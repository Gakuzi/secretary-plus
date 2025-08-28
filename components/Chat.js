import { createMessageElement } from './Message.js';
import * as Icons from './icons/Icons.js';
import { SpeechRecognizer } from '../utils/speech.js';

// Module-level variables
let chatLog, chatInput, sendButton, voiceRecordButton, cameraButton, attachButton, fileInput;
let onSendMessageCallback, onSystemErrorCallback, onNewChatCallback;
let speechRecognizer;

// UI state for the new voice input
let recordMode = 'none'; // 'none', 'hold', 'tap', 'locked'
let recordingStartTime = 0;
let timerInterval = null;
let startY = 0; // For tracking vertical drag to lock
let tapTimeout = null;
const TAP_DURATION = 250; // ms to differentiate tap from hold

// --- File Drop & File Handling ---
function handleDragOver(e) { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e) { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-over'); }
function handleDrop(e) {
    handleDragLeave(e);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
}

async function handleFileSelect(file) {
    if (file.type.startsWith('image/')) {
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
    } else if (file.type === 'application/pdf') {
        const { pdfjsLib } = window;
        if (!pdfjsLib) {
            onSystemErrorCallback('Библиотека для чтения PDF не загружена. Функция недоступна.');
            console.error("pdf.js library (window.pdfjsLib) not found. PDF functionality will be disabled.");
            return;
        }
        // Set worker path for pdf.js right before use to avoid race conditions on app load.
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;

        const originalPlaceholder = chatInput.placeholder;
        chatInput.placeholder = `Обработка PDF: ${file.name}...`;
        chatInput.disabled = true;
        voiceRecordButton.disabled = true;
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument(arrayBuffer);
            const pdf = await loadingTask.promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                fullText += textContent.items.map(item => item.str).join(' ') + '\n';
            }
            
            const userPrompt = chatInput.value.trim();
            chatInput.value = '';
            updateInputUI();
            
            const finalPrompt = userPrompt 
              ? `${userPrompt}\n\nКонтекст из файла "${file.name}":\n\n${fullText.trim()}`
              : `Я загрузил файл "${file.name}". Проанализируй его и кратко изложи суть. Вот его содержимое:\n\n${fullText.trim()}`;
            
            onSendMessageCallback(finalPrompt, null);
        } catch (error) {
            console.error('Error processing PDF:', error);
            onSystemErrorCallback(`Не удалось обработать PDF файл: ${error.message}`);
        } finally {
            chatInput.placeholder = originalPlaceholder;
            chatInput.disabled = false;
            voiceRecordButton.disabled = false;
        }
    } else {
        onSystemErrorCallback('Неподдерживаемый тип файла. Пожалуйста, выберите изображение или PDF.');
    }
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
    chatInput.style.height = `${chatInput.scrollHeight}px`;

    // Toggle between voice and send button
    if (hasText) {
        voiceRecordButton.classList.add('hidden');
        sendButton.classList.remove('hidden');
    } else {
        voiceRecordButton.classList.remove('hidden');
        sendButton.classList.add('hidden');
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

    document.getElementById('internal-left-actions').classList.add('hidden');
    document.getElementById('cancel-recording-button').classList.remove('hidden');
    document.getElementById('input-bar').classList.add('recording-locked');
    document.getElementById('locked-recording-indicator').classList.remove('hidden');

    sendButton.classList.remove('hidden');
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
    
    document.getElementById('internal-left-actions').classList.remove('hidden');
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
export function createChatInterface(onSendMessage, showCameraView, onSystemError, onNewChat) {
    onSendMessageCallback = onSendMessage;
    onSystemErrorCallback = onSystemError;
    onNewChatCallback = onNewChat;

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
                    ${Icons.LockIcon}
                    <span>Проведите вверх, чтобы зафиксировать</span>
                </div>
            </div>
        </div>

        <div id="input-bar-container" class="p-2 sm:p-4 border-t border-gray-700">
            <!-- Contextual Actions Frame -->
            <div id="contextual-actions-frame" style="display: none;">
                <div id="action-bar-container" class="flex items-center justify-center flex-wrap gap-2">
                    <!-- Buttons will be rendered here by renderContextualActions -->
                </div>
            </div>
            <div class="flex items-end w-full gap-2">
                 <div id="bottom-left-actions" class="flex items-center self-end flex-shrink-0">
                     <button id="new-chat-button-bottom" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Начать новый чат">
                        ${Icons.NewChatIcon}
                    </button>
                    <button id="camera-button" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Сделать фото">
                        ${Icons.CameraIcon}
                    </button>
                    <button id="attach-button" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Прикрепить файл">
                        ${Icons.AttachmentIcon}
                    </button>
                </div>

                <div id="input-bar" class="flex items-end w-full flex-1 gap-2 bg-gray-800 rounded-2xl p-1 border border-gray-700">
                    <div id="internal-left-actions" class="flex items-center self-end flex-shrink-0 pl-2">
                        <!-- This container is for elements inside the input bar that might appear during special states, like recording lock -->
                    </div>
                    
                    <!-- This button is visually hidden but used to trigger file selection -->
                    <input type="file" id="file-input" class="hidden" accept="image/*,application/pdf">

                    <!-- Cancel button for locked recording -->
                    <button id="cancel-recording-button" class="hidden self-end flex-shrink-0 p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Отменить запись">
                        ${Icons.TrashIcon}
                    </button>

                    <!-- Flashing indicator for locked recording -->
                    <div id="locked-recording-indicator" class="hidden items-center gap-2 self-end flex-shrink-0 text-red-500 pl-2">
                        <span class="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                        <span class="font-mono font-semibold recording-timer">0:00</span>
                    </div>

                    <textarea id="chat-input" class="self-end" placeholder="Сообщение..." rows="1"></textarea>
                    
                    <div class="flex items-center self-end flex-shrink-0 p-1">
                        <button id="send-button" class="hidden flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors" aria-label="Отправить">
                            ${Icons.SendIcon}
                        </button>
                        <button id="voice-record-button" class="flex items-center justify-center w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors" aria-label="Записать голосовое сообщение">
                            ${Icons.MicrophoneIcon}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    chatLog = chatWrapper.querySelector('#chat-log');
    chatInput = chatWrapper.querySelector('#chat-input');
    sendButton = chatWrapper.querySelector('#send-button');
    voiceRecordButton = chatWrapper.querySelector('#voice-record-button');
    cameraButton = chatWrapper.querySelector('#camera-button');
    attachButton = chatWrapper.querySelector('#attach-button');
    fileInput = chatWrapper.querySelector('#file-input');
    const cancelRecordingButton = chatWrapper.querySelector('#cancel-recording-button');
    const newChatButtonBottom = chatWrapper.querySelector('#new-chat-button-bottom');

    // --- EVENT LISTENERS ---
    sendButton.addEventListener('click', sendMessageHandler);
    chatInput.addEventListener('input', updateInputUI);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessageHandler();
        }
    });

    newChatButtonBottom.addEventListener('click', onNewChatCallback);
    cameraButton.addEventListener('click', showCameraView);
    attachButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
            // Reset the input so the same file can be selected again
            e.target.value = null;
        }
    });

    voiceRecordButton.addEventListener('pointerdown', pointerDown);
    cancelRecordingButton.addEventListener('click', () => stopRecording(true));

    speechRecognizer = new SpeechRecognizer(
        (transcript) => {
            chatInput.value = transcript;
            updateInputUI();
        },
        (finalTranscript) => {
            if (recordMode === 'tap' && finalTranscript) {
                onSendMessageCallback(finalTranscript);
                chatInput.value = '';
                stopRecording(false);
            }
            if (recordMode === 'hold' && finalTranscript) {
                 onSendMessageCallback(finalTranscript);
                 chatInput.value = '';
            }
            updateInputUI();
        },
        (error) => {
            console.error('Speech recognition error:', error);
            if (error !== 'no-speech' && error !== 'aborted') {
                onSystemErrorCallback(`распознавания речи: ${error}`);
            }
            stopRecording(true); // Cancel on error
            updateInputUI();
        }
    );

    updateInputUI();

    return chatWrapper;
}

