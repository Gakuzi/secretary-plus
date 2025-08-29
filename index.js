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
    showLoadingIndicator();
    let proxyUrl = null;

    // Centralized logic for managing the proxy status indicator
    if (state.settings.useProxy) {
        updateProxyStatusIndicator('connecting'); // Set to 'connecting' while we find and use a proxy
        proxyUrl = await getActiveProxy();
        if (!proxyUrl) {
            updateProxyStatusIndicator('error');
            showSystemError("Режим прокси включен, но не найдено ни одного активного прокси-сервера. Проверьте настройки.");
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

        state.messages.push(response);
        addMessageToChat(response);
        renderContextualActions(response.contextualActions);
    } catch (error) {
        showSystemError(`Произошла ошибка: ${error.message}`);
        if (proxyUrl) { // If we were attempting to use a proxy, mark it as an error
            updateProxyStatusIndicator('error');
        }
    } finally {
        state.isLoading = false;
        hideLoadingIndicator();
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
        // Fallback for other actions, can be more specific if needed
        promptToSend = `Выполни "${action}" с данными: ${JSON.stringify(payload)}`;
    }

    if (promptToSend) await handleSendMessage(promptToSend, null, { silent: true });
}


async function handleQuickReply(e) {
    const target = e.target.closest('.quick-reply-button');
    if (!target || target.disabled) return;

    const replyText = target.dataset.replyText;
    const container = target.closest('.quick-replies-container');

    if (container) {
        container.querySelectorAll('.quick-reply-button').forEach(btn => {
            btn.disabled = true;
            if (btn === target) {
                btn.classList.add('clicked');
            }
        });
    }

    if (replyText) {
        await handleSendMessage(replyText);
    }

    // Wait a bit before removing to show feedback
    setTimeout(() => {
        container?.remove();
    }, 300);
}

// --- EMAIL POLLING ---
function setupEmailPolling() {
    if (emailCheckInterval) clearInterval(emailCheckInterval);
    if (!state.settings.enableEmailPolling || !state.isGoogleConnected) return;

    emailCheckInterval = setInterval(async () => {
        try {
            const emails = await googleProvider.getRecentEmails({ max_results: 1 });
            if (emails && emails.length > 0) {
                const latestEmail = emails[0];
                if (latestEmail.id !== state.lastSeenEmailId) {
                    state.lastSeenEmailId = latestEmail.id;
                    const prompt = `Только что пришло новое письмо от ${latestEmail.from} с темой "${latestEmail.subject}". Проанализируй его содержимое и предложи действия. Содержимое: ${latestEmail.body}`;
                    await handleSendMessage(prompt, null, { silent: true });
                }
            }
        } catch (error) {
            console.error("Email polling failed:", error);
            // Don't show system error for background task
        }
    }, 60 * 1000); // Check every 60 seconds
}

// --- MODAL HANDLERS ---
function showProfileModal() {
    modalContainer.innerHTML = '';
    const profileModal = createProfileModal(
        state.userProfile,
        state.settings,
        {
            onClose: () => modalContainer.innerHTML = '',
            onSave: async (newSettings) => {
                state.settings = newSettings;
                saveSettings(newSettings);
                if (supabaseService && state.isSupabaseReady) {
                    await supabaseService.saveUserSettings(newSettings);
                }
                modalContainer.innerHTML = '';
                // Re-initialize services that depend on settings
                await initializeAppServices();
            },
            onLogout: handleLogout,
            onDelete: async () => {
                if (confirm('Вы уверены, что хотите удалить все свои данные из облака? Это действие необратимо.')) {
                    await supabaseService.deleteUserSettings();
                    alert('Данные удалены.');
                }
            },
            onForceSync: async () => {
                 await runAllSyncs();
            },
            onAnalyzeError: async ({ context, error }) => {
                return await analyzeSyncErrorWithGemini({
                    errorMessage: error,
                    context: context,
                    appStructure: APP_STRUCTURE_CONTEXT,
                    apiKey: state.settings.geminiApiKey,
                    proxyUrl: await getActiveProxy()
                });
            },
            onViewData: async ({ tableName }) => {
                if (!supabaseService) return { error: 'Supabase не подключен.' };
                return await supabaseService.getSampleData(tableName);
            }
        },
        state.syncStatus,
        syncTasks,
        supabaseService?.url
    );
    modalContainer.appendChild(profileModal);
}

