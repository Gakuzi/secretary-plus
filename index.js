import { GoogleServiceProvider } from './services/google/GoogleServiceProvider.js';
import { AppleServiceProvider } from './services/apple/AppleServiceProvider.js';
import { OutlookServiceProvider } from './services/outlook/OutlookServiceProvider.js';
import { callGemini } from './services/geminiService.js';
import { getSettings, saveSettings } from './utils/storage.js';
import { createSettingsModal } from './components/SettingsModal.js';
import { createStatsModal } from './components/StatsModal.js';
import { createWelcomeScreen } from './components/Welcome.js';
import { createChatInterface, addMessageToChat, showLoadingIndicator, hideLoadingIndicator } from './components/Chat.js';
import { createCameraView } from './components/CameraView.js';
import { SettingsIcon, ChartBarIcon } from './components/icons/Icons.js';
import { MessageSender } from './types.js';

// --- STATE MANAGEMENT ---
let state = {
    settings: {
        googleClientId: '',
        geminiApiKey: '',
        activeProviderId: 'google',
    },
    messages: [],
    isAuthenticated: false,
    userProfile: null,
    isLoading: false,
    actionStats: {}, // For tracking function calls
};

let activeProvider = null;
const serviceProviders = {
    google: new GoogleServiceProvider(),
    apple: new AppleServiceProvider(),
    outlook: new OutlookServiceProvider(),
};

// --- DOM ELEMENTS ---
const authContainer = document.getElementById('auth-container');
const mainContent = document.getElementById('main-content');
const settingsButton = document.getElementById('settings-button');
const statsButton = document.getElementById('stats-button');
const settingsModalContainer = document.getElementById('settings-modal-container');
const statsModalContainer = document.getElementById('stats-modal-container');
const cameraViewContainer = document.getElementById('camera-view-container');


// --- RENDER FUNCTIONS ---
function renderAuth() {
    authContainer.innerHTML = '';
    if (state.isAuthenticated && state.userProfile) {
        const profileElement = document.createElement('div');
        profileElement.className = 'flex items-center space-x-2';
        profileElement.innerHTML = `
            <img src="${state.userProfile.imageUrl}" alt="${state.userProfile.name}" class="w-8 h-8 rounded-full">
            <span class="text-sm font-medium hidden sm:block">${state.userProfile.name}</span>
            <button id="logout-button" class="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-md transition-colors">Выйти</button>
        `;
        authContainer.appendChild(profileElement);
        document.getElementById('logout-button').addEventListener('click', handleLogout);
    } else {
        const loginButton = document.createElement('button');
        loginButton.id = 'login-button';
        loginButton.className = 'px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors';
        loginButton.textContent = 'Войти';
        authContainer.appendChild(loginButton);
        document.getElementById('login-button').addEventListener('click', handleLogin);
    }
}

function renderMainContent() {
    mainContent.innerHTML = '';
    // Всегда создаем основной интерфейс чата (контейнер и поле ввода)
    const chatContainer = createChatInterface(handleSendMessage);
    mainContent.appendChild(chatContainer);
    
    // После создания интерфейса чата, находим кнопку камеры и вешаем обработчик
    document.getElementById('camera-button').addEventListener('click', showCameraView);


    // Определяем, что показывать в области сообщений: приветствие или историю
    const chatLog = document.getElementById('chat-log');
    if (state.messages.length === 0) {
        chatLog.appendChild(createWelcomeScreen());
    } else {
        state.messages.forEach(msg => addMessageToChat(msg));
    }
}


function render() {
    renderAuth();
    renderMainContent();
}


// --- EVENT HANDLERS & LOGIC ---

