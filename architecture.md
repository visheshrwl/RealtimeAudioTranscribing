# Extension Architecture (Detailed)

This document provides a comprehensive overview of the technical architecture for the **Real-Time Audio Transcription Chrome Extension**. The extension is built using the **Manifest V3** platform, ensuring it is secure, performant, and compliant with modern Chrome standards. Its architecture is event-driven, relying on message passing between three isolated components.

---

## Core Components

The extension is divided into three distinct parts, each with a specific set of responsibilities. This separation of concerns makes the system more robust and easier to maintain.

### 1. Side Panel (User Interface)

- **Files:** `sidepanel.html`, `sidepanel.js`  
- **Role:** The user-facing component.  

**Responsibilities:**
- **User Input:** Captures user interactions — start, stop, pause recording, selecting audio source (Tab vs. Microphone), and entering the API key.  
- **State Display:** Renders application state — live transcript with timestamps, recording status (`Recording`, `Paused`, `Idle`), and error messages.  
- **Command Dispatcher:** Translates user actions into messages and sends them to the Background Service Worker. Contains no core logic itself.  

---

### 2. Background Service Worker

- **File:** `background.js`  
- **Role:** The central coordinator and brain of the extension.  

**Responsibilities:**
- **State Management:** Maintains the single source of truth (`recordingState`, `apiKey`) and persists it to `chrome.storage.local`.  
- **Orchestration:** Receives commands from the Side Panel and coordinates actions (e.g., `startRecording` → launches Offscreen Document).  
- **API Communication:** Handles all network requests — sends audio to Google Gemini API, processes responses, implements retry with exponential backoff, and manages fallback logic.  
- **Offline Buffering:** Queues audio chunks when offline and processes them when connectivity is restored.  

---

### 3. Offscreen Document

- **Files:** `offscreen.js`, `offscreen.html`  
- **Role:** Hidden background page for audio processing.  

**Rationale:** MV3 Service Workers cannot directly access DOM APIs like the Web Audio API (needed for silence detection). Offscreen Document provides this capability.  

**Responsibilities:**
- **Audio Capture:** Uses `navigator.mediaDevices.getUserMedia` for tab or mic audio.  
- **Live Audio Playback:** Routes tab audio back to user speakers via `<audio>` element.  
- **Silence Detection:** Critical optimization. Uses `AudioContext` + `AnalyserNode` to monitor audio volume. Starts `MediaRecorder` only when speech is detected; stops after silence to reduce API load.  
- **Audio Encoding:** Captures speech into `.webm` chunks using `MediaRecorder`.  
- **Data Conversion:** Converts audio blobs into Base64-encoded WAV before sending to Service Worker.  

---

## Data & Communication Flow

All components are decoupled and communicate via `chrome.runtime.sendMessage`.

---

---

## Recording Startup Flow

When the user clicks **Start**, the following sequence occurs:

1. **User Action**
   - [User] clicks "Start" in **Side Panel**.

2. **Side Panel → Background SW**
   - Sends `startRecording` message to the Background Service Worker (SW).

3. **Background SW**
   - Ensures Offscreen Document exists (creates if missing).
   - Sends `startOffscreenRecording` message to Offscreen Document.

4. **Offscreen Document**
   - Requests Mic/Tab Audio Stream.
   - Starts audio playback (if Tab audio).
   - Initializes Web Audio API for analysis.
   - Begins **Silence Detection Loop**.

---

## Active Transcription Loop (Optimized)

The optimized transcription cycle works as follows:

1. **Silence Detection Loop (Offscreen Doc)**
   - Continuously monitors audio volume.

2. **Speech Detected (Volume > Threshold)**
   - Starts `MediaRecorder` (if inactive).

3. **Silence Detected (Volume < Threshold)**
   - Triggers 1.5s timeout.
   - On timeout completion:
     - Stops `MediaRecorder` → fires `onstop`.
     - Sends audio chunk to Background SW.

4. **Background SW**
   - Sends chunk to Gemini API.
   - Receives transcript result.
   - Sends `updateTranscript` message to Side Panel.

5. **Side Panel**
   - Renders new transcript text with timestamps.

---

## Error Handling Flow (e.g., Mic Permission Denied)

When microphone access is denied:

1. **Offscreen Doc**
   - Calls `getUserMedia` for mic input.
   - If user clicks "Block", `NotAllowedError` is thrown.

2. **Error Handling**
   - `catch` block identifies the error.
   - Sends `recordingError` message (with details) to Background SW.

3. **Background SW**
   - Calls `stopRecording()` for cleanup.
   - Sends `error` message to Side Panel.

4. **Side Panel**
   - Displays specific error message to the user.

---
