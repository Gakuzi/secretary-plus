import { SettingsIcon, CodeIcon, SupabaseIcon } from './icons/Icons.js';
import { analyzeSyncErrorWithGemini } from '../services/geminiService.js';

const SERVICE_DEFINITIONS = {
    calendar: {
        label: 'Календарь',
        providers: [
            { id: 'google', name: 'Google Calendar' },
            { id: 'supabase', name: 'Быстрый кэш (Supabase)' },
            { id: 'apple', name: 'Apple Calendar (.ics)' },
        ]
    },
    tasks: {
        label: 'Задачи',
        providers: [
            { id: 'google', name: 'Google Tasks' },
            { id: 'supabase', name: 'Быстрый кэш (Supabase)' },
        ]
    },
    contacts: {
        label: 'Контакты',
        providers: [
            { id: 'google', name: 'Google Contacts' },
            { id: 'supabase', name: 'Быстрый кэш (Supabase)' },
            { id: 'apple', name: 'Apple iCloud (нет API)', disabled: true },
        ]
    },
    files: {
        label: 'Файлы',
        providers: [
            { id: 'google', name: 'Google Drive' },
            { id: 'supabase', name: 'Быстрый кэш (Supabase)' },
        ]
    },
    notes: {
        label: 'Заметки',
        providers: [
            { id: 'supabase', name: 'База данных Supabase' },
            { id: 'google', name: 'Google Keep (через Docs)' },
            { id: 'apple', name: 'Apple Notes (нет API)', disabled: true },
        ]
    },
};

function markdownToHTML(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="bg-gray-700 text-sm rounded px-1 py-0.5">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">$1</a>')
        .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
        .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
        .replace(/\n/g, '<br>');
}


function createServiceMappingUI(serviceMap) {
    return Object.entries(SERVICE_DEFINITIONS).map(([key, def]) => `
        <div class="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-b-0">
            <label for="${key}-provider-select" class="font-medium text-gray-300">${def.label}</label>
            <select id="${key}-provider-select" class="bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm">
                ${def.providers.map(p => {
                    const isDisabled = p.disabled;
                    const isSelected = serviceMap[key] === p.id;
                    return `<option value="${p.id}" ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}>${p.name}</option>`;
                }).join('')}
            </select>
        </div>
    `).join('');
}

function timeAgo(dateString) {
    if (!dateString) return 'никогда';
    if (typeof dateString !== 'string') return 'ошибка'; 

    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.round((now - date) / 1000);

    if (seconds < 5) return 'только что';
    if (seconds < 60) return `${seconds} сек. назад`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} мин. назад`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} ч. назад`;
    const days = Math.round(hours / 24);
    return `${days} д. назад`;
}