async function handleCardAction(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    e.preventDefault();

    const action = target.dataset.action;
    const payload = JSON.parse(target.dataset.payload);

    let userPromptText = '';
    let systemPrompt = '';

    if (action === 'select_contact') {
        userPromptText = `Выбран контакт: ${payload.name}`;
        if (payload.email) {
            systemPrompt = `Пользователь выбрал контакт: Имя - ${payload.name}, Email - ${payload.email}. Продолжай выполнение первоначального запроса с этой информацией.`;
        } else {
            systemPrompt = `Пользователь выбрал контакт '${payload.name}', у которого нет email адреса. Спроси у пользователя email для этого контакта, чтобы добавить его на встречу. Предложи вариант создать встречу без участников и просто получить ссылку для ручной отправки.`;
        }
    } else if (action === 'select_document') {
        userPromptText = `Выбран документ: ${payload.name}`;
        systemPrompt = `Пользователь выбрал документ: Название - "${payload.name}", Ссылка - ${payload.url}. Продолжай выполнение первоначального запроса с этой информацией.`;
    } else if (action === 'create_document_prompt') {
        userPromptText = `Да, создать новый документ с названием "${payload.query}"`;
        systemPrompt = `Пользователь согласился создать новый документ. Вызови функцию create_google_doc с названием "${payload.query}".`;
    } else if (action === 'create_meet_with') {
        userPromptText = `Создать видеовстречу с ${payload.name}`;
        systemPrompt = `Создай видеовстречу с ${payload.name} (${payload.email}) на ближайшее удобное время. Установи продолжительность 30 минут.`;
    } else if (action === 'send_meeting_link') {
        userPromptText = 'Да, отправить ссылку участникам.';
        systemPrompt = `Пользователь хочет отправить приглашение на встречу. Вызови функцию send_email с этими данными: ${JSON.stringify(payload)}`;
    } else if (action === 'create_prep_task') {
        userPromptText = 'Да, создать задачу для подготовки.';
        systemPrompt = `Пользователь хочет создать задачу для подготовки к встрече. Вызови функцию create_task с этими данными: ${JSON.stringify(payload)}`;
    } else if (action === 'create_doc_with_content') {
        userPromptText = `Да, создать документ "${payload.title}" с предложенным содержанием.`;
        systemPrompt = `Пользователь согласился создать документ с содержанием. Вызови функцию create_google_doc_with_content с этими данными: ${JSON.stringify(payload)}`;
    } else if (action === 'create_empty_doc') {
        userPromptText = `Нет, создать пустой документ "${payload.title}".`;
        systemPrompt = `Пользователь решил создать пустой документ. Вызови функцию create_google_doc с названием "${payload.title}".`;
    }


    if (!systemPrompt) return;

    // Add a visual confirmation message for the user
    const userMessage = { sender: MessageSender.USER, text: userPromptText, id: Date.now() };
    state.messages.push(userMessage);
    addMessageToChat(userMessage);

    // Send the system-level prompt to Gemini to continue the flow
    await handleSendMessage(systemPrompt, null, true);
}

async function handleQuickReply(e) {
    const target = e.target.closest('.quick-reply-button');
    if (!target || target.disabled) return;

    const replyText = target.dataset.replyText;

    // Visually update the UI immediately
    const container = target.closest('.quick-replies-container');
    container.querySelectorAll('button').forEach(btn => {
        btn.disabled = true;
        if (btn !== target) {
            btn.style.opacity = '0.5'; // Fade out other options
        }
    });
    target.classList.add('clicked'); // Highlight the clicked one

    // Send the reply as a new message
    await handleSendMessage(replyText);
}


async function handleSendMessage(prompt, image = null, isSystem = false) {
    if (state.isLoading || (!prompt && !image)) return;

    if (!state.settings.geminiApiKey) {
        const errorMessage = { sender: MessageSender.SYSTEM, text: "Ошибка: Ключ Gemini API не указан. Пожалуйста, добавьте его в настройках (иконка шестеренки в правом верхнем углу)." };
        addMessageToChat(errorMessage);
        return;
    }
    
    // Если это первое сообщение, очистим приветственный экран
    if (state.messages.length === 0) {
        const chatLog = document.getElementById('chat-log');
        if (chatLog) chatLog.innerHTML = '';
    }

    state.isLoading = true;

    // Only add user message to history if it's not a system message
    if (!isSystem) {
      const userMessage = { sender: MessageSender.USER, text: prompt, image, id: Date.now() };
      state.messages.push(userMessage);
      addMessageToChat(userMessage);
    }
    
    showLoadingIndicator();

    try {
        const isUnsupportedDomain = window.location.hostname !== 'localhost' && !window.location.hostname.endsWith('github.io');
        const response = await callGemini(
            prompt,
            state.messages.slice(0, -1), // Send history without the last user message
            activeProvider,
            isUnsupportedDomain,
            image,
            state.settings.geminiApiKey
        );

        // Track function call for stats
        if (response.functionCallName) {
            state.actionStats[response.functionCallName] = (state.actionStats[response.functionCallName] || 0) + 1;
        }

        state.messages.push(response);
        addMessageToChat(response);
    } catch (error) {
        console.error("Error calling Gemini:", error);
        const errorMessage = { sender: MessageSender.SYSTEM, text: `Произошла ошибка: ${error.message}` };
        state.messages.push(errorMessage);
        addMessageToChat(errorMessage);
    } finally {
        state.isLoading = false;
        hideLoadingIndicator();
    }
}

