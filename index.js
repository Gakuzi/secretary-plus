import { GoogleServiceProvider } from './services/google/GoogleServiceProvider.js';
import { AppleServiceProvider } from './services/apple/AppleServiceProvider.js';
import { SupabaseService } from './services/supabase/SupabaseService.js';
import { callGemini, analyzeGenericErrorWithGemini, testProxyConnection, findProxiesWithGemini } from './services/geminiService.js';
import { getSettings, saveSettings, getSyncStatus, saveSyncStatus } from './utils/storage.js';
import { createSettingsModal } from './components/SettingsModal.js';
import { createStatsModal } from './components/StatsModal.js';
import { createHelpModal } from './components/HelpModal.js';
import { createWelcomeScreen } from './components/Welcome.js';
import { createChatInterface, addMessageToChat, showLoadingIndicator, hideLoadingIndicator, renderContextualActions } from './components/Chat.js';
import { createCameraView } from './components/CameraView.js';
import { SettingsIcon, ChartBarIcon, QuestionMarkCircleIcon } from './components/icons/Icons.js';
import { MessageSender } from './types.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';

// Add a guard to prevent the script from running multiple times
// if it's loaded by both the HTML and the TSX entry point.
if (!window.isSecretaryPlusAppInitialized) {
    window.isSecretaryPlusAppInitialized = true;

    // --- UTILITY ---
    function isMobile() {
        // Simple check for mobile user agents
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    // Provides context to the AI for generic error analysis
    const APP_STRUCTURE_CONTEXT = `
    - index.html: Главный HTML-файл.
    - index.js: Основная логика приложения, управление состоянием, обработчики событий.
    - utils/storage.js: Хранит настройки пользователя, включая ключи API.
    - constants.js: Хранит жестко заданные учетные данные для подключения к Supabase.
    - services/geminiService.js: Обрабатывает все вызовы к Gemini API для чата и анализа.
    - services/google/GoogleServiceProvider.js: Управляет всеми взаимодействиями с Google API (Календарь, Диск, Gmail и т.д.).
    - services/supabase/SupabaseService.js: Управляет всеми взаимодействиями с базой данных Supabase (аутентификация, синхронизация данных, запросы).
    - components/Chat.js: Рендерит интерфейс чата и панель ввода.
    - components/SettingsModal.js: Рендерит UI настроек, где пользователь вводит свои личные ключи.
    - components/HelpModal.js: Рендерит UI 'Центра помощи' с ИИ-анализом ошибок.
    - setup-guide.html: Интерактивный мастер для первоначальной настройки профиля пользователя (вход, ввод ключей).
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
        lastSeenEmailId: null, // For proactive email check
        syncStatus: getSyncStatus(),
        isSyncing: false,
        proxies: [], // User-defined proxy servers
    };

    // --- SERVICE INSTANCES ---
    const googleProvider = new GoogleServiceProvider();
    const appleProvider = new AppleServiceProvider();
    let supabaseService = null;
    let emailCheckInterval = null;
    let syncInterval = null; // Interval timer for auto-sync


    const serviceProviders = {
        google: googleProvider,
        apple: appleProvider,
        supabase: null, // Will be populated with supabaseService instance
    };


    // --- DOM ELEMENTS ---
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const settingsButton = document.getElementById('settings-button');
    const helpButton = document.getElementById('help-button');
    const statsButton = document.getElementById('stats-button');
    const settingsModalContainer = document.getElementById('settings-modal-container');
    const helpModalContainer = document.getElementById('help-modal-container');
    const statsModalContainer = document.getElementById('stats-modal-container');
    const cameraViewContainer = document.getElementById('camera-view-container');

    // --- ERROR HANDLING ---
    /**
     * Displays a system-level error message to the user in the chat interface.
     * @param {string} text The error message to display.
     */
    function showSystemError(text) {
        const errorMessage = { sender: MessageSender.SYSTEM, text: `Ошибка: ${text}`, id: Date.now() };
        // We don't push system errors to history to avoid confusing the AI model.
        addMessageToChat(errorMessage);
    }


    // --- RENDER FUNCTIONS ---
    function renderAuth() {
        authContainer.innerHTML = '';
        if (state.isGoogleConnected && state.userProfile) {
            const profileElement = document.createElement('div');
            profileElement.className = 'flex items-center space-x-2';
            profileElement.innerHTML = `
                <div class="relative">
                    <img src="${state.userProfile.imageUrl}" alt="${state.userProfile.name}" class="w-8 h-8 rounded-full ring-2 ring-gray-600 ring-offset-2 ring-offset-gray-800">
                </div>
            `;
            authContainer.appendChild(profileElement);
        } else {
             // In the new flow, the auth button is primarily in the Welcome screen / Settings modal.
             // This can be kept empty or show a generic state.
        }
    }

    function renderMainContent() {
        mainContent.innerHTML = '';
        const chatContainer = createChatInterface(handleSendMessage, showCameraView, showSystemError, handleNewChat);
        mainContent.appendChild(chatContainer);

        const chatLog = document.getElementById('chat-log');
        if (state.messages.length === 0) {
            chatLog.appendChild(createWelcomeScreen({
                isGoogleConnected: state.isGoogleConnected,
                isSupabaseReady: state.isSupabaseReady, 
            }));
            renderContextualActions(undefined); 
        } else {
            state.messages.forEach(msg => addMessageToChat(msg));
        }
    }

    function render() {
        renderAuth();
        renderMainContent();
    }
    
    // --- AUTO-SYNC LOGIC ---
    const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

    const syncTasks = [
        { name: 'Calendar', providerFn: () => googleProvider.getCalendarEvents({ max_results: 1000 }), supabaseFn: (items) => supabaseService.syncCalendarEvents(items) },
        { name: 'Tasks', providerFn: () => googleProvider.getTasks({ max_results: 100 }), supabaseFn: (items) => supabaseService.syncTasks(items) },
        { name: 'Contacts', providerFn: () => googleProvider.getAllContacts(), supabaseFn: (items) => supabaseService.syncContacts(items) },
        { name: 'Files', providerFn: () => googleProvider.getAllFiles(), supabaseFn: (items) => supabaseService.syncFiles(items) },
        { name: 'Emails', providerFn: () => googleProvider.getRecentEmails({ max_results: 1000 }), supabaseFn: (items) => supabaseService.syncEmails(items) },
    ];

    async function runAllSyncs(isForced = false) {
        if (state.isSyncing && !isForced) {
            console.log("Sync already in progress. Skipping.");
            return;
        }
        if (!state.isGoogleConnected || !state.isSupabaseReady || !supabaseService) {
            console.log("Cannot sync: Not connected to Google or Supabase is unavailable.");
            return;
        }

        console.log("Starting background sync...");
        state.isSyncing = true;
        // Re-render the settings modal if it's open to show loading state
        if (document.getElementById('settings-content')) {
            showSettings('sync');
        }

        for (const task of syncTasks) {
            try {
                console.log(`Syncing ${task.name}...`);
                const items = await task.providerFn();
                await task.supabaseFn(items);
                state.syncStatus[task.name] = new Date().toISOString();
                console.log(`Syncing ${task.name} successful.`);
            } catch (error) {
                console.error(`Failed to sync ${task.name}:`, error);
                state.syncStatus[task.name] = { error: error.message };
            }
            // Save status after each task to ensure progress is saved even if one fails
            saveSyncStatus(state.syncStatus);
            // Re-render modal to update status line by line
            if (document.getElementById('settings-content')) {
                showSettings('sync');
            }
        }

        state.isSyncing = false;
        console.log("Background sync finished.");
        if (document.getElementById('settings-content')) {
            showSettings('sync');
        }
    }

    function startAutoSync() {
        if (syncInterval) clearInterval(syncInterval);
        if (!state.settings.enableAutoSync || !state.isSupabaseReady) return;

        // Run once on start, then set interval
        setTimeout(runAllSyncs, 2000); // Run after 2 seconds to not block initial load
        syncInterval = setInterval(runAllSyncs, SYNC_INTERVAL_MS);
        console.log(`Auto-sync started. Interval: ${SYNC_INTERVAL_MS / 1000}s`);
    }

    function stopAutoSync() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
            console.log("Auto-sync stopped.");
        }
    }


    // --- AUTHENTICATION & INITIALIZATION ---

    async function initializeSupabase() {
        try {
            supabaseService = new SupabaseService(SUPABASE_URL, SUPABASE_ANON_KEY);
            serviceProviders.supabase = supabaseService;

            supabaseService.onAuthStateChange(async (event, session) => {
                console.log(`Supabase auth event: ${event}`);
                await handleAuthStateChange(session);
            });
            
            state.isSupabaseReady = true;

        } catch (error) {
            console.error("Supabase initialization failed:", error);
            showSystemError(`Не удалось подключиться к облачному хранилищу. Некоторые функции будут недоступны.`);
            state.isSupabaseReady = false;
            supabaseService = null;
            serviceProviders.supabase = null;
        }
    }

    async function handleAuthStateChange(session) {
        if (session) {
            state.supabaseUser = session.user;
            const providerToken = session.provider_token;
            googleProvider.setAuthToken(providerToken);
            
            try {
                // Load settings from DB and merge with local
                const dbSettings = await supabaseService.getUserSettings();
                const localSettings = getSettings();
                
                if (dbSettings) {
                    console.log("Loaded settings from Supabase.");
                    const mergedSettings = { ...localSettings, ...dbSettings };
                    state.settings = mergedSettings;
                } else {
                    console.log("No settings found in Supabase for this user. Using local settings.");
                    state.settings = localSettings;
                     // This indicates a user who has logged in but never saved settings via the wizard.
                     // We don't save local to cloud here anymore, wizard is the source of truth.
                }
                saveSettings(state.settings); // Update local cache with merged/latest settings

                // Re-apply critical settings from the potentially new settings object
                googleProvider.setTimezone(state.settings.timezone);
                await googleProvider.initClient(state.settings.googleClientId, () => {});
                
                state.userProfile = await googleProvider.getUserProfile();
                state.isGoogleConnected = true;
                state.actionStats = await supabaseService.getActionStats(); // Load stats on login
                state.proxies = await supabaseService.getProxies(); // Load proxies on login
                startAutoSync();

            } catch (error) {
                console.error("Failed to fetch Google user profile or settings via Supabase:", error);
                showSystemError(`Не удалось получить профиль Google после аутентификации. Ошибка: ${error.message}`);
                await handleLogout(); // Log out on critical failure to avoid inconsistent state
            }
        } else {
            // User is logged out
            state.supabaseUser = null;
            state.isGoogleConnected = false;
            state.userProfile = null;
            state.actionStats = {}; // Clear stats on logout
            state.proxies = []; // Clear proxies on logout
            googleProvider.setAuthToken(null);
            stopAutoSync();
            state.settings = getSettings();
        }
        
        renderAuth();
        setupEmailPolling();
        renderMainContent(); // Always re-render main content on auth change
    }
    
    async function initializeAppServices() {
        await initializeSupabase();
        // Google client is now initialized after auth state change, not here.
        googleProvider.setTimezone(state.settings.timezone);
        renderAuth();
    }

    // --- EVENT HANDLERS & LOGIC ---

    async function handleLogin() {
        if (!state.isSupabaseReady) {
            showSystemError('Подключение к облаку не удалось. Пожалуйста, проверьте консоль на наличие ошибок.');
            return;
        }
        await supabaseService.signInWithGoogle();
    }

    async function handleLogout() {
        if (state.supabaseUser) { 
            await supabaseService.signOut();
        } else { 
            await googleProvider.disconnect();
            // Manually reset state since there's no authStateChange event
            state.isGoogleConnected = false;
            state.userProfile = null;
            state.actionStats = {};
            state.supabaseUser = null;
            renderAuth();
            renderMainContent();
        }
    }

    async function handleSaveSettings(newSettings) {
        const oldSettings = { ...state.settings };
        state.settings = newSettings;
        saveSettings(newSettings);

        hideSettings();

        try {
            // If logged into Supabase, save to the database as well
            if (state.supabaseUser && supabaseService) {
                await supabaseService.saveUserSettings(newSettings);
                console.log("Settings saved to Supabase.");
            }

            // Re-apply settings immediately
            googleProvider.setTimezone(newSettings.timezone);
            
            // Handle changes that require restarting services
            if (newSettings.enableAutoSync !== oldSettings.enableAutoSync) {
                newSettings.enableAutoSync ? startAutoSync() : stopAutoSync();
            }
            if (newSettings.enableEmailPolling !== oldSettings.enableEmailPolling) {
                setupEmailPolling();
            }
            
        } catch (error) {
            console.error("Error applying new settings:", error);
            showSystemError(`Ошибка при применении настроек: ${error.message}`);
        }
    }
    
    function handleNewChat() {
        if (state.messages.length === 0) return;
        
        if (confirm('Вы уверены, что хотите начать новый чат? Вся текущая история будет удалена.')) {
            state.messages = [];
            state.lastSeenEmailId = null;
            renderMainContent();
        }
    }

    async function processBotResponse(prompt, image = null, isSystemInitiated = false) {
        state.isLoading = true;
        showLoadingIndicator();
        
        const findBestProxy = () => {
            if (!state.isSupabaseReady || state.proxies.length === 0) {
                return null;
            }
            const sorted = [...state.proxies]
                .filter(p => p.is_active)
                .sort((a, b) => a.priority - b.priority);
            
            const ok = sorted.find(p => p.last_status === 'ok');
            if (ok) return ok.url;
            
            const untested = sorted.find(p => p.last_status === 'untested');
            if (untested) return untested.url;
            
            return sorted.length > 0 ? sorted[0].url : null;
        };

        try {
            const history = isSystemInitiated ? state.messages : state.messages.slice(0, -1);
            
            const response = await callGemini({
                prompt,
                history: history,
                serviceProviders,
                serviceMap: state.settings.serviceMap,
                timezone: state.settings.timezone,
                isGoogleConnected: state.isGoogleConnected,
                image,
                apiKey: state.settings.geminiApiKey,
                proxyUrl: state.settings.useProxy ? findBestProxy() : null,
            });

            if (response.functionCallName) {
                state.actionStats[response.functionCallName] = (state.actionStats[response.functionCallName] || 0) + 1;
                if (supabaseService && state.isSupabaseReady) {
                    await supabaseService.incrementActionStat(response.functionCallName);
                }
            }
            
            if (response.systemContext) {
                 state.messages.push({ sender: MessageSender.SYSTEM, text: response.systemContext, id: Date.now() });
            }

            if (isSystemInitiated) {
                const systemPromptMessage = { sender: MessageSender.SYSTEM, text: prompt, id: Date.now() };
                state.messages.push(systemPromptMessage);
            }

            state.messages.push(response);
            addMessageToChat(response);

            if (response.contextualActions && response.contextualActions.length > 0) {
                renderContextualActions(response.contextualActions);
            }
        } catch (error) {
            console.error("Error calling Gemini:", error);
            showSystemError(`Произошла ошибка: ${error.message}`);
        } finally {
            state.isLoading = false;
            hideLoadingIndicator();
        }
    }


    async function handleSendMessage(prompt, image = null) {
        if (state.isLoading || (!prompt && !image)) return;

        renderContextualActions(null); 

        if (!state.settings.geminiApiKey) {
            showSystemError("Ключ Gemini API не указан. Пожалуйста, пройдите мастер настройки.");
            showSettings();
            return;
        }
        
        const chatLog = document.getElementById('chat-log');
        const welcomeScreen = chatLog?.querySelector('.welcome-screen-container');
        if (welcomeScreen) {
             chatLog.innerHTML = '';
        }
        
        const userMessage = { sender: MessageSender.USER, text: prompt, image, id: Date.now() };
        state.messages.push(userMessage);
        addMessageToChat(userMessage);
        
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
             case 'open_proxy_settings':
                showSettings('proxies');
                return; 
             case 'use_item_context':
                promptToSend = payload.prompt;
                break;
            case 'analyze_event': {
                const { summary, description, startTime, endTime } = payload;
                const start = new Date(startTime).toLocaleString('ru-RU');
                const end = new Date(endTime).toLocaleString('ru-RU');
                promptToSend = `Проанализируй это событие календаря и предложи релевантные действия (например, "удалить", "создать задачу для подготовки", "написать участникам").

---
**ДАННЫЕ СОБЫТИЯ**
- **ID:** ${payload.id}
- **Название:** ${summary}
- **Описание:** ${description || 'Нет'}
- **Время:** ${start} - ${end}`;
                break;
            }
            case 'analyze_task': {
                const { id, title, notes, due } = payload;
                const dueDate = due ? new Date(due).toLocaleString('ru-RU') : 'Не указан';
                promptToSend = `Проанализируй эту задачу и предложи релевантные действия (например, "изменить", "удалить", "создать событие в календаре").

---
**ДАННЫЕ ЗАДАЧИ**
- **ID:** ${id}
- **Название:** ${title}
- **Заметки:** ${notes || 'Нет'}
- **Срок выполнения:** ${dueDate}`;
                break;
            }
            case 'analyze_email': {
                const attachmentText = payload.attachments?.length > 0
                    ? payload.attachments.map(a => `${a.filename} (${a.mimeType})`).join(', ')
                    : 'Нет';
                
                promptToSend = `Проанализируй полное содержимое этого письма.
                
Твой ответ должен включать:
1.  **Сводка:** Краткое и ясное изложение сути письма. Если есть вложения, упомяни их.
2.  **Ссылка:** Обязательно включи ссылку на оригинал в Gmail.
3.  **Действия:** Предложи релевантные действия в виде кнопок [CONTEXT_ACTIONS], включая стандартные "Удалить" и "Ответить".

---
**ДАННЫЕ ПИСЬМА**
- **От кого:** ${payload.from}
- **Тема:** ${payload.subject}
- **Ссылка:** ${payload.gmailLink}
- **Вложения:** ${attachmentText}
- **Содержимое:**
${payload.body}`;
                break;
            }
            case 'analyze_contact': {
                const { display_name, email, phone } = payload;
                promptToSend = `Проанализируй этот контакт и предложи релевантные действия (позвонить, написать, создать встречу).

---
**ДАННЫЕ КОНТАКТА**
- **Имя:** ${display_name || 'Не указано'}
- **Email:** ${email || 'Не указан'}
- **Телефон:** ${phone || 'Не указан'}`;
                break;
            }
            case 'analyze_document':
                promptToSend = `Я выбрал документ "${payload.name}". Ссылка для открытия: ${payload.url}. Предложи действия, которые можно с ним совершить (например, "отправить по почте", "создать задачу на его основе").`;
                break;
            case 'create_document_prompt':
                promptToSend = `Да, создать новый документ с названием "${payload.query}".`;
                break;
            case 'create_meet_with':
                promptToSend = `Создай видеовстречу с ${payload.name} (${payload.email}) на ближайшее удобное время, продолжительностью 30 минут.`;
                break;
            case 'send_meeting_link':
                promptToSend = `Да, отправь ссылку участникам встречи.`;
                break;
            case 'create_prep_task':
                promptToSend = `Да, создай задачу для подготовки к встрече.`;
                break;
            case 'request_delete': {
                const { id, type } = payload;
                let typeText = '';
                if (type === 'event') {
                    typeText = `событие с ID ${id}`;
                } else if (type === 'task') {
                    typeText = `задачу с ID ${id}`;
                } else if (type === 'email') {
                    typeText = `письмо с ID ${id}`;
                }
                if(typeText) {
                    promptToSend = `Да, я подтверждаю удаление: ${typeText}.`;
                }
                break;
            }
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
                return; 
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
    
    async function handleActionPrompt(e) {
        const target = e.target.closest('[data-action-prompt]');
        if (!target) return;
        
        const promptText = target.dataset.actionPrompt;
        if (promptText) {
            await handleSendMessage(promptText);
        }
    }

    async function handleForceSync() {
        await runAllSyncs(true);
    }

    // --- PROACTIVE FEATURES ---

    async function checkForNewEmail() {
        if (!state.isGoogleConnected || document.hidden || state.isLoading) {
            return;
        }

        try {
            const recentEmails = await googleProvider.getRecentEmails({ max_results: 1 });
            if (recentEmails && recentEmails.length > 0) {
                const latestEmail = recentEmails[0];
                if (state.lastSeenEmailId === null) {
                    state.lastSeenEmailId = latestEmail.id;
                    return;
                }

                if (latestEmail.id !== state.lastSeenEmailId) {
                    console.log("New email detected:", latestEmail.subject);
                    state.lastSeenEmailId = latestEmail.id;

                    const chatLog = document.getElementById('chat-log');
                    const welcomeScreen = chatLog?.querySelector('.welcome-screen-container');
                    if (welcomeScreen) {
                        chatLog.innerHTML = '';
                    }

                    const systemPrompt = `Пришло новое письмо от "${latestEmail.from}" с темой "${latestEmail.subject}". Содержимое: "${latestEmail.snippet}". Проанализируй и кратко сообщи мне об этом, предложив релевантные действия (ответить, удалить, создать задачу и т.д.).`;
                    await processBotResponse(systemPrompt, null, true);
                }
            }
        } catch (error) {
            console.error("Error checking for new email:", error);
        }
    }

    function setupEmailPolling() {
        if (emailCheckInterval) {
            clearInterval(emailCheckInterval);
            emailCheckInterval = null;
        }

        if (state.settings.enableEmailPolling && state.isGoogleConnected) {
            setTimeout(checkForNewEmail, 2000);
            emailCheckInterval = setInterval(checkForNewEmail, 60000); 
        }
    }


    // --- UI MODALS & VIEWS ---

    function showSettings(initialTab = 'connections') {
        const modal = createSettingsModal(
            state.settings,
            {
                isSupabaseReady: state.isSupabaseReady,
                isGoogleConnected: state.isGoogleConnected,
                userProfile: state.userProfile,
                proxies: state.proxies, 
            },
            {
                onSave: handleSaveSettings, 
                onClose: hideSettings,
                onLogin: handleLogin, 
                onLogout: handleLogout,
                onForceSync: handleForceSync,
                isSyncing: state.isSyncing,
                syncStatus: state.syncStatus,
                onProxyAdd: handleProxyAdd,
                onProxyUpdate: handleProxyUpdate,
                onProxyDelete: handleProxyDelete,
                onProxyTest: handleProxyTest,
                onFindAndUpdateProxies: handleFindAndUpdateProxies,
                onCleanupProxies: handleCleanupProxies,
                onProxyReorder: handleProxyReorder,
            }
        );
        settingsModalContainer.innerHTML = '';
        settingsModalContainer.appendChild(modal);
        
        const targetTabButton = modal.querySelector(`.settings-tab-button[data-tab="${initialTab}"]`);
        if (targetTabButton) {
            targetTabButton.click();
        }
        settingsModalContainer.classList.remove('hidden');
    }

    function hideSettings() {
        settingsModalContainer.classList.add('hidden');
        settingsModalContainer.innerHTML = '';
    }
    
    // --- Proxy Management Handlers ---
    async function handleProxyAdd(proxyData) {
        if (!supabaseService) return;
        try {
            const newProxy = await supabaseService.addProxy(proxyData);
            state.proxies.push(newProxy);
            showSettings('proxies'); 
        } catch (error) {
            showSystemError(`Не удалось добавить прокси: ${error.message}`);
        }
    }
    
    async function handleProxyUpdate(id, updateData) {
        if (!supabaseService) return;
        try {
            const updatedProxy = await supabaseService.updateProxy(id, updateData);
            const index = state.proxies.findIndex(p => p.id === id);
            if (index !== -1) {
                state.proxies[index] = { ...state.proxies[index], ...updatedProxy };
            }
        } catch (error) {
            showSystemError(`Не удалось обновить прокси: ${error.message}`);
        }
        state.proxies = await supabaseService.getProxies();
        showSettings('proxies');
    }

    async function handleProxyDelete(id) {
        if (!supabaseService) return;
        if (!confirm('Вы уверены, что хотите удалить этот прокси-сервер?')) return;
        try {
            await supabaseService.deleteProxy(id);
            state.proxies = state.proxies.filter(p => p.id !== id);
            showSettings('proxies'); 
        } catch (error) {
            showSystemError(`Не удалось удалить прокси: ${error.message}`);
        }
    }
    
    async function handleProxyTest(proxy) {
        if (!supabaseService) return { status: 'error', message: 'Supabase not connected' };
        
        const startTime = performance.now();
        const result = await testProxyConnection({ proxyUrl: proxy.url, apiKey: state.settings.geminiApiKey });
        const endTime = performance.now();
        const speed = result.status === 'ok' ? Math.round(endTime - startTime) : null;

        const updateData = {
            last_status: result.status,
            last_speed_ms: speed,
            last_checked_at: new Date().toISOString(),
        };

        supabaseService.updateProxy(proxy.id, updateData).then(updatedProxy => {
             const index = state.proxies.findIndex(p => p.id === proxy.id);
             if (index !== -1) {
                 state.proxies[index] = updatedProxy;
             }
        }).catch(err => console.error("Failed to save proxy test results", err));

        return { ...result, speed, proxy };
    }

    async function handleProxyReorder(reorderedProxies) {
        if (!supabaseService) return;
        state.proxies = reorderedProxies;
        
        const updates = reorderedProxies.map((proxy, index) => ({
            id: proxy.id,
            priority: index,
        }));
        
        try {
            await supabaseService.updateProxyPriorities(updates);
        } catch (error) {
             showSystemError(`Не удалось сохранить порядок прокси: ${error.message}`);
        }
    }


    async function handleFindAndUpdateProxies() {
        if (!supabaseService) return;
        
        const modal = document.getElementById('settings-content');
        const findButton = modal?.querySelector('#find-proxies-ai-button');
        if (findButton) {
            findButton.disabled = true;
            findButton.textContent = 'Поиск...';
        }

        try {
            const bestProxy = state.settings.useProxy ? findBestProxy() : null;
            const foundProxies = await findProxiesWithGemini({ apiKey: state.settings.geminiApiKey, proxyUrl: bestProxy });
            
            const formatted = foundProxies.map(p => ({
                url: p.url,
                alias: `${p.country}, ${p.city || ''}`.replace(/, $/, ''),
                geolocation: `${p.country}, ${p.city || ''}`.replace(/, $/, ''),
                priority: 99, 
                is_active: true, 
            }));
            
            await supabaseService.upsertProxies(formatted);
            state.proxies = await supabaseService.getProxies();

        } catch (error) {
            showSystemError(`Не удалось найти прокси: ${error.message}`);
        } finally {
            if (findButton) {
                findButton.disabled = false;
                findButton.textContent = 'Найти ИИ';
            }
            showSettings('proxies');
        }
    }

    async function handleCleanupProxies() {
        if (!supabaseService || state.proxies.length === 0) return;
        
        const modal = document.getElementById('settings-content');
        const cleanupButton = modal?.querySelector('#cleanup-proxies-button');
        if(cleanupButton) {
            cleanupButton.disabled = true;
            cleanupButton.textContent = 'Тестирование...';
        }
        
        const failedProxies = [];
        const testPromises = state.proxies.map(async (proxy) => {
            const { status } = await handleProxyTest(proxy); 
            if (status !== 'ok') {
                failedProxies.push(proxy);
            }
        });
        
        await Promise.all(testPromises);
        
        state.proxies = await supabaseService.getProxies();
        showSettings('proxies');

        if (failedProxies.length > 0) {
            if (confirm(`Найдено ${failedProxies.length} нерабочих прокси. Удалить их?`)) {
                const deletePromises = failedProxies.map(p => supabaseService.deleteProxy(p.id));
                await Promise.all(deletePromises);
                state.proxies = await supabaseService.getProxies();
            }
        } else {
            alert('Все прокси-серверы работают исправно.');
        }

        if(cleanupButton) {
            cleanupButton.disabled = false;
            cleanupButton.textContent = 'Проверить все и удалить нерабочие';
        }
        showSettings('proxies'); 
    }


    function showHelpModal() {
        const findBestProxy = () => {
            if (!state.isSupabaseReady || state.proxies.length === 0 || !state.settings.useProxy) {
                return null;
            }
            const sorted = [...state.proxies]
                .filter(p => p.is_active)
                .sort((a, b) => a.priority - b.priority);
            
            const ok = sorted.find(p => p.last_status === 'ok');
            if (ok) return ok.url;
            
            const untested = sorted.find(p => p.last_status === 'untested');
            if (untested) return untested.url;
            
            return sorted.length > 0 ? sorted[0].url : null;
        };
        const handleAnalyzeError = (errorMessage) => {
            return analyzeGenericErrorWithGemini({
                errorMessage,
                appStructure: APP_STRUCTURE_CONTEXT,
                apiKey: state.settings.geminiApiKey,
                proxyUrl: findBestProxy(),
            });
        };

        const modal = createHelpModal(hideHelpModal, state.settings, handleAnalyzeError);
        helpModalContainer.innerHTML = '';
        helpModalContainer.appendChild(modal);
        helpModalContainer.classList.remove('hidden');
    }

    function hideHelpModal() {
        helpModalContainer.classList.add('hidden');
        helpModalContainer.innerHTML = '';
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
        const onCapture = (image) => {
            const prompt = document.getElementById('chat-input')?.value.trim() || 'Что на этом изображении?';
            handleSendMessage(prompt, image);
        };
        const cameraView = createCameraView(onCapture, hideCameraView);
        cameraViewContainer.innerHTML = '';
        cameraViewContainer.appendChild(cameraView);
        cameraViewContainer.classList.remove('hidden');
    }

    function hideCameraView() {
        cameraViewContainer.classList.add('hidden');
        cameraViewContainer.innerHTML = '';
    }

    // --- INITIALIZATION ---
    async function main() {
        settingsButton.innerHTML = SettingsIcon;
        helpButton.innerHTML = QuestionMarkCircleIcon;
        statsButton.innerHTML = ChartBarIcon;

        settingsButton.addEventListener('click', () => showSettings());
        helpButton.addEventListener('click', showHelpModal);
        statsButton.addEventListener('click', showStatsModal);
        
        document.body.addEventListener('click', handleCardAction);
        document.body.addEventListener('click', handleQuickReply);
        document.body.addEventListener('click', handleActionPrompt);

        mainContent.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action="welcome_prompt"]');
            if (target) {
                const payload = JSON.parse(target.dataset.payload);
                if (payload.prompt) {
                    handleSendMessage(payload.prompt);
                }
            }
        });

        await initializeAppServices();
        render(); 
    }

    main().catch(error => {
        console.error("An unhandled error occurred during app initialization:", error);
        showSystemError(`Критическая ошибка при запуске: ${error.message}. Попробуйте обновить страницу.`);
    });
}