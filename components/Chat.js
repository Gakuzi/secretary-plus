import { createMessageElement } from './Message.js';
import { MicrophoneIcon, SendIcon, CameraIcon, LockIcon, TrashIcon, ArrowLeftIcon, KeyboardIcon } from './icons/Icons.js';
import { SpeechRecognizer } from '../utils/speech.js';

// Module-level variables
let chatLog, chatInput, sendButton, voiceRecordButton, cameraButton, toggleInputModeButton, fileInput;
let speechRecognizer, onSendMessageCallback, showCameraViewCallback;
let inputBar, composeView, recordingView, lockHint, cancelHint, recordingIndicator, recordingTimer;

// State for UI and voice recording
let isTextModeOnMobile = false;
const VOICE_LOCK_THRESHOLD_Y = -60; // Pixels to slide up to lock
const VOICE_CANCEL_THRESHOLD_X = -80; // Pixels to slide left to cancel
let voiceState = {
    isRecording: false, isLocked: false, isCancelled: false,
    pointerStart: { x: 0, y: 0 }, currentPos: {x: 0, y: 0},
    startTime: 0, timerInterval: null,
};

// --- UTILITIES ---
function isMobile() {
    return document.body.classList.contains('is-mobile');
}

// --- EVENT HANDLERS for File Drop ---
function handleDragOver(e) { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e) { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-over'); }
function handleDrop(e) {
    handleDragLeave(e);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageFile(file);
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

// --- SEND MESSAGE LOGIC ---
const sendMessageHandler = () => {
    const prompt = chatInput.value.trim();
    if (prompt) {
        onSendMessageCallback(prompt, null);
        chatInput.value = '';
        if (voiceState.isLocked) resetVoiceRecording();
        updateInputState();
    }
};

// --- ADAPTIVE UI LOGIC ---
function updateInputState() {
    if (voiceState.isRecording && !voiceState.isLocked) return;

    const hasText = chatInput.value.trim().length > 0;
    const mobile = isMobile();

    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, 128)}px`;

    if (mobile) {
        // --- Mobile View ---
        toggleInputModeButton.classList.remove('hidden');
        if (isTextModeOnMobile) {
            toggleInputModeButton.innerHTML = MicrophoneIcon;
            composeView.classList.remove('hidden');
            cameraButton.classList.remove('hidden');
            voiceRecordButton.classList.add('hidden');
            sendButton.classList.toggle('hidden', !hasText);
        } else {
            toggleInputModeButton.innerHTML = KeyboardIcon;
            composeView.classList.add('hidden');
            cameraButton.classList.add('hidden');
            voiceRecordButton.classList.remove('hidden');
            sendButton.classList.add('hidden');
        }
    } else {
        // --- Desktop View ---
        toggleInputModeButton.classList.add('hidden');
        composeView.classList.remove('hidden');
        cameraButton.classList.remove('hidden');
        sendButton.classList.toggle('hidden', !hasText);
        voiceRecordButton.classList.toggle('hidden', hasText);
    }
}

function toggleInputMode() {
    if (!isMobile()) return;
    isTextModeOnMobile = !isTextModeOnMobile;
    updateInputState();
    if (isTextModeOnMobile) chatInput.focus();
}

// --- VOICE RECORDING LOGIC (TELEGRAM STYLE) ---
function startVoiceRecording(e) {
    if (!speechRecognizer || !speechRecognizer.isSupported || voiceState.isRecording) return;
    e.preventDefault();

    voiceState = {
        isRecording: true, isLocked: false, isCancelled: false,
        pointerStart: { x: e.clientX, y: e.clientY },
        currentPos: { x: e.clientX, y: e.clientY },
        startTime: Date.now(), timerInterval: null,
    };
    
    speechRecognizer.start();
    
    // UI Updates
    chatInput.style.opacity = '0';
    recordingView.classList.add('visible');
    lockHint.classList.add('visible');
    cancelHint.classList.add('visible');
    cancelHint.classList.add('animated');
    voiceRecordButton.classList.add('recording-active');
    
    // Timer
    voiceState.timerInterval = setInterval(updateRecordingTimer, 1000);
    updateRecordingTimer();

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishVoiceRecording);
}

function handlePointerMove(e) {
    if (!voiceState.isRecording || voiceState.isLocked) return;
    e.preventDefault();

    voiceState.currentPos = { x: e.clientX, y: e.clientY };
    const deltaX = voiceState.currentPos.x - voiceState.pointerStart.x;
    const deltaY = voiceState.currentPos.y - voiceState.pointerStart.y;
    
    // Animate UI based on drag
    inputBar.style.transform = `translateX(${Math.min(0, deltaX)}px)`;
    lockHint.style.transform = `translateY(${Math.min(0, deltaY)}px)`;

    // Check for cancel
    const isCancelling = deltaX < VOICE_CANCEL_THRESHOLD_X;
    if (isCancelling) {
        voiceState.isCancelled = true;
        inputBar.classList.add('is-cancelling');
    } else {
        voiceState.isCancelled = false;
        inputBar.classList.remove('is-cancelling');
    }
    
    // Check for lock
    const isLocking = deltaY < VOICE_LOCK_THRESHOLD_Y;
    if (isLocking) {
        lockHint.classList.add('is-locking');
        if (!voiceState.isLocked) lockVoiceRecording();
    } else {
        lockHint.classList.remove('is-locking');
    }
}

function lockVoiceRecording() {
    voiceState.isLocked = true;
    cleanUpPointerEvents();
    
    speechRecognizer.recognition.onend = () => {
        if (!voiceState.isLocked) speechRecognizer.onEnd('');
        speechRecognizer.isListening = false;
    };
    
    resetVoiceUI(true); // Reset UI but keep state
    composeView.classList.add('locked');
    chatInput.style.opacity = '1';
    chatInput.placeholder = 'Запись... говорите';
    composeView.insertAdjacentHTML('afterbegin', `<div id="recording-indicator-locked"><span class="dot"></span><span id="recording-timer-locked">0:00</span></div>`);
    
    voiceRecordButton.classList.add('hidden');
    sendButton.classList.remove('hidden');
    
    cameraButton.innerHTML = TrashIcon;
    cameraButton.onclick = cancelVoiceRecording;
    cameraButton.classList.remove('hidden');
    toggleInputModeButton.classList.add('hidden');

    chatInput.focus();
}

function finishVoiceRecording() {
    if (!voiceState.isRecording) return;
    cleanUpPointerEvents();
    
    if (voiceState.isCancelled) {
        speechRecognizer.stop();
    } else {
        speechRecognizer.stop(); // This triggers onEnd, which sends the message
    }
    resetVoiceRecording();
}

function cancelVoiceRecording() {
    voiceState.isCancelled = true;
    speechRecognizer.stop();
    resetVoiceRecording();
}

function resetVoiceRecording() {
    cleanUpPointerEvents();
    resetVoiceUI();
    updateInputState();
}

// --- UI & STATE CLEANUP ---
function updateRecordingTimer() {
    const elapsed = Math.floor((Date.now() - voiceState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    recordingTimer.textContent = timeString;
    const lockedTimer = document.getElementById('recording-timer-locked');
    if (lockedTimer) lockedTimer.textContent = timeString;
}

function cleanUpPointerEvents() {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', finishVoiceRecording);
}

function resetVoiceUI(isEnteringLock = false) {
    clearInterval(voiceState.timerInterval);
    inputBar.style.transform = 'translateX(0)';
    inputBar.classList.remove('is-cancelling');
    
    if (!isEnteringLock) {
        Object.assign(voiceState, { isRecording: false, isLocked: false, isCancelled: false });
        composeView.classList.remove('locked');
        chatInput.placeholder = 'Сообщение...';
        const lockedIndicator = document.getElementById('recording-indicator-locked');
        if (lockedIndicator) lockedIndicator.remove();
        
        cameraButton.innerHTML = CameraIcon;
        cameraButton.onclick = () => fileInput.click();
    }
    
    chatInput.style.opacity = '1';
    recordingView.classList.remove('visible');
    lockHint.classList.remove('visible', 'is-locking');
    lockHint.style.transform = 'translateY(20px)';
    cancelHint.classList.remove('visible', 'animated');
    voiceRecordButton.classList.remove('recording-active');
}

// --- CHAT INTERFACE CREATION ---
export function createChatInterface(onSendMessage, showCameraView) {
    onSendMessageCallback = onSendMessage;
    showCameraViewCallback = showCameraView;

    const chatWrapper = document.createElement('div');
    chatWrapper.className = 'flex flex-col h-full bg-gray-900';
    chatWrapper.addEventListener('dragover', handleDragOver);
    chatWrapper.addEventListener('dragleave', handleDragLeave);
    chatWrapper.addEventListener('drop', handleDrop);

    chatWrapper.innerHTML = `
        <div id="chat-log" class="flex-1 overflow-y-auto p-4 space-y-4"></div>
        <div id="input-bar-wrapper" class="p-2 sm:p-4 border-t border-gray-700">
            <div id="lock-hint">
                 <div class="lock-icon-bg">${LockIcon}</div>
                 <svg class="w-4 h-16 text-gray-500" viewBox="0 0 10 80" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 75V5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 5"/></svg>
            </div>
            <div id="input-bar">
                <button id="toggle-input-mode-button" class="p-2.5 rounded-full hover:bg-gray-700 self-center flex-shrink-0"></button>
                <button id="camera-button" class="p-2.5 rounded-full hover:bg-gray-700 self-center flex-shrink-0">${CameraIcon}</button>
                <input type="file" id="file-input" class="hidden" accept="image/*">
                
                <div id="input-content-wrapper">
                    <div id="compose-view" class="relative w-full flex items-end">
                      <textarea id="chat-input" placeholder="Сообщение..." rows="1"></textarea>
                    </div>
                    <div id="recording-view">
                        <div id="recording-indicator"><span class="dot"></span><span id="recording-timer">0:00</span></div>
                        <div id="cancel-hint">${ArrowLeftIcon} <span>Смахните для отмены</span></div>
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
    fileInput = chatWrapper.querySelector('#file-input');
    inputBar = chatWrapper.querySelector('#input-bar');
    composeView = chatWrapper.querySelector('#compose-view');
    recordingView = chatWrapper.querySelector('#recording-view');
    lockHint = chatWrapper.querySelector('#lock-hint');
    cancelHint = chatWrapper.querySelector('#cancel-hint');
    recordingIndicator = chatWrapper.querySelector('#recording-indicator');
    recordingTimer = chatWrapper.querySelector('#recording-timer');
    
    // --- Event Listeners ---
    sendButton.addEventListener('click', sendMessageHandler);
    chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessageHandler(); } });
    chatInput.addEventListener('input', updateInputState);
    toggleInputModeButton.addEventListener('click', toggleInputMode);
    
    cameraButton.addEventListener('click', () => fileInput.click()); 
    fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleImageFile(e.target.files[0]); });

    // --- Speech Recognizer Setup ---
    speechRecognizer = new SpeechRecognizer(
        (transcript) => {
            if (voiceState.isLocked) { 
              chatInput.value = transcript; 
              updateInputState(); 
              // Move cursor to end
              chatInput.scrollTop = chatInput.scrollHeight;
              chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
            }
        },
        (finalTranscript) => {
             if (!voiceState.isCancelled && finalTranscript.trim()) { onSendMessageCallback(finalTranscript); }
        },
        (error) => { console.error('Speech recognition error:', error); if (error !== 'no-speech') resetVoiceRecording(); }
    );
    
    voiceRecordButton.addEventListener('pointerdown', startVoiceRecording);
    
    updateInputState(); // Initial call to set the correct UI state
    return chatWrapper;
}

// --- PUBLIC FUNCTIONS FOR CHAT MANIPULATION ---
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
    loadingElement.className = 'flex items-start space-x-3 message-item';
    loadingElement.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold text-lg flex-shrink-0">S+</div>
        <div class="max-w-xl">
            <div class="font-bold">Секретарь+</div>
            <div class="p-3 rounded-lg mt-1 bg-gray-800">
                <div class="text-gray-400">Думаю<span class="blinking-cursor"></span></div>
            </div>
        </div>
    `;
    chatLog.appendChild(loadingElement);
    chatLog.scrollTop = chatLog.scrollHeight;
}

export function hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.remove();
}