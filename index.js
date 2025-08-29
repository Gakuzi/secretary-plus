import { GoogleServiceProvider } from './services/google/GoogleServiceProvider.js';
import { AppleServiceProvider } from './services/apple/AppleServiceProvider.js';
import { SupabaseService } from './services/supabase/SupabaseService.js';
import { callGemini, analyzeGenericErrorWithGemini } from './services/geminiService.js';
import { getSettings, saveSettings, getSyncStatus, saveSyncStatus } from './utils/storage.js';
import { createSetupWizard } from './components/SetupWizard.js';
import { createSettingsModal } from './components/SettingsModal.js';
import { createProfileModal } from './components/ProfileModal.js';
import { createStatsModal } from './components/StatsModal.js';
import { createHelpModal } from './components/HelpModal.js';
import { createWelcomeScreen } from './components/Welcome.js';
import { createChatInterface, addMessageToChat, showLoadingIndicator, hideLoadingIndicator, renderContextualActions } from './components/Chat.js';
import { createCameraView } from './components/CameraView.js';
import { SettingsIcon, ChartBarIcon, QuestionMarkCircleIcon } from './components/icons/Icons.js';
import { MessageSender } from './types.js';
import { SUPABASE_CONFIG, GOOGLE_CLIENT_ID } from './config.js';

