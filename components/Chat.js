import { createMessageElement } from './Message.js';
import { MicrophoneIcon, SendIcon, CameraIcon, LockIcon, TrashIcon, AttachmentIcon } from './icons/Icons.js';
import { SpeechRecognizer } from '../utils/speech.js';

// Module-level variables
let chatLog, chatInput, sendButton, voiceRecordButton, cameraButton, attachButton, fileInput;
let onSendMessageCallback;
let speechRecognizer;

// UI state for the new voice input
let recordMode = 'none'; // 'none', 'hold', 'tap', 'locked'
let recordingStartTime = 0;
let timerInterval = null;
let startY = 0; // For tracking vertical drag to lock
let tapTimeout = null;
const TAP_DURATION = 250; // ms to differentiate tap from hold

// --- File Drop & Image Handling ---
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
        updateInputUI();
    };
    reader.readAsDataURL(file);
}

// --- Message Sending Logic ---
const sendMessageHandler = () => {
    const prompt = chatInput.value.trim();
    if (prompt) {
        onSendMessageCallback(prompt);
        chatInput.value = '';
        if (recordMode === 'locked') {
            stopRecording(false); // Stop and reset UI if it was locked
        }
        updateInputUI();
    }
};

// --- UI Updates ---
function updateInputUI() {
    const hasText = chatInput.value.trim().length > 0;
    
    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, 128)}px`;

    // Toggle between voice and send button
    if (hasText) {
        voiceRecordButton.classList.add('hidden');
        sendButton.classList.remove('hidden');
        sendButton.classList.add('flex');
    } else {
        voiceRecordButton.classList.remove('hidden');
        sendButton.classList.add('hidden');
        sendButton.classList.remove('flex');
    }
}

// --- Voice Recording Logic ---

function pointerDown(e) {
    if (recordMode !== 'none' || !speechRecognizer?.isSupported) return;
    e.preventDefault();

    startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    
    // Differentiate between tap and hold
    tapTimeout = setTimeout(() => {
        tapTimeout = null;
        recordMode = 'hold';
        startRecording(true); // Start in continuous mode for hold
    }, TAP_DURATION);
    
    document.addEventListener('pointermove', pointerMove);
    document.addEventListener('pointerup', pointerUp, { once: true });
}

function pointerMove(e) {
    if (recordMode !== 'hold') return;

    const currentY = e.clientY;
    const deltaY = startY - currentY;
    
    if (deltaY > 60) {
        lockRecording();
    }
}

function pointerUp() {
    clearTimeout(tapTimeout);
    
    if (tapTimeout) { // Pointer up happened before hold threshold -> TAP
        recordMode = 'tap';
        startRecording(false); // Start in non-continuous mode for tap
    } else if (recordMode === 'hold') { // Pointer up happened after hold threshold -> HOLD/RELEASE
        stopRecording(false); // Stop and send
    }
    
    document.removeEventListener('pointermove', pointerMove);
}

function startRecording(isContinuous) {
    if (!speechRecognizer) return;

    recordingStartTime = Date.now();
    speechRecognizer.start(isContinuous);

    if (recordMode === 'hold') {
        document.body.classList.add('recording-active');
        document.getElementById('recording-indicator-panel').classList.remove('hidden');
    }
    
    chatInput.placeholder = 'Идет запись...';
    voiceRecordButton.classList.add('bg-red-500', 'hover:bg-red-600', 'scale-110');
    
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

function lockRecording() {
    if (recordMode !== 'hold') return;
    recordMode = 'locked';
    
    // Update UI for locked state
    document.getElementById('recording-indicator-panel').classList.add('hidden');
    document.body.classList.remove('recording-active');

    document.getElementById('left-actions').classList.add('hidden');
    document.getElementById('cancel-recording-button').classList.remove('hidden');
    document.getElementById('input-bar').classList.add('recording-locked');
    document.getElementById('locked-recording-indicator').classList.remove('hidden');

    sendButton.classList.remove('hidden');
    sendButton.classList.add('flex');
    voiceRecordButton.classList.add('hidden');
    chatInput.placeholder = '';
}

function stopRecording(isCancel) {
    if (recordMode === 'none') return;
    
    clearInterval(timerInterval);
    const wasLocked = recordMode === 'locked';
    recordMode = 'none';

    if (isCancel) {
        speechRecognizer.abort();
        chatInput.value = '';
    } else {
        speechRecognizer.stop();
    }
    
    // Reset UI
    document.body.classList.remove('recording-active');
    document.getElementById('recording-indicator-panel').classList.add('hidden');
    
    document.getElementById('left-actions').classList.remove('hidden');
    document.getElementById('cancel-recording-button').classList.add('hidden');
    document.getElementById('input-bar').classList.remove('recording-locked');
    document.getElementById('locked-recording-indicator').classList.add('hidden');
    
    chatInput.placeholder = 'Сообщение...';
    voiceRecordButton.classList.remove('bg-red-500', 'hover:bg-red-600', 'scale-110');
    
    if (wasLocked) {
        updateInputUI();
    }
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    const timers = document.querySelectorAll('.recording-timer');
    timers.forEach(t => t.textContent = timeString);
}


// --- CHAT INTERFACE CREATION ---
export function createChatInterface(onSendMessage, showCameraView) {
    onSendMessageCallback = onSendMessage;

    const chatWrapper = document.createElement('div');
    chatWrapper.className = 'flex flex-col h-full bg-gray-900';
    chatWrapper.addEventListener('dragover', handleDragOver);
    chatWrapper.addEventListener('dragleave', handleDragLeave);
    chatWrapper.addEventListener('drop', handleDrop);

    chatWrapper.innerHTML = `
        <div id="chat-log" class="flex-1 overflow-y-auto p-4 space-y-4"></div>

        <!-- This panel appears during hold-to-record -->
        <div id="recording-indicator-panel" class="hidden fixed inset-x-0 bottom-24 flex items-center justify-center pointer-events-none">
            <div class="flex items-center gap-4 bg-gray-800/90 backdrop-blur-sm shadow-lg rounded-full px-6 py-3 border border-gray-700">
                <div class="flex items-center gap-2 text-red-500">
                    <span class="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                    <span class="font-mono font-semibold text-lg recording-timer">0:00</span>
                </div>
                <div class="text-gray-400">Отпустите, чтобы отправить</div>
                <div class="flex items-center gap-2 text-gray-400">
                    ${LockIcon}
                    <span>Проведите вверх, чтобы зафиксировать</span>
                </div>
            </div>
        </div>

        <div id="input-bar-wrapper" class="p-2 sm:p-4 border-t border-gray-700">
            <div class="flex items-center w-full gap-2">
                <div id="left-actions" class="flex items-center gap-1">
                    <button id="camera-button" class="p-2.5 rounded-full hover:bg-gray-700 flex-shrink-0">${CameraIcon}</button>
                    <button id="attach-button" class="p-2.5 rounded-full hover:bg-gray-700 flex-shrink-0">${AttachmentIcon}</button>
                    <input type="file" id="file-input" class="hidden" accept="image/*">
                </div>
                <button id="cancel-recording-button" class="hidden p-2.5 rounded-full hover:bg-gray-700 text-red-500 flex-shrink-0">${TrashIcon}</button>
                
                <div id="input-bar" class="flex-1 relative flex items-center bg-gray-800 rounded-2xl">
                    <div id="locked-recording-indicator" class="hidden absolute left-4 items-center gap-2 text-red-500 font-mono font-semibold">
                        <span class="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>
                        <span class="recording-timer">0:00</span>
                    </div>
                    <textarea id="chat-input" placeholder="Сообщение..." rows="1" class="w-full px-4 py-4 bg-transparent border-none outline-none text-gray-100 text-base resize-none"></textarea>
                </div>

                <button id="send-button" class="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 flex-shrink-0 hidden items-center justify-center">${SendIcon}</button>
                <button id="voice-record-button" class="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 flex-shrink-0 flex items-center justify-center">${MicrophoneIcon}</button>
            </div>
        </div>
    `;

    // --- DOM Element assignments ---
    chatLog = chatWrapper.querySelector('#chat-log');
    chatInput = chatWrapper.querySelector('#chat-input');
    sendButton = chatWrapper.querySelector('#send-button');
    voiceRecordButton = chatWrapper.querySelector('#voice-record-button');
    cameraButton = chatWrapper.querySelector('#camera-button');
    attachButton = chatWrapper.querySelector('#attach-button');
    fileInput = chatWrapper.querySelector('#file-input');
    
    // --- Event Listeners ---
    sendButton.addEventListener('click', sendMessageHandler);
    chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessageHandler(); } });
    chatInput.addEventListener('input', updateInputUI);
    
    cameraButton.addEventListener('click', showCameraView); 
    attachButton.addEventListener('click', () => fileInput.click()); 
    fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleImageFile(e.target.files[0]); });

    voiceRecordButton.addEventListener('pointerdown', pointerDown);
    chatWrapper.querySelector('#cancel-recording-button').addEventListener('click', () => stopRecording(true));

    // --- Speech Recognizer Setup ---
    speechRecognizer = new SpeechRecognizer(
        (transcript) => {
            // Live transcription
            chatInput.value = transcript;
            updateInputUI();
            chatInput.scrollTop = chatInput.scrollHeight; // Keep cursor visible
        },
        (finalTranscript) => {
            // On successful end
            stopRecording(false); // Clean up UI state
            if (finalTranscript.trim()) {
                chatInput.value = finalTranscript;
                sendMessageHandler();
            }
            updateInputUI();
        },
        (error) => {
            console.error('Speech recognition error:', error);
            if (error !== 'no-speech' && error !== 'aborted') {
                 alert(`Ошибка распознавания речи: ${error}`);
            }
            stopRecording(true); // Cancel on error
            updateInputUI();
        }
    );

    updateInputUI();
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