import { GoogleServiceProvider } from './services/google/GoogleServiceProvider.js';
import { AppleServiceProvider } from './services/apple/AppleServiceProvider.js';
import { SupabaseService } from './services/supabase/SupabaseService.js';
import { callGemini, analyzeGenericErrorWithGemini } from './services/geminiService.js';
import { getSettings, saveSettings, getSyncStatus, saveSyncStatus } from './utils/storage.js';
import { createSettingsModal } from './components/SettingsModal.js';
import { createStatsModal } from './components/StatsModal.js';
import { createHelpModal } from './components/HelpModal.js';
import { createWelcomeScreen } from './components/Welcome.js';
import { createChatInterface, addMessageToChat, showLoadingIndicator, hideLoadingIndicator, renderContextualActions } from './components/Chat.js';
import { createCameraView } from './components/CameraView.js';
import { SettingsIcon, ChartBarIcon, SupabaseIcon, GoogleIcon, NewChatIcon, QuestionMarkCircleIcon } from './components/icons/Icons.js';
import { MessageSender } from './types.js';

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
    - services/geminiService.js: Обрабатывает все вызовы к Gemini API для чата и анализа.
    - services/google/GoogleServiceProvider.js: Управляет всеми взаимодействиями с Google API (Календарь, Диск, Gmail и т.д.).
    - services/supabase/SupabaseService.js: Управляет всеми взаимодействиями с базой данных Supabase (аутентификация, синхронизация данных, запросы).
    - components/Chat.js: Рендерит интерфейс чата и панель ввода.
    - components/Message.js: Рендерит отдельные сообщения в чате.
    - components/ResultCard.js: Рендерит интерактивные карточки в сообщениях чата.
    - components/SettingsModal.js: Рендерит UI настроек.
    - components/HelpModal.js: Рендерит UI 'Центра помощи' с ИИ-анализом ошибок.
    - setup-guide.html: Содержит SQL-скрипт для настройки базы данных Supabase. Ошибка типа 'column does not exist' часто означает, что пользователю нужно повторно запустить скрипт из этого файла.
    `;


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
        lastSeenEmailId: null, // For proactive email check
        syncStatus: getSyncStatus(),
        isSyncing: false,
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
    const newChatButton = document.getElementById('new-chat-button');
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
            loginButton.textContent = state.settings.isSupabaseEnabled ? 'Авторизоваться' : 'Войти через Google';
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
        const chatContainer = createChatInterface(handleSendMessage, showCameraView, showSystemError);
        mainContent.appendChild(chatContainer);

        const chatLog = document.getElementById('chat-log');
        if (state.messages.length === 0) {
            chatLog.appendChild(createWelcomeScreen({
                isGoogleConnected: state.isGoogleConnected,
                isSupabaseEnabled: state.settings.isSupabaseEnabled,
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
        if (!state.isGoogleConnected || !supabaseService) {
            console.log("Cannot sync: Not connected to Google or Supabase.");
            return;
        }

        console.log("Starting background sync...");
        state.isSyncing = true;
        // Re-render the settings modal if it's open to show loading state
        if (document.getElementById('settings-content')) {
            showSettings();
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
            saveSyncStatus(state.syncStatus);
            // Re-render modal to update status line by line
            if (document.getElementById('settings-content')) {
                showSettings();
            }
        }

        state.isSyncing = false;
        console.log("Background sync finished.");
        if (document.getElementById('settings-content')) {
            showSettings();
        }
    }

    function startAutoSync() {
        if (syncInterval) clearInterval(syncInterval);
        if (!state.settings.enableAutoSync || !state.settings.isSupabaseEnabled) {
            return;
        }

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
                showSystemError(`Не удалось инициализировать Supabase. ${error.message}`);
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
                startAutoSync();
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
            stopAutoSync();
        }
        renderAuth();
        setupEmailPolling();

        // Always re-render main content on auth change if no messages exist
        // to correctly show/hide welcome prompts.
        if (state.messages.length === 0) {
            renderMainContent();
        }
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
         setupEmailPolling();

        // Always re-render main content on auth change if no messages exist
        // to correctly show/hide welcome prompts.
        if (state.messages.length === 0) {
            renderMainContent();
        }
    }

    function handleGoogleDirectAuthResponse(tokenResponse) {
        if (tokenResponse && tokenResponse.access_token) {
            updateGoogleDirectAuthState(tokenResponse);
        } else {
            console.error("Google direct auth failed:", tokenResponse);
            showSystemError("Ошибка входа через Google. Проверьте Client ID и настройки в Google Cloud Console.");
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
                showSystemError('Supabase не настроен. Проверьте URL и ключ в настройках.');
                return;
            }
            await supabaseService.signInWithGoogle();
        } else { // Direct Google Login
            if (!state.settings.googleClientId) {
                 showSystemError('Google Client ID не настроен. Проверьте настройки.');
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
        const oldSettings = { ...state.settings };
        state.settings = newSettings;
        saveSettings(newSettings);
        hideSettings();
        await initializeAppServices();

        // Start or stop sync based on new settings
        if (newSettings.enableAutoSync && !oldSettings.enableAutoSync) {
            startAutoSync();
        } else if (!newSettings.enableAutoSync && oldSettings.enableAutoSync) {
            stopAutoSync();
        }
    }
    
    function handleNewChat() {
        state.messages = [];
        state.lastSeenEmailId = null;
        renderMainContent();
    }

    /**
     * Central function to process a prompt (from user or system), call Gemini, and display the response.
     * @param {string} prompt - The text prompt to send to the Gemini model.
     * @param {object|null} image - An optional image object to send.
     * @param {boolean} isSystemInitiated - Flag to indicate if this is a proactive message.
     */
    async function processBotResponse(prompt, image = null, isSystemInitiated = false) {
        state.isLoading = true;
        showLoadingIndicator();

        try {
            // If the message is system-initiated, it doesn't get added to history beforehand.
            // History is the state of messages *before* the current prompt.
            const history = isSystemInitiated ? state.messages : state.messages.slice(0, -1);
            
            const response = await callGemini({
                prompt,
                history: history,
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
            
            // If the assistant provides system context (like email content), add it to history
            // but don't display it. This enriches the next turn's context.
            if (response.systemContext) {
                 state.messages.push({ sender: MessageSender.SYSTEM, text: response.systemContext, id: Date.now() });
            }

            // If system initiated, add a special message indicating this.
            if (isSystemInitiated) {
                const systemPromptMessage = { sender: MessageSender.SYSTEM, text: prompt, id: Date.now() };
                state.messages.push(systemPromptMessage);
                 // We don't display this system message, but it's in history for context.
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

        renderContextualActions(null); // Clear previous actions before sending

        if (!state.settings.geminiApiKey) {
            showSystemError("Ключ Gemini API не указан. Пожалуйста, добавьте его в настройках.");
            return;
        }
        
        const chatLog = document.getElementById('chat-log');
        const welcomeScreen = chatLog?.querySelector('.welcome-screen-container');
        if (welcomeScreen) {
             chatLog.innerHTML = '';
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
                // This prompt tells the model to execute the action it just proposed.
                promptToSend = `Да, отправь ссылку участникам встречи.`;
                break;
            case 'create_prep_task':
                // Same here, confirming the proposed action.
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
            return; // Don't check if not connected, tab is not visible, or app is busy
        }

        try {
            const recentEmails = await googleProvider.getRecentEmails({ max_results: 1 });
            if (recentEmails && recentEmails.length > 0) {
                const latestEmail = recentEmails[0];
                if (state.lastSeenEmailId === null) {
                    // On first load, just set the ID and don't notify
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

                    // The assistant "speaks first"
                    const systemPrompt = `Пришло новое письмо от "${latestEmail.from}" с темой "${latestEmail.subject}". Содержимое: "${latestEmail.snippet}". Проанализируй и кратко сообщи мне об этом, предложив релевантные действия (ответить, удалить, создать задачу и т.д.).`;
                    await processBotResponse(systemPrompt, null, true);
                }
            }
        } catch (error) {
            console.error("Error checking for new email:", error);
            // Don't alert the user, just log it.
        }
    }

    function setupEmailPolling() {
        if (emailCheckInterval) {
            clearInterval(emailCheckInterval);
            emailCheckInterval = null;
        }

        if (state.settings.enableEmailPolling && state.isGoogleConnected) {
            // Check immediately, then start the interval
            setTimeout(checkForNewEmail, 2000);
            emailCheckInterval = setInterval(checkForNewEmail, 60000); // Check every 60 seconds
        }
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
            supabaseService,
            state.syncStatus,
            state.isSyncing,
            handleForceSync
        );
        settingsModalContainer.innerHTML = '';
        settingsModalContainer.appendChild(modal);
        settingsModalContainer.classList.remove('hidden');
    }

    function hideSettings() {
        settingsModalContainer.classList.add('hidden');
        settingsModalContainer.innerHTML = '';
    }

    function showHelpModal() {
        const handleAnalyzeError = (errorMessage) => {
            return analyzeGenericErrorWithGemini({
                errorMessage,
                appStructure: APP_STRUCTURE_CONTEXT,
                apiKey: state.settings.geminiApiKey,
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
        helpButton.innerHTML = QuestionMarkCircleIcon;
        statsButton.innerHTML = ChartBarIcon;
        newChatButton.innerHTML = NewChatIcon;

        settingsButton.addEventListener('click', showSettings);
        helpButton.addEventListener('click', showHelpModal);
        statsButton.addEventListener('click', showStatsModal);
        newChatButton.addEventListener('click', handleNewChat);

        mainContent.addEventListener('click', (e) => {
            handleCardAction(e);
            handleQuickReply(e);
            handleActionPrompt(e);
            
            const settingsButtonFromWelcome = e.target.closest('#open-settings-from-welcome');
            if (settingsButtonFromWelcome) {
                showSettings();
                return;
            }

            const welcomeActionButton = e.target.closest('.welcome-prompt-button');
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
        
        render(); // Render UI first to ensure error display area exists
        await initializeAppServices(); // Then initialize services which might produce errors
    }

    document.addEventListener('DOMContentLoaded', init);

} // end of initialization guard