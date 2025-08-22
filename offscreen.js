// offscreen.js

// --- Core Recording State ---
let mediaRecorder;
let audioChunks = [];
let playbackAudio; // To play audio back to the user
let stream; // To hold the master audio stream

// --- Silence Detection State & Settings ---
let audioContext;
let analyser;
let sourceNode;
const SILENCE_THRESHOLD = -50; // dB, adjust this value based on microphone sensitivity and background noise
const SPEECH_TIMEOUT = 1500;   // ms, how long to wait in silence before sending the audio chunk
let silenceCheckInterval;
let speechTimeout;

// --- Message Listener ---
chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(message) {
    switch (message.action) {
        case 'startOffscreenRecording':
            await startRecording(message.source, message.streamId);
            break;
        case 'stopOffscreenRecording':
            stopRecording();
            break;
        case 'pauseOffscreenRecording':
            if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.pause();
            break;
        case 'resumeOffscreenRecording':
            if (mediaRecorder && mediaRecorder.state === 'paused') mediaRecorder.resume();
            break;
    }
}

// --- Main Recording Logic ---
async function startRecording(source, streamId) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        console.warn('Recorder is already active.');
        return;
    }

    const constraints = source === 'mic' 
        ? { audio: true }
        : { audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } };

    try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Play tab audio back to the user so they can hear it
        if (source === 'tab') {
            playbackAudio = new Audio();
            playbackAudio.srcObject = stream;
            playbackAudio.play().catch(e => console.error("Playback failed:", e));
        }

        // Setup MediaRecorder to capture the stream
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            if (audioChunks.length === 0) return;
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
            const audioBase64 = await convertBlobToBase64Wav(audioBlob);
            chrome.runtime.sendMessage({ action: 'processAudioChunk', audioChunk: audioBase64 });
            audioChunks = [];
        };

        // Initialize the audio analysis for silence detection
        setupAudioAnalysis();
        // Start the silence detection loop, which will control the recorder
        startSilenceDetection();

    } catch (error) {
        console.error("Error starting offscreen recording:", error);
        let errorMessage = "An unknown error occurred while starting the recording.";
        if (error.name === 'NotAllowedError') {
            errorMessage = "Microphone permission was denied. Please allow it in your browser settings and try again.";
        }
        // Send a specific error message back to the background script to stop the session
        chrome.runtime.sendMessage({ action: 'recordingError', error: errorMessage });
    }
}

// --- Silence Detection Implementation ---
function setupAudioAnalysis() {
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    // A smaller FFT size is more responsive to quick changes in volume
    analyser.fftSize = 512; 
    sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(analyser);
}

function startSilenceDetection() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    silenceCheckInterval = setInterval(() => {
        // Don't check for silence if the user has manually paused
        if (mediaRecorder.state === 'paused') {
            return;
        }

        analyser.getFloatTimeDomainData(dataArray);
        let sum = 0.0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / bufferLength);
        const db = 20 * Math.log10(rms || 0.00001); // Use a floor value to avoid -Infinity

        if (db > SILENCE_THRESHOLD) {
            // --- Speech Detected ---
            // If not recording, start now.
            if (mediaRecorder.state === 'inactive') {
                mediaRecorder.start();
            }
            // If a silence timeout is running, clear it because speech has resumed.
            if (speechTimeout) {
                clearTimeout(speechTimeout);
                speechTimeout = null;
            }
        } else {
            // --- Silence Detected ---
            // If we are recording and there's no timeout scheduled, start one.
            if (mediaRecorder.state === 'recording' && !speechTimeout) {
                speechTimeout = setTimeout(() => {
                    // If the timeout completes, stop the recording to send the chunk.
                    mediaRecorder.stop();
                    speechTimeout = null;
                }, SPEECH_TIMEOUT);
            }
        }
    }, 200); // Check volume 5 times per second
}

// --- Cleanup Logic ---
function stopRecording() {
    // Clear intervals and timeouts
    if (silenceCheckInterval) clearInterval(silenceCheckInterval);
    if (speechTimeout) clearTimeout(speechTimeout);

    // Stop the MediaRecorder and release the media stream tracks
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        mediaRecorder.stop();
    }

    // Stop the audio playback element
    if (playbackAudio) {
        playbackAudio.pause();
        playbackAudio.srcObject = null;
        playbackAudio = null;
    }

    // Close the audio context to free up resources
    if (audioContext) {
        audioContext.close();
    }

    // Close the offscreen document
    window.close();
}

// --- Audio Conversion Utilities ---
async function convertBlobToBase64Wav(blob) {
    // Using an OfflineAudioContext is more efficient for this conversion
    const tempAudioContext = new AudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await tempAudioContext.decodeAudioData(arrayBuffer);
    tempAudioContext.close(); // Close the context after use
    
    const wavBlob = bufferToWav(audioBuffer);
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(wavBlob);
    });
}

function bufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels, length = buffer.length * numOfChan * 2 + 44;
    const bufferOut = new ArrayBuffer(length), view = new DataView(bufferOut);
    const channels = []; let offset = 0, pos = 0;
    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
    setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
    setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164);
    setUint32(length - pos - 4);
    for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
    while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true); pos += 2;
        }
        offset++;
    }
    return new Blob([view], { type: 'audio/wav' });
    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}