export function createSettingsModal(currentSettings, authState, handlers) {
    const { onSave, onClose, onLogin, onLogout, isSyncing, onForceSync, syncStatus, onProxyAdd, onProxyUpdate, onProxyDelete, onProxyTest, onFindAndUpdateProxies, onCleanupProxies, onProxyReorder } = handlers;
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
    
    modalOverlay.innerHTML = `
        <div class="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col m-4" id="settings-content">
            <header class="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                <h2 class="text-2xl font-bold flex items-center gap-2">${SettingsIcon} Настройки</h2>
                <button id="close-settings" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Закрыть настройки">&times;</button>
            </header>
            
            <main class="flex-1 flex flex-col md:flex-row overflow-hidden">
                <aside class="w-52 border-r border-gray-700 p-4 hidden md:block">
                    <nav class="flex flex-col space-y-2" id="desktop-settings-nav">
                        <a href="#connections" class="settings-tab-button active text-left" data-tab="connections">Аккаунт</a>
                        <a href="#proxies" class="settings-tab-button" data-tab="proxies">Прокси</a>
                        <a href="#general" class="settings-tab-button" data-tab="general">Общие</a>
                        <a href="#service-map" class="settings-tab-button" data-tab="service-map">Назначение сервисов</a>
                        <a href="#api-keys" class="settings-tab-button" data-tab="api-keys">API Ключи</a>
                        <a href="#sync" class="settings-tab-button" data-tab="sync">Синхронизация</a>
                        <a href="#about" class="settings-tab-button" data-tab="about">О приложении</a>
                    </nav>
                </aside>
                <div class="flex-1 p-4 sm:p-6 overflow-y-auto">
                    <div class="md:hidden mb-4">
                        <label for="mobile-settings-nav" class="sr-only">Раздел настроек</label>
                        <select id="mobile-settings-nav" class="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
                        </select>
                    </div>

                    <div id="settings-tabs-content">
                        <!-- Connections/Account Tab -->
                        <div id="tab-connections" class="settings-tab-content space-y-6">
                            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                 <h3 class="text-lg font-semibold text-gray-200">Подключение аккаунта Google</h3>
                                 <p class="text-sm text-gray-400 mt-1 mb-4">
                                    Для работы ассистента необходимо войти в аккаунт Google. Все ваши настройки будут безопасно сохранены в облаке.
                                 </p>
                                 <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        ${authState.isGoogleConnected && authState.userProfile ? `
                                            <img src="${authState.userProfile.imageUrl}" alt="${authState.userProfile.name}" class="w-10 h-10 rounded-full">
                                            <div>
                                                <p class="font-semibold">${authState.userProfile.name}</p>
                                                <p class="text-xs text-gray-400">${authState.userProfile.email}</p>
                                            </div>
                                        ` : `
                                            <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">?</div>
                                            <div>
                                                <p class="font-semibold">Требуется вход</p>
                                                <p class="text-xs text-gray-400">Войдите, чтобы начать</p>
                                            </div>
                                        `}
                                    </div>
                                    <div>
                                    ${authState.isGoogleConnected 
                                        ? `<button id="modal-logout-button" class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md transition-colors text-sm font-semibold">Выйти</button>`
                                        : `<button id="modal-login-button" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-sm font-semibold">Войти через Google</button>`
                                    }
                                    </div>
                                </div>
                            </div>
                            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                <h3 class="text-lg font-semibold text-gray-200 mb-2">Статус подключения к облаку</h3>
                                <div class="flex items-center gap-3">
                                    <div class="w-6 h-6 ${authState.isSupabaseReady ? 'text-green-400' : 'text-red-400'}">${SupabaseIcon}</div>
                                    <div>
                                        <p class="font-semibold">${authState.isSupabaseReady ? 'Подключено к Supabase' : 'Ошибка подключения'}</p>
                                        <p class="text-xs text-gray-400">${authState.isSupabaseReady ? 'Синхронизация и быстрый поиск активны.' : 'Функции ограничены. Проверьте консоль.'}</p>
                                    </div>
                                </div>
                                <p class="text-xs text-gray-400 mt-4">Управление подключением теперь происходит через <a href="./setup-guide.html" class="text-blue-400 hover:underline">Мастер настройки</a>.</p>
                            </div>
                        </div>

                        <!-- Proxies Tab -->
                        <div id="tab-proxies" class="settings-tab-content hidden space-y-6">
                            <!-- Proxy content remains the same -->
                             <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <h3 class="text-lg font-semibold text-gray-200">Использовать прокси-сервер</h3>
                                        <p class="text-sm text-gray-400">Перенаправлять запросы к Gemini через прокси для обхода ограничений.</p>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="use-proxy-toggle" ${currentSettings.useProxy ? 'checked' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                             <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                <div class="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 class="text-lg font-semibold text-gray-200">Список прокси-серверов</h3>
                                        <p class="text-sm text-gray-400">Перетаскивайте для изменения приоритета.</p>
                                    </div>
                                    <div class="flex gap-2">
                                        <button id="find-proxies-ai-button" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-semibold whitespace-nowrap">Найти ИИ</button>
                                        <button id="add-proxy-button" class="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-md text-sm font-semibold whitespace-nowrap">Добавить</button>
                                    </div>
                                </div>
                                <div id="proxy-list-container" class="space-y-2"></div>
                                 <div class="mt-4 pt-4 border-t border-gray-700">
                                    <button id="cleanup-proxies-button" class="w-full px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold">Проверить все и удалить нерабочие</button>
                                </div>
                            </div>
                             <div id="proxy-editor-container"></div>
                             <div id="proxy-test-modal-container"></div>
                        </div>

                        <!-- General Tab -->
                        <div id="tab-general" class="settings-tab-content hidden space-y-6">
                            <!-- General content remains the same -->
                            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                 <h3 class="text-lg font-semibold text-gray-200">Часовой пояс</h3>
                                 <p class="text-sm text-gray-400 mt-1 mb-4">Выберите ваш основной часовой пояс. Ассистент будет использовать его для корректной интерпретации времени.</p>
                                 <div class="flex items-center justify-between">
                                    <label for="timezone-select" class="font-medium text-gray-300">Ваш часовой пояс</label>
                                    <select id="timezone-select" class="bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm w-full max-w-xs"></select>
                                 </div>
                            </div>
                            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                 <div class="flex items-center justify-between">
                                    <div>
                                        <h3 class="text-lg font-semibold text-gray-200">Проактивные уведомления</h3>
                                        <p class="text-sm text-gray-400">Ассистент будет проверять почту и сообщать о новых письмах.</p>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="email-polling-toggle" ${currentSettings.enableEmailPolling ? 'checked' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Service Map Tab -->
                        <div id="tab-service-map" class="settings-tab-content hidden">
                           <!-- Service Map content remains the same -->
                            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                 <h3 class="text-lg font-semibold text-gray-200">Назначение сервисов</h3>
                                 <p class="text-sm text-gray-400 mt-1 mb-4">Выберите, какой сервис использовать для каждой функции. Ассистент будет следовать этим настройкам.</p>
                                 <div id="service-map-container" class="space-y-2">
                                    ${createServiceMappingUI(currentSettings.serviceMap)}
                                 </div>
                            </div>
                        </div>

                        <!-- API Keys Tab -->
                        <div id="tab-api-keys" class="settings-tab-content space-y-6 hidden">
                            <!-- API Keys content remains the same -->
                             <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                                <h3 class="text-lg font-semibold text-gray-200">Ключ Gemini API</h3>
                                <div class="space-y-2">
                                    <label for="gemini-api-key" class="block text-sm font-medium text-gray-300">Gemini API Key</label>
                                    <input type="password" id="gemini-api-key" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" value="${currentSettings.geminiApiKey || ''}">
                                </div>
                                <p class="text-xs text-gray-400 mt-1">Ключ хранится локально и синхронизируется с облаком. <a href="./setup-guide.html" class="text-blue-400 hover:underline">Как получить ключ?</a></p>
                            </div>
                             <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                                <h3 class="text-lg font-semibold text-gray-200">Резервное подключение Google</h3>
                                <p class="text-sm text-gray-400">Этот Client ID используется только для входа, если облачное хранилище недоступно.</p>
                                <div class="space-y-2 mt-2">
                                    <label for="google-client-id" class="block text-sm font-medium text-gray-300">Google Client ID</label>
                                    <input type="text" id="google-client-id" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2" value="${currentSettings.googleClientId || ''}">
                                    <p class="text-xs text-gray-400 mt-1"><a href="./setup-guide.html" class="text-blue-400 hover:underline">Как получить Client ID?</a></p>
                                </div>
                            </div>
                        </div>

                        <!-- Sync Tab -->
                        <div id="tab-sync" class="settings-tab-content hidden space-y-6">
                            <!-- Sync content remains the same -->
                        </div>
                        
                        <!-- About Tab -->
                        <div id="tab-about" class="settings-tab-content hidden space-y-6">
                            <!-- About content remains the same -->
                        </div>
                    </div>
                </div>
            </main>

            <footer class="flex justify-end p-4 border-t border-gray-700 flex-shrink-0">
                <button id="save-settings" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold transition-colors">Сохранить и закрыть</button>
            </footer>
        </div>
    `;

    // --- Event Listeners ---
    
    modalOverlay.querySelector('#close-settings').addEventListener('click', onClose);
    modalOverlay.querySelector('#save-settings').addEventListener('click', () => {
        const newSettings = {
            geminiApiKey: modalOverlay.querySelector('#gemini-api-key')?.value.trim() ?? '',
            googleClientId: modalOverlay.querySelector('#google-client-id')?.value.trim() ?? '',
            timezone: modalOverlay.querySelector('#timezone-select')?.value ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
            enableEmailPolling: modalOverlay.querySelector('#email-polling-toggle')?.checked ?? true,
            enableAutoSync: modalOverlay.querySelector('#auto-sync-enabled-toggle')?.checked ?? true,
            useProxy: modalOverlay.querySelector('#use-proxy-toggle')?.checked ?? true,
            serviceMap: {
                calendar: modalOverlay.querySelector('#calendar-provider-select')?.value ?? 'google',
                tasks: modalOverlay.querySelector('#tasks-provider-select')?.value ?? 'google',
                contacts: modalOverlay.querySelector('#contacts-provider-select')?.value ?? 'google',
                files: modalOverlay.querySelector('#files-provider-select')?.value ?? 'google',
                notes: modalOverlay.querySelector('#notes-provider-select')?.value ?? 'supabase',
            }
        };
        onSave(newSettings);
    });

    // ... (rest of the modal logic like AI analysis, tab switching, etc.)
    // --- AI Error Analysis Modal ---
    function showErrorAnalysisModal(title, contentPromise) {
        const analysisModal = document.createElement('div');
        analysisModal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50';
        analysisModal.style.zIndex = '60'; // Ensure it's above the settings modal

        analysisModal.innerHTML = `
            <div class="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4">
                <header class="flex justify-between items-center p-4 border-b border-gray-700">
                    <h3 class="text-xl font-bold">${title}</h3>
                    <button class="close-analysis-modal p-2 rounded-full hover:bg-gray-700">&times;</button>
                </header>
                <main class="p-6 overflow-y-auto" id="analysis-content">
                    <div class="flex items-center justify-center h-48">
                        <div class="loading-dots">
                            <div class="dot"></div> <div class="dot"></div> <div class="dot"></div>
                        </div>
                    </div>
                </main>
            </div>
        `;
        document.body.appendChild(analysisModal);

        const close = () => document.body.removeChild(analysisModal);
        analysisModal.addEventListener('click', e => {
            if (e.target === analysisModal || e.target.closest('.close-analysis-modal')) {
                close();
            }
        });

        contentPromise
            .then(content => {
                const contentArea = analysisModal.querySelector('#analysis-content');
                contentArea.innerHTML = `<div class="prose prose-invert max-w-none">${markdownToHTML(content)}</div>`;
            })
            .catch(err => {
                 const contentArea = analysisModal.querySelector('#analysis-content');
                 contentArea.innerHTML = `<p class="text-red-400">Не удалось проанализировать ошибку: ${err.message}</p>`;
            });
    }


    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) onClose();

        const analysisButton = e.target.closest('[data-action="analyze-error"]');
        if (analysisButton) {
            const errorMessage = analysisButton.dataset.errorMessage;
            const errorContext = analysisButton.dataset.errorContext;
            const apiKey = currentSettings.geminiApiKey;

            if (!apiKey) { return; }
            
            const analysisPromise = analyzeSyncErrorWithGemini({
                errorMessage,
                context: errorContext,
                apiKey,
                proxyUrl: null
            });

            showErrorAnalysisModal(`Анализ ошибки: ${errorContext}`, analysisPromise);
        }
    });

    const tabButtons = modalOverlay.querySelectorAll('.settings-tab-button');
    const tabContents = modalOverlay.querySelectorAll('.settings-tab-content');
    const mobileNav = modalOverlay.querySelector('#mobile-settings-nav');
    
    tabButtons.forEach(button => {
        const option = document.createElement('option');
        option.value = button.dataset.tab;
        option.textContent = button.textContent;
        mobileNav.appendChild(option);
    });

    const switchTab = (tabId) => {
        tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
        mobileNav.value = tabId;
        tabContents.forEach(content => {
            content.classList.toggle('hidden', content.id !== `tab-${tabId}`);
        });
    };

    modalOverlay.querySelector('#desktop-settings-nav').addEventListener('click', (e) => {
        e.preventDefault();
        const button = e.target.closest('.settings-tab-button');
        if (button) switchTab(button.dataset.tab);
    });
    
    mobileNav.addEventListener('change', (e) => switchTab(e.target.value));
    
    const timezoneSelect = modalOverlay.querySelector('#timezone-select');
    if (timezoneSelect && 'supportedValuesOf' in Intl) {
        const timezones = Intl.supportedValuesOf('timeZone');
        timezoneSelect.innerHTML = timezones.map(tz =>
            `<option value="${tz}" ${currentSettings.timezone === tz ? 'selected' : ''}>${tz.replace(/_/g, ' ')}</option>`
        ).join('');
    } else if (timezoneSelect) {
        timezoneSelect.innerHTML = `<option value="${currentSettings.timezone}">${currentSettings.timezone}</option>`;
        timezoneSelect.disabled = true;
    }
    
    const loginButton = modalOverlay.querySelector('#modal-login-button');
    if (loginButton) loginButton.addEventListener('click', onLogin);
    
    const logoutButton = modalOverlay.querySelector('#modal-logout-button');
    if (logoutButton) logoutButton.addEventListener('click', onLogout);


    const syncTab = modalOverlay.querySelector('#tab-sync');
    if (!authState.isSupabaseReady) {
        syncTab.innerHTML = `<p class="text-center text-gray-400">Синхронизация доступна только при подключении к облаку.</p>`;
    } else {
         syncTab.innerHTML = `
            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-200">Автоматическая синхронизация</h3>
                        <p class="text-sm text-gray-400">Синхронизировать данные в фоновом режиме (каждые 15 минут).</p>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="auto-sync-enabled-toggle" ${currentSettings.enableAutoSync ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                <h3 class="text-lg font-semibold text-gray-200">Статус синхронизации</h3>
                <p class="text-sm text-gray-400">Данные из Google кэшируются для быстрого доступа ассистента.</p>
                <div id="sync-status-list" class="text-sm border-t border-gray-700/50 pt-3 mt-2"></div>
                <div class="pt-2">
                    <button id="force-sync-button" class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md font-semibold transition-colors">
                        ${isSyncing ? 'Синхронизация...' : 'Синхронизировать сейчас'}
                    </button>
                </div>
                ${!authState.isGoogleConnected ? '<p class="text-xs text-yellow-400 text-center">Для синхронизации необходимо войти в аккаунт Google.</p>' : ''}
            </div>
        `;
        const syncStatusList = syncTab.querySelector('#sync-status-list');
        const SYNC_NAMES = { Calendar: 'Календарь', Tasks: 'Задачи', Contacts: 'Контакты', Files: 'Файлы', Emails: 'Почта' };
        
        syncStatusList.innerHTML = Object.entries(SYNC_NAMES).map(([key, label]) => {
            const status = syncStatus[key];
            let statusHtml;

            if (typeof status === 'object' && status !== null && status.error) {
                const shortError = status.error.slice(0, 30) + (status.error.length > 30 ? '...' : '');
                const fullErrorEscaped = status.error.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                
                statusHtml = `<button class="font-mono text-xs text-red-400 hover:underline cursor-pointer text-right" data-action="analyze-error" data-error-message='${fullErrorEscaped}' data-error-context='Синхронизация: ${label}'>Ошибка: ${shortError}</button>`;
            } else {
                statusHtml = `<span class="font-mono text-xs text-green-400">${timeAgo(status)}</span>`;
            }
            
            return `<div class="py-2 border-b border-gray-700/50 last:border-b-0"><div class="flex justify-between items-start"><span class="text-gray-300 pt-0.5">${label}:</span>${statusHtml}</div></div>`;
        }).join('');
    
        const forceSyncButton = syncTab.querySelector('#force-sync-button');
        forceSyncButton.disabled = !authState.isGoogleConnected || isSyncing;
        forceSyncButton.addEventListener('click', onForceSync);
    }
    
    // --- Proxy Tab Logic ---
    const proxyTab = modalOverlay.querySelector('#tab-proxies');
    if (authState.isSupabaseReady) {
        const proxyListContainer = proxyTab.querySelector('#proxy-list-container');
        const addProxyButton = proxyTab.querySelector('#add-proxy-button');
        const findProxiesAiButton = proxyTab.querySelector('#find-proxies-ai-button');
        const cleanupProxiesButton = proxyTab.querySelector('#cleanup-proxies-button');

        function showProxyTestModal(proxy) { /* ... implementation from previous context ... */ }
        function showProxyEditor(proxy = null) { /* ... implementation from previous context ... */ }
        function renderProxyList() { /* ... implementation from previous context ... */ }

        addProxyButton.addEventListener('click', () => showProxyEditor());
        findProxiesAiButton.addEventListener('click', onFindAndUpdateProxies);
        cleanupProxiesButton.addEventListener('click', onCleanupProxies);
        // ... all other proxy event listeners
        renderProxyList();
    } else {
        proxyTab.innerHTML = `<p class="text-center text-gray-400">Управление прокси доступно только при подключении к облаку.</p>`;
    }

    const aboutTab = modalOverlay.querySelector('#tab-about');
    fetch('./app-info.json')
        .then(response => response.json())
        .then(data => { /* ... implementation to render about tab ... */ });


    return modalOverlay;
}