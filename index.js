import { GoogleServiceProvider } from './services/google/GoogleServiceProvider.js';
import { AppleServiceProvider } from './services/apple/AppleServiceProvider.js';
import { SupabaseService } from './services/supabase/SupabaseService.js';
import { callGemini } from './services/geminiService.js';
import { getSettings, saveSettings } from './utils/storage.js';
import { createSettingsModal } from './components/SettingsModal.js';
import { createStatsModal } from './components/StatsModal.js';
import { createWelcomeScreen } from './components/Welcome.js';
import { createChatInterface, addMessageToChat, showLoadingIndicator, hideLoadingIndicator } from './components/Chat.js';
import { createCameraView } from './components/CameraView.js';
import { SettingsIcon, ChartBarIcon, SupabaseIcon, GoogleIcon } from './components/icons/Icons.js';
import { MessageSender } from './types.js';

// --- UTILITY ---
function isMobile() {
    // Simple check for mobile user agents
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}


// --- STATE MANAGEMENT ---
let state = {
    settings: getSettings(),
    messages: [],
    isSupabaseConfigured: false,
    isGoogleConnected: false,
    userProfile: null,
    supabaseUser: null,
    isLoading: false,
    actionStats: {},
};

// --- SERVICE INSTANCES ---
const googleProvider = new GoogleServiceProvider();
const appleProvider = new AppleServiceProvider();
let supabaseService = null;

