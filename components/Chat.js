import { createMessageElement } from './Message.js';
import { MicrophoneIcon, SendIcon, CameraIcon, LockIcon, TrashIcon, ArrowLeftIcon, KeyboardIcon } from './icons/Icons.js';
import { SpeechRecognizer } from '../utils/speech.js';

// Module-level variables for DOM elements and state
let chatLog, chatInput, sendButton, voiceRecordButton, cameraButton, toggleInputModeButton;
let speechRecognizer, onSendMessageCallback;
let inputBar, composeView, recordingView, lockHint, cancelHint, recordingTimer;

// State for UI and voice recording
let isTextModeOnMobile = false;
const VOICE_THRESHOLD_Y = -60;
const VOICE_THRESHOLD_X = -60;
let voiceState = {
    isRecording: false, isLocked: false, isCancelled: false,
    pointerStart: { x: 0, y: 0 }, startTime: 0, timerInterval: null,
};

// --- UTILITIES ---

// Utility to check if on a mobile device based on a class added at startup
function isMobile() {
    return document.body.classList.contains('is-mobile');
}

// --- EVENT HANDLERS ---

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

const sendMessageHandler = () => {
    const prompt = chatInput.value.trim();
    if (prompt || voiceState.isLocked) { // Allow sending from locked state
        onSendMessageCallback(prompt, null);
        chatInput.value = '';
        if (voiceState.isLocked) {
            resetVoiceUI();
        }
        updateInputState();
    }
};

// --- ADAPTIVE UI LOGIC ---

