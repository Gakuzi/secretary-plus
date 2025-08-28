import { createMessageElement } from './Message.js';
import { AttachmentIcon, MicrophoneIcon, SendIcon, CameraIcon, LockIcon, TrashIcon, ArrowLeftIcon } from './icons/Icons.js';
import { SpeechRecognizer } from '../utils/speech.js';

let chatLog;
let chatInput;
let sendButton;
let speechRecognizer;
let onSendMessageCallback;
let voiceRecordButton;

// Voice recording state
let voiceState = {
    isRecording: false,
    isLocked: false,
    isCancelled: false,
    pointerStart: { x: 0, y: 0 },
    startTime: 0,
    timerInterval: null,
};

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    handleDragLeave(e);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleImageFile(file);
    }
}

function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];
        const image = { mimeType: file.type, base64 };
        const prompt = chatInput.value.trim();
        onSendMessageCallback(prompt, image);
        chatInput.value = '';
        updateInputState();
    };
    reader.readAsDataURL(file);
}

const sendMessageHandler = (promptOverride = null) => {
    const prompt = (typeof promptOverride === 'string') ? promptOverride : chatInput.value.trim();
    if (prompt) {
        onSendMessageCallback(prompt, null);
        chatInput.value = '';
        updateInputState();
    }
};

function updateInputState() {
    const hasText = chatInput.value.trim().length > 0;
    sendButton.classList.toggle('hidden', !hasText);
    voiceRecordButton.classList.toggle('hidden', hasText);
    
    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = `${chatInput.scrollHeight}px`;
}

// --- VOICE RECORDING LOGIC ---

function startRecording(e) {
    if (!speechRecognizer.isSupported || voiceState.isRecording) return;
    
    voiceState.isRecording = true;
    voiceState.isLocked = false;
    voiceState.isCancelled = false;
    voiceState.pointerStart = { x: e.clientX, y: e.clientY };
    voiceState.startTime = Date.now();
    
    speechRecognizer.start();
    
    voiceRecordButton.classList.add('recording-active');
    document.getElementById('recording-overlay').classList.add('visible');
    document.getElementById('lock-hint').classList.add('visible');

    const timerEl = document.getElementById('recording-timer');
    timerEl.textContent = '0:00';
    voiceState.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - voiceState.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopRecording);
}

function handlePointerMove(e) {
    if (!voiceState.isRecording || voiceState.isLocked) return;

    const deltaX = e.clientX - voiceState.pointerStart.x;
    const deltaY = e.clientY - voiceState.pointerStart.y;

    const cancelHint = document.getElementById('cancel-hint');
    const lockHint = document.getElementById('lock-hint');

    // Slide left to cancel
    if (deltaX < -50) {
        voiceState.isCancelled = true;
        cancelHint.classList.add('highlight');
    } else {
        voiceState.isCancelled = false;
        cancelHint.classList.remove('highlight');
    }

    // Slide up to lock
    if (deltaY < -60) {
        voiceState.isLocked = true;
        speechRecognizer.recognition.onend = null; // Prevent auto-stop
        
        voiceRecordButton.classList.remove('recording-active');
        lockHint.classList.remove('visible');
        document.getElementById('recording-overlay').classList.remove('visible');
        document.getElementById('input-area-content').classList.add('hidden');
        document.getElementById('locked-recording-bar').classList.remove('hidden');

        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', stopRecording);
    }
}

function stopRecording() {
    if (!voiceState.isRecording) return;

    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopRecording);

    if (voiceState.isCancelled) {
        cancelRecording();
    } else {
        speechRecognizer.stop(); // This will trigger onEnd, which sends the message
    }
    
    resetVoiceUI();
}

function cancelRecording() {
    voiceState.isRecording = false;
    speechRecognizer.stop();
    speechRecognizer.recognition.onend = null; // Prevent onEnd from firing and sending
    resetVoiceUI();
}

function sendLockedRecording() {
    voiceState.isRecording = false;
    speechRecognizer.stop();
    resetVoiceUI();
}

function resetVoiceUI() {
    voiceState.isRecording = false;
    voiceState.isLocked = false;
    clearInterval(voiceState.timerInterval);
    
    voiceRecordButton.classList.remove('recording-active');
    document.getElementById('recording-overlay').classList.remove('visible');
    document.getElementById('lock-hint').classList.remove('visible');
    document.getElementById('cancel-hint').classList.remove('highlight');
    
    document.getElementById('input-area-content').classList.remove('hidden');
    document.getElementById('locked-recording-bar').classList.add('hidden');
}

// --- CHAT INTERFACE CREATION ---

