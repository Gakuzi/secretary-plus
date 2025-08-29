import { GoogleServiceProvider } from './services/google/GoogleServiceProvider.js';
import { AppleServiceProvider } from './services/apple/AppleServiceProvider.js';
import { SupabaseService } from './services/supabase/SupabaseService.js';
import { callGemini, analyzeGenericErrorWithGemini } from './services/geminiService.js';
import { getSettings, saveSettings, getSyncStatus, saveSyncStatus } from './utils/storage.js';
import { createSetupWizard } from './components/SetupWizard.js';
import { createProfileModal } from './components/ProfileModal.js';
import { createStatsModal } from './components/StatsModal.js';
import { createHelpModal } from './components/HelpModal.js';
import { createWelcomeScreen } from './components/Welcome.js';
import { createChatInterface, addMessageToChat, showLoadingIndicator, hideLoadingIndicator, renderContextualActions } from './components/Chat.js';
import { createCameraView } from './components/CameraView.js';
import { SettingsIcon, ChartBarIcon, QuestionMarkCircleIcon } from './components/icons/Icons.js';
import { MessageSender } from './types.js';

// --- UTILITY ---
const APP_STRUCTURE_CONTEXT = `
- index.html: Главный HTML-файл.
- index.js: Основная логика приложения.
- services/geminiService.js: Все вызовы к Gemini API.
- services/google/GoogleServiceProvider.js: Все взаимодействия с Google API.
- services/supabase/SupabaseService.js: Все взаимодействия с Supabase.
- components/SetupWizard.js: ЕДИНСТВЕННОЕ место для всех настроек, включая ключи, прокси и аутентификацию. Ошибки конфигурации почти всегда решаются повторным запуском этого мастера.
`;

// --- STATE MANAGEMENT ---
let state = {
    settings: getSettings(),
    messages: [],
    isSupabaseReady: false,
    isGoogleConnected: false,
    userProfile: null,
    supabaseUser: null,
    isLoading: false,
    actionStats: {},
    lastSeenEmailId: null,
    syncStatus: getSyncStatus(),
    isSyncing: false,
};

// --- SERVICE INSTANCES ---
const googleProvider = new GoogleServiceProvider();
const appleProvider = new AppleServiceProvider();
let supabaseService = null;
let emailCheckInterval = null;
let syncInterval = null;

const serviceProviders = {
    google: googleProvider,
    apple: appleProvider,
    supabase: null,
};

// --- DOM ELEMENTS ---
const appContainer = document.getElementById('app');
const authContainer = document.getElementById('auth-container');
const mainContent = document.getElementById('main-content');
const settingsButton = document.getElementById('settings-button');
const helpButton = document.getElementById('help-button');
const statsButton = document.getElementById('stats-button');
const modalContainer = document.getElementById('modal-container');
const cameraViewContainer = document.getElementById('camera-view-container');
const wizardContainer = document.getElementById('setup-wizard-container');

// --- ERROR HANDLING ---
function showSystemError(text) {
    addMessageToChat({ sender: MessageSender.SYSTEM, text: `Ошибка: ${text}`, id: Date.now() });
}

// --- RENDER FUNCTIONS ---
function renderAuth() {
    authContainer.innerHTML = '';
    if (state.isGoogleConnected && state.userProfile) {
        const profileButton = document.createElement('button');
        profileButton.className = 'flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 rounded-full';
        profileButton.setAttribute('aria-label', 'Открыть профиль пользователя');
        profileButton.innerHTML = `<img src="${state.userProfile.imageUrl}" alt="${state.userProfile.name}" class="w-8 h-8 rounded-full">`;
        
        // The profile modal is only available in Supabase mode where settings can be managed.
        if (state.isSupabaseReady && state.supabaseUser) {
            profileButton.addEventListener('click', showProfileModal);
        }
        
        authContainer.appendChild(profileButton);
    }
}

function renderMainContent() {
    mainContent.innerHTML = '';
    const chatContainer = createChatInterface(handleSendMessage, showCameraView, showSystemError, handleNewChat);
    mainContent.appendChild(chatContainer);
    if (state.messages.length === 0) {
        document.getElementById('chat-log').appendChild(createWelcomeScreen({
            isGoogleConnected: state.isGoogleConnected,
            isSupabaseEnabled: state.settings.isSupabaseEnabled,
        }));
    } else {
        state.messages.forEach(addMessageToChat);
    }
}

