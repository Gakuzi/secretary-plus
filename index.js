import { GoogleServiceProvider } from './services/google/GoogleServiceProvider.js';
import { SupabaseService } from './services/supabase/SupabaseService.js';
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
        supabaseUrl: '',
        supabaseAnonKey: '',
        geminiApiKey: '',
    },
    messages: [],
    isSupabaseConnected: false,
    isGoogleConnected: false,
    userProfile: null, // From Google
    supabaseUser: null, // From Supabase
    isLoading: false,
    actionStats: {}, // For tracking function calls
};

// --- SERVICE INSTANCES ---
const googleProvider = new GoogleServiceProvider();
let supabaseService = null;

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
    if (state.isGoogleConnected && state.userProfile) {
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
        loginButton.textContent = 'Войти через Google';
        authContainer.appendChild(loginButton);
        document.getElementById('login-button').addEventListener('click', handleLogin);
    }
}

function renderMainContent() {
    mainContent.innerHTML = '';
    const chatContainer = createChatInterface(handleSendMessage);
    mainContent.appendChild(chatContainer);
    
    document.getElementById('camera-button').addEventListener('click', showCameraView);

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

    const userMessage = { sender: MessageSender.USER, text: userPromptText, id: Date.now() };
    state.messages.push(userMessage);
    addMessageToChat(userMessage);

    await handleSendMessage(systemPrompt, null, true);
}

async function handleQuickReply(e) {
    const target = e.target.closest('.quick-reply-button');
    if (!target || target.disabled) return;

    const replyText = target.dataset.replyText;

    const container = target.closest('.quick-replies-container');
    container.querySelectorAll('button').forEach(btn => {
        btn.disabled = true;
        if (btn !== target) {
            btn.style.opacity = '0.5';
        }
    });
    target.classList.add('clicked');

    await handleSendMessage(replyText);
}


async function handleSendMessage(prompt, image = null, isSystem = false) {
    if (state.isLoading || (!prompt && !image)) return;

    if (!state.settings.geminiApiKey) {
        const errorMessage = { sender: MessageSender.SYSTEM, text: "Ошибка: Ключ Gemini API не указан. Пожалуйста, добавьте его в настройках." };
        addMessageToChat(errorMessage);
        return;
    }
    
    if (state.messages.length === 0) {
        const chatLog = document.getElementById('chat-log');
        if (chatLog) chatLog.innerHTML = '';
    }

    state.isLoading = true;

    if (!isSystem) {
      const userMessage = { sender: MessageSender.USER, text: prompt, image, id: Date.now() };
      state.messages.push(userMessage);
      addMessageToChat(userMessage);
    }
    
    showLoadingIndicator();

    try {
        const response = await callGemini(
            prompt,
            state.messages.slice(0, -1),
            googleProvider,
            supabaseService,
            state.isGoogleConnected,
            image,
            state.settings.geminiApiKey
        );

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
    const modal = createSettingsModal(
        state.settings,
        {
            isSupabaseConnected: state.isSupabaseConnected,
            isGoogleConnected: state.isGoogleConnected,
            supabaseUser: state.supabaseUser,
        },
        handleSaveSettings, 
        hideSettings,
        googleProvider,
        supabaseService
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
        (image) => { 
            handleSendMessage(null, image);
            hideCameraView();
        },
        () => {
            hideCameraView();
        }
    );
    cameraViewContainer.innerHTML = '';
    cameraViewContainer.appendChild(cameraView);
    cameraViewContainer.classList.remove('hidden');
}

function hideCameraView() {
    cameraViewContainer.classList.add('hidden');
    cameraViewContainer.innerHTML = '';
}


async function handleSaveSettings(newSettings) {
    state.settings = newSettings;
    saveSettings(newSettings);
    hideSettings();
    await initializeSupabase(); 
    // Re-render auth in case connection status changed
    renderAuth();
}

async function handleLogin() {
    if (!supabaseService) {
        alert('Клиент Supabase не инициализирован. Пожалуйста, проверьте настройки.');
        return;
    }
    try {
        await supabaseService.signInWithGoogle();
        // The onAuthStateChange handler will manage the rest
    } catch (error) {
        console.error('Login failed', error);
        alert(`Ошибка входа: ${error.message}`);
    }
}

async function handleLogout() {
    if (supabaseService) {
        await supabaseService.signOut();
    }
    // State will be cleared by onAuthStateChange handler
}

async function updateAuthState(session) {
    if (session) {
        state.supabaseUser = session.user;
        state.isGoogleConnected = true;
        const providerToken = session.provider_token;
        googleProvider.setAuthToken(providerToken);
        try {
            state.userProfile = await googleProvider.getUserProfile();
        } catch (error) {
            console.error("Failed to fetch Google user profile:", error);
            // If token is expired, sign out to force re-login
            await handleLogout();
            return;
        }
    } else {
        state.supabaseUser = null;
        state.isGoogleConnected = false;
        state.userProfile = null;
        googleProvider.setAuthToken(null);
    }
    renderAuth();
}

async function initializeSupabase() {
    const { supabaseUrl, supabaseAnonKey } = state.settings;
    if (supabaseUrl && supabaseAnonKey) {
        if (supabaseService && supabaseService.url === supabaseUrl) {
            return; // Already initialized with the same URL
        }
        supabaseService = new SupabaseService(supabaseUrl, supabaseAnonKey);
        state.isSupabaseConnected = true;
        
        // Listen for auth changes
        supabaseService.onAuthStateChange((event, session) => {
            console.log(`Supabase auth event: ${event}`);
            updateAuthState(session);
        });

        // Check initial session
        const session = await supabaseService.getSession();
        await updateAuthState(session);

    } else {
        supabaseService = null;
        state.isSupabaseConnected = false;
        await updateAuthState(null); // Clear auth state
    }
}


// --- INITIALIZATION ---
async function init() {
    settingsButton.innerHTML = SettingsIcon;
    statsButton.innerHTML = ChartBarIcon;

    settingsButton.addEventListener('click', showSettings);
    statsButton.addEventListener('click', showStatsModal);

    mainContent.addEventListener('click', (e) => {
        handleCardAction(e);
        handleQuickReply(e);
    });

    state.settings = getSettings();
    await initializeSupabase();
    render();
}

document.addEventListener('DOMContentLoaded', init);