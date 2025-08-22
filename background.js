// --- State ---
let capturedTabId = null;
let apiKey = null;
let audioSource = 'tab';
const OFFLINE_QUEUE_KEY = 'offlineAudioQueue';

// --- Offscreen Document Management ---
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
async function hasOffscreenDocument() {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)] });
    return contexts.length > 0;
}
async function setupOffscreenDocument() {
    if (!(await hasOffscreenDocument())) {
        await chrome.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: ['USER_MEDIA'],
            justification: 'Audio processing for transcription',
        });
    }
}

// --- Message Handling ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'startRecording':
            apiKey = message.apiKey;
            audioSource = message.source;
            startRecording()
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;
        case 'stopRecording':
            stopRecording();
            sendResponse({ success: true });
            break;
        case 'pauseRecording':
            chrome.runtime.sendMessage({ action: 'pauseOffscreenRecording' });
            break;
        case 'resumeRecording':
            chrome.runtime.sendMessage({ action: 'resumeOffscreenRecording' });
            break;
        case 'processAudioChunk':
            handleAudioChunk(message.audioChunk);
            break;
        case 'recordingError':
            handleError(new Error(message.error));
            break;
    }
    return false;
});

// --- Core Recording Logic ---
async function startRecording() {
    try {
        await setupOffscreenDocument();
        let streamId;

        if (audioSource === 'tab') {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab) throw new Error("Could not find active tab.");
            capturedTabId = activeTab.id;
            streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: capturedTabId });
        }

        chrome.runtime.sendMessage({
            action: 'startOffscreenRecording',
            streamId: streamId,
            source: audioSource
        });

        await chrome.storage.local.set({ recordingState: 'recording', startTime: Date.now(), transcript: [] });
    } catch (error) {
        console.error("Error in startRecording:", error);
        handleError(error);
        throw error;
    }
}

function stopRecording() {
    if (chrome.runtime.id) {
        chrome.runtime.sendMessage({ action: 'stopOffscreenRecording' });
        chrome.storage.local.set({ recordingState: 'idle' });
        chrome.runtime.sendMessage({ action: 'recordingStopped' });
        capturedTabId = null;
    }
}

function handleError(error) {
    console.error("Handling error:", error.message);
    if (chrome.runtime.id) {
        chrome.runtime.sendMessage({ action: 'error', error: error.message });
        stopRecording();
    }
}

// --- Audio & Transcription Handling ---
async function handleAudioChunk(audioBase64) {
    if (!navigator.onLine) {
        updateStatus("Offline. Buffering audio...");
        await addToOfflineQueue(audioBase64);
        return;
    }
    updateStatus("Transcribing...");
    await transcribeAudio(audioBase64);
}

async function transcribeAudio(audioBase64) {
    const services = [callGeminiApi, callWhisperApi, callDeepgramApi];
    const errorMessages = []; // To collect specific errors from each API attempt

    for (const service of services) {
        try {
            const result = await service(audioBase64, apiKey);
            // More robust check for a valid transcript in the response
            if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
                const transcript = result.candidates[0].content.parts[0].text;
                if (chrome.runtime.id) {
                    chrome.runtime.sendMessage({ action: 'updateTranscript', transcript, source: audioSource });
                }
                updateStatus("Recording");
                return; // Success, exit the loop
            } else {
                // Handle cases where the API returns a success status but no actual text
                errorMessages.push(`${service.name}: Received an empty or invalid response.`);
            }
        } catch (error) {
            console.warn(`Service ${service.name} failed:`, error.message);
            errorMessages.push(`${service.name}: ${error.message}`); // Collect the specific error
        }
    }
    
    // If the loop completes without returning, all services have failed
    const finalError = `Transcription failed. Details: ${errorMessages.join('; ')}`;
    handleError(new Error(finalError));
}


// --- API Services ---
async function callGeminiApi(audioBase64, key, retries = 3, delay = 1000) {
    const payload = { contents: [{ parts: [{ text: "Transcribe this audio." }, { inlineData: { mimeType: "audio/wav", data: audioBase64 } }] }] };
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) {
                // Try to parse the error response from Google for a more specific message
                const errorBody = await response.json();
                const errorMessage = errorBody?.error?.message || `HTTP Error ${response.status}`;
                throw new Error(errorMessage);
            }
            return await response.json();
        } catch (error) {
            console.error(`Gemini API attempt ${i + 1} failed:`, error.message);
            if (i === retries - 1) throw error; // Re-throw the last error
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
        }
    }
}

// --- Placeholder Fallback APIs ---
async function callWhisperApi(audioBase64, key) { throw new Error("Whisper API not implemented."); }
async function callDeepgramApi(audioBase64, key) { throw new Error("Deepgram API not implemented."); }

// --- Offline Queue & Connectivity ---
async function addToOfflineQueue(audioBase64) {
    const { [OFFLINE_QUEUE_KEY]: queue = [] } = await chrome.storage.local.get(OFFLINE_QUEUE_KEY);
    queue.push(audioBase64);
    await chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: queue });
}

async function processOfflineQueue() {
    const { [OFFLINE_QUEUE_KEY]: queue = [] } = await chrome.storage.local.get(OFFLINE_QUEUE_KEY);
    if (queue.length === 0) return;
    
    updateStatus(`Syncing ${queue.length} offline chunk(s)...`);
    const promises = queue.map(chunk => transcribeAudio(chunk));
    await Promise.all(promises);
    await chrome.storage.local.remove(OFFLINE_QUEUE_KEY);
    updateStatus("Recording");
}

self.addEventListener('online', processOfflineQueue);
self.addEventListener('offline', () => updateStatus("Offline. Buffering..."));

function updateStatus(status) {
    if (chrome.runtime.id) {
        chrome.runtime.sendMessage({ action: 'statusUpdate', status });
    }
}

chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === capturedTabId) stopRecording();
});