// --- SYNC LOGIC ---
const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const syncTasks = [
    { name: 'Calendar', providerFn: () => googleProvider.getCalendarEvents({ max_results: 1000 }), supabaseFn: (items) => supabaseService.syncCalendarEvents(items) },
    { name: 'Tasks', providerFn: () => googleProvider.getTasks({ max_results: 100 }), supabaseFn: (items) => supabaseService.syncTasks(items) },
    { name: 'Contacts', providerFn: () => googleProvider.getAllContacts(), supabaseFn: (items) => supabaseService.syncContacts(items) },
    { name: 'Files', providerFn: () => googleProvider.getAllFiles(), supabaseFn: (items) => supabaseService.syncFiles(items) },
    { name: 'Emails', providerFn: () => googleProvider.getRecentEmails({ max_results: 1000 }), supabaseFn: (items) => supabaseService.syncEmails(items) },
];

async function runAllSyncs() {
    if (state.isSyncing || !state.isGoogleConnected || !state.isSupabaseReady || !supabaseService) return;
    state.isSyncing = true;
    for (const task of syncTasks) {
        try {
            const items = await task.providerFn();
            await task.supabaseFn(items);
            state.syncStatus[task.name] = new Date().toISOString();
        } catch (error) {
            console.error(`Failed to sync ${task.name}:`, error);
            state.syncStatus[task.name] = { error: error.message };
        }
        saveSyncStatus(state.syncStatus);
    }
    state.isSyncing = false;
}

function startAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
    if (!state.settings.enableAutoSync || !state.settings.isSupabaseEnabled) return;
    setTimeout(runAllSyncs, 2000);
    syncInterval = setInterval(runAllSyncs, SYNC_INTERVAL_MS);
}

function stopAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
}

// --- AUTH & INITIALIZATION ---
async function initializeSupabase() {
    const { supabaseUrl, supabaseAnonKey } = state.settings;
    if (!supabaseUrl || !supabaseAnonKey) {
        state.isSupabaseReady = false;
        return;
    }
    try {
        supabaseService = new SupabaseService(supabaseUrl, supabaseAnonKey);
        serviceProviders.supabase = supabaseService;
        state.isSupabaseReady = true;
    } catch (error) {
        console.error("Supabase initialization failed:", error);
        state.isSupabaseReady = false;
    }
}

async function handleAuthentication() {
    // This function runs after settings are confirmed and services are initialized.
    // It checks the auth state and populates user info.
    if (state.settings.isSupabaseEnabled && supabaseService) {
        const { data: { session } } = await supabaseService.client.auth.getSession();
        if (session) {
            state.supabaseUser = session.user;
            googleProvider.setAuthToken(session.provider_token);
        }
    }

    if (googleProvider.token) {
        try {
            state.userProfile = await googleProvider.getUserProfile();
            state.isGoogleConnected = true;
            if (state.isSupabaseReady && state.supabaseUser) {
                state.actionStats = await supabaseService.getActionStats();
            }
        } catch (error) {
            console.error("Failed to get user profile:", error);
            showSystemError(`Не удалось получить профиль Google: ${error.message}`);
            // Force logout on profile fetch failure
            await handleLogout();
        }
    }
    renderAuth();
    setupEmailPolling();
}

async function initializeAppServices() {
    state.settings = getSettings(); // Re-read settings
    if (state.settings.isSupabaseEnabled) {
        await initializeSupabase();
    }
    await googleProvider.initClient(state.settings.googleClientId, null); // Callback handled by wizard
    googleProvider.setTimezone(state.settings.timezone);
    await handleAuthentication();
    startAutoSync();
}

// --- EVENT HANDLERS & LOGIC ---
async function handleLogout() {
    modalContainer.innerHTML = ''; // Close any open modal
    if (state.supabaseUser) {
        await supabaseService.signOut();
    } else {
        await googleProvider.disconnect();
    }
    // Simple way to reset state completely
    window.location.reload();
}

async function handleSaveProfileSettings(newSettings) {
    state.settings = newSettings;
    saveSettings(newSettings);
    if (state.supabaseUser && supabaseService) {
        try {
            await supabaseService.saveUserSettings(newSettings);
            modalContainer.innerHTML = '';
            // Re-apply settings
            state.settings.enableAutoSync ? startAutoSync() : stopAutoSync();
            setupEmailPolling();
        } catch (error) {
            showSystemError(`Ошибка при сохранении настроек: ${error.message}`);
        }
    }
}

async function handleDeleteSettings() {
    if (!supabaseService || !state.supabaseUser) return;
    if (confirm('Вы уверены, что хотите удалить все ваши настройки из облака?')) {
        try {
            await supabaseService.deleteUserSettings();
            modalContainer.innerHTML = '';
        } catch (error) {
            showSystemError(`Не удалось удалить настройки: ${error.message}`);
        }
    }
}

function handleNewChat() {
    if (state.messages.length > 0 && confirm('Вы уверены, что хотите начать новый чат?')) {
        state.messages = [];
        renderMainContent();
    }
}

