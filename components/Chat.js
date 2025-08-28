import { createMessageElement } from './Message.js';
import { AttachmentIcon, MicrophoneIcon, SendIcon, CameraIcon } from './icons/Icons.js';
import { SpeechRecognizer } from '../utils/speech.js';

let chatLog;
let chatInput;
let sendButton;
let speechRecognizer;
let onSendMessageCallback;

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
    };
    reader.readAsDataURL(file);
}

const sendMessageHandler = (promptOverride = null) => {
    const prompt = (typeof promptOverride === 'string') ? promptOverride : chatInput.value.trim();
    if (prompt) {
        onSendMessageCallback(prompt, null);
        chatInput.value = '';
        chatInput.style.height = 'auto';
    }
};

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
            <div class="flex items-center bg-gray-900 rounded-lg p-2">
                <textarea id="chat-input" class="flex-1 bg-transparent focus:outline-none resize-none px-2" placeholder="Спросите что-нибудь..." rows="1"></textarea>
                <button id="attach-button" class="p-2 rounded-full hover:bg-gray-700">${AttachmentIcon}</button>
                <input type="file" id="file-input" class="hidden" accept="image/*">
                <button id="camera-button" class="p-2 rounded-full hover:bg-gray-700">${CameraIcon}</button>
                <button id="mic-button" class="p-2 rounded-full hover:bg-gray-700">${MicrophoneIcon}</button>
                <button id="send-button" class="p-2 rounded-full bg-blue-600 hover:bg-blue-700 ml-2">${SendIcon}</button>
            </div>
        </div>
    `;

    chatLog = chatWrapper.querySelector('#chat-log');
    chatInput = chatWrapper.querySelector('#chat-input');
    sendButton = chatWrapper.querySelector('#send-button');
    const micButton = chatWrapper.querySelector('#mic-button');
    const attachButton = chatWrapper.querySelector('#attach-button');
    const fileInput = chatWrapper.querySelector('#file-input');
    
    sendButton.addEventListener('click', () => sendMessageHandler());
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessageHandler();
        }
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = `${chatInput.scrollHeight}px`;
    });

    attachButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleImageFile(file);
    });

    speechRecognizer = new SpeechRecognizer(
        (transcript) => { // onResult (interim or final)
            chatInput.value = transcript;
            chatInput.dispatchEvent(new Event('input')); // Trigger auto-resize
        },
        (finalTranscript) => { // onAutoEnd (sends message automatically)
            micButton.classList.remove('text-red-500');
            if (finalTranscript.trim()) {
                sendMessageHandler(finalTranscript);
            }
        },
        (error) => { // onError
            console.error('Speech recognition error:', error);
            alert(`Ошибка распознавания речи: ${error}`);
            micButton.classList.remove('text-red-500');
        }
    );

    micButton.addEventListener('click', () => {
        if (!speechRecognizer.isSupported) {
            alert("Распознавание речи не поддерживается в этом браузере.");
            return;
        }
        if (speechRecognizer.isListening) {
            speechRecognizer.stop(); // Manual stop, will not auto-send
            micButton.classList.remove('text-red-500');
        } else {
            speechRecognizer.start(); // Start listening
            micButton.classList.add('text-red-500');
        }
    });

    return chatWrapper;
}

export function addMessageToChat(message) {
    if (!chatLog) return;

    // При добавлении сообщения, если приветственный экран все еще там, убираем его.
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