// This is the single source of truth for the input bar's appearance.
function updateInputState() {
    if (voiceState.isRecording) return; // Don't change UI during active recording

    const hasText = chatInput.value.trim().length > 0;
    const mobile = isMobile();

    // Adjust textarea height first
    chatInput.style.height = 'auto';
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, 128)}px`;

    if (mobile) {
        // --- Mobile View Logic ---
        toggleInputModeButton.classList.remove('hidden');

        if (isTextModeOnMobile) {
            // In text mode on mobile: show keyboard, textarea, and send button (if text exists)
            toggleInputModeButton.innerHTML = MicrophoneIcon;
            composeView.classList.remove('hidden');
            cameraButton.classList.remove('hidden');
            voiceRecordButton.classList.add('hidden');
            sendButton.classList.toggle('hidden', !hasText);
        } else {
            // In voice mode on mobile: show mic button as primary action
            toggleInputModeButton.innerHTML = KeyboardIcon;
            composeView.classList.add('hidden');
            cameraButton.classList.add('hidden');
            voiceRecordButton.classList.remove('hidden');
            sendButton.classList.add('hidden');
        }
    } else {
        // --- Desktop View Logic ---
        // Always show textarea, toggle send/mic based on text
        toggleInputModeButton.classList.add('hidden');
        composeView.classList.remove('hidden');
        cameraButton.classList.remove('hidden');
        sendButton.classList.toggle('hidden', !hasText);
        voiceRecordButton.classList.toggle('hidden', hasText);
    }
}

// Toggles between voice and text modes on mobile devices
function toggleInputMode() {
    if (!isMobile()) return;
    isTextModeOnMobile = !isTextModeOnMobile;
    updateInputState();
    if (isTextModeOnMobile) {
        chatInput.focus();
    }
}

// --- VOICE RECORDING LOGIC ---

function startRecording(e) {
    if (!speechRecognizer.isSupported || voiceState.isRecording) return;
    e.preventDefault();

    voiceState = {
        isRecording: true, isLocked: false, isCancelled: false,
        pointerStart: { x: e.clientX, y: e.clientY },
        startTime: Date.now(), timerInterval: null,
    };

    speechRecognizer.start();
    
    // UI Updates for recording
    inputBar.classList.add('recording');
    composeView.classList.add('hidden');
    recordingView.classList.remove('hidden');
    lockHint.classList.add('visible');
    cancelHint.classList.add('active');
    voiceRecordButton.classList.add('recording-active');

    // Timer
    recordingTimer.textContent = '0:00';
    voiceState.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - voiceState.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        recordingTimer.textContent = timeString;
        const lockedTimer = document.getElementById('recording-timer-locked');
        if (lockedTimer) lockedTimer.textContent = timeString;
    }, 1000);

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', stopRecording);
}

function handlePointerMove(e) {
    if (!voiceState.isRecording || voiceState.isLocked) return;
    e.preventDefault();

    const deltaX = e.clientX - voiceState.pointerStart.x;
    const deltaY = e.clientY - voiceState.pointerStart.y;

    // Slide left to cancel
    voiceState.isCancelled = deltaX < VOICE_THRESHOLD_X;
    inputBar.style.transform = voiceState.isCancelled ? `translateX(${deltaX}px)` : 'translateX(0)';

    // Slide up to lock
    lockHint.style.transform = `translateY(${Math.max(0, deltaY * -0.2)}px)`;
    if (deltaY < VOICE_THRESHOLD_Y) {
        lockHint.classList.add('is-locking');
        if (!voiceState.isLocked) lockRecording();
    } else {
        lockHint.classList.remove('is-locking');
    }
}

function lockRecording() {
    voiceState.isLocked = true;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopRecording);
    
    speechRecognizer.recognition.onend = () => {
        if (!voiceState.isLocked) speechRecognizer.onEnd('');
        speechRecognizer.isListening = false;
    };
    
    resetVoiceUI(true);
    composeView.classList.remove('hidden');
    composeView.classList.add('locked');
    composeView.insertAdjacentHTML('afterbegin', `<div id="recording-indicator-locked"><span class="dot"></span><span id="recording-timer-locked">0:00</span></div>`);
    
    recordingView.classList.add('hidden');
    voiceRecordButton.classList.add('hidden');
    sendButton.classList.remove('hidden');
    
    cameraButton.innerHTML = TrashIcon;
    cameraButton.id = 'cancel-locked-button'; // Temporarily re-purpose the camera button
    cameraButton.onclick = cancelRecording;
    cameraButton.classList.remove('hidden'); // Ensure it's visible
    toggleInputModeButton.classList.add('hidden'); // Hide the mode toggle

    chatInput.focus();
}

function stopRecording() {
    if (!voiceState.isRecording) return;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopRecording);
    
    if (voiceState.isCancelled) {
        cancelRecording();
    } else {
        speechRecognizer.stop(); // This triggers onEnd, sending the message
    }
    resetVoiceUI();
}

function cancelRecording() {
    voiceState.isRecording = false;
    voiceState.isLocked = false;
    speechRecognizer.recognition.onend = null; 
    speechRecognizer.stop();
    resetVoiceUI();
    updateInputState();
}

function resetVoiceUI(isEnteringLock = false) {
    clearInterval(voiceState.timerInterval);
    inputBar.style.transform = 'translateX(0)';
    
    if (!isEnteringLock) {
        voiceState.isRecording = false;
        voiceState.isLocked = false;
        composeView.classList.remove('hidden', 'locked');
        const lockedIndicator = document.getElementById('recording-indicator-locked');
        if (lockedIndicator) lockedIndicator.remove();
        
        const cancelButton = document.getElementById('cancel-locked-button');
        if (cancelButton) {
            cancelButton.innerHTML = CameraIcon;
            cancelButton.id = 'camera-button';
            cancelButton.onclick = null; // onclick will be reassigned in createChatInterface
        }
    }
    
    recordingView.classList.add('hidden');
    lockHint.classList.remove('visible', 'is-locking');
    lockHint.style.transform = 'translateY(20px)';
    cancelHint.classList.remove('active');
    voiceRecordButton.classList.remove('recording-active');
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
        <div id="chat-log" class="flex-1 overflow-y-auto p-4 space-y-4"></div>
        <div id="input-bar-wrapper" class="p-2 sm:p-4 bg-gray-900 border-t border-gray-700">
            <div id="lock-hint">
                 <div class="lock-icon-bg">${LockIcon}</div>
                 <svg class="w-4 h-16 text-gray-500" viewBox="0 0 10 80" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 75V5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 5"/></svg>
            </div>
            <div id="input-bar">
                <button id="toggle-input-mode-button" class="p-2.5 rounded-full hover:bg-gray-700 self-center flex-shrink-0"></button>
                <button id="camera-button" class="p-2.5 rounded-full hover:bg-gray-700 self-center flex-shrink-0">${CameraIcon}</button>
                <input type="file" id="file-input" class="hidden" accept="image/*">
                
                <div id="input-content-wrapper">
                    <!-- Default compose view -->
                    <div id="compose-view" class="w-full flex items-center">
                        <textarea id="chat-input" class="flex-1 bg-transparent focus:outline-none resize-none px-2 max-h-32 self-center" placeholder="Сообщение..." rows="1"></textarea>
                    </div>
                    <!-- Recording view (replaces compose) -->
                    <div id="recording-view" class="hidden">
                        <div id="recording-indicator">
                            <span class="dot"></span>
                            <span id="recording-timer">0:00</span>
                        </div>
                        <div id="cancel-hint">
                           ${ArrowLeftIcon} <span>Смахните для отмены</span>
                        </div>
                    </div>
                </div>

                <button id="send-button" class="p-2.5 rounded-full bg-blue-600 hover:bg-blue-700 self-center flex-shrink-0 hidden">${SendIcon}</button>
                <button id="voice-record-button" class="p-2.5 rounded-full bg-blue-600 hover:bg-blue-700 self-center flex-shrink-0">${MicrophoneIcon}</button>
            </div>
        </div>
    `;

    // --- DOM Element assignments ---
    chatLog = chatWrapper.querySelector('#chat-log');
    chatInput = chatWrapper.querySelector('#chat-input');
    sendButton = chatWrapper.querySelector('#send-button');
    voiceRecordButton = chatWrapper.querySelector('#voice-record-button');
    cameraButton = chatWrapper.querySelector('#camera-button');
    toggleInputModeButton = chatWrapper.querySelector('#toggle-input-mode-button');
    const fileInput = chatWrapper.querySelector('#file-input');
    inputBar = chatWrapper.querySelector('#input-bar');
    composeView = chatWrapper.querySelector('#compose-view');
    recordingView = chatWrapper.querySelector('#recording-view');
    lockHint = chatWrapper.querySelector('#lock-hint');
    cancelHint = chatWrapper.querySelector('#cancel-hint');
    recordingTimer = chatWrapper.querySelector('#recording-timer');
    
    // --- Event Listeners ---
    sendButton.addEventListener('click', sendMessageHandler);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessageHandler();
        }
    });

    chatInput.addEventListener('input', updateInputState);
    toggleInputModeButton.addEventListener('click', toggleInputMode);

    cameraButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleImageFile(file);
    });

    // --- Speech Recognizer Setup ---
    speechRecognizer = new SpeechRecognizer(
        (transcript) => {
            if (voiceState.isLocked) {
                 chatInput.value = transcript;
                 updateInputState();
            }
        },
        (finalTranscript) => {
             if (!voiceState.isCancelled && finalTranscript.trim()) {
                onSendMessageCallback(finalTranscript);
            }
        },
        (error) => {
            console.error('Speech recognition error:', error);
            resetVoiceUI();
        }
    );
    
    voiceRecordButton.addEventListener('pointerdown', startRecording);
    
    updateInputState(); // Initial call to set the correct UI state
    return chatWrapper;
}

export function addMessageToChat(message) {
    if (!chatLog) return;
    const welcomeScreen = chatLog.querySelector('.welcome-screen-container');
    if (welcomeScreen) chatLog.innerHTML = '';

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
    if (indicator) indicator.remove();
}