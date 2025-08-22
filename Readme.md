# Real-Time Audio Transcription Extension

![Version](https://img.shields.io/badge/version-2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active-brightgreen)

An intelligent Chrome extension that captures audio from your browser or microphone, provides highly accurate real-time transcription using the Google Gemini API, and optimizes usage with advanced silence detection.

---

## Overview

This extension provides a seamless and efficient way to transcribe audio content directly within your browser. Whether you're in a virtual meeting, watching a lecture, or need to capture your own thoughts, this tool uses a clean side panel interface to deliver live transcripts. The core of its efficiency lies in its **silence detection** capability, which intelligently records only when speech is present, dramatically reducing API costs and focusing on what matters.

---

## Key Features

* 🎤 **Multi-Source Capture**: Transcribe audio from the **active browser tab** (e.g., Google Meet, YouTube) or directly from your **microphone**.
* 🤫 **Intelligent Silence Detection**: The extension analyzes audio in real-time and only records when speech is detected, saving significant API usage and costs.
* ⏸️ **Full Playback Control**: **Start**, **Stop**, **Pause**, and **Resume** your transcription session at any time.
* 🌐 **Offline Buffering**: If your internet connection drops, the extension automatically saves audio chunks and transcribes them once you're back online.
* 💪 **Robust Error Handling**: Provides clear, user-friendly error messages for API key issues, permission denials, and network failures.
* ✨ **Live Audio Playback**: Hear the audio from a browser tab *while* it's being transcribed.
* 📋 **Flexible Export Options**: **Copy** the entire transcript, or **download** it as a clean `.txt` or structured `.json` file. You can also **Clear** the transcript at any time.

---

## Getting Started

Follow these instructions to get the extension running on your local machine for development and testing purposes.

### Prerequisites

* **Google Chrome**: The latest version is recommended.
* **Git**: Required for cloning the repository.
* **A Google Gemini API Key**.

### Installation & Setup

1.  **Clone the Repository:**
    Open your terminal and run the following command:
    ```bash
    git clone [https://github.com/your-username/real-time-transcription-extension.git](https://github.com/your-username/real-time-transcription-extension.git)
    ```

2.  **Get Your API Key:**
    * Navigate to [Google AI Studio](https://aistudio.google.com/).
    * Create a new project or use an existing one.
    * Click on "**Get API key**" and copy the generated key.

3.  **Load the Extension in Chrome:**
    * Open Chrome and navigate to `chrome://extensions`.
    * Enable **Developer mode** using the toggle in the top-right corner.
    * Click the **"Load unpacked"** button.
    * Select the folder where you cloned the repository. The extension icon will appear in your toolbar.

---

## Usage Instructions

1.  **Open the Side Panel**: Navigate to a tab with audio or simply open a new tab. Click the extension icon in your toolbar to open the side panel.
2.  **Configure Your Session**:
    * Select your desired **Audio Source** (`Active Tab Audio` or `Microphone`).
    * Paste your **Gemini API Key** into the input field.
3.  **Start Transcribing**: Click the **Start** button.
    * If using the microphone for the first time, the browser will prompt you for permission. You must click **Allow**.
4.  **Manage the Session**:
    * Use the **Pause** and **Resume** buttons to control the transcription.
    * The status indicator and text will show the current state (Recording, Paused, Idle, Transcribing).
    * Click **Stop** to end the session completely.
5.  **Export Your Transcript**:
    * Use the buttons in the footer to **Copy**, download as **TXT**, or download as **JSON**.
    * Click **Clear** to wipe the current transcript from the panel and start fresh.

---

## Contributing

We welcome contributions to improve this project! Please follow these guidelines to ensure a smooth and collaborative process.

### Branching Strategy

* **`main`**: This branch contains the latest stable, production-ready code.
* **`develop`**: This is the primary development branch. All feature branches are merged into `develop`.
* **Feature Branches**: Create a new branch from `develop` for each new feature or bugfix. Use a descriptive naming convention:
    * `feature/add-new-export-format`
    * `bugfix/fix-timer-display-issue`

### Commit Message Guidelines

We follow the [**Conventional Commits**](https://www.conventionalcommits.org/en/v1.0.0/) specification. This creates a more readable and structured commit history. Each commit message should be structured as follows:

```
<type>[optional scope]: <description>

[optional body]

[optional footer]
```


**Common Types:**

* **`feat`**: A new feature.
* **`fix`**: A bug fix.
* **`docs`**: Documentation only changes.
* **`style`**: Changes that do not affect the meaning of the code (white-space, formatting, etc).
* **`refactor`**: A code change that neither fixes a bug nor adds a feature.
* **`perf`**: A code change that improves performance.
* **`test`**: Adding missing tests or correcting existing tests.
* **`chore`**: Changes to the build process or auxiliary tools.

**Example Commit:**

```feat(export): add support for JSON download

Users can now download the full transcript object as a structured
JSON file, including timestamps and audio source labels for each entry.

Closes #24
```

### Pull Request (PR) Process

1.  Fork the repository and create your feature branch from `develop`.
2.  Make your changes and ensure your code adheres to the project's style.
3.  Write clear, conventional commit messages.
4.  Push your feature branch to your fork.
5.  Open a pull request from your feature branch to the main repository's `develop` branch.
6.  Provide a clear title and a detailed description of the changes in your PR.
7.  Your PR will be reviewed, and once approved, it will be merged.

---

## Packaging for Production

To create a `.zip` file ready for submission to the Chrome Web Store:

1.  Ensure all your changes are committed and your working directory is clean.
2.  From the root of the project directory, run the following command:

    ```bash
    zip -r extension.zip . -x "*.git*" "README.md" "Architecture.md" "*.DS_Store"
    ```

3.  The `extension.zip` file will be created in the root directory.

---

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