export function createChatInterface(onSendMessage) {
    onSendMessageCallback = onSendMessage;
    const chatWrapper = document.createElement('div');
    chatWrapper.className = 'flex flex-col h-full';
    chatWrapper.addEventListener('dragover', handleDragOver);
    chatWrapper.addEventListener('dragleave', handleDragLeave);
    chatWrapper.addEventListener('drop', handleDrop);

    chatWrapper.innerHTML = `
        <div id="chat-log" class="flex-1 overflow-y-auto p-4 space-y-4">
            <!-- Messages or welcome screen will be appended here -->
        </div>
        <div class="p-4 bg-gray-800 border-t border-gray-700">
            <div id="recording-overlay">
                <div id="cancel-hint" class="recording-hint">
                    ${ArrowLeftIcon} <span>Отмена</span>
                </div>
                <span id="recording-timer">0:00</span>
            </div>
            <div id="lock-hint" class="p-2 rounded-full bg-gray-900/80">
                ${LockIcon}
            </div>
            <div id="locked-recording-bar" class="hidden flex items-center bg-gray-900 rounded-lg p-2">
                <button id="cancel-locked-button" class="p-2 text-red-500">${TrashIcon}</button>
                <div class="flex-1 text-center text-gray-400">Запись...</div>
                <button id="send-locked-button" class="p-2 rounded-full bg-blue-600 hover:bg-blue-700 ml-2">${SendIcon}</button>
            </div>
            <div id="input-area-content" class="flex items-end bg-gray-900 rounded-lg p-2 gap-1">
                <button id="attach-button" class="p-2 rounded-full hover:bg-gray-700 self-center flex-shrink-0">${AttachmentIcon}</button>
                <input type="file" id="file-input" class="hidden" accept="image/*">
                <button id="camera-button" class="p-2 rounded-full hover:bg-gray-700 self-center flex-shrink-0">${CameraIcon}</button>
                <textarea id="chat-input" class="flex-1 bg-transparent focus:outline-none resize-none px-2 max-h-32" placeholder="Спросите что-нибудь..." rows="1"></textarea>
                <button id="send-button" class="p-2 rounded-full bg-blue-600 hover:bg-blue-700 self-center flex-shrink-0 hidden">${SendIcon}</button>
                <button id="voice-record-button" class="p-2 rounded-full bg-blue-600 hover:bg-blue-700 self-center flex-shrink-0">${MicrophoneIcon}</button>
            </div>
        </div>
    `;

    chatLog = chatWrapper.querySelector('#chat-log');
    chatInput = chatWrapper.querySelector('#chat-input');
    sendButton = chatWrapper.querySelector('#send-button');
    voiceRecordButton = chatWrapper.querySelector('#voice-record-button');
    const attachButton = chatWrapper.querySelector('#attach-button');
    const fileInput = chatWrapper.querySelector('#file-input');
    
    sendButton.addEventListener('click', () => sendMessageHandler());
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessageHandler();
        }
    });

    chatInput.addEventListener('input', updateInputState);

    attachButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleImageFile(file);
    });

    // --- NEW SPEECH RECOGNIZER SETUP ---
    speechRecognizer = new SpeechRecognizer(
        (transcript) => { // onResult (interim or final)
            if (voiceState.isLocked) {
                 chatInput.value = transcript;
                 updateInputState();
            }
        },
        (finalTranscript) => { // onEnd
             if (!voiceState.isCancelled && finalTranscript.trim()) {
                onSendMessageCallback(finalTranscript);
            }
        },
        (error) => { // onError
            console.error('Speech recognition error:', error);
            alert(`Ошибка распознавания речи: ${error}`);
            resetVoiceUI();
        }
    );
    
    voiceRecordButton.addEventListener('pointerdown', startRecording);
    chatWrapper.querySelector('#cancel-locked-button').addEventListener('click', cancelRecording);
    chatWrapper.querySelector('#send-locked-button').addEventListener('click', () => {
        const transcript = chatInput.value.trim();
        if (transcript) {
            onSendMessageCallback(transcript);
        }
        chatInput.value = '';
        updateInputState();
        resetVoiceUI();
    });

    updateInputState(); // Initial UI setup
    return chatWrapper;
}

export function addMessageToChat(message) {
    if (!chatLog) return;

    const welcomeScreen = chatLog.querySelector('.welcome-screen-container');
    if (welcomeScreen) {
        chatLog.innerHTML = '';
    }

    const messageElement = createMessageElement(message);
    chatLog.appendChild(messageElement);
    chatLog.scrollTop = chatLog.scrollHeight;
}

export function showLoadingIndicator() {
    if (!chatLog) return;
    const loadingElement = document.createElement('div');
    loadingElement.id = 'loading-indicator';
    loadingElement.className = 'flex items-center space-x-2 p-4';
    loadingElement.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold text-lg">S+</div>
        <div>
            <div class="font-bold">Секретарь+</div>
            <div class="text-gray-400">Думаю<span class="blinking-cursor"></span></div>
        </div>
    `;
    chatLog.appendChild(loadingElement);
    chatLog.scrollTop = chatLog.scrollHeight;
}

export function hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
        indicator.remove();
    }
}
