import { GoogleServiceProvider } from './services/google/GoogleServiceProvider.js';
import { AppleServiceProvider } from './services/apple/AppleServiceProvider.js';
import { SupabaseService } from './services/supabase/SupabaseService.js';
import { callGemini, analyzeSyncErrorWithGemini, testProxyConnection } from './services/geminiService.js';
import { getSettings, saveSettings, getSyncStatus, saveSyncStatus, getGoogleToken, saveGoogleToken, clearGoogleToken } from './utils/storage.js';
import { createSetupWizard } from './components/SetupWizard.js';
import { createSettingsModal } from './components/SettingsModal.js';
import { createProfileModal } from './components/ProfileModal.js';
import { createHelpModal } from './components/HelpModal.js';
import { createDbSetupWizard } from './components/DbSetupWizard.js';
import { createProxySetupWizard } from './components/ProxySetupWizard.js';
import { createProxyManagerModal } from './components/ProxyManagerModal.js';
import { createWelcomeScreen } from './components/Welcome.js';
import { createChatInterface, addMessageToChat, showLoadingIndicator, hideLoadingIndicator, renderContextualActions } from './components/Chat.js';
import { createCameraView } from './components/CameraView.js';
import { SettingsIcon, QuestionMarkCircleIcon } from './components/icons/Icons.js';
import { MessageSender } from './types.js';
import { SUPABASE_CONFIG, GOOGLE_CLIENT_ID } from './config.js';
import { createMigrationModal } from './components/MigrationModal.js';
import { createDbExecutionModal } from './components/DbExecutionModal.js';
import { FULL_MIGRATION_SQL } from './services/supabase/migrations.js';


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
    lastSeenEmailId: null,
    syncStatus: getSyncStatus(),
    isSyncing: false,
    proxyStatus: 'off', // 'off', 'connecting', 'ok', 'error'
    sessionId: null,
};

// --- SERVICE INSTANCES ---
const googleProvider = new GoogleServiceProvider();
const appleProvider = new AppleServiceProvider();
let supabaseService = null;
let emailCheckInterval = null;
let syncInterval = null;
let proxyTestInterval = null;
let migrationModal = null; // Instance for the migration modal

const serviceProviders = {
    google: googleProvider,
    apple: appleProvider,
    supabase: null,
};

// --- DOM ELEMENTS ---
// These will be populated after the app's structure is rendered.
let appContainer, authContainer, mainContent, settingsButton, helpButton, modalContainer, cameraViewContainer, wizardContainer;

// --- ERROR HANDLING ---
function showSystemError(text) {
    addMessageToChat({ sender: MessageSender.SYSTEM, text: `Ошибка: ${text}`, id: Date.now() });
}

