import { GoogleServiceProvider } from './services/google/GoogleServiceProvider.js';
import { AppleServiceProvider } from './services/apple/AppleServiceProvider.js';
import { SupabaseService } from './services/supabase/SupabaseService.js';
import { callGemini } from './services/geminiService.js';
import { getSettings, saveSettings, getSyncStatus, saveSyncStatus } from './utils/storage.js';
import { createSettingsModal } from './components/SettingsModal.js';
import { createProfileModal } from './components/ProfileModal.js';
import { createHelpModal } from './components/HelpModal.js';
import { createWelcomeScreen } from './components/Welcome.js';
import { createChatInterface, addMessageToChat, showLoadingIndicator, hideLoadingIndicator, renderContextualActions } from './components/Chat.js';
import { createCameraView } from './components/CameraView.js';
import { createAboutModal } from './components/AboutModal.js';
import { createMigrationModal } from './components/MigrationModal.js';
import { createDbSetupWizard } from './components/DbSetupWizard.js';
import { SettingsIcon, QuestionMarkCircleIcon, UserIcon } from './components/icons/Icons.js';
import { MessageSender } from './types.js';
import { SUPABASE_CONFIG } from './config.js';

// --- UTILITY ---
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
    userProfile: null,
    isLoading: false, // Prevents auth race conditions and duplicate actions
    lastSeenEmailId: null,
    syncStatus: getSyncStatus(),
    isSyncing: false,
    sessionId: null,
    keyPool: [],
    proxyPool: [],
};

