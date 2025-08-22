// --- DOM Elements ---
const startStopBtn = document.getElementById('startStopBtn');
const pauseResumeBtn = document.getElementById('pauseResumeBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const timerEl = document.getElementById('timer');
const transcriptContainer = document.getElementById('transcriptContainer');
const placeholder = document.getElementById('placeholder');
const copyBtn = document.getElementById('copyBtn');
const downloadTxtBtn = document.getElementById('downloadTxtBtn');
const errorMessageEl = document.getElementById('error-message');
const apiKeyInput = document.getElementById('apiKey');
const audioSourceSelect = document.getElementById('audioSource');
const setupSection = document.getElementById('setupSection');

// --- State ---
let recordingState = 'idle'; // idle, recording, paused
let timerInterval;
let secondsElapsed = 0;
let fullTranscript = [];

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['recordingState', 'startTime', 'pausedTime', 'secondsElapsed', 'transcript', 'apiKey', 'audioSource'], (result) => {
        recordingState = result.recordingState || 'idle';
        fullTranscript = result.transcript || [];
        apiKeyInput.value = result.apiKey || '';
        audioSourceSelect.value = result.audioSource || 'tab';
        
        renderTranscript();

        if (recordingState === 'recording') {
            const now = Date.now();
            const elapsedSinceStart = result.startTime ? Math.floor((now - result.startTime) / 1000) : 0;
            secondsElapsed = result.secondsElapsed + elapsedSinceStart;
            updateUIForRecording();
            startTimer();
        } else if (recordingState === 'paused') {
            secondsElapsed = result.secondsElapsed || 0;
            updateUIForPaused();
            timerEl.textContent = formatTime(secondsElapsed);
        } else {
            updateUIForIdle();
        }
    });
});

// --- Event Listeners ---
startStopBtn.addEventListener('click', handleStartStop);
pauseResumeBtn.addEventListener('click', handlePauseResume);
copyBtn.addEventListener('click', copyTranscript);
downloadTxtBtn.addEventListener('click', () => downloadTranscript('txt'));
apiKeyInput.addEventListener('change', (e) => chrome.storage.local.set({ apiKey: e.target.value }));
audioSourceSelect.addEventListener('change', (e) => chrome.storage.local.set({ audioSource: e.target.value }));

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updateTranscript') {
        const newEntry = { timestamp: new Date().toISOString(), text: message.transcript, source: message.source };
        fullTranscript.push(newEntry);
        renderSingleTranscript(newEntry);
        chrome.storage.local.set({ transcript: fullTranscript });
        updateExportButtons();
    } else if (message.action === 'recordingStopped') {
        recordingState = 'idle';
        stopTimer();
        updateUIForIdle();
    } else if (message.action === 'error') {
        displayError(message.error);
    } else if (message.action === 'statusUpdate') {
        statusText.textContent = message.status;
    }
});

// --- Control Handlers ---
async function handleStartStop() {
    if (recordingState === 'idle') { // Start
        if (!apiKeyInput.value) {
            displayError("Please enter your Gemini API Key.");
            return;
        }
        
        const source = audioSourceSelect.value;
        if (source === 'mic') {
            const hasPermission = await requestMicPermission();
            if (!hasPermission) {
                displayError("Microphone permission is required.");
                return;
            }
        }

        const response = await chrome.runtime.sendMessage({ action: 'startRecording', apiKey: apiKeyInput.value, source });
        if (response && response.success) {
            recordingState = 'recording';
            secondsElapsed = 0;
            fullTranscript = [];
            chrome.storage.local.set({ transcript: [], startTime: Date.now(), secondsElapsed: 0 });
            renderTranscript();
            updateUIForRecording();
            startTimer();
            displayError(null);
        } else {
            displayError(response?.error || 'Failed to start recording.');
        }
    } else { // Stop
        chrome.runtime.sendMessage({ action: 'stopRecording' });
        recordingState = 'idle';
        stopTimer();
        updateUIForIdle();
        chrome.storage.local.set({ recordingState: 'idle', secondsElapsed });
    }
}