// --- RENDER FUNCTIONS ---
function updateProxyStatusIndicator(status) {
    if (state.proxyStatus === status && status !== 'connecting') return; 
    state.proxyStatus = status;
    const profileButton = authContainer?.querySelector('button');
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
        profileButton.innerHTML = `<img src="${state.userProfile.imageUrl || state.userProfile.avatar_url}" alt="${state.userProfile.name || state.userProfile.full_name}" class="w-8 h-8 rounded-full">`;
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
export const syncTasks = [
    { name: 'Calendar', label: 'Календарь', icon: 'CalendarIcon', tableName: 'calendar_events', providerFn: () => googleProvider.getCalendarEvents({ showDeleted: true, max_results: 2500 }), supabaseFn: (items) => supabaseService.syncCalendarEvents(items) },
    { name: 'Tasks', label: 'Задачи', icon: 'CheckSquareIcon', tableName: 'tasks', providerFn: () => googleProvider.getTasks({ showCompleted: true, showHidden: true, max_results: 2000 }), supabaseFn: (items) => supabaseService.syncTasks(items) },
    { name: 'Contacts', label: 'Контакты', icon: 'UsersIcon', tableName: 'contacts', providerFn: () => googleProvider.getAllContacts(), supabaseFn: (items) => supabaseService.syncContacts(items) },
    { name: 'Files', label: 'Файлы', icon: 'FileIcon', tableName: 'files', providerFn: () => googleProvider.getAllFiles(), supabaseFn: (items) => supabaseService.syncFiles(items) },
    { name: 'Emails', label: 'Почта', icon: 'EmailIcon', tableName: 'emails', providerFn: () => googleProvider.getRecentEmails({ max_results: 1000 }), supabaseFn: (items) => supabaseService.syncEmails(items) },
];

async function runSingleSync(taskName) {
    if (!state.isGoogleConnected || !state.isSupabaseReady || !supabaseService) {
        throw new Error("Сервисы не готовы для синхронизации.");
    }
    const task = syncTasks.find(t => t.name === taskName);
    if (!task) throw new Error(`Задача синхронизации "${taskName}" не найдена.`);

    try {
        const items = await task.providerFn();
        await task.supabaseFn(items);
        state.syncStatus[task.name] = { lastSync: new Date().toISOString(), error: null };
    } catch (error) {
        console.error(`Failed to sync ${task.name}:`, error);
        state.syncStatus[task.name] = { ...(state.syncStatus[task.name] || {}), error: error.message };
        throw error; // Re-throw so the caller knows it failed
    } finally {
        saveSyncStatus(state.syncStatus);
    }
}

async function runAllSyncs() {
    if (state.isSyncing || !state.isGoogleConnected || !state.isSupabaseReady || !supabaseService) return;
    state.isSyncing = true;
    for (const task of syncTasks) {
        try {
            await runSingleSync(task.name);
        } catch (error) {
            // Error is already logged and saved by runSingleSync, just continue to the next task.
        }
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

// --- PROXY TESTING LOGIC ---
const PROXY_TEST_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function runActiveProxyTests() {
    if (!state.settings.useProxy || !state.isSupabaseReady || !supabaseService) {
        updateProxyStatusIndicator('off');
        return;
    }
    
    const activeProxies = await supabaseService.getActiveProxies();
    if (activeProxies.length === 0) {
        updateProxyStatusIndicator('error');
        return;
    }

    let isAnyProxyOk = false;
    for (const proxy of activeProxies) {
        const result = await testProxyConnection({ 
            proxyUrl: proxy.url, 
            apiKey: state.settings.geminiApiKey 
        });
        
        await supabaseService.updateProxy(proxy.id, {
            last_test_status: result.status,
            last_test_speed: result.speed,
        });
        
        if (result.status === 'ok') {
            isAnyProxyOk = true;
        }
    }
    
    updateProxyStatusIndicator(isAnyProxyOk ? 'ok' : 'error');
}

function startAutoProxyTesting() {
    if (proxyTestInterval) clearInterval(proxyTestInterval);
    if (!state.settings.useProxy) {
        updateProxyStatusIndicator('off');
        return;
    }
    // Run once on start, then set interval
    updateProxyStatusIndicator('connecting');
    setTimeout(runActiveProxyTests, 3000); // Initial run after 3s
    proxyTestInterval = setInterval(runActiveProxyTests, PROXY_TEST_INTERVAL_MS);
}

function stopAutoProxyTesting() {
    if (proxyTestInterval) clearInterval(proxyTestInterval);
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

async function startNewChatSession() {
    if (state.isSupabaseReady && supabaseService) {
        try {
            state.sessionId = await supabaseService.createNewSession();
        } catch (error) {
            console.error("Failed to create new chat session:", error);
            state.sessionId = null; // Ensure it's null on failure
        }
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
    } else {
        // Handle direct Google auth: load token from localStorage if it exists
        const directToken = getGoogleToken();
        if (directToken) {
            googleProvider.setAuthToken(directToken);
        }
    }

    if (googleProvider.token) {
        try {
            const googleProfile = await googleProvider.getUserProfile();
            state.isGoogleConnected = true;
            
            if (state.isSupabaseReady && supabaseService) {
                const supabaseProfile = await supabaseService.getCurrentUserProfile();
                state.userProfile = supabaseProfile || { ...googleProfile, role: 'user' };
            } else {
                 state.userProfile = googleProfile;
            }

        } catch (error) {
            console.error("Failed to get user profile, token might be invalid:", error);
            showSystemError(`Сессия Google истекла или недействительна. Пожалуйста, войдите снова.`);
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
    await startNewChatSession();
    startAutoSync();
    startAutoProxyTesting();
}

// --- EVENT HANDLERS & LOGIC ---
async function handleLogout() {
    modalContainer.innerHTML = '';
    if (state.supabaseUser) {
        await supabaseService.signOut();
    } else {
        await googleProvider.disconnect();
    }
    // Clear all potential auth tokens
    clearGoogleToken();
    localStorage.removeItem('secretary-plus-settings-v4');
    localStorage.removeItem('secretary-plus-sync-status-v1');
    window.location.reload();
}

async function handleNewChat() {
    if (state.messages.length > 0 && confirm('Вы уверены, что хотите начать новый чат?')) {
        state.messages = [];
        await startNewChatSession();
        renderMainContent();
    }
}

// This function is now a pure data fetcher and does not update the UI.
async function getActiveProxy() {
    if (!state.settings.useProxy || !state.isSupabaseReady || !supabaseService) {
        return null;
    }
    const proxies = await supabaseService.getActiveProxies();
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
    }

    if (supabaseService && state.sessionId) {
        supabaseService.logChatMessage(botMessage, state.sessionId);
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

    if (supabaseService && state.sessionId) {
        supabaseService.logChatMessage(userMessage, state.sessionId);
    }

    // Clear contextual actions after sending a new message
    renderContextualActions([]);
    await processBotResponse(userMessage, false);
}

/**
 * A centralized handler for all dynamic actions in the app.
 * Uses event delegation to handle clicks on buttons with data-* attributes.
 */
async function handleGlobalClick(event) {
    const target = event.target;

    // --- 1. Handle actions within result cards, welcome screen, etc. ---
    const actionButton = target.closest('[data-action]');
    if (actionButton) {
        event.preventDefault();
        
        const action = actionButton.dataset.action;
        let payload = {};
        try {
            payload = JSON.parse(actionButton.dataset.payload || '{}');
        } catch (e) {
            console.error("Failed to parse payload for action:", action, e);
        }

        switch (action) {
            case 'welcome_prompt': {
                handleSendMessage(payload.prompt);
                const welcomeScreen = document.querySelector('.welcome-screen-container');
                if (welcomeScreen) welcomeScreen.remove();
                break;
            }

            case 'analyze_event':
                handleSendMessage(`Подробности о событии: "${payload.summary}". Что можно с ним сделать?`);
                break;
            case 'analyze_task':
                handleSendMessage(`Подробности о задаче: "${payload.title}". Какие есть опции?`);
                break;
            case 'analyze_email':
                handleSendMessage(`Проанализируй это письмо от ${payload.from} с темой "${payload.subject}" и подготовь варианты действий. Содержимое:\n\n${payload.body}`);
                break;
            case 'analyze_document':
                handleSendMessage(`Проанализируй документ "${payload.name}" и сделай краткую выжимку.`);
                break;
            case 'analyze_contact': {
                addMessageToChat({
                    id: Date.now().toString(),
                    sender: MessageSender.ASSISTANT,
                    text: `Выбран контакт: ${payload.display_name}.`,
                    card: { type: 'contact', icon: 'UsersIcon', title: 'Карточка контакта', person: payload }
                });
                break;
            }

            case 'download_ics': {
                try {
                    const base64Decoded = atob(payload.data);
                    const uint8Array = new Uint8Array(base64Decoded.length);
                    for (let i = 0; i < base64Decoded.length; i++) {
                        uint8Array[i] = base64Decoded.charCodeAt(i);
                    }
                    const blob = new Blob([uint8Array], { type: 'text/calendar;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = payload.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (e) {
                    showSystemError(`Не удалось создать файл .ics: ${e.message}`);
                }
                break;
            }

            case 'request_delete': {
                const typeMap = { event: 'событие', task: 'задачу', email: 'письмо' };
                const typeText = typeMap[payload.type] || 'элемент';
                if (confirm(`Вы уверены, что хотите удалить это ${typeText}?`)) {
                    handleSendMessage(`Удали ${typeText} с ID ${payload.id}`);
                }
                break;
            }
            case 'create_meet_with':
                handleSendMessage(`Создай видеовстречу с ${payload.name} (${payload.email}) на ближайшее удобное время.`);
                break;
            
            case 'send_meeting_link': {
                try {
                    await googleProvider.sendEmail(payload);
                    addMessageToChat({ sender: MessageSender.ASSISTANT, text: 'Приглашение со ссылкой на встречу отправлено.', id: Date.now().toString() });
                } catch (e) { showSystemError(`Не удалось отправить письмо: ${e.message}`); }
                break;
            }
            case 'create_prep_task': {
                try {
                    const task = await googleProvider.createTask(payload);
                    addMessageToChat({ sender: MessageSender.ASSISTANT, text: `Задача "${task.title}" успешно создана.`, id: Date.now().toString() });
                } catch (e) { showSystemError(`Не удалось создать задачу: ${e.message}`); }
                break;
            }
            case 'create_google_doc_with_content': {
                 try {
                    const doc = await googleProvider.createGoogleDocWithContent(payload.title, payload.content);
                    addMessageToChat({ sender: MessageSender.ASSISTANT, text: `Документ "${doc.name}" создан.`, id: Date.now().toString(), card: { type: 'document', icon: 'FileIcon', title: doc.name, actions: [{label: 'Открыть', url: doc.webViewLink}] } });
                } catch (e) { showSystemError(`Не удалось создать документ: ${e.message}`); }
                break;
            }
        }
        return;
    }

    // --- 2. Handle client-side actions (like opening modals) ---
    const clientActionButton = target.closest('[data-client-action]');
    if (clientActionButton) {
        event.preventDefault();
        const action = clientActionButton.dataset.clientAction;
        if (action === 'open_settings') {
            showSettingsModal();
        }
        return;
    }

    // --- 3. Handle contextual action prompts ---
    const promptButton = target.closest('[data-action-prompt]');
    if (promptButton) {
        event.preventDefault();
        handleSendMessage(promptButton.dataset.actionPrompt);
        renderContextualActions([]);
        return;
    }

    // --- 4. Handle quick replies ---
    const replyButton = target.closest('[data-reply-text]');
    if (replyButton) {
        event.preventDefault();
        handleSendMessage(replyButton.dataset.replyText);
        const container = replyButton.closest('.quick-replies-container');
        if (container) {
            container.querySelectorAll('button').forEach(b => b.disabled = true);
            replyButton.classList.add('clicked');
        }
        return;
    }
    
     // --- 5. Handle welcome screen "open wizard" button ---
    const openWizardButton = target.closest('#open-wizard-from-welcome');
    if (openWizardButton) {
        if (confirm('Это действие перезапустит мастер настройки и может сбросить несохраненные ключи. Продолжить?')) {
             localStorage.removeItem('secretary-plus-settings-v4');
             window.location.reload();
        }
        return;
    }
}


// --- MODAL & WIZARD MANAGEMENT ---
function showSettingsModal() {
    modalContainer.innerHTML = '';
    const modal = createSettingsModal({
        settings: state.settings,
        onClose: () => { modalContainer.innerHTML = ''; },
        onSave: async (newSettings) => {
            state.settings = newSettings;
            if (supabaseService) {
                try {
                    await supabaseService.saveUserSettings(newSettings);
                } catch (error) {
                    console.error("Failed to save settings to cloud:", error);
                    showSystemError(`Не удалось сохранить настройки в облаке: ${error.message}`);
                }
            }
            saveSettings(newSettings);
            googleProvider.setTimezone(newSettings.timezone);
            if(newSettings.enableAutoSync) startAutoSync(); else stopAutoSync();
            if(newSettings.enableEmailPolling) setupEmailPolling(); else stopEmailPolling();
            startAutoProxyTesting(); // Restart proxy testing based on new settings
            modalContainer.innerHTML = '';
        },
        onLaunchDbWizard: () => {
             modalContainer.innerHTML = ''; // Close settings before opening wizard
             showDbSetupWizard();
        },
        onLaunchDbExecutionModal: () => {
            modalContainer.innerHTML = ''; // Close settings
            showDbExecutionModal();
        },
        onLaunchProxyManager: () => {
            modalContainer.innerHTML = ''; // Close settings before opening manager
            showProxyManagerModal();
        }
    });
    modalContainer.appendChild(modal);
}

async function showProfileModal() {
    modalContainer.innerHTML = `<div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"><div class="animate-spin h-10 w-10 border-4 border-white border-t-transparent rounded-full"></div></div>`;

    try {
        if (!state.userProfile) {
            throw new Error("Не удалось загрузить профиль пользователя.");
        }
        
        modalContainer.innerHTML = ''; // Clear loading spinner
        const modal = createProfileModal({
            currentUserProfile: state.userProfile,
            supabaseService: supabaseService,
            onClose: () => { modalContainer.innerHTML = ''; },
            onLogout: handleLogout,
        });
        modalContainer.appendChild(modal);

    } catch (error) {
        modalContainer.innerHTML = '';
        showSystemError(`Не удалось открыть профиль: ${error.message}`);
    }
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
        onLaunchProxyWizard: () => showProxySetupWizard({
            supabaseService: supabaseService,
            onClose: () => { wizardContainer.innerHTML = ''; }
        })
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
        onSave: async (newSettings) => {
            state.settings = newSettings;
             if (supabaseService) {
                await supabaseService.saveUserSettings(newSettings);
            }
            saveSettings(newSettings);
            // DO NOT close the wizard or show an alert here.
            // The wizard manages its own lifecycle and provides feedback internally.
        }
     });
     wizardContainer.appendChild(wizard);
}

function showDbExecutionModal() {
    modalContainer.innerHTML = ''; // Clear other modals
    const modal = createDbExecutionModal({
        sqlScript: FULL_MIGRATION_SQL,
        onExecute: async (sql) => {
            if (!state.settings.managementWorkerUrl || !state.settings.adminSecretToken) {
                throw new Error("Управляющий воркер не настроен. Запустите мастер настройки БД в Настройках.");
            }
            if (!supabaseService) {
                 await initializeSupabase();
            }
            return await supabaseService.executeSqlViaFunction(
                state.settings.managementWorkerUrl,
                state.settings.adminSecretToken,
                sql
            );
        },
        onClose: () => {
            modalContainer.innerHTML = '';
            // It might be good to reload or re-sync after a successful migration
        }
    });
    modalContainer.appendChild(modal);
}

function showProxySetupWizard({ supabaseService, onClose }) {
     wizardContainer.innerHTML = '';
     const wizard = createProxySetupWizard({
        supabaseService: supabaseService,
        onClose: onClose,
     });
     wizardContainer.appendChild(wizard);
}

function showProxyManagerModal() {
    wizardContainer.innerHTML = '';
    const manager = createProxyManagerModal({
        supabaseService: supabaseService,
        onClose: () => { wizardContainer.innerHTML = ''; },
    });
    wizardContainer.appendChild(manager);
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

// --- SCHEMA MIGRATION LOGIC ---

async function runMigration() {
    if (!migrationModal) return;

    if (!state.settings.managementWorkerUrl || !state.settings.adminSecretToken) {
        migrationModal.updateState('not-configured');
        return;
    }

    try {
        migrationModal.updateState('migrating', 'Выполняется SQL-скрипт. Это может занять до минуты...');
        await supabaseService.executeSqlViaFunction(
            state.settings.managementWorkerUrl,
            state.settings.adminSecretToken,
            FULL_MIGRATION_SQL
        );
        migrationModal.updateState('success');
        setTimeout(() => window.location.reload(), 3000); // Reload to apply changes
    } catch (error) {
        migrationModal.updateState('error', null, error.message);
    }
}

async function checkDatabaseSchema() {
    if (!state.settings.isSupabaseEnabled || !supabaseService) {
        return true; // Supabase is disabled, so no schema to check.
    }

    try {
        // This check is now more robust. The 'sessions' table was added in the same
        // migration as the critical 'get_or_create_profile' RPC function. If this
        // check fails, we can be confident the schema is out of date.
        const { error } = await supabaseService.client.from('sessions').select('*', { count: 'exact', head: true });

        if (error) {
            // 42P01 is PostgreSQL's code for "undefined_table"
            if (error.code === '42P01' || error.message.includes("violates row-level security policy")) {
                return false; // Schema is outdated or missing tables/policies.
            }
            throw error; // A different, unexpected error occurred.
        }
        return true; // Schema seems OK.
    } catch (e) {
        console.error("Database schema check failed with an exception:", e);
        return false; // Treat exceptions as a failed check for safety.
    }
}


// --- APP STARTUP LOGIC ---
/**
 * Renders the main application UI, hooks up event listeners, and decides
 * whether to show the setup wizard or the main chat interface.
 */
async function startFullApp() {
    // Populate global DOM element variables
    appContainer = document.getElementById('app');
    authContainer = document.getElementById('auth-container');
    mainContent = document.getElementById('main-content');
    settingsButton = document.getElementById('settings-button');
    helpButton = document.getElementById('help-button');
    modalContainer = document.getElementById('modal-container');
    cameraViewContainer = document.getElementById('camera-view-container');
    wizardContainer = document.getElementById('setup-wizard-container');

    // Hook up header button listeners
    settingsButton.innerHTML = SettingsIcon;
    helpButton.innerHTML = QuestionMarkCircleIcon;
    settingsButton.addEventListener('click', showSettingsModal);
    helpButton.addEventListener('click', showHelpModal);
    
    // Add the global click handler to the body to catch all dynamic actions
    document.body.addEventListener('click', handleGlobalClick);
    
    const settings = getSettings();
    const savedWizardState = sessionStorage.getItem('wizardState');

    // Condition to show the initial setup wizard
    if (!settings.geminiApiKey) {
        // If this is a true first run, clear any potentially conflicting old data.
        if (!savedWizardState) {
            localStorage.removeItem('secretary-plus-settings-v4');
            localStorage.removeItem('secretary-plus-sync-status-v1');
        }
        
        wizardContainer.innerHTML = '';
        const wizard = createSetupWizard({
            onComplete: async (newSettings) => {
                state.settings = newSettings;
                saveSettings(newSettings);
                wizardContainer.innerHTML = '';
                await initializeAppServices();
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
        // All settings are present. Initialize services and render the main app.
        await initializeAppServices();

        const isSchemaOk = await checkDatabaseSchema();
        if (!isSchemaOk) {
            const { element, updateState } = createMigrationModal();
            migrationModal = { updateState };
            wizardContainer.innerHTML = '';
            wizardContainer.appendChild(element);
            updateState('required');

            element.addEventListener('click', async (e) => {
                const action = e.target.closest('[data-action]')?.dataset.action;
                if (action === 'migrate' || action === 'retry') {
                    await runMigration();
                } else if (action === 'open-wizard') {
                    element.remove();
                    showDbSetupWizard();
                }
            });
        } else {
            renderMainContent();
        }
    }
}

/**
 * Main entry point. Decides whether to handle an auth callback or start the app normally.
 */
async function main() {
    const isAuthCallback = window.location.hash.includes('access_token');
    const settings = getSettings();

    // If we are returning from a Supabase OAuth flow, handle it before starting the app.
    if (isAuthCallback && settings.isSupabaseEnabled) {
        // Display a non-destructive loading overlay instead of replacing the entire body.
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'fixed inset-0 bg-slate-900/80 flex items-center justify-center z-50 text-white';
        loadingOverlay.innerHTML = '<span>Завершение входа...</span>';
        document.body.appendChild(loadingOverlay);

        try {
            // Initialize Supabase early to handle the auth event from the URL hash.
            const tempSupabaseService = new SupabaseService(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
            
            // Wait for the SIGNED_IN event, which confirms Supabase has created the session.
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Authentication timed out. Please try again."));
                }, 15000); // 15-second timeout for safety.

                const { data: { subscription } } = tempSupabaseService.onAuthStateChange((event, session) => {
                    if (event === 'SIGNED_IN' && session) {
                        clearTimeout(timeout);
                        subscription.unsubscribe(); // Stop listening after success.
                        resolve(session);
                    }
                });
            });

            // Clean the URL hash.
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            
            // Remove the overlay and start the app directly without a full reload.
            loadingOverlay.remove();
            await startFullApp();

        } catch (error) {
            console.error("OAuth Callback Error:", error);
            // Show error to the user if something goes wrong
            loadingOverlay.innerHTML = `
                <div class="flex flex-col items-center justify-center text-center p-4">
                    <p class="font-bold text-red-400">Ошибка аутентификации</p>
                    <p class="mt-2">${error.message}</p>
                    <a href="${window.location.pathname}" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Попробовать снова</a>
                </div>`;
        }

    } else {
        // This is a normal app start (not an auth callback).
        await startFullApp();
    }
}


main().catch(error => {
    console.error("An unhandled error occurred during app startup:", error);
    document.body.innerHTML = `<div class="p-4 text-red-500">A critical error occurred. Please check the console.</div>`;
});