function showSettings() {
    const isUnsupportedDomain = window.location.hostname !== 'localhost' && !window.location.hostname.endsWith('github.io');
    const modal = createSettingsModal(
        state.settings, 
        serviceProviders, 
        handleSaveSettings, 
        hideSettings, 
        isUnsupportedDomain,
        handleAuthAndSave
    );
    settingsModalContainer.innerHTML = '';
    settingsModalContainer.appendChild(modal);
    settingsModalContainer.classList.remove('hidden');
}

function hideSettings() {
    settingsModalContainer.classList.add('hidden');
    settingsModalContainer.innerHTML = '';
}

function showStatsModal() {
    const modal = createStatsModal(state.actionStats, hideStatsModal);
    statsModalContainer.innerHTML = '';
    statsModalContainer.appendChild(modal);
    statsModalContainer.classList.remove('hidden');
}

function hideStatsModal() {
    statsModalContainer.classList.add('hidden');
    statsModalContainer.innerHTML = '';
}

function showCameraView() {
    const cameraView = createCameraView(
        (image) => { // onCapture
            handleSendMessage(null, image);
            hideCameraView();
        },
        () => { // onClose
            hideCameraView();
        }
    );
    cameraViewContainer.innerHTML = '';
    cameraViewContainer.appendChild(cameraView);
    cameraViewContainer.classList.remove('hidden');
}

function hideCameraView() {
    cameraViewContainer.classList.add('hidden');
    cameraViewContainer.innerHTML = ''; // Clean up to stop stream etc.
}


function handleSaveSettings(newSettings) {
    state.settings = newSettings;
    saveSettings(newSettings);
    hideSettings();
    // Re-initialize provider if client ID changed
    setupActiveProvider();
    checkAuth();
}

async function handleAuthAndSave(newSettings) {
    state.settings = newSettings;
    saveSettings(newSettings);
    setupActiveProvider();
    hideSettings();
    // handleLogin will show its own alerts and trigger the auth flow
    await handleLogin();
}


async function handleLogin() {
    if (!activeProvider) {
        alert('Сервис авторизации не настроен.');
        return;
    }
    if (!state.settings.googleClientId && state.settings.activeProviderId === 'google') {
        alert('Google Client ID не указан в настройках.');
        return;
    }
    try {
        await activeProvider.authenticate();
        await checkAuth();
    } catch (error) {
        console.error("Authentication failed", error);
        alert(`Ошибка авторизации: ${error.message || 'попробуйте еще раз.'}`);
    }
}

async function handleLogout() {
    if (activeProvider) {
        await activeProvider.disconnect();
    }
    state.isAuthenticated = false;
    state.userProfile = null;
    renderAuth();
}

async function checkAuth() {
    if (activeProvider) {
        try {
            const isAuthenticated = await activeProvider.isAuthenticated();
            state.isAuthenticated = isAuthenticated;
            if (isAuthenticated) {
                state.userProfile = await activeProvider.getUserProfile();
            } else {
                state.userProfile = null;
            }
        } catch (error) {
            console.warn(`Не удалось проверить статус авторизации: ${error.message}`);
            state.isAuthenticated = false;
            state.userProfile = null;
        }
    } else {
        state.isAuthenticated = false;
        state.userProfile = null;
    }
    renderAuth();
}

function setupActiveProvider() {
    const providerId = state.settings.activeProviderId;
    if (providerId === 'google') {
        // This will now use the setter in GoogleServiceProvider to reset initialization
        serviceProviders.google.clientId = state.settings.googleClientId;
        activeProvider = serviceProviders.google;
    } else {
        activeProvider = serviceProviders[providerId] || null;
    }
}


// --- INITIALIZATION ---
function init() {
    settingsButton.innerHTML = SettingsIcon;
    statsButton.innerHTML = ChartBarIcon;

    settingsButton.addEventListener('click', showSettings);
    statsButton.addEventListener('click', showStatsModal);

    mainContent.addEventListener('click', (e) => {
        handleCardAction(e);
        handleQuickReply(e);
    });

    state.settings = getSettings();
    setupActiveProvider();
    checkAuth();
    render();
}

document.addEventListener('DOMContentLoaded', init);