function handlePauseResume() {
    if (recordingState === 'recording') { // Pause
        chrome.runtime.sendMessage({ action: 'pauseRecording' });
        recordingState = 'paused';
        stopTimer();
        updateUIForPaused();
        chrome.storage.local.set({ recordingState: 'paused', secondsElapsed, pausedTime: Date.now() });
    } else if (recordingState === 'paused') { // Resume
        chrome.runtime.sendMessage({ action: 'resumeRecording' });
        recordingState = 'recording';
        updateUIForRecording();
        startTimer();
        chrome.storage.local.set({ recordingState: 'recording', startTime: Date.now() });
    }
}

async function requestMicPermission() {
    return new Promise(resolve => {
        chrome.permissions.request({ permissions: ['microphone'] }, (granted) => {
            resolve(granted);
        });
    });
}

// --- UI Update Functions ---
function updateUIForIdle() {
    startStopBtn.textContent = 'Start';
    startStopBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
    startStopBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
    pauseResumeBtn.classList.add('hidden');
    setupSection.classList.remove('hidden');
    statusIndicator.className = 'w-3 h-3 rounded-full bg-slate-400 transition-colors';
    statusText.textContent = 'Idle';
    timerEl.textContent = formatTime(0);
}

function updateUIForRecording() {
    startStopBtn.textContent = 'Stop';
    startStopBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    startStopBtn.classList.add('bg-red-600', 'hover:bg-red-700');
    pauseResumeBtn.textContent = 'Pause';
    pauseResumeBtn.classList.remove('hidden', 'bg-yellow-500');
    pauseResumeBtn.classList.add('bg-slate-200');
    setupSection.classList.add('hidden');
    statusIndicator.className = 'w-3 h-3 rounded-full bg-green-500 transition-colors animate-pulse';
    statusText.textContent = 'Recording';
}

function updateUIForPaused() {
    pauseResumeBtn.textContent = 'Resume';
    pauseResumeBtn.classList.add('bg-yellow-500');
    statusIndicator.className = 'w-3 h-3 rounded-full bg-yellow-500 transition-colors';
    statusText.textContent = 'Paused';
}

// --- Timer Functions ---
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        secondsElapsed++;
        timerEl.textContent = formatTime(secondsElapsed);
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// --- Transcript & Export ---
function renderTranscript() {
    transcriptContainer.innerHTML = '';
    if (fullTranscript.length === 0) {
        transcriptContainer.appendChild(placeholder);
        placeholder.classList.remove('hidden');
    } else {
        placeholder.classList.add('hidden');
        fullTranscript.forEach(renderSingleTranscript);
    }
    updateExportButtons();
}

function renderSingleTranscript(entry) {
    if (placeholder) placeholder.classList.add('hidden');
    const time = new Date(entry.timestamp);
    const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const block = document.createElement('div');
    block.className = 'p-3 bg-slate-50 rounded-md';
    
    const header = document.createElement('div');
    header.className = 'flex justify-between items-center mb-1';
    
    const timestampEl = document.createElement('p');
    timestampEl.className = 'text-xs font-semibold text-blue-600';
    timestampEl.textContent = `[${timeString}]`;
    
    const sourceEl = document.createElement('p');
    sourceEl.className = 'text-xs font-medium text-slate-500 px-2 py-0.5 bg-slate-100 rounded-full';
    sourceEl.textContent = entry.source === 'mic' ? 'Microphone' : 'Tab Audio';
    
    const textEl = document.createElement('p');
    textEl.className = 'text-slate-700';
    textEl.textContent = entry.text;
    
    header.appendChild(timestampEl);
    header.appendChild(sourceEl);
    block.appendChild(header);
    block.appendChild(textEl);
    transcriptContainer.appendChild(block);
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
}

function displayError(message) {
    if (message) {
        errorMessageEl.textContent = message;
        errorMessageEl.classList.remove('hidden');
    } else {
        errorMessageEl.classList.add('hidden');
    }
}

function updateExportButtons() {
    const hasTranscript = fullTranscript.length > 0;
    copyBtn.disabled = !hasTranscript;
    downloadTxtBtn.disabled = !hasTranscript;
}

function copyTranscript() {
    const textToCopy = fullTranscript.map(entry => `[${new Date(entry.timestamp).toLocaleTimeString()}] ${entry.text}`).join('\n\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });
}

function downloadTranscript(format) {
    const content = fullTranscript.map(entry => `[${new Date(entry.timestamp).toLocaleTimeString()}] (${entry.source}) ${entry.text}`).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}
