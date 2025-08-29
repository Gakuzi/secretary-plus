
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
import { createDbSetupWizard } from './components/DbSetupWizard.js';
import { createProxySetupWizard } from './components/ProxySetupWizard.js';
import { createWelcomeScreen } from './components/Welcome.js';
import { createChatInterface, addMessageToChat, showLoadingIndicator, hideLoadingIndicator, renderContextualActions } from './components/Chat.js';
import { createCameraView } from './components/CameraView.js';
import { SettingsIcon, ChartBarIcon, QuestionMarkCircleIcon } from './components/icons/Icons.js';
import { MessageSender } from './types.js';
import { SUPABASE_CONFIG, GOOGLE_CLIENT_ID } from './config.js';
import { createMigrationModal } from './components/MigrationModal.js';
import { MIGRATIONS, LATEST_SCHEMA_VERSION } from './services/supabase/migrations.js';

// --- UTILITY ---
const APP_STRUCTURE_CONTEXT = `
- index.html: Главный HTML-файл.
- config.js: Хранилище статических ключей (Supabase, Google Client ID).
- index.js: Основная логика приложения.
- services/geminiService.js: Все вызовы к Gemini API.
- services/google/GoogleServiceProvider.js: Все взаимодействия с Google API.
- services/supabase/SupabaseService.js: Все взаимодействия с Supabase.
- services/supabase/migrations.js: SQL-скрипты для автоматического обновления схемы БД.
- components/SetupWizard.js: Мастер первоначальной настройки.
- components/SettingsModal.js: Окно для управления настройками после входа.
- components/ProfileModal.js: Окно профиля, где отображается статус синхронизации.
- components/DbSetupWizard.js: Мастер настройки управляющего воркера для автоматического обновления схемы БД.
- components/ProxySetupWizard.js: Мастер настройки прокси-воркера для Gemini.
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
        profileButton.className = 'flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-blue-500 rounded-full';
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
    }
    
    const botMessage = await callGemini({
        userMessage: userMessage,
        history: state.messages,
        serviceProviders,
        serviceMap: state.settings.serviceMap,
        timezone: state.settings.timezone,
        isGoogleConnected: state.isGoogleConnected,
        apiKey: state.settings.geminiApiKey,
        proxyUrl: proxyUrl,
    });
    
    // Update proxy status based on the result of the API call
    if(state.settings.useProxy && proxyUrl) {
        // If we got a valid bot message (not a system error about the proxy itself), it means the proxy worked.
        if (botMessage && botMessage.sender !== MessageSender.SYSTEM) {
             updateProxyStatusIndicator('ok');
        } else if (botMessage.text.includes("Gemini")) { 
            // If the error message is from Gemini (e.g., bad API key), the proxy is still OK.
            updateProxyStatusIndicator('ok');
        } else {
             updateProxyStatusIndicator('error');
        }
    }

    if (botMessage.functionCallName && supabaseService) {
        supabaseService.incrementActionStat(botMessage.functionCallName);
        state.actionStats[botMessage.functionCallName] = (state.actionStats[botMessage.functionCallName] || 0) + 1;
    }
    
    state.isLoading = false;
    hideLoadingIndicator();
    
    // If we are in a silent operation (like email polling), don't add to chat
    if (isSilent) {
        if(botMessage.text && botMessage.text.trim().length > 0) {
             showBrowserNotification("Новое важное сообщение", {
                body: botMessage.text,
                icon: './favicon.svg'
            });
        }
        return;
    }
    
    state.messages.push(botMessage);
    addMessageToChat(botMessage);
    
    // Render contextual actions if they exist
    renderContextualActions(botMessage.contextualActions || []);
}

async function handleSendMessage(prompt, image = null) {
    if (state.isLoading) return;
    const userMessage = {
        id: Date.now().toString(),
        sender: MessageSender.USER,
        text: prompt,
        image: image
    };
    state.messages.push(userMessage);
    addMessageToChat(userMessage);
    // Clear contextual actions after sending a new message
    renderContextualActions([]);
    await processBotResponse(userMessage, false);
}

// --- MODAL & WIZARD MANAGEMENT ---
function showSettingsModal() {
    modalContainer.innerHTML = '';
    const modal = createSettingsModal({
        settings: state.settings,
        supabaseService: supabaseService,
        onClose: () => { modalContainer.innerHTML = ''; },
        onSave: async (newSettings) => {
            state.settings = newSettings;
            if (supabaseService) {
                await supabaseService.saveUserSettings(newSettings);
            }
            saveSettings(newSettings);
            googleProvider.setTimezone(newSettings.timezone);
            if(newSettings.enableAutoSync) startAutoSync(); else stopAutoSync();
            if(newSettings.enableEmailPolling) setupEmailPolling(); else stopEmailPolling();
            modalContainer.innerHTML = '';
        },
        onLaunchDbWizard: () => {
             modalContainer.innerHTML = ''; // Close settings before opening wizard
             showDbSetupWizard();
        },
    });
    modalContainer.appendChild(modal);
}

function showProfileModal() {
    modalContainer.innerHTML = '';
    const modal = createProfileModal(
        state.userProfile,
        state.settings,
        {
            onClose: () => { modalContainer.innerHTML = ''; },
            onSave: async (newSettings) => {
                state.settings = newSettings;
                 if (supabaseService) {
                    await supabaseService.saveUserSettings(newSettings);
                }
                saveSettings(newSettings);
                googleProvider.setTimezone(newSettings.timezone);
                if(newSettings.enableAutoSync) startAutoSync(); else stopAutoSync();
                if(newSettings.enableEmailPolling) setupEmailPolling(); else stopEmailPolling();
            },
            onLogout: handleLogout,
            onDelete: async () => {
                if (confirm('Вы уверены, что хотите удалить все ваши настройки из облака? Это действие необратимо.')) {
                    await supabaseService.deleteUserSettings();
                    // Keep local settings but disable Supabase
                    state.settings.isSupabaseEnabled = false;
                    saveSettings(state.settings);
                    window.location.reload();
                }
            },
            onForceSync: runAllSyncs,
            onAnalyzeError: async ({ context, error }) => analyzeSyncErrorWithGemini({
                errorMessage: error,
                context: context,
                appStructure: APP_STRUCTURE_CONTEXT,
                apiKey: state.settings.geminiApiKey,
                proxyUrl: await getActiveProxy(),
            }),
            onViewData: async ({ tableName }) => supabaseService.getSampleData(tableName),
            onLaunchDbWizard: () => {
                modalContainer.innerHTML = ''; // Close profile before opening wizard
                showDbSetupWizard();
            },
        },
        state.syncStatus,
        syncTasks,
        SUPABASE_CONFIG.url,
    );
    modalContainer.appendChild(modal);
}

function showHelpModal() {
    modalContainer.innerHTML = '';
    const modal = createHelpModal({
        onClose: () => { modalContainer.innerHTML = ''; },
        settings: state.settings,
        // FIX: Make arrow function async to allow await
        analyzeErrorFn: async (errorText) => analyzeSyncErrorWithGemini({
            errorMessage: errorText,
            context: 'User is analyzing a pasted error in the Help Center.',
            appStructure: APP_STRUCTURE_CONTEXT,
            apiKey: state.settings.geminiApiKey,
            proxyUrl: await getActiveProxy(),
        }),
        onRelaunchWizard: () => {
            if (confirm('Вы уверены? Ваши текущие ключи, сохраненные в браузере, будут удалены.')) {
                 localStorage.removeItem('secretary-plus-settings-v4');
                 window.location.reload();
            }
        },
        onLaunchDbWizard: showDbSetupWizard,
        onLaunchProxyWizard: showProxySetupWizard
    });
    modalContainer.appendChild(modal);
}

function showStatsModal() {
    modalContainer.innerHTML = '';
    const modal = createStatsModal(state.actionStats, () => {
        modalContainer.innerHTML = '';
    });
    modalContainer.appendChild(modal);
}

function showCameraView() {
    cameraViewContainer.innerHTML = '';
    cameraViewContainer.classList.remove('hidden');
    const cameraView = createCameraView(
        (image) => { handleSendMessage('Что на этом фото?', image); },
        () => {
            cameraViewContainer.innerHTML = '';
            cameraViewContainer.classList.add('hidden');
        }
    );
    cameraViewContainer.appendChild(cameraView);
}

function showDbSetupWizard() {
     wizardContainer.innerHTML = '';
     const wizard = createDbSetupWizard({
        settings: state.settings,
        supabaseConfig: SUPABASE_CONFIG,
        onClose: () => { wizardContainer.innerHTML = ''; },
        onSave: (newSettings) => {
            state.settings = newSettings;
            saveSettings(newSettings);
            wizardContainer.innerHTML = '';
            alert('Настройки Управляющего воркера сохранены!');
        }
     });
     wizardContainer.appendChild(wizard);
}

function showProxySetupWizard() {
     wizardContainer.innerHTML = '';
     const wizard = createProxySetupWizard({
        onClose: () => { wizardContainer.innerHTML = ''; },
     });
     wizardContainer.appendChild(wizard);
}


// --- POLLING LOGIC ---
function stopEmailPolling() {
    if (emailCheckInterval) clearInterval(emailCheckInterval);
}

function setupEmailPolling() {
    stopEmailPolling();
    if (!state.settings.enableEmailPolling || !state.isGoogleConnected) return;
    
    const checkEmails = async () => {
        try {
            const emails = await googleProvider.getRecentEmails({ max_results: 1 });
            if (emails && emails.length > 0) {
                const latestEmail = emails[0];
                if (latestEmail.id !== state.lastSeenEmailId) {
                    state.lastSeenEmailId = latestEmail.id;
                    const prompt = `Проанализируй это новое письмо и скажи, является ли оно важным или срочным. Если да, кратко изложи суть. Если нет, ничего не отвечай. Письмо:\nОт: ${latestEmail.from}\nТема: ${latestEmail.subject}\n\n${latestEmail.body}`;
                    await processBotResponse({ text: prompt }, true);
                }
            }
        } catch (error) {
            console.error("Email polling failed:", error);
            // Optionally stop polling on repeated failures
        }
    };

    setTimeout(checkEmails, 5000);
    emailCheckInterval = setInterval(checkEmails, 60000);
}

// --- SCHEMA MIGRATION ---
async function runSchemaMigrations() {
    if (!state.settings.isSupabaseEnabled || !state.settings.managementWorkerUrl) {
        return;
    }

    const { element: modal, updateState } = createMigrationModal();
    modalContainer.appendChild(modal);

    const performMigration = async () => {
        try {
            updateState('checking');
            let currentVersion = 0;

            try {
                const versionResult = await supabaseService.executeSql(state.settings.managementWorkerUrl, 'SELECT version FROM public.schema_migrations WHERE id = 1;');
                if (versionResult && versionResult.length > 0) {
                    currentVersion = versionResult[0].version;
                }
            } catch (e) {
                if (e.message.includes('relation "public.schema_migrations" does not exist')) {
                    currentVersion = 0;
                } else {
                    throw e;
                }
            }

            if (currentVersion >= LATEST_SCHEMA_VERSION) {
                updateState('success', 'Ваша база данных в актуальном состоянии.');
                return new Promise(resolve => setTimeout(() => { modal.remove(); resolve(); }, 1500));
            }

            const migrationsToRun = MIGRATIONS.filter(m => m.version > currentVersion).sort((a, b) => a.version - b.version);

            for (const migration of migrationsToRun) {
                updateState('migrating', `Шаг ${migration.version}/${LATEST_SCHEMA_VERSION}: ${migration.description}`);
                await supabaseService.executeSql(state.settings.managementWorkerUrl, migration.sql);
                const updateVersionSql = `UPDATE public.schema_migrations SET version = ${migration.version}, last_updated = now() WHERE id = 1;`;
                await supabaseService.executeSql(state.settings.managementWorkerUrl, updateVersionSql);
            }

            updateState('success');
            return new Promise(resolve => setTimeout(() => { modal.remove(); resolve(); }, 1500));

        } catch (error) {
            console.error("Migration failed:", error);
            updateState('error', null, error.message);
            // This promise will not resolve, halting app execution until fixed.
            return new Promise((_, reject) => {
                 modal.addEventListener('click', e => {
                    const action = e.target.dataset.action;
                    if (action === 'retry') {
                        performMigration().then(() => reject()); // Resolve outer promise on success
                    } else if (action === 'open-wizard') {
                        modal.remove();
                        showDbSetupWizard();
                    }
                });
            });
        }
    };

    return performMigration();
}

// --- MAIN APP INITIALIZATION ---
async function main() {
    settingsButton.innerHTML = SettingsIcon;
    statsButton.innerHTML = ChartBarIcon;
    helpButton.innerHTML = QuestionMarkCircleIcon;
    settingsButton.addEventListener('click', showSettingsModal);
    helpButton.addEventListener('click', showHelpModal);
    statsButton.addEventListener('click', showStatsModal);
    
    const savedWizardState = sessionStorage.getItem('wizardState');
    sessionStorage.removeItem('wizardState');
    
    const settings = getSettings();
    if (!settings.geminiApiKey) {
         wizardContainer.innerHTML = '';
         const wizard = createSetupWizard({
            onComplete: async (newSettings) => {
                state.settings = newSettings;
                saveSettings(newSettings);
                wizardContainer.innerHTML = '';
                await initializeAppServices();
                await runSchemaMigrations();
                renderMainContent();
            },
            onExit: () => {
                wizardContainer.innerHTML = '';
                initializeAppServices().then(renderMainContent);
            },
            googleProvider,
            supabaseConfig: SUPABASE_CONFIG,
            googleClientId: GOOGLE_CLIENT_ID,
            resumeState: savedWizardState ? JSON.parse(savedWizardState) : null
         });
         wizardContainer.appendChild(wizard);
    } else {
        await initializeAppServices();
        await runSchemaMigrations();
        renderMainContent();
    }
}

main();