async function processBotResponse(prompt, image = null) {
    state.isLoading = true;
    showLoadingIndicator();

    const findBestProxy = () => {
        if (!state.isSupabaseReady || !state.settings.proxies?.length) return null;
        const sorted = [...state.settings.proxies]
            .filter(p => p.is_active)
            .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        return sorted.length > 0 ? sorted[0].url : null;
    };

    try {
        const response = await callGemini({
            prompt,
            history: state.messages.slice(0, -1),
            serviceProviders,
            serviceMap: state.settings.serviceMap,
            timezone: state.settings.timezone,
            isGoogleConnected: state.isGoogleConnected,
            image,
            apiKey: state.settings.geminiApiKey,
            proxyUrl: findBestProxy(),
        });

        if (response.functionCallName && supabaseService && state.isSupabaseReady) {
            state.actionStats[response.functionCallName] = (state.actionStats[response.functionCallName] || 0) + 1;
            await supabaseService.incrementActionStat(response.functionCallName);
        }

        state.messages.push(response);
        addMessageToChat(response);
        renderContextualActions(response.contextualActions);
    } catch (error) {
        showSystemError(`Произошла ошибка: ${error.message}`);
    } finally {
        state.isLoading = false;
        hideLoadingIndicator();
    }
}

async function handleSendMessage(prompt, image = null) {
    if (state.isLoading || (!prompt && !image)) return;
    renderContextualActions(null);
    if (mainContent.querySelector('.welcome-screen-container')) mainContent.innerHTML = '';

    const userMessage = { sender: MessageSender.USER, text: prompt, image, id: Date.now() };
    state.messages.push(userMessage);
    addMessageToChat(userMessage);
    await processBotResponse(prompt, image);
}

// Simplified card action handler
async function handleCardAction(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    e.preventDefault();
    const action = target.dataset.action;
    const payload = JSON.parse(target.dataset.payload);
    let promptToSend = '';
    // ... logic to build promptToSend based on action and payload (omitted for brevity, remains unchanged)
    if (action === 'download_ics') {
        const link = document.createElement('a');
        link.href = `data:text/calendar;charset=utf-8;base64,${payload.data}`;
        link.download = payload.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
    }
    // Default prompt building based on type
    promptToSend = `[CONTEXT] User interacted with a card item. Type: ${payload.type}, ID: ${payload.id}. Full data: ${JSON.stringify(payload)}. Generate a summary and relevant actions.`;
    if (action.startsWith('analyze_')) {
        promptToSend = `Проанализируй этот элемент и предложи действия. Данные: ${JSON.stringify(payload)}`;
    } else if (action === 'request_delete') {
         promptToSend = `Да, я подтверждаю удаление: ${payload.type} с ID ${payload.id}.`;
    }
    // ... more specific actions if needed
    if (promptToSend) await handleSendMessage(promptToSend);
}

async function handleQuickReply(e) {
    const target = e.target.closest('.quick-reply-button');
    if (!target || target.disabled) return;
    target.closest('.quick-replies-container').remove();
    await handleSendMessage(target.dataset.replyText);
}

async function handleActionPrompt(e) {
    const target = e.target.closest('[data-action-prompt]');
    if (target) await handleSendMessage(target.dataset.actionPrompt);
}

// --- PROACTIVE FEATURES ---
async function checkForNewEmail() {
    if (!state.isGoogleConnected || document.hidden || state.isLoading) return;
    try {
        const [latestEmail] = await googleProvider.getRecentEmails({ max_results: 1 });
        if (latestEmail && latestEmail.id !== state.lastSeenEmailId) {
            state.lastSeenEmailId = latestEmail.id;
            const systemPrompt = `Пришло новое письмо от "${latestEmail.from}" с темой "${latestEmail.subject}". Содержимое: "${latestEmail.snippet}". Проанализируй и кратко сообщи мне об этом, предложив релевантные действия.`;
            await processBotResponse(systemPrompt, null, true);
        }
    } catch (error) {
        console.error("Error checking for new email:", error);
    }
}

function setupEmailPolling() {
    if (emailCheckInterval) clearInterval(emailCheckInterval);
    if (state.settings.enableEmailPolling && state.isGoogleConnected) {
        state.lastSeenEmailId = null; // Reset on setup
        setTimeout(async () => {
            const [latestEmail] = await googleProvider.getRecentEmails({ max_results: 1 });
            if (latestEmail) state.lastSeenEmailId = latestEmail.id;
        }, 2000); // Prime the last seen ID
        emailCheckInterval = setInterval(checkForNewEmail, 60000);
    }
}

// --- UI MODALS ---
function showModal(modalElement) {
    modalContainer.innerHTML = '';
    modalContainer.appendChild(modalElement);
}

