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
            profileElement.className = 'flex items-center space-x-2 cursor-pointer';
            profileElement.innerHTML = `
                <div class="relative">
                    <img src="${state.userProfile.imageUrl}" alt="${state.userProfile.name}" class="w-8 h-8 rounded-full ring-2 ring-gray-600 ring-offset-2 ring-offset-gray-800">
                </div>
            `;
            profileElement.addEventListener('click', () => showSettings('profile'));
            authContainer.appendChild(profileElement);
        } else {
             // Header is empty when logged out. Login is initiated from Welcome or Settings.
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
        // This function is now deprecated in favor of the setup guide link
        window.location.href = './setup-guide.html';
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
                if (supabaseService) {
                    supabaseService.incrementActionStat(response.functionCallName);
                }
            }
            
            addMessageToChat(response);
            if (response.contextualActions) {
                renderContextualActions(response.contextualActions);
            }
            
        } catch (error) {
            console.error('Error processing bot response:', error);
            showSystemError(`Не удалось получить ответ от ассистента: ${error.message}`);
        } finally {
            state.isLoading = false;
            hideLoadingIndicator();
        }
    }

    async function handleSendMessage(prompt, image = null) {
        if (state.isLoading) return;

        const userMessage = { sender: MessageSender.USER, text: prompt, image, id: Date.now() };
        state.messages.push(userMessage);
        addMessageToChat(userMessage);
        renderContextualActions(undefined); // Clear actions on new user message

        // Use a short timeout to allow the UI to update before the potentially long API call
        setTimeout(() => processBotResponse(prompt, image), 50);
    }
    
    async function handleCardAction(action, payload) {
        if (state.isLoading) return;
        console.log(`Card action triggered: ${action}`, payload);
        let systemPrompt = '';

        try {
            switch(action) {
                case 'analyze_event':
                case 'analyze_task':
                case 'analyze_email':
                case 'analyze_document':
                case 'analyze_contact':
                    // These actions involve sending the item's data back to Gemini for analysis
                    systemPrompt = `Проанализируй этот элемент и предложи контекстные действия: ${JSON.stringify(payload)}`;
                    break;
                case 'download_ics':
                    const blob = new Blob([atob(payload.data)], { type: 'text/calendar' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = payload.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    return; // No need to call Gemini
                case 'create_meet_with':
                    systemPrompt = `Создай событие в календаре для видеовстречи с ${payload.name} (${payload.email}) на ближайшее удобное время.`;
                    break;
                case 'request_delete':
                    systemPrompt = `Я хочу удалить этот элемент (ID: ${payload.id}, Тип: ${payload.type}). Пожалуйста, запроси у меня подтверждение перед вызовом инструмента удаления.`;
                    break;
                case 'send_meeting_link':
                    systemPrompt = `Отправь письмо участникам (${payload.to.join(', ')}) с темой "${payload.subject}" и содержанием "${payload.body}".`;
                    break;
                 case 'create_prep_task':
                    systemPrompt = `Создай задачу с названием "${payload.title}" и описанием "${payload.notes}".`;
                    break;
                case 'create_google_doc_with_content':
                    systemPrompt = `Создай Google документ с названием "${payload.title}" и содержимым: "${payload.content}"`;
                    break;
                case 'open_proxy_settings':
                    showSettings('proxies');
                    return;
                default:
                    console.warn(`Unknown card action: ${action}`);
                    return;
            }
        } catch (error) {
            console.error("Error handling card action:", error);
            showSystemError(`Ошибка обработки действия: ${error.message}`);
            return;
        }

        if (systemPrompt) {
            const systemMessage = { sender: MessageSender.SYSTEM, text: systemPrompt, id: Date.now(), isHidden: true };
            state.messages.push(systemMessage); // Add to history for context
            processBotResponse(systemPrompt, null, true);
        }
    }
    
    // --- PROACTIVE FEATURES ---
    function setupEmailPolling() {
        if (emailCheckInterval) clearInterval(emailCheckInterval);
        if (!state.settings.enableEmailPolling || !state.isGoogleConnected) return;

        const checkEmails = async () => {
            if (state.isLoading) return; // Don't interrupt user
            try {
                const recentEmails = await googleProvider.getRecentEmails({ max_results: 1 });
                if (recentEmails.length > 0) {
                    const latestEmail = recentEmails[0];
                    if (latestEmail.id !== state.lastSeenEmailId) {
                        state.lastSeenEmailId = latestEmail.id;
                        // Avoid notifying about our own sent emails
                        if (latestEmail.from.includes(state.userProfile.email)) return;
                        
                        const notificationPrompt = `Только что пришло новое письмо от ${latestEmail.from} с темой "${latestEmail.subject}". Хочешь, я его проанализирую?`;
                        const systemMessage = { sender: MessageSender.SYSTEM, text: notificationPrompt, id: Date.now() };
                        state.messages.push(systemMessage);
                        addMessageToChat(systemMessage);
                    }
                }
            } catch (error) {
                console.error("Error polling emails:", error);
            }
        };

        emailCheckInterval = setInterval(checkEmails, 60 * 1000); // Check every minute
    }

    // --- MODAL & VIEW MANAGEMENT ---
    function showSettings(initialTab = 'profile') {
        settingsModalContainer.innerHTML = '';
        const modal = createSettingsModal(state.settings, {
            isGoogleConnected: state.isGoogleConnected,
            isSupabaseReady: state.isSupabaseReady,
            userProfile: state.userProfile,
            proxies: state.proxies,
        }, {
            onSave: handleSaveSettings,
            onClose: hideSettings,
            onLogin: handleLogin,
            onLogout: handleLogout,
            isSyncing: state.isSyncing,
            onForceSync: () => runAllSyncs(true),
            syncStatus: state.syncStatus,
            onProxyAdd: handleProxyAdd,
            onProxyUpdate: handleProxyUpdate,
            onProxyDelete: handleProxyDelete,
            onProxyTest: handleProxyTest,
            onFindAndUpdateProxies: handleFindAndUpdateProxies,
            onCleanupProxies: handleCleanupProxies,
            onProxyReorder: handleProxyReorder,
            onProxyRefresh: handleProxyRefresh,
        });
        settingsModalContainer.appendChild(modal);
        settingsModalContainer.classList.remove('hidden');
        document.querySelector(`#desktop-settings-nav a[data-tab="${initialTab}"]`)?.click();
    }
    
    function hideSettings() { settingsModalContainer.classList.add('hidden'); }
    
    function showHelp() {
        helpModalContainer.innerHTML = '';
        const analyzeErrorFn = (errorMessage) => {
            return analyzeGenericErrorWithGemini({
                errorMessage,
                appStructure: APP_STRUCTURE_CONTEXT,
                apiKey: state.settings.geminiApiKey,
                proxyUrl: null, // Use direct connection for reliability
            });
        };
        const modal = createHelpModal(hideHelp, state.settings, analyzeErrorFn);
        helpModalContainer.appendChild(modal);
        helpModalContainer.classList.remove('hidden');
    }
    function hideHelp() { helpModalContainer.classList.add('hidden'); }
    
    function showStats() {
        statsModalContainer.innerHTML = '';
        const modal = createStatsModal(state.actionStats, hideStats);
        statsModalContainer.appendChild(modal);
        statsModalContainer.classList.remove('hidden');
    }
    function hideStats() { statsModalContainer.classList.add('hidden'); }

    function showCameraView() {
        cameraViewContainer.innerHTML = '';
        const cameraView = createCameraView(
            (image) => handleSendMessage('', image), // Send empty prompt with image
            hideCameraView
        );
        cameraViewContainer.appendChild(cameraView);
        cameraViewContainer.classList.remove('hidden');
    }
    function hideCameraView() { cameraViewContainer.classList.add('hidden'); }
    
    // --- Proxy Handlers for Settings Modal ---
    async function handleProxyAdd(proxyData) {
        try {
            const newProxy = await supabaseService.addProxy(proxyData);
            state.proxies.push(newProxy);
            // sort by priority again
            state.proxies.sort((a,b) => a.priority - b.priority);
            showSettings('proxies');
        } catch (error) {
            console.error("Error adding proxy:", error);
            showSystemError(`Не удалось добавить прокси: ${error.message}`);
        }
    }

    async function handleProxyUpdate(id, updateData) {
        try {
            const updatedProxy = await supabaseService.updateProxy(id, updateData);
            state.proxies = state.proxies.map(p => p.id === id ? updatedProxy : p);
            showSettings('proxies'); // Re-render to show changes
        } catch (error) {
            console.error("Error updating proxy:", error);
            showSystemError(`Не удалось обновить прокси: ${error.message}`);
        }
    }
    
    async function handleProxyDelete(id) {
        if (confirm("Вы уверены, что хотите удалить этот прокси-сервер?")) {
            try {
                await supabaseService.deleteProxy(id);
                state.proxies = state.proxies.filter(p => p.id !== id);
                showSettings('proxies');
            } catch (error) {
                console.error("Error deleting proxy:", error);
                showSystemError(`Не удалось удалить прокси: ${error.message}`);
            }
        }
    }
    
    async function handleProxyTest(proxy) {
        const { status, message, speed } = await testProxyConnection({
            proxyUrl: proxy.url,
            apiKey: state.settings.geminiApiKey,
        });
        
        const updateData = {
            last_status: status,
            last_checked_at: new Date().toISOString(),
            last_speed_ms: speed,
        };
        
        await handleProxyUpdate(proxy.id, updateData);
        return { status, message, speed };
    }
    
    async function handleFindAndUpdateProxies(event) {
        if (!state.supabaseUser) {
            showSystemError("Необходимо войти в аккаунт для поиска прокси.");
            return;
        }
        const button = event.target;
        button.disabled = true;
        button.textContent = 'Поиск...';
        try {
            const found = await findProxiesWithGemini({ apiKey: state.settings.geminiApiKey });
            const newProxies = found.map(p => ({
                url: p.url,
                geolocation: `${p.country}, ${p.city || ''}`.replace(/, $/, ''),
                user_id: state.supabaseUser.id,
            }));
            const upserted = await supabaseService.upsertProxies(newProxies);
            state.proxies = await supabaseService.getProxies(); // Refresh the list
            showSettings('proxies');
        } catch (error) {
            console.error("Error finding and updating proxies:", error);
            showSystemError(`Ошибка поиска прокси: ${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = 'Найти ИИ';
        }
    }
    
    async function handleCleanupProxies(event) {
        const button = event.target;
        button.disabled = true;
        button.textContent = 'Тестирование...';
        let failedCount = 0;
        for (const proxy of state.proxies) {
            const { status } = await testProxyConnection({ proxyUrl: proxy.url, apiKey: state.settings.geminiApiKey });
            if (status !== 'ok') {
                failedCount++;
            }
        }
        if (failedCount > 0 && confirm(`${failedCount} прокси не отвечают. Удалить их из списка?`)) {
            const tests = state.proxies.map(p => testProxyConnection({ proxyUrl: p.url, apiKey: state.settings.geminiApiKey }));
            const results = await Promise.all(tests);
            const failedIds = results.reduce((acc, result, index) => {
                if (result.status !== 'ok') {
                    acc.push(state.proxies[index].id);
                }
                return acc;
            }, []);
            for (const id of failedIds) {
                await supabaseService.deleteProxy(id);
            }
            state.proxies = await supabaseService.getProxies();
        }
        showSettings('proxies');
        button.disabled = false;
        button.textContent = 'Проверить все и удалить нерабочие';
    }

    async function handleProxyReorder(reorderedProxies) {
        try {
            await supabaseService.updateProxyPriorities(reorderedProxies);
            // Optimistically update local state to avoid a full refresh
            const priorityMap = new Map(reorderedProxies.map(p => [p.id, p.priority]));
            state.proxies.forEach(p => {
                if(priorityMap.has(p.id.toString())) {
                    p.priority = priorityMap.get(p.id.toString());
                }
            });
            state.proxies.sort((a, b) => a.priority - b.priority);
        } catch (error) {
            console.error("Failed to reorder proxies:", error);
            showSystemError("Не удалось обновить порядок прокси.");
            // Force a refresh from DB on error
            state.proxies = await supabaseService.getProxies();
        } finally {
            showSettings('proxies'); // Re-render with new order
        }
    }

    async function handleProxyRefresh() {
        try {
           state.proxies = await supabaseService.getProxies();
           showSettings('proxies');
        } catch (error) {
           console.error("Failed to refresh proxies:", error);
           showSystemError("Не удалось обновить список прокси.");
        }
    }


    // --- GLOBAL EVENT LISTENERS ---
    
    document.addEventListener('click', (e) => {
        // Handle contextual action button clicks
        const actionButton = e.target.closest('[data-action-prompt]');
        if (actionButton) {
            handleSendMessage(actionButton.dataset.actionPrompt);
            return;
        }

        // Handle card action clicks
        const cardActionButton = e.target.closest('[data-action]');
        if (cardActionButton && !cardActionButton.hasAttribute('data-action-prompt')) {
             const payload = cardActionButton.dataset.payload ? JSON.parse(cardActionButton.dataset.payload) : {};
             handleCardAction(cardActionButton.dataset.action, payload);
             return;
        }

        // Handle quick reply clicks
        const quickReplyButton = e.target.closest('.quick-reply-button');
        if (quickReplyButton) {
            const replyText = quickReplyButton.dataset.replyText;
            quickReplyButton.classList.add('clicked');
            quickReplyButton.closest('.quick-replies-container').querySelectorAll('button').forEach(btn => btn.disabled = true);
            handleSendMessage(replyText);
        }

        const welcomePromptButton = e.target.closest('[data-action="welcome_prompt"]');
        if (welcomePromptButton) {
             const payload = JSON.parse(welcomePromptButton.dataset.payload);
             handleSendMessage(payload.prompt);
        }
    });
    
    // Listen for completion of the setup guide in another window/tab
    window.addEventListener('message', (event) => {
        if (event.data === 'setup_completed') {
            window.location.reload();
        }
    });

    // --- APP INITIALIZATION ---
    settingsButton.innerHTML = SettingsIcon;
    helpButton.innerHTML = QuestionMarkCircleIcon;
    statsButton.innerHTML = ChartBarIcon;

    settingsButton.addEventListener('click', () => showSettings());
    helpButton.addEventListener('click', showHelp);
    statsButton.addEventListener('click', showStats);

    initializeAppServices();
    render();
}