function showSettingsModal() {
    modalContainer.innerHTML = '';
    const settingsModal = createSettingsModal({
        settings: state.settings,
        supabaseService,
        onClose: () => modalContainer.innerHTML = '',
        onSave: async (newSettings) => {
            const shouldReload = state.settings.isSupabaseEnabled !== newSettings.isSupabaseEnabled ||
                               state.settings.geminiApiKey !== newSettings.geminiApiKey;

            state.settings = newSettings;
            saveSettings(newSettings);
            
            if (supabaseService && state.isSupabaseReady) {
               await supabaseService.saveUserSettings(newSettings);
            }

            modalContainer.innerHTML = '';
            
            if (shouldReload) {
                window.location.reload();
            } else {
                await initializeAppServices(); // Re-init with new settings
            }
        }
    });
    modalContainer.appendChild(settingsModal);
}


function showStatsModal() {
    modalContainer.innerHTML = '';
    const statsModal = createStatsModal(state.actionStats, () => modalContainer.innerHTML = '');
    modalContainer.appendChild(statsModal);
}

function showHelpModal() {
    modalContainer.innerHTML = '';
    const helpModal = createHelpModal({
        onClose: () => modalContainer.innerHTML = '',
        settings: state.settings,
        analyzeErrorFn: async (errorMessage) => {
            return analyzeSyncErrorWithGemini({
                errorMessage,
                context: 'Пользователь анализирует ошибку вручную через Центр Помощи.',
                appStructure: APP_STRUCTURE_CONTEXT,
                apiKey: state.settings.geminiApiKey,
                proxyUrl: await getActiveProxy(),
            });
        },
        onRelaunchWizard: () => {
             if (confirm('Вы уверены? Это сотрет текущие настройки в браузере и перезапустит мастер настройки.')) {
                localStorage.removeItem('secretary-plus-settings-v4');
                window.location.reload();
             }
        }
    });
    modalContainer.appendChild(helpModal);
}


function showCameraView() {
    cameraViewContainer.innerHTML = '';
    const cameraView = createCameraView(
        (image) => {
            handleSendMessage('Что на этом фото?', image);
        },
        () => {
            cameraViewContainer.classList.add('hidden');
        }
    );
    cameraViewContainer.appendChild(cameraView);
    cameraViewContainer.classList.remove('hidden');
}


// --- INITIALIZATION ---
async function init() {
    // Inject icons
    settingsButton.innerHTML = SettingsIcon;
    statsButton.innerHTML = ChartBarIcon;
    helpButton.innerHTML = QuestionMarkCircleIcon;

    // Add main event listeners
    settingsButton.addEventListener('click', showSettingsModal);
    statsButton.addEventListener('click', showStatsModal);
    helpButton.addEventListener('click', showHelpModal);
    document.body.addEventListener('click', handleCardAction);
    document.body.addEventListener('click', handleQuickReply);

    const onWizardComplete = async (finalSettings) => {
        saveSettings(finalSettings);
        sessionStorage.removeItem('wizardState');
        wizardContainer.innerHTML = '';
        await initializeAppServices();
        renderMainContent();
    };

    const onWizardExit = () => {
        sessionStorage.removeItem('wizardState');
        wizardContainer.innerHTML = '';
        renderMainContent(); // Show welcome screen if not configured
    };
    
    const resumeStateJSON = sessionStorage.getItem('wizardState');
    if (resumeStateJSON) {
        sessionStorage.removeItem('wizardState'); // Clear it immediately
        const resumeState = JSON.parse(resumeStateJSON);
        const wizard = createSetupWizard({ onComplete: onWizardComplete, onExit: onWizardExit, googleProvider, supabaseConfig: SUPABASE_CONFIG, googleClientId: GOOGLE_CLIENT_ID, resumeState });
        wizardContainer.appendChild(wizard);
    } else if (!state.settings.geminiApiKey) {
        const wizard = createSetupWizard({ onComplete: onWizardComplete, onExit: onWizardExit, googleProvider, supabaseConfig: SUPABASE_CONFIG, googleClientId: GOOGLE_CLIENT_ID });
        wizardContainer.appendChild(wizard);
    } else {
        await initializeAppServices();
        renderMainContent();
    }
}

// Start the application
init();