// --- UTILITY ---
const APP_STRUCTURE_CONTEXT = `
- index.html: Главный HTML-файл.
- config.js: Хранилище статических ключей (Supabase, Google Client ID).
- index.js: Основная логика приложения.
- services/geminiService.js: Все вызовы к Gemini API.
- services/google/GoogleServiceProvider.js: Все взаимодействия с Google API.
- services/supabase/SupabaseService.js: Все взаимодействия с Supabase.
- components/SetupWizard.js: Мастер первоначальной настройки.
- components/SettingsModal.js: Окно для управления настройками после входа.
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
    proxyStatus: 'off', // 'off', 'connecting', 'ok', 'error'
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
function updateProxyStatusIndicator(status) {
    if (state.proxyStatus === status) return; // Avoid unnecessary DOM manipulation
    state.proxyStatus = status;
    const profileButton = authContainer.querySelector('button');
    if (profileButton) {
        profileButton.classList.remove('proxy-status-ok', 'proxy-status-error', 'proxy-status-off', 'proxy-status-connecting');
        profileButton.classList.add(`proxy-status-${status}`);
    }
}

function renderAuth() {
    authContainer.innerHTML = '';
    if (state.isGoogleConnected && state.userProfile) {
        const profileButton = document.createElement('button');
        profileButton.className = 'flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 rounded-full';
        profileButton.setAttribute('aria-label', 'Открыть профиль пользователя');
        profileButton.innerHTML = `<img src="${state.userProfile.imageUrl}" alt="${state.userProfile.name}" class="w-8 h-8 rounded-full">`;
        profileButton.addEventListener('click', showProfileModal);
        authContainer.appendChild(profileButton);
        // Ensure indicator is updated after rendering
        updateProxyStatusIndicator(state.proxyStatus);
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
    if (!state.settings.isSupabaseEnabled) {
        state.isSupabaseReady = false;
        return;
    }
    try {
        supabaseService = new SupabaseService(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        serviceProviders.supabase = supabaseService;
        state.isSupabaseReady = true;
    } catch (error) {
        console.error("Supabase initialization failed:", error);
        state.isSupabaseReady = false;
    }
}

async function handleAuthentication() {
    if (state.settings.isSupabaseEnabled && supabaseService) {
        const { data: { session } } = await supabaseService.client.auth.getSession();
        if (session) {
            state.supabaseUser = session.user;
            googleProvider.setAuthToken(session.provider_token);
            // Fetch and apply cloud settings
            const cloudSettings = await supabaseService.getUserSettings();
            if (cloudSettings) {
                state.settings = { ...state.settings, ...cloudSettings };
                saveSettings(state.settings);
            }
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
            await handleLogout();
        }
    }
    renderAuth();
    setupEmailPolling();
}

async function initializeAppServices() {
    state.settings = getSettings();
    if (state.settings.isSupabaseEnabled) {
        await initializeSupabase();
    }
    await googleProvider.initClient(GOOGLE_CLIENT_ID, null);
    googleProvider.setTimezone(state.settings.timezone);
    await handleAuthentication();
    startAutoSync();
}

// --- EVENT HANDLERS & LOGIC ---
async function handleLogout() {
    modalContainer.innerHTML = '';
    if (state.supabaseUser) {
        await supabaseService.signOut();
    } else {
        await googleProvider.disconnect();
    }
    // A more robust way to clear state
    localStorage.removeItem('secretary-plus-settings-v4');
    localStorage.removeItem('secretary-plus-sync-status-v1');
    window.location.reload();
}

function handleNewChat() {
    if (state.messages.length > 0 && confirm('Вы уверены, что хотите начать новый чат?')) {
        state.messages = [];
        renderMainContent();
    }
}

async function getActiveProxy() {
    if (!state.settings.useProxy || !state.isSupabaseReady || !supabaseService) {
        updateProxyStatusIndicator('off');
        return null;
    }
    const proxies = await supabaseService.getProxies();
    // Find the first active proxy that has a good status, ordered by priority
    const sorted = [...proxies]
        .filter(p => p.is_active) // Don't filter by status here, try any active one
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    
    if (sorted.length > 0) {
        updateProxyStatusIndicator('connecting');
        return sorted[0].url;
    }
    
    // If useProxy is on, but no active proxies exist.
    updateProxyStatusIndicator('error');
    return null;
};

async function processBotResponse(prompt, image = null) {
    state.isLoading = true;
    showLoadingIndicator();
    let proxyUrl = null;

    try {
        proxyUrl = await getActiveProxy();
        
        const response = await callGemini({
            prompt,
            history: state.messages.slice(0, -1),
            serviceProviders,
            serviceMap: state.settings.serviceMap,
            timezone: state.settings.timezone,
            isGoogleConnected: state.isGoogleConnected,
            image,
            apiKey: state.settings.geminiApiKey,
            proxyUrl: proxyUrl,
        });

        // If a proxy was used and the call was successful (not a system error), it's OK.
        if (proxyUrl && response.sender !== MessageSender.SYSTEM) {
             updateProxyStatusIndicator('ok');
        } else if (proxyUrl) { // It was a system error with a proxy
             updateProxyStatusIndicator('error');
        }

        if (response.functionCallName && supabaseService && state.isSupabaseReady) {
            state.actionStats[response.functionCallName] = (state.actionStats[response.functionCallName] || 0) + 1;
            await supabaseService.incrementActionStat(response.functionCallName);
        }

        state.messages.push(response);
        addMessageToChat(response);
        renderContextualActions(response.contextualActions);
    } catch (error) {
        showSystemError(`Произошла ошибка: ${error.message}`);
        if (proxyUrl) updateProxyStatusIndicator('error');
    } finally {
        state.isLoading = false;
        hideLoadingIndicator();
    }
}

async function handleSendMessage(prompt, image = null) {
    if (state.isLoading || (!prompt && !image)) return;
    renderContextualActions(null);
    if (mainContent.querySelector('.welcome-screen-container')) {
        renderMainContent(); // Re-render to remove welcome and add chat log
        await new Promise(resolve => setTimeout(resolve, 0)); // Allow DOM to update
    }

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

    if (action === 'download_ics') {
        const link = document.createElement('a');
        link.href = `data:text/calendar;charset=utf-8;base64,${payload.data}`;
        link.download = payload.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
    }

    if (action.startsWith('analyze_')) {
        promptToSend = `Проанализируй этот элемент и предложи действия. Данные: ${JSON.stringify(payload)}`;
    } else if (action === 'request_delete') {
         promptToSend = `Да, я подтверждаю удаление: ${payload.type} с ID ${payload.id}.`;
    } else {
        promptToSend = `[CONTEXT] User interacted with a card item. Type: ${payload.type}, ID: ${payload.id}. Full data: ${JSON.stringify(payload)}. Generate a summary and relevant actions.`;
    }

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
        state.lastSeenEmailId = null;
        setTimeout(async () => {
            const [latestEmail] = await googleProvider.getRecentEmails({ max_results: 1 });
            if (latestEmail) state.lastSeenEmailId = latestEmail.id;
        }, 2000);
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

function showSettingsModal() {
    if (!state.isGoogleConnected) {
        showSystemError("Необходимо войти в аккаунт для доступа к настройкам.");
        return;
    }
    const modal = createSettingsModal({
        settings: state.settings,
        supabaseService: supabaseService,
        onClose: hideModal,
        onSave: (newSettings) => {
            state.settings = { ...state.settings, ...newSettings };
            saveSettings(state.settings);
            if (supabaseService) {
                supabaseService.saveUserSettings(state.settings)
                    .catch(e => showSystemError(`Ошибка сохранения настроек в облако: ${e.message}`));
            }
            hideModal();
            initializeAppServices(); // Re-init to apply changes
        },
    });
    showModal(modal);
}

function showProfileModal() {
    const handlers = {
        onClose: hideModal,
        onLogout: handleLogout,
        onSave: (newSettings) => {
             state.settings = newSettings;
             saveSettings(state.settings);
             if (supabaseService) {
                 supabaseService.saveUserSettings(newSettings)
                    .then(() => {
                        hideModal();
                        initializeAppServices();
                    })
                    .catch(e => showSystemError(`Ошибка сохранения настроек в облако: ${e.message}`));
             } else {
                hideModal();
                initializeAppServices();
             }
        },
        onDelete: async () => {
            if (confirm('Вы уверены, что хотите удалить ВСЕ ваши облачные настройки? Это действие необратимо.')) {
                try {
                    await supabaseService.deleteUserSettings();
                    alert('Настройки в облаке удалены. Локальные настройки остались.');
                    hideModal();
                } catch(e) {
                    showSystemError(`Ошибка удаления настроек: ${e.message}`);
                }
            }
        },
    };
    const modal = createProfileModal(state.userProfile, state.settings, handlers);
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
    return !!settings.geminiApiKey;
}

async function handleSetupComplete(newSettings) {
    saveSettings(newSettings);
    wizardContainer.innerHTML = '';
    appContainer.classList.remove('hidden');
    await runApp();
}

function handleWizardExit() {
    wizardContainer.innerHTML = '';
    appContainer.classList.remove('hidden');
    runApp();
}

function showSetupWizard(isRelaunch = false) {
    if (isRelaunch && !confirm('Это перезапустит мастер настройки. Настройки в облаке Supabase останутся. Продолжить?')) {
        return;
    }
    
    wizardContainer.innerHTML = '';
    appContainer.classList.add('hidden');

    wizardContainer.appendChild(createSetupWizard({
        onComplete: handleSetupComplete,
        onExit: handleWizardExit,
        googleProvider,
        supabaseConfig: SUPABASE_CONFIG,
        googleClientId: GOOGLE_CLIENT_ID,
    }));
}

// --- MAIN APP ENTRY POINT ---
async function runApp() {
    appContainer.classList.remove('hidden');
    wizardContainer.innerHTML = '';
    
    settingsButton.innerHTML = SettingsIcon;
    helpButton.innerHTML = QuestionMarkCircleIcon;
    statsButton.innerHTML = ChartBarIcon;

    settingsButton.addEventListener('click', showSettingsModal);
    helpButton.addEventListener('click', showHelpModal);
    statsButton.addEventListener('click', showStatsModal);

    document.body.addEventListener('click', (e) => {
        handleCardAction(e);
        handleQuickReply(e);
        handleActionPrompt(e);
    });
    
    mainContent.addEventListener('click', (e) => {
        const promptTarget = e.target.closest('[data-action="welcome_prompt"]');
        if (promptTarget) handleSendMessage(JSON.parse(promptTarget.dataset.payload).prompt);
        if (e.target.closest('#open-wizard-from-welcome')) showSetupWizard(false);
    });

    await initializeAppServices();
    renderMainContent();
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    const resumeStateJSON = sessionStorage.getItem('wizardState');
    if (resumeStateJSON) {
        sessionStorage.removeItem('wizardState');
        wizardContainer.appendChild(createSetupWizard({
            onComplete: handleSetupComplete,
            onExit: handleWizardExit,
            googleProvider,
            supabaseConfig: SUPABASE_CONFIG,
            googleClientId: GOOGLE_CLIENT_ID,
            resumeState: JSON.parse(resumeStateJSON),
        }));
        return;
    }

    const settings = getSettings();
    state.settings = settings;

    if (isConfigurationComplete(settings)) {
        await runApp();
    } else {
        showSetupWizard(false);
    }
});