const serviceProviders = {
    google: googleProvider,
    apple: appleProvider,
    supabase: null, // Will be populated with supabaseService instance
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
    if (state.isGoogleConnected && state.userProfile) {
        const connectionIcon = state.settings.isSupabaseEnabled
            ? `<div class="w-6 h-6 text-green-400" title="Подключено через Supabase">${SupabaseIcon}</div>`
            : `<div class="w-6 h-6" title="Подключено напрямую к Google">${GoogleIcon}</div>`;

        const profileElement = document.createElement('div');
        profileElement.className = 'flex items-center space-x-2';
        profileElement.innerHTML = `
            ${connectionIcon}
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
        
        // Disable login if not configured
        const { isSupabaseEnabled, isGoogleEnabled, googleClientId, supabaseUrl, supabaseAnonKey } = state.settings;
        const isSupabaseConfigured = isSupabaseEnabled && supabaseUrl && supabaseAnonKey;
        const isDirectGoogleConfigured = !isSupabaseEnabled && isGoogleEnabled && googleClientId;
        if (!isSupabaseConfigured && !isDirectGoogleConfigured) {
             loginButton.disabled = true;
             loginButton.classList.replace('bg-blue-600', 'bg-gray-600');
             loginButton.classList.remove('hover:bg-blue-700');
             loginButton.title = 'Пожалуйста, настройте Supabase или Google Client ID в настройках.';
        }
    }
}

function renderMainContent() {
    mainContent.innerHTML = '';
    const chatContainer = createChatInterface(handleSendMessage, showCameraView);
    mainContent.appendChild(chatContainer);

    const chatLog = document.getElementById('chat-log');
    if (state.messages.length === 0) {
        chatLog.appendChild(createWelcomeScreen({
            isGoogleConnected: state.isGoogleConnected,
            isSupabaseEnabled: state.settings.isSupabaseEnabled,
        }));
    } else {
        state.messages.forEach(msg => addMessageToChat(msg));
    }
}

function render() {
    renderAuth();
    renderMainContent();
}

// --- AUTHENTICATION & INITIALIZATION ---

async function initializeSupabase() {
    const { supabaseUrl, supabaseAnonKey } = state.settings;
    if (supabaseUrl && supabaseAnonKey) {
        try {
            if (supabaseService && supabaseService.url === supabaseUrl) {
                return; 
            }
            supabaseService = new SupabaseService(supabaseUrl, supabaseAnonKey);
            serviceProviders.supabase = supabaseService;
            state.isSupabaseConfigured = true;

            supabaseService.onAuthStateChange((event, session) => {
                console.log(`Supabase auth event: ${event}`);
                updateSupabaseAuthState(session);
            });
            
            const session = await supabaseService.getSession();
            await updateSupabaseAuthState(session);
        } catch (error) {
            console.error("Supabase initialization failed:", error);
            state.isSupabaseConfigured = false;
            supabaseService = null;
            serviceProviders.supabase = null;
        }
    } else {
        supabaseService = null;
        serviceProviders.supabase = null;
        state.isSupabaseConfigured = false;
        if (state.isGoogleConnected && state.settings.isSupabaseEnabled) {
             await updateSupabaseAuthState(null); // Clear auth if Supabase was logged in but now disabled/unconfigured
        }
    }
}

async function initializeGoogleDirect() {
    const { googleClientId } = state.settings;
    await googleProvider.initClient(googleClientId, handleGoogleDirectAuthResponse);
}

async function updateSupabaseAuthState(session) {
    if (session) {
        state.supabaseUser = session.user;
        const providerToken = session.provider_token;
        googleProvider.setAuthToken(providerToken);
        try {
            state.userProfile = await googleProvider.getUserProfile();
            state.isGoogleConnected = true;
        } catch (error) {
            console.error("Failed to fetch Google user profile via Supabase:", error);
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

async function updateGoogleDirectAuthState(token) {
    if (token) {
        googleProvider.setAuthToken(token.access_token);
        try {
            state.userProfile = await googleProvider.getUserProfile();
            state.isGoogleConnected = true;
        } catch (error) {
            console.error("Failed to fetch Google user profile directly:", error);
            await handleLogout();
            return;
        }
    } else {
         state.isGoogleConnected = false;
         state.userProfile = null;
         googleProvider.setAuthToken(null);
    }
     renderAuth();
}

function handleGoogleDirectAuthResponse(tokenResponse) {
    if (tokenResponse && tokenResponse.access_token) {
        updateGoogleDirectAuthState(tokenResponse);
    } else {
        console.error("Google direct auth failed:", tokenResponse);
        alert("Ошибка входа через Google.");
    }
}

async function initializeAppServices() {
    // Reset state before re-initialization
    state.isSupabaseConfigured = false;
    state.isGoogleConnected = false;
    supabaseService = null;
    serviceProviders.supabase = null;

    if (state.settings.isSupabaseEnabled) {
        await initializeSupabase();
    } else if (state.settings.isGoogleEnabled) {
        await initializeGoogleDirect();
    }
    
    // Set user-defined timezone for Google services
    googleProvider.setTimezone(state.settings.timezone);

    // Fallback if no auth method is configured but was previously logged in
    if (!state.isGoogleConnected) {
        await updateSupabaseAuthState(null);
    }

    renderAuth();
}

// --- EVENT HANDLERS & LOGIC ---

async function handleLogin() {
    if (state.settings.isSupabaseEnabled) {
        if (!supabaseService) {
            alert('Supabase не настроен. Проверьте настройки.');
            return;
        }
        await supabaseService.signInWithGoogle();
    } else { // Direct Google Login
        if (!state.settings.googleClientId) {
             alert('Google Client ID не настроен. Проверьте настройки.');
             return;
        }
        await googleProvider.authenticate();
    }
}

async function handleLogout() {
    if (state.settings.isSupabaseEnabled && supabaseService) {
        await supabaseService.signOut();
    } else {
        await googleProvider.disconnect();
        await updateGoogleDirectAuthState(null);
    }
}

async function handleSaveSettings(newSettings) {
    state.settings = newSettings;
    saveSettings(newSettings);
    hideSettings();
    await initializeAppServices();
}

/**
 * Central function to process a prompt (from user or system), call Gemini, and display the response.
 * @param {string} prompt - The text prompt to send to the Gemini model.
 * @param {object|null} image - An optional image object to send.
 */
async function processBotResponse(prompt, image = null) {
    state.isLoading = true;
    showLoadingIndicator();

    try {
        // The history sent to Gemini is always the state of messages *before* the current prompt.
        // The current prompt is passed separately.
        const response = await callGemini({
            prompt,
            history: state.messages.slice(0, -1),
            serviceProviders,
            serviceMap: state.settings.serviceMap,
            timezone: state.settings.timezone,
            isGoogleConnected: state.isGoogleConnected,
            image,
            apiKey: state.settings.geminiApiKey
        });

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


async function handleSendMessage(prompt, image = null) {
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
    
    // Add the user's message to history first
    const userMessage = { sender: MessageSender.USER, text: prompt, image, id: Date.now() };
    state.messages.push(userMessage);
    addMessageToChat(userMessage);
    
    // Then process the response
    await processBotResponse(prompt, image);
}

async function handleCardAction(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    e.preventDefault();

    const action = target.dataset.action;
    const payload = JSON.parse(target.dataset.payload);

    let promptToSend = '';

    switch (action) {
        case 'select_contact':
            promptToSend = `Для моей задачи я выбираю контакт: ${payload.name} (${payload.email || 'email не указан'}).`;
            break;
        case 'select_document':
            promptToSend = `Я выбираю документ: "${payload.name}".`;
            break;
        case 'create_document_prompt':
            promptToSend = `Да, создать новый документ с названием "${payload.query}".`;
            break;
        case 'create_meet_with':
            promptToSend = `Создай видеовстречу с ${payload.name} (${payload.email}) на ближайшее удобное время, продолжительностью 30 минут.`;
            break;
        case 'send_meeting_link':
            // This prompt tells the model to execute the action it just proposed.
            promptToSend = `Да, отправь ссылку участникам встречи.`;
            break;
        case 'create_prep_task':
            // Same here, confirming the proposed action.
            promptToSend = `Да, создай задачу для подготовки к встрече.`;
            break;
        case 'create_doc_with_content':
            promptToSend = `Да, создай документ "${payload.title}" с предложенным тобой содержанием.`;
            break;
        case 'create_empty_doc':
            promptToSend = `Нет, просто создай пустой документ с названием "${payload.title}".`;
            break;
        case 'download_ics':
            const link = document.createElement('a');
            link.href = `data:text/calendar;charset=utf-8;base64,${payload.data}`;
            link.download = payload.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return; // Client-side action, no bot call needed.
    }

    if (promptToSend) {
        await handleSendMessage(promptToSend);
    }
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


// --- UI MODALS & VIEWS ---

function showSettings() {
    const modal = createSettingsModal(
        state.settings,
        {
            isSupabaseConfigured: state.isSupabaseConfigured,
            isGoogleConnected: state.isGoogleConnected,
            userProfile: state.userProfile,
        },
        handleSaveSettings, 
        hideSettings,
        handleLogin, // Pass auth handlers
        handleLogout,
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

// --- APP START ---
async function init() {
    // Add mobile class for adaptive UI
    if (isMobile()) {
        document.body.classList.add('is-mobile');
    }

    settingsButton.innerHTML = SettingsIcon;
    statsButton.innerHTML = ChartBarIcon;

    settingsButton.addEventListener('click', showSettings);
    statsButton.addEventListener('click', showStatsModal);

    mainContent.addEventListener('click', (e) => {
        handleCardAction(e);
        handleQuickReply(e);
        
        const settingsButtonFromWelcome = e.target.closest('#open-settings-from-welcome');
        if (settingsButtonFromWelcome) {
            showSettings();
            return;
        }

        const welcomeActionButton = e.target.closest('.welcome-action-card');
        if (welcomeActionButton) {
            const action = welcomeActionButton.dataset.action;
            const payload = welcomeActionButton.dataset.payload ? JSON.parse(welcomeActionButton.dataset.payload) : {};

            if (action === 'welcome_prompt' && payload.prompt) {
                handleSendMessage(payload.prompt);
            } else if (action === 'show_stats') {
                showStatsModal();
            }
        }
    });

    await initializeAppServices();
    render();
}

document.addEventListener('DOMContentLoaded', init);