export function addMessageToChat(message) {
    if (!chatLog) return;
    const isScrolledToBottom = chatLog.scrollHeight - chatLog.clientHeight <= chatLog.scrollTop + 1;
    
    // Find and remove loading indicator if it exists
    const loadingIndicator = chatLog.querySelector('.loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
    
    const messageElement = createMessageElement(message);
    chatLog.appendChild(messageElement);

    if (isScrolledToBottom) {
        chatLog.scrollTop = chatLog.scrollHeight;
    }
}

export function showLoadingIndicator() {
    if (!chatLog || chatLog.querySelector('.loading-indicator')) return;
    
    const loadingElement = document.createElement('div');
    loadingElement.className = 'flex items-start space-x-3 message-item loading-indicator';
    loadingElement.innerHTML = `
        <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 bg-gray-700">S+</div>
        <div class="max-w-xl">
            <div class="font-bold">Секретарь+</div>
            <div class="p-3 rounded-lg mt-1 bg-gray-800 flex items-center">
                <span>Думаю</span>
                <div class="loading-dots">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>
        </div>
    `;
    chatLog.appendChild(loadingElement);
    chatLog.scrollTop = chatLog.scrollHeight;
}

export function hideLoadingIndicator() {
    const loadingIndicator = chatLog?.querySelector('.loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}


export function renderContextualActions(actions) {
    const frame = document.getElementById('contextual-actions-frame');
    const container = document.getElementById('action-bar-container');

    if (!frame || !container) return;

    if (!actions || actions.length === 0) {
        frame.style.display = 'none';
        return;
    }
    
    container.innerHTML = actions.map(action => {
        const iconSVG = Icons[action.icon] || '';
        return `
            <button class="action-bar-button flex items-center gap-2" data-action-prompt="${action.prompt}">
                ${iconSVG ? `<span class="w-4 h-4">${iconSVG}</span>` : ''}
                ${action.label}
            </button>
        `;
    }).join('');
    frame.style.display = 'block';
}