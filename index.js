import { GoogleServiceProvider } from './services/google/GoogleServiceProvider.js';
import { AppleServiceProvider } from './services/apple/AppleServiceProvider.js';
import { SupabaseService } from './services/supabase/SupabaseService.js';
import { callGemini, analyzeSyncErrorWithGemini } from './services/geminiService.js';
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
- components/ProfileModal.js: Окно профиля, где отображается статус синхронизации.
- SUPABASE_SETUP.md: Содержит SQL-скрипт для создания/обновления схемы БД.
`;

async function showBrowserNotification(title, options) {
    if (!('Notification' in window)) {
        console.warn("Браузер не поддерживает уведомления.");
        return;
    }

    if (Notification.permission === "granted") {
        new Notification(title, options);
    } else if (Notification.permission !== "denied") {
        try {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                new Notification(title, options);
            }
        } catch (error) {
            console.error("Ошибка при запросе разрешений на уведомления:", error);
        }
    }
}


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
    if (state.proxyStatus === status && status !== 'connecting') return; 
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
    { name: 'Calendar', label: 'Календарь', icon: 'CalendarIcon', tableName: 'calendar_events', providerFn: () => googleProvider.getCalendarEvents({ showDeleted: true, max_results: 2500 }), supabaseFn: (items) => supabaseService.syncCalendarEvents(items) },
    { name: 'Tasks', label: 'Задачи', icon: 'CheckSquareIcon', tableName: 'tasks', providerFn: () => googleProvider.getTasks({ showCompleted: true, showHidden: true, max_results: 2000 }), supabaseFn: (items) => supabaseService.syncTasks(items) },
    { name: 'Contacts', label: 'Контакты', icon: 'UsersIcon', tableName: 'contacts', providerFn: () => googleProvider.getAllContacts(), supabaseFn: (items) => supabaseService.syncContacts(items) },
    { name: 'Files', label: 'Файлы', icon: 'FileIcon', tableName: 'files', providerFn: () => googleProvider.getAllFiles(), supabaseFn: (items) => supabaseService.syncFiles(items) },
    { name: 'Emails', label: 'Почта', icon: 'EmailIcon', tableName: 'emails', providerFn: () => googleProvider.getRecentEmails({ max_results: 1000 }), supabaseFn: (items) => supabaseService.syncEmails(items) },
];

async function runAllSyncs() {
    if (state.isSyncing || !state.isGoogleConnected || !state.isSupabaseReady || !supabaseService) return;
    state.isSyncing = true;
    for (const task of syncTasks) {
        try {
            const items = await task.providerFn();
            await task.supabaseFn(items);
            state.syncStatus[task.name] = { lastSync: new Date().toISOString(), error: null };
        } catch (error) {
            console.error(`Failed to sync ${task.name}:`, error);
            state.syncStatus[task.name] = { ...(state.syncStatus[task.name] || {}), error: error.message };
        }
        // Save status after each task to ensure progress is not lost if one fails.
        saveSyncStatus(state.syncStatus);
    }
    state.isSyncing = false;
    // The profile modal, if open, will need to be re-rendered or have its state updated.
    // For simplicity, we can just re-open it or rely on its own internal refresh mechanism if it has one.
    // The current implementation re-renders the sync section on its own.
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

// This function is now a pure data fetcher and does not update the UI.
async function getActiveProxy() {
    if (!state.settings.useProxy || !state.isSupabaseReady || !supabaseService) {
        return null;
    }
    const proxies = await supabaseService.getProxies();
    // Find the first active proxy
    const sorted = [...proxies]
        .filter(p => p.is_active)
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    
    return sorted.length > 0 ? sorted[0].url : null;
};

async function processBotResponse(userMessage, isSilent) {
    state.isLoading = true;
    if (!isSilent) showLoadingIndicator();
    let proxyUrl = null;

    // Centralized logic for managing the proxy status indicator
    if (state.settings.useProxy) {
        updateProxyStatusIndicator('connecting'); // Set to 'connecting' while we find and use a proxy
        proxyUrl = await getActiveProxy();
        if (!proxyUrl) {
            updateProxyStatusIndicator('error');
            if (!isSilent) showSystemError("Режим прокси включен, но не найдено ни одного активного прокси-сервера. Проверьте настройки.");
        }
    } else {
        updateProxyStatusIndicator('off');
    }

    // Determine the history to send to Gemini
    const historyForGemini = isSilent 
        ? state.messages // For silent, the message is not in state yet
        : state.messages.slice(0, -1); // For regular, the message is the last one in state

    try {
        const response = await callGemini({
            userMessage,
            history: historyForGemini,
            serviceProviders,
            serviceMap: state.settings.serviceMap,
            timezone: state.settings.timezone,
            isGoogleConnected: state.isGoogleConnected,
            apiKey: state.settings.geminiApiKey,
            proxyUrl: proxyUrl, // Pass the found proxyUrl (or null)
        });

        if (isSilent && response.sender === MessageSender.ASSISTANT && response.text) {
            showBrowserNotification('Секретарь+', {
                body: response.text,
                icon: './favicon.svg'
            });
        }

        // After the call, update status based on the result
        if (proxyUrl) {
            if (response.sender !== MessageSender.SYSTEM) {
                updateProxyStatusIndicator('ok');
            } else {
                updateProxyStatusIndicator('error');
            }
        }
        
        if (response.functionCallName && supabaseService && state.isSupabaseReady) {
            state.actionStats[response.functionCallName] = (state.actionStats[response.functionCallName] || 0) + 1;
            await supabaseService.incrementActionStat(response.functionCallName);
        }

        if (!isSilent) hideLoadingIndicator();
        state.messages.push(response);
        addMessageToChat(response);
        renderContextualActions(response.contextualActions);
    } catch (error) {
        if (!isSilent) {
            hideLoadingIndicator();
            showSystemError(`Произошла ошибка: ${error.message}`);
        }
        if (proxyUrl) { // If we were attempting to use a proxy, mark it as an error
            updateProxyStatusIndicator('error');
        }
    } finally {
        state.isLoading = false;
        if (!isSilent) hideLoadingIndicator();
    }
}

async function handleSendMessage(prompt, image = null, options = { silent: false }) {
    if (state.isLoading || (!prompt && !image)) return;
    renderContextualActions(null);
    if (mainContent.querySelector('.welcome-screen-container')) {
        renderMainContent(); // Re-render to remove welcome and add chat log
        await new Promise(resolve => setTimeout(resolve, 0)); // Allow DOM to update
    }

    const userMessage = { sender: MessageSender.USER, text: prompt, image, id: Date.now() };
    
    if (!options.silent) {
        state.messages.push(userMessage);
        addMessageToChat(userMessage);
    }

    await processBotResponse(userMessage, options.silent);
}


// Simplified card action handler
async function handleCardAction(e) {
    const target = e.target.closest('[data-action]');
    
    // **FIX:** This check is now more robust. It ensures that the handler only
    // proceeds if there is a non-empty `data-payload` attribute. This prevents
    // errors from buttons in modals that use `data-action` for other purposes.
    if (!target || !target.dataset.payload) {
        return;
    }

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
        // Fallback for other actions, can be more specific if needed
        promptToSend = `Выполни "${action}" с данными: ${JSON.stringify(payload)}`;
    }

    if (promptToSend) await handleSendMessage(promptToSend, null, { silent: true });
}


async function handleQuickReply(e) {
    const target = e.target.closest('.quick-reply-button');
    if (!target || target.disabled) return;
    
    // Give visual feedback and disable other buttons
    const container = target.closest('.quick-replies-container');
    container.querySelectorAll('button').forEach(btn => {
        btn.disabled = true;
    });
    target.classList.add('clicked');
    
    await handleSendMessage(target.dataset.replyText);
}

// --- MODAL & VIEW MANAGEMENT ---

function showSetupWizard(resumeState = null) {
    wizardContainer.innerHTML = '';
    const onComplete = (newSettings) => {
        saveSettings(newSettings);
        wizardContainer.innerHTML = '';
        window.location.reload();
    };
    const onExit = () => {
        wizardContainer.innerHTML = '';
        if (state.settings.geminiApiKey) {
            onAppReady();
        }
    };
    const wizard = createSetupWizard({ onComplete, onExit, googleProvider, supabaseConfig: SUPABASE_CONFIG, googleClientId: GOOGLE_CLIENT_ID, resumeState });
    wizardContainer.appendChild(wizard);
}

function showSettingsModal() {
    modalContainer.innerHTML = '';
    const onSave = async (newSettings) => {
        state.settings = newSettings;
        saveSettings(newSettings);
        if (state.isSupabaseReady && supabaseService) {
            await supabaseService.saveUserSettings(newSettings);
        }
        modalContainer.innerHTML = '';
        await initializeAppServices();
    };
    const modal = createSettingsModal({
        settings: state.settings,
        supabaseService: supabaseService,
        onClose: () => modalContainer.innerHTML = '',
        onSave,
    });
    modalContainer.appendChild(modal);
}

function showProfileModal() {
    modalContainer.innerHTML = '';
    const onSave = async (newSettings) => {
        state.settings = newSettings;
        saveSettings(newSettings);
        if (state.isSupabaseReady && supabaseService) {
            await supabaseService.saveUserSettings(newSettings);
        }
        modalContainer.innerHTML = '';
        await initializeAppServices();
    };
    const onDelete = async () => {
        if (confirm('Вы уверены, что хотите удалить ВСЕ свои настройки из облака Supabase? Это действие необратимо.')) {
            await supabaseService.deleteUserSettings();
            alert('Настройки удалены из облака.');
            modalContainer.innerHTML = '';
        }
    };
    const onForceSync = async () => {
        await runAllSyncs();
        showProfileModal();
    };
     const onAnalyzeError = async ({ context, error }) => {
        return await analyzeSyncErrorWithGemini({
            errorMessage: error,
            context: context,
            appStructure: APP_STRUCTURE_CONTEXT,
            apiKey: state.settings.geminiApiKey,
            proxyUrl: await getActiveProxy()
        });
    };
    const onViewData = async ({ tableName }) => {
        return await supabaseService.getSampleData(tableName);
    };

    const modal = createProfileModal(
        state.userProfile,
        state.settings,
        {
            onClose: () => modalContainer.innerHTML = '',
            onSave,
            onLogout: handleLogout,
            onDelete,
            onForceSync,
            onAnalyzeError,
            onViewData,
        },
        state.syncStatus,
        syncTasks,
        state.settings.isSupabaseEnabled ? SUPABASE_CONFIG.url : null
    );
    modalContainer.appendChild(modal);
}

function showStatsModal() {
    modalContainer.innerHTML = '';
    const modal = createStatsModal(state.actionStats, () => modalContainer.innerHTML = '');
    modalContainer.appendChild(modal);
}

function showHelpModal(options = {}) {
    modalContainer.innerHTML = '';
    const onRelaunchWizard = () => {
        if (confirm('Это действие удалит ваши текущие настройки из браузера. Вы уверены?')) {
            localStorage.removeItem('secretary-plus-settings-v4');
            showSetupWizard();
        }
    };
     const analyzeErrorFn = async (errorMessage) => {
         return await analyzeSyncErrorWithGemini({
            errorMessage: errorMessage,
            context: 'Пользователь вручную вставил ошибку для анализа в Центре Помощи.',
            appStructure: APP_STRUCTURE_CONTEXT,
            apiKey: state.settings.geminiApiKey,
            proxyUrl: await getActiveProxy()
        });
     };

    const modal = createHelpModal({
        onClose: () => modalContainer.innerHTML = '',
        settings: state.settings,
        analyzeErrorFn,
        onRelaunchWizard,
        initialTab: options.initialTab || 'error-analysis'
    });
    modalContainer.appendChild(modal);
}

function showCameraView() {
    cameraViewContainer.innerHTML = '';
    cameraViewContainer.classList.remove('hidden');
    const onCapture = (image) => handleSendMessage('', image);
    const onClose = () => {
        cameraViewContainer.classList.add('hidden');
        cameraViewContainer.innerHTML = '';
    };
    const cameraView = createCameraView(onCapture, onClose);
    cameraViewContainer.appendChild(cameraView);
}

// --- EMAIL POLLING ---

function setupEmailPolling() {
    if (emailCheckInterval) clearInterval(emailCheckInterval);
    if (!state.settings.enableEmailPolling || !state.isGoogleConnected) return;

    emailCheckInterval = setInterval(async () => {
        try {
            const emails = await googleProvider.getRecentEmails({ max_results: 1 });
            if (emails.length > 0) {
                const latestEmail = emails[0];
                if (latestEmail.id !== state.lastSeenEmailId) {
                    state.lastSeenEmailId = latestEmail.id;
                    const from = latestEmail.from.replace(/<.*?>/g, '').trim();
                    const prompt = `Мне пришло новое письмо от ${from} с темой "${latestEmail.subject}". Проанализируй его содержимое и предложи действия. Данные: ${JSON.stringify(latestEmail)}`;
                    await handleSendMessage(prompt, null, { silent: true });
                }
            }
        } catch (error) {
            console.error("Email polling failed:", error);
        }
    }, 60 * 1000); // Check every minute
}

// --- GLOBAL EVENT LISTENERS ---
// Using event delegation on the document body for dynamic elements

document.body.addEventListener('click', (e) => {
    handleQuickReply(e);
    handleCardAction(e);

    const contextualAction = e.target.closest('[data-action-prompt]');
    if (contextualAction) {
        const prompt = contextualAction.dataset.actionPrompt;
        renderContextualActions(null); // Hide actions after click
        handleSendMessage(prompt);
        return;
    }

     const welcomePrompt = e.target.closest('[data-action="welcome_prompt"]');
    if (welcomePrompt) {
        const payload = JSON.parse(welcomePrompt.dataset.payload);
        handleSendMessage(payload.prompt);
        return;
    }

    const openWizardButton = e.target.closest('#open-wizard-from-welcome');
    if(openWizardButton) {
        showSetupWizard();
        return;
    }
    
    // New handler for opening help from settings
    const openHelpLink = e.target.closest('#open-help-from-settings');
    if (openHelpLink) {
        e.preventDefault();
        modalContainer.innerHTML = ''; // Close current modal
        showHelpModal({ initialTab: 'instructions' });
        return;
    }
});

// --- APP INITIALIZATION ---

async function onAppReady() {
    await initializeAppServices();
    renderMainContent();
}

function showInitialScreen() {
    const wizardResumeStateRaw = sessionStorage.getItem('wizardState');
    if (wizardResumeStateRaw) {
        sessionStorage.removeItem('wizardState');
        try {
            const resumeState = JSON.parse(wizardResumeStateRaw);
            showSetupWizard(resumeState);
            return;
        } catch (e) {
            console.error("Failed to parse wizard resume state", e);
        }
    }
    
    // Show wizard if Gemini key is missing
    if (!state.settings.geminiApiKey) {
        showSetupWizard();
    } else {
        onAppReady();
    }
}

// Setup header buttons
settingsButton.innerHTML = SettingsIcon;
statsButton.innerHTML = ChartBarIcon;
helpButton.innerHTML = QuestionMarkCircleIcon;

settingsButton.addEventListener('click', showSettingsModal);
statsButton.addEventListener('click', showStatsModal);
helpButton.addEventListener('click', () => showHelpModal());

// Start the app
showInitialScreen();