// --- SERVICE INSTANCES ---
const googleProvider = new GoogleServiceProvider();
const appleProvider = new AppleServiceProvider();
let supabaseService = null;
try {
    supabaseService = new SupabaseService(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
} catch (e) {
    console.error("Global Supabase initialization failed", e);
}

const serviceProviders = {
    google: googleProvider,
    apple: appleProvider,
    supabase: supabaseService,
};

// --- DOM ELEMENTS ---
let appContainer, modalContainer, cameraViewContainer, globalModalContainer;
let emailCheckInterval = null;
let syncInterval = null;


// --- ERROR HANDLING ---
function showSystemError(text) {
    addMessageToChat({ sender: MessageSender.SYSTEM, text: `Ошибка: ${text}`, id: Date.now() });
}

// --- RENDER FUNCTIONS ---
function renderAuth(profile) {
    const authContainer = document.getElementById('auth-container');
    if (!authContainer) return;
    
    authContainer.innerHTML = '';
    if (profile) {
        const profileButton = document.createElement('button');
        profileButton.className = 'flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-blue-500 rounded-full';
        profileButton.setAttribute('aria-label', 'Открыть профиль пользователя');
        
        if (profile.avatar_url) {
            profileButton.innerHTML = `<img src="${profile.avatar_url}" alt="${profile.full_name}" class="w-8 h-8 rounded-full">`;
        } else {
            // Fallback icon for users without an avatar
            const fallbackIcon = document.createElement('div');
            fallbackIcon.className = 'w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400';
            fallbackIcon.innerHTML = UserIcon;
            profileButton.appendChild(fallbackIcon);
        }
        
        profileButton.addEventListener('click', showProfileModal);
        authContainer.appendChild(profileButton);
    }
}


// --- SYNC LOGIC ---
const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const ALL_SYNC_TASKS = [
    { name: 'Calendar', serviceKey: 'calendar', label: 'Календарь', icon: 'CalendarIcon', tableName: 'calendar_events', providerFn: () => googleProvider.getCalendarEvents({ showDeleted: true, max_results: 2500 }), supabaseFn: (items) => supabaseService.syncCalendarEvents(items) },
    { name: 'Tasks', serviceKey: 'tasks', label: 'Задачи', icon: 'CheckSquareIcon', tableName: 'tasks', providerFn: () => googleProvider.getTasks({ showCompleted: true, showHidden: true, max_results: 2000 }), supabaseFn: (items) => supabaseService.syncTasks(items) },
    { name: 'Contacts', serviceKey: 'contacts', label: 'Контакты', icon: 'UsersIcon', tableName: 'contacts', providerFn: () => googleProvider.getAllContacts(), supabaseFn: (items) => supabaseService.syncContacts(items) },
    { name: 'Files', serviceKey: 'files', label: 'Файлы', icon: 'FileIcon', tableName: 'files', providerFn: () => googleProvider.getAllFiles(), supabaseFn: (items) => supabaseService.syncFiles(items) },
    { name: 'Emails', serviceKey: 'emails', label: 'Почта', icon: 'EmailIcon', tableName: 'emails', providerFn: () => googleProvider.getRecentEmails({ max_results: 1000 }), supabaseFn: (items) => supabaseService.syncEmails(items) },
    { name: 'Notes', serviceKey: 'notes', label: 'Заметки', icon: 'FileIcon', tableName: 'notes', providerFn: null, supabaseFn: null }, // Placeholder for UI
];

function getEnabledSyncTasks() {
    return ALL_SYNC_TASKS.filter(task => state.settings.enabledServices[task.serviceKey]);
}

async function runSingleSync(taskName) {
    if (!googleProvider.token || !supabaseService) {
        throw new Error("Сервисы не готовы для синхронизации.");
    }
    const task = getEnabledSyncTasks().find(t => t.name === taskName);
    if (!task || !task.providerFn) throw new Error(`Задача синхронизации "${taskName}" не найдена или не настроена.`);

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
    if (state.isSyncing || !googleProvider.token || !supabaseService) return;
    state.isSyncing = true;
    for (const task of getEnabledSyncTasks()) {
        if (!task.providerFn) continue; // Skip tasks without a provider function (like Notes)
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
    if (!state.settings.enableAutoSync) return;
    setTimeout(runAllSyncs, 2000);
    syncInterval = setInterval(runAllSyncs, SYNC_INTERVAL_MS);
}

function stopAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
}


// --- AUTH & INITIALIZATION ---
async function startNewChatSession() {
    if (supabaseService) {
        try {
            state.sessionId = await supabaseService.createNewSession();
        } catch (error) {
            console.error("Failed to create new chat session:", error);
            showSystemError(error.message)
            state.sessionId = null; // Ensure it's null on failure
        }
    }
}

// --- EVENT HANDLERS & LOGIC ---
async function handleLogout() {
    modalContainer.innerHTML = '';
    if (supabaseService) {
        await supabaseService.signOut();
    }
}

async function handleNewChat() {
    if (state.messages.length > 0 && confirm('Вы уверены, что хотите начать новый чат?')) {
        state.messages = [];
        await startNewChatSession();
        const chatContainer = createChatInterface(handleSendMessage, showCameraView, showSystemError, handleNewChat);
        document.getElementById('main-content').innerHTML = '';
        document.getElementById('main-content').appendChild(chatContainer);
    }
}


async function processBotResponse(userMessage, isSilent) {
    if (state.isLoading) return;
    state.isLoading = true;
    if (!isSilent) showLoadingIndicator();
    
    const botMessage = await callGemini({
        userMessage: userMessage,
        history: state.messages,
        serviceProviders,
        serviceMap: state.settings.serviceMap,
        timezone: state.settings.timezone,
        isGoogleConnected: !!googleProvider.token,
        keyPool: state.keyPool,
        proxyPool: state.proxyPool,
    });

    if (botMessage.functionCallName && supabaseService) {
        supabaseService.incrementActionStat(botMessage.functionCallName);
    }

    if (supabaseService && state.sessionId) {
        supabaseService.logChatMessage(botMessage, state.sessionId);
    }
    
    state.isLoading = false;
    hideLoadingIndicator();
    
    if (isSilent) {
        if(botMessage.text && botMessage.text.trim().length > 0 && botMessage.sender === MessageSender.ASSISTANT) {
             showBrowserNotification("Новое важное сообщение", {
                body: botMessage.text,
                icon: './favicon.svg'
            });
        }
        return;
    }
    
    state.messages.push(botMessage);
    addMessageToChat(botMessage);
    
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

    renderContextualActions([]);
    await processBotResponse(userMessage, false);
}

async function handleGlobalClick(event) {
    const target = event.target;
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
            case 'welcome_prompt':
                handleSendMessage(payload.prompt);
                const welcomeScreen = document.querySelector('.welcome-screen-container');
                if (welcomeScreen) welcomeScreen.remove();
                break;
            case 'analyze_event': handleSendMessage(`Подробности о событии: "${payload.summary}". Что можно с ним сделать?`); break;
            case 'analyze_task': handleSendMessage(`Подробности о задаче: "${payload.title}". Какие есть опции?`); break;
            case 'analyze_email': handleSendMessage(`Проанализируй это письмо от ${payload.from} с темой "${payload.subject}" и подготовь варианты действий. Содержимое:\n\n${payload.body}`); break;
            case 'analyze_document': handleSendMessage(`Проанализируй документ "${payload.name}" и сделай краткую выжимку.`); break;
            case 'analyze_contact': addMessageToChat({ id: Date.now().toString(), sender: MessageSender.ASSISTANT, text: `Выбран контакт: ${payload.display_name}.`, card: { type: 'contact', icon: 'UsersIcon', title: 'Карточка контакта', person: payload } }); break;
            case 'download_ics':
                try {
                    const base64Decoded = atob(payload.data);
                    const uint8Array = new Uint8Array(base64Decoded.length);
                    for (let i = 0; i < base64Decoded.length; i++) { uint8Array[i] = base64Decoded.charCodeAt(i); }
                    const blob = new Blob([uint8Array], { type: 'text/calendar;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = payload.filename;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (e) { showSystemError(`Не удалось создать файл .ics: ${e.message}`); }
                break;
            case 'request_delete':
                const typeMap = { event: 'событие', task: 'задачу', email: 'письмо' };
                const typeText = typeMap[payload.type] || 'элемент';
                if (confirm(`Вы уверены, что хотите удалить это ${typeText}?`)) { handleSendMessage(`Удали ${typeText} с ID ${payload.id}`); }
                break;
            case 'create_meet_with': handleSendMessage(`Создай видеовстречу с ${payload.name} (${payload.email}) на ближайшее удобное время.`); break;
            case 'send_meeting_link':
                try {
                    await googleProvider.sendEmail(payload);
                    addMessageToChat({ sender: MessageSender.ASSISTANT, text: 'Приглашение со ссылкой на встречу отправлено.', id: Date.now().toString() });
                } catch (e) { showSystemError(`Не удалось отправить письмо: ${e.message}`); }
                break;
            case 'create_prep_task':
                try {
                    const task = await googleProvider.createTask(payload);
                    addMessageToChat({ sender: MessageSender.ASSISTANT, text: `Задача "${task.title}" успешно создана.`, id: Date.now().toString() });
                } catch (e) { showSystemError(`Не удалось создать задачу: ${e.message}`); }
                break;
            case 'create_google_doc_with_content':
                 try {
                    const doc = await googleProvider.createGoogleDocWithContent(payload.title, payload.content);
                    addMessageToChat({ sender: MessageSender.ASSISTANT, text: `Документ "${doc.name}" создан.`, id: Date.now().toString(), card: { type: 'document', icon: 'FileIcon', title: doc.name, actions: [{label: 'Открыть', url: doc.webViewLink}] } });
                } catch (e) { showSystemError(`Не удалось создать документ: ${e.message}`); }
                break;
        }
        return;
    }

    const clientActionButton = target.closest('[data-client-action]');
    if (clientActionButton) {
        event.preventDefault();
        const action = clientActionButton.dataset.clientAction;
        switch (action) {
            case 'open_settings': showSettingsModal(); break;
            case 'open_migration_modal': {
                const { element: migrationModal } = createMigrationModal({ supabaseService, onOpenSettings: showSettingsModal });
                globalModalContainer.innerHTML = '';
                globalModalContainer.appendChild(migrationModal);
                break;
            }
            case 'open_db_setup_wizard': {
                // Close any other open modals first
                modalContainer.innerHTML = '';
                globalModalContainer.innerHTML = '';
                const wizard = createDbSetupWizard({
                    supabaseService: supabaseService,
                    onComplete: () => {
                        globalModalContainer.innerHTML = '';
                        // Optionally reopen settings if needed
                        showSettingsModal();
                    }
                });
                globalModalContainer.appendChild(wizard);
                break;
            }
        }
        return;
    }

    const promptButton = target.closest('[data-action-prompt]');
    if (promptButton) {
        event.preventDefault();
        handleSendMessage(promptButton.dataset.actionPrompt);
        renderContextualActions([]);
        return;
    }

    const replyButton = target.closest('[data-reply-text]');
    if (replyButton) {
        event.preventDefault();
        handleSendMessage(replyButton.dataset.replyText);
        const container = replyButton.closest('.quick-replies-container');
        if (container) { container.querySelectorAll('button').forEach(b => b.disabled = true); replyButton.classList.add('clicked'); }
        return;
    }
}


// --- MODAL & WIZARD MANAGEMENT ---

function showSettingsModal() {
    modalContainer.innerHTML = '';
    const modal = createSettingsModal({
        supabaseService: supabaseService,
        allSyncTasks: getEnabledSyncTasks(),
        onClose: () => { modalContainer.innerHTML = ''; },
        onRunSingleSync: runSingleSync,
        onRunAllSyncs: runAllSyncs,
    });
    modalContainer.appendChild(modal);
}

async function showProfileModal() {
    modalContainer.innerHTML = `<div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"><div class="animate-spin h-10 w-10 border-4 border-white border-t-transparent rounded-full"></div></div>`;

    try {
        if (!state.userProfile) throw new Error("Не удалось загрузить профиль пользователя.");
        modalContainer.innerHTML = '';
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
    const modal = createHelpModal({ onClose: () => { modalContainer.innerHTML = ''; } });
    modalContainer.appendChild(modal);
}

function showCameraView() {
    cameraViewContainer.innerHTML = '';
    cameraViewContainer.classList.remove('hidden');
    const cameraView = createCameraView(
        (image) => { handleSendMessage('Что на этом фото?', image); },
        () => { cameraViewContainer.innerHTML = ''; cameraViewContainer.classList.add('hidden'); }
    );
    cameraViewContainer.appendChild(cameraView);
}

function showAboutModal() {
    modalContainer.innerHTML = '';
    const aboutModal = createAboutModal(() => { modalContainer.innerHTML = ''; });
    modalContainer.appendChild(aboutModal);
}

// --- POLLING LOGIC ---
function stopEmailPolling() {
    if (emailCheckInterval) clearInterval(emailCheckInterval);
}

function setupEmailPolling() {
    stopEmailPolling();
    if (!state.settings.enableEmailPolling || !googleProvider.token) return;
    
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
        }
    };

    setTimeout(checkEmails, 5000);
    emailCheckInterval = setInterval(checkEmails, 60000);
}


// --- APP STARTUP LOGIC ---

function renderMainApp() {
    appContainer.innerHTML = `
        <div id="app" class="flex flex-col h-full">
            <header class="flex justify-between items-center p-2 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0 bg-white dark:bg-slate-800 shadow-sm">
                <a href="#" onclick="window.location.reload()" class="flex items-center gap-3" aria-label="Домашняя страница Секретарь+">
                    <div id="header-logo-container" class="w-10 h-10">
                         <img src="https://cdn3.iconfinder.com/data/icons/user-icon-1/100/06-1User-512.png" alt="Логотип Секретарь+">
                    </div>
                    <h1 class="text-xl font-bold text-slate-800 dark:text-slate-100">Секретарь+</h1>
                </a>
                <div class="flex items-center gap-2">
                    <div id="auth-container" class="relative"></div>
                    <button id="help-button" class="p-2 text-slate-500 dark:text-slate-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Помощь"></button>
                    <button id="settings-button" data-client-action="open_settings" class="p-2 text-slate-500 dark:text-slate-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Настройки"></button>
                </div>
            </header>
            <main id="main-content" class="flex-1 overflow-hidden relative"></main>
        </div>
    `;
    const settingsButton = document.getElementById('settings-button');
    const helpButton = document.getElementById('help-button');
    settingsButton.innerHTML = SettingsIcon;
    helpButton.innerHTML = QuestionMarkCircleIcon;
    helpButton.addEventListener('click', showHelpModal);
    document.body.addEventListener('click', handleGlobalClick);
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = '';
    const chatContainer = createChatInterface(handleSendMessage, showCameraView, showSystemError, handleNewChat);
    mainContent.appendChild(chatContainer);
}


async function startAuthenticatedSession(session) {
    if (state.isLoading) return;
    state.isLoading = true;

    try {
        const userProfile = await supabaseService.getCurrentUserProfile();
        if (!userProfile) throw new Error("Профиль пользователя не найден в базе данных.");
        
        state.userProfile = userProfile;
        googleProvider.setAuthToken(session.provider_token);
        await googleProvider.loadGapiClient();
        
        renderMainApp();
        renderAuth(state.userProfile);

        const cloudSettings = await supabaseService.getUserSettings();
        if (cloudSettings) {
            state.settings = { ...getSettings(), ...cloudSettings };
            saveSettings(state.settings);
        }
        supabaseService.setSettings(state.settings);
        googleProvider.setTimezone(state.settings.timezone);

        const isAdminOrOwner = userProfile.role === 'admin' || userProfile.role === 'owner';
        const settingsBtn = document.getElementById('settings-button');
        if (settingsBtn) { settingsBtn.style.display = isAdminOrOwner ? 'block' : 'none'; }
        
        try {
            await supabaseService.checkSchemaVersion();
            state.keyPool = await supabaseService.getSharedGeminiKeys();
            state.proxyPool = await supabaseService.getSharedProxies();
            await startNewChatSession();
            startAutoSync();
            setupEmailPolling();
        } catch (schemaError) {
            const isSchemaError = schemaError.message.includes('relation') || schemaError.message.includes('does not exist') || schemaError.message.includes('Could not find the function');
            
            if (isAdminOrOwner && isSchemaError) {
                 addMessageToChat({
                    id: Date.now().toString(),
                    sender: MessageSender.SYSTEM,
                    text: 'Структура вашей базы данных устарела. Для корректной работы приложения необходимо её обновить.',
                    card: {
                        type: 'system_action',
                        icon: 'AlertTriangleIcon',
                        title: 'Требуется обновление базы данных',
                        actions: [{
                            label: 'Запустить мастер обновления',
                            clientAction: 'open_migration_modal'
                        }]
                    }
                });
            } else if (isSchemaError) {
                 showSystemError("База данных не настроена. Обратитесь к администратору.");
            } else {
                 showSystemError(`Не удалось загрузить конфигурацию: ${schemaError.message}`);
            }
        }

    } catch (error) {
        console.error("Critical error during session start, signing out:", error);
        if (!document.getElementById('app')) {
             alert(`Критическая ошибка: не удалось запустить сессию. Выполняется выход.\n\nДетали: ${error.message}`);
             await handleLogout();
        } else {
            showSystemError(error.message);
        }
    } finally {
        state.isLoading = false;
    }
}


function showWelcomeScreen() {
    if (document.querySelector('.welcome-screen-container')) return;
    appContainer.innerHTML = '';
    const welcome = createWelcomeScreen({
        onLogin: async () => {
            try {
                await supabaseService.signInWithGoogle();
            } catch (error) {
                console.error("Google Sign-In failed:", error);
                alert(`Не удалось войти через Google: ${error.message}`);
            }
        },
        onShowAbout: showAboutModal,
    });
    appContainer.appendChild(welcome);
}

function waitForExternalLibs() {
    return new Promise((resolve, reject) => {
        const timeout = 15000;
        const interval = 100;
        let elapsed = 0;
        const check = () => {
            const isGoogleReady = window.google && window.google.accounts && window.google.accounts.oauth2 && window.gapi;
            const isSupabaseReady = window.supabase && typeof window.supabase.createClient === 'function';
            const isPdfJsReady = window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function';
            const isChartJsReady = window.Chart;

            if (isGoogleReady && isSupabaseReady && isPdfJsReady && isChartJsReady) {
                resolve();
            } else {
                elapsed += interval;
                if (elapsed >= timeout) {
                    let missing = [];
                    if (!isGoogleReady) missing.push("Google API");
                    if (!isSupabaseReady) missing.push("Supabase Client");
                    if (!isPdfJsReady) missing.push("PDF.js");
                    if (!isChartJsReady) missing.push("Chart.js");
                    reject(new Error(`Критическая ошибка при запуске: не удалось загрузить внешние библиотеки: ${missing.join(', ')}.\n\nПроверьте подключение к интернету, отключите блокировщики рекламы и попробуйте перезагрузить страницу.`));
                } else {
                    setTimeout(check, interval);
                }
            }
        };
        check();
    });
}

async function main() {
    appContainer = document.getElementById('app-container');
    modalContainer = document.getElementById('modal-container');
    cameraViewContainer = document.getElementById('camera-view-container');
    globalModalContainer = document.getElementById('global-modal-container');

    appContainer.innerHTML = `<div class="h-full w-full flex items-center justify-center"><div class="animate-spin h-10 w-10 border-4 border-slate-300 border-t-transparent rounded-full"></div></div>`;

    try {
        await waitForExternalLibs();
    } catch (error) {
        appContainer.innerHTML = `<div class="p-4 text-red-500">${error.message}</div>`;
        return;
    }

    if (!supabaseService) {
        appContainer.innerHTML = `<div class="p-4 text-red-500">Не удалось инициализировать Supabase. Проверьте конфигурацию.</div>`;
        return;
    }
    
    supabaseService.onAuthStateChange(async (event, session) => {
        if (session && !state.userProfile) {
            await startAuthenticatedSession(session);
        } else if (session && state.userProfile) {
            googleProvider.setAuthToken(session.provider_token);
        } else if (!session && state.userProfile) {
            state.userProfile = null;
            state.isLoading = false;
            stopEmailPolling();
            stopAutoSync();
            showWelcomeScreen();
        } else if (!session && !state.userProfile) {
            if (!document.querySelector('.welcome-screen-container')) {
                showWelcomeScreen();
            }
        }
    });
}

window.onload = main;