function hideModal() {
    modalContainer.innerHTML = '';
}

function showProfileModal() {
    if (!state.isGoogleConnected || !state.userProfile || !state.supabaseUser) return;
    const modal = createProfileModal(state.userProfile, state.settings, {
        onClose: hideModal,
        onSave: handleSaveProfileSettings,
        onLogout: handleLogout,
        onDelete: handleDeleteSettings,
    });
    showModal(modal);
}

function showHelpModal() {
    const handleAnalyzeError = (errorMessage) => analyzeGenericErrorWithGemini({
        errorMessage,
        appStructure: APP_STRUCTURE_CONTEXT,
        apiKey: state.settings.geminiApiKey,
        proxyUrl: null,
    });
    const modal = createHelpModal({ 
        onClose: hideModal, 
        analyzeErrorFn: handleAnalyzeError, 
        onRelaunchWizard: () => {
            hideModal();
            showSetupWizard(true);
        },
        settings: state.settings,
    });
    showModal(modal);
}

function showStatsModal() {
    const modal = createStatsModal(state.actionStats, hideModal);
    showModal(modal);
}

function showCameraView() {
    const onCapture = (image) => {
        const prompt = document.getElementById('chat-input')?.value.trim() || 'Что на этом изображении?';
        handleSendMessage(prompt, image);
        hideCameraView();
    };
    cameraViewContainer.innerHTML = '';
    cameraViewContainer.appendChild(createCameraView(onCapture, hideCameraView));
    cameraViewContainer.classList.remove('hidden');
}

function hideCameraView() {
    cameraViewContainer.classList.add('hidden');
}

// --- SETUP WIZARD LOGIC ---
function isConfigurationComplete(settings) {
    if (!settings.geminiApiKey) return false;
    if (settings.isSupabaseEnabled) {
        return !!(settings.supabaseUrl && settings.supabaseAnonKey && settings.googleClientId);
    } else {
        return !!settings.googleClientId;
    }
}

async function handleSetupComplete(newSettings) {
    saveSettings(newSettings);
    wizardContainer.innerHTML = ''; // Remove wizard from DOM
    appContainer.classList.remove('hidden');
    await runApp(); // Initialize and run the main application
}

function handleWizardExit() {
    wizardContainer.innerHTML = ''; // Remove wizard from DOM
    appContainer.classList.remove('hidden');
    runApp(); // Run the app with whatever settings are currently saved
}


function showSetupWizard(isRelaunch = false) {
    if (isRelaunch && !confirm('Это перезапустит мастер настройки и сотрет текущие ключи из локального хранилища. Настройки в облаке Supabase останутся. Продолжить?')) {
        return;
    }
    if (isRelaunch) {
        localStorage.removeItem('secretary-plus-settings-v4');
    }
    
    wizardContainer.innerHTML = '';
    appContainer.classList.add('hidden');

    wizardContainer.appendChild(createSetupWizard({
        onComplete: handleSetupComplete,
        onExit: handleWizardExit,
        googleProvider,
    }));
}

// --- MAIN APP ENTRY POINT ---
async function runApp() {
    appContainer.classList.remove('hidden');
    
    settingsButton.innerHTML = SettingsIcon;
    helpButton.innerHTML = QuestionMarkCircleIcon;
    statsButton.innerHTML = ChartBarIcon;

    settingsButton.addEventListener('click', () => showSetupWizard(true));
    helpButton.addEventListener('click', showHelpModal);
    statsButton.addEventListener('click', showStatsModal);

    // Use a single listener on the body for better performance
    document.body.addEventListener('click', (e) => {
        handleCardAction(e);
        handleQuickReply(e);
        handleActionPrompt(e);
    });
    
    mainContent.addEventListener('click', (e) => {
        const promptTarget = e.target.closest('[data-action="welcome_prompt"]');
        if (promptTarget) handleSendMessage(JSON.parse(promptTarget.dataset.payload).prompt);
        if (e.target.closest('#open-settings-from-welcome')) showSetupWizard(true);
    });

    await initializeAppServices();
    renderMainContent();
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // This handles the redirect back from Google OAuth during the wizard flow.
    const resumeStateJSON = sessionStorage.getItem('wizardState');
    if (resumeStateJSON) {
        sessionStorage.removeItem('wizardState');
        wizardContainer.appendChild(createSetupWizard({
            onComplete: handleSetupComplete,
            onExit: handleWizardExit,
            googleProvider,
            resumeState: JSON.parse(resumeStateJSON),
        }));
        return;
    }

    const settings = getSettings();
    state.settings = settings; // Set initial state

    if (isConfigurationComplete(settings)) {
        await runApp();
    } else {
        showSetupWizard(false);
    }
});
