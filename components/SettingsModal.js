import { SettingsIcon, CodeIcon } from './icons/Icons.js';
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

// A simple markdown to HTML converter, duplicated for use in this component.
function markdownToHTML(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')     // Italic
        .replace(/`([^`]+)`/g, '<code class="bg-gray-700 text-sm rounded px-1 py-0.5">$1</code>') // Inline code
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">$1</a>') // Link
        .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>') // h3
        .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>') // h2
        .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>') // h1
        .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>') // li
        .replace(/\n/g, '<br>'); // Newlines - careful with this one
}


function createServiceMappingUI(serviceMap, isSupabaseEnabled) {
    return Object.entries(SERVICE_DEFINITIONS).map(([key, def]) => `
        <div class="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-b-0">
            <label for="${key}-provider-select" class="font-medium text-gray-300">${def.label}</label>
            <select id="${key}-provider-select" class="bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm">
                ${def.providers.map(p => {
                    const isDisabled = p.disabled || (p.id === 'supabase' && !isSupabaseEnabled);
                    const isSelected = serviceMap[key] === p.id;
                    return `<option value="${p.id}" ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}>${p.name}${isDisabled && p.id === 'supabase' ? ' (требуется Supabase)' : ''}</option>`;
                }).join('')}
            </select>
        </div>
    `).join('');
}

function timeAgo(dateString) {
    if (!dateString) return 'никогда';
    if (typeof dateString !== 'string') return 'ошибка'; // Handle error state

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


export function createSettingsModal(currentSettings, authState, onSave, onClose, onLogin, onLogout, googleProvider, supabaseService, syncStatus, isSyncing, onForceSync) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';

    const isSupabaseConfigured = !!(currentSettings.supabaseUrl && currentSettings.supabaseAnonKey);
    const isDirectGoogleConfigured = !!currentSettings.googleClientId;

    modalOverlay.innerHTML = `
        <div class="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col m-4" id="settings-content">
            <header class="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                <h2 class="text-2xl font-bold flex items-center gap-2">${SettingsIcon} Настройки</h2>
                <button id="close-settings" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Закрыть настройки">&times;</button>
            </header>
            
            <main class="flex-1 flex overflow-hidden">
                <aside class="w-52 border-r border-gray-700 p-4">
                    <nav class="flex flex-col space-y-2">
                        <a href="#connections" class="settings-tab-button active text-left" data-tab="connections">Подключения</a>
                        <a href="#general" class="settings-tab-button" data-tab="general">Общие</a>
                        <a href="#service-map" class="settings-tab-button" data-tab="service-map">Назначение сервисов</a>
                        <a href="#api-keys" class="settings-tab-button" data-tab="api-keys">API Ключи</a>
                        <a href="#sync" class="settings-tab-button" data-tab="sync" ${!currentSettings.isSupabaseEnabled ? 'style="display: none;"' : ''}>Синхронизация</a>
                        <a href="#about" class="settings-tab-button" data-tab="about">О приложении</a>
                    </nav>
                </aside>
                <div class="flex-1 p-6 overflow-y-auto" id="settings-tabs-content">
                    
                    <!-- Connections Tab -->
                    <div id="tab-connections" class="settings-tab-content space-y-6">
                        
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h3 class="text-lg font-semibold text-gray-200">Использовать Supabase</h3>
                                    <p class="text-sm text-gray-400">Рекомендуется для синхронизации и хранения заметок.</p>
                                </div>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="supabase-enabled-toggle" ${currentSettings.isSupabaseEnabled ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div id="supabase-settings-block" class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4" ${!currentSettings.isSupabaseEnabled ? 'style="display: none;"' : ''}>
                            <div class="flex justify-between items-start">
                                <div>
                                    <h3 class="text-lg font-semibold text-gray-200">1. Конфигурация Supabase</h3>
                                    <a href="./setup-guide.html#supabase-setup" target="_blank" class="text-blue-400 hover:underline font-semibold text-sm">
                                        ➡️ Открыть инструкцию по настройке
                                    </a>
                                </div>
                                <div class="text-sm text-right">
                                    <p class="font-semibold">Статус конфигурации:</p>
                                    <p class="${isSupabaseConfigured ? 'text-green-400' : 'text-yellow-400'}">${isSupabaseConfigured ? 'Заполнена' : 'Не заполнена'}</p>
                                </div>
                            </div>
                            <div class="space-y-2">
                                <label for="supabase-url" class="block text-sm font-medium text-gray-300">Supabase Project URL</label>
                                <input type="text" id="supabase-url" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" value="${currentSettings.supabaseUrl || ''}">
                            </div>
                            <div class="space-y-2">
                                <label for="supabase-anon-key" class="block text-sm font-medium text-gray-300">Supabase Anon Key</label>
                                <input type="password" id="supabase-anon-key" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" value="${currentSettings.supabaseAnonKey || ''}">
                            </div>
                        </div>
                        
                        <div id="direct-google-settings-block" class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4" ${currentSettings.isSupabaseEnabled ? 'style="display: none;"' : ''}>
                             <div class="flex justify-between items-start">
                                <div>
                                    <h3 class="text-lg font-semibold text-gray-200">1. Конфигурация Google</h3>
                                     <a href="./setup-guide.html#google-cloud-setup" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline font-semibold text-sm">
                                        ➡️ Открыть инструкцию по получению Client ID
                                     </a>
                                </div>
                                 <div class="text-sm text-right">
                                    <p class="font-semibold">Статус конфигурации:</p>
                                    <p class="${isDirectGoogleConfigured ? 'text-green-400' : 'text-yellow-400'}">${isDirectGoogleConfigured ? 'Заполнена' : 'Не заполнена'}</p>
                                </div>
                            </div>
                             <div class="space-y-2">
                                <label for="google-client-id" class="block text-sm font-medium text-gray-300">Google Client ID</label>
                                <input type="password" id="google-client-id" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" placeholder="Required when Supabase is disabled" value="${currentSettings.googleClientId || ''}">
                            </div>
                        </div>

                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                             <h3 class="text-lg font-semibold text-gray-200">2. Подключение аккаунта Google</h3>
                             <p id="auth-method-description" class="text-sm text-gray-400 mt-1 mb-4">
                                ${currentSettings.isSupabaseEnabled ? 'Для работы ассистента необходимо войти в аккаунт Google через Supabase.' : 'Для работы ассистента необходимо войти в аккаунт Google напрямую.'}
                             </p>
                             <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <span class="w-3 h-3 rounded-full ${authState.isGoogleConnected ? 'bg-green-500' : 'bg-red-500'}"></span>
                                    <div>
                                        <p class="font-semibold">Статус: ${authState.isGoogleConnected ? `Подключено` : 'Требуется вход'}</p>
                                        ${authState.isGoogleConnected && authState.userProfile?.email ? `<p class="text-xs text-gray-400">(${authState.userProfile.email})</p>` : ''}
                                    </div>
                                </div>
                                <button id="google-auth-action-button" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">${authState.isGoogleConnected ? 'Выйти' : 'Войти через Google'}</button>
                            </div>
                             <p class="text-xs text-yellow-400 mt-3" id="login-warning" ${!authState.isGoogleConnected ? '' : 'style="display: none;"'}>
                                Ассистент не будет работать корректно до тех пор, пока вы не войдете в аккаунт.
                            </p>
                        </div>
                    </div>

                    <!-- General Tab -->
                    <div id="tab-general" class="settings-tab-content hidden space-y-6">
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                             <h3 class="text-lg font-semibold text-gray-200">Часовой пояс</h3>
                             <p class="text-sm text-gray-400 mt-1 mb-4">Выберите ваш основной часовой пояс. Ассистент будет использовать его для корректной интерпретации времени.</p>
                             <div class="flex items-center justify-between">
                                <label for="timezone-select" class="font-medium text-gray-300">Ваш часовой пояс</label>
                                <select id="timezone-select" class="bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm w-full max-w-xs">
                                    <!-- Options populated by JS -->
                                </select>
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
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                             <h3 class="text-lg font-semibold text-gray-200">Назначение сервисов</h3>
                             <p class="text-sm text-gray-400 mt-1 mb-4">Выберите, какой сервис использовать для каждой функции. Ассистент будет следовать этим настройкам.</p>
                             <div id="service-map-container" class="space-y-2">
                                ${createServiceMappingUI(currentSettings.serviceMap, currentSettings.isSupabaseEnabled)}
                             </div>
                        </div>
                    </div>

                    <!-- API Keys Tab -->
                    <div id="tab-api-keys" class="settings-tab-content space-y-6 hidden">
                         <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                            <h3 class="text-lg font-semibold text-gray-200">Ключ Gemini API</h3>
                            <div class="space-y-2">
                                <label for="gemini-api-key" class="block text-sm font-medium text-gray-300">Gemini API Key</label>
                                <input type="password" id="gemini-api-key" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" value="${currentSettings.geminiApiKey || ''}">
                            </div>
                            <p class="text-xs text-gray-400 mt-1">Ваш ключ хранится локально в браузере. <a href="./setup-guide.html#gemini-setup" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">Как получить ключ?</a></p>
                        </div>
                    </div>

                    <!-- Sync Tab -->
                    <div id="tab-sync" class="settings-tab-content space-y-6 ${!currentSettings.isSupabaseEnabled ? 'hidden' : ''}">
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
                            <div id="sync-status-list" class="text-sm border-t border-gray-700/50 pt-3 mt-2">
                                <!-- Status items will be rendered here by JS -->
                            </div>
                            <div class="pt-2">
                                <button id="force-sync-button" ${!authState.isGoogleConnected || isSyncing ? 'disabled' : ''} class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md font-semibold transition-colors">
                                    ${isSyncing ? 'Синхронизация...' : 'Синхронизировать сейчас'}
                                </button>
                            </div>
                            ${!authState.isGoogleConnected ? '<p class="text-xs text-yellow-400 text-center">Для синхронизации необходимо войти в аккаунт Google.</p>' : ''}
                        </div>
                    </div>
                    
                    <!-- About Tab -->
                    <div id="tab-about" class="settings-tab-content hidden space-y-6">
                        <div class="flex items-center justify-center p-8 text-gray-400">Загрузка информации о приложении...</div>
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
            supabaseUrl: modalOverlay.querySelector('#supabase-url').value.trim(),
            supabaseAnonKey: modalOverlay.querySelector('#supabase-anon-key').value.trim(),
            geminiApiKey: modalOverlay.querySelector('#gemini-api-key').value.trim(),
            isSupabaseEnabled: modalOverlay.querySelector('#supabase-enabled-toggle').checked,
            isGoogleEnabled: true, 
            googleClientId: modalOverlay.querySelector('#google-client-id').value.trim(),
            timezone: modalOverlay.querySelector('#timezone-select').value,
            enableEmailPolling: modalOverlay.querySelector('#email-polling-toggle').checked,
            enableAutoSync: modalOverlay.querySelector('#auto-sync-enabled-toggle').checked,
            serviceMap: {
                calendar: modalOverlay.querySelector('#calendar-provider-select').value,
                tasks: modalOverlay.querySelector('#tasks-provider-select').value,
                contacts: modalOverlay.querySelector('#contacts-provider-select').value,
                files: modalOverlay.querySelector('#files-provider-select').value,
                notes: modalOverlay.querySelector('#notes-provider-select').value,
            }
        };
        onSave(newSettings);
    });

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

        // Event Delegation for AI error analysis
        const analysisButton = e.target.closest('[data-action="analyze-error"]');
        if (analysisButton) {
            const errorMessage = analysisButton.dataset.errorMessage;
            const errorContext = analysisButton.dataset.errorContext;
            const apiKey = currentSettings.geminiApiKey;

            if (!apiKey) {
                alert("Ошибка: Ключ Gemini API не указан в настройках. Анализ невозможен.");
                return;
            }
            
            const analysisPromise = analyzeSyncErrorWithGemini({
                errorMessage,
                context: errorContext,
                apiKey
            });

            showErrorAnalysisModal(`Анализ ошибки: ${errorContext}`, analysisPromise);
        }
    });

    // Main tab switching logic
    const tabButtons = modalOverlay.querySelectorAll('.settings-tab-button');
    const tabContents = modalOverlay.querySelectorAll('.settings-tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = e.target.dataset.tab;

            tabButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');

            tabContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== `tab-${tabId}`);
            });
        });
    });
    
    // Populate Timezone selector
    const timezoneSelect = modalOverlay.querySelector('#timezone-select');
    if (timezoneSelect && 'supportedValuesOf' in Intl) {
        const timezones = Intl.supportedValuesOf('timeZone');
        timezoneSelect.innerHTML = timezones.map(tz =>
            `<option value="${tz}" ${currentSettings.timezone === tz ? 'selected' : ''}>${tz.replace(/_/g, ' ')}</option>`
        ).join('');
    } else if (timezoneSelect) {
        // Fallback for older browsers
        timezoneSelect.innerHTML = `<option value="${currentSettings.timezone}">${currentSettings.timezone}</option>`;
        timezoneSelect.disabled = true;
    }


    // Logic for Supabase toggle
    const supabaseToggle = modalOverlay.querySelector('#supabase-enabled-toggle');
    supabaseToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        modalOverlay.querySelector('#supabase-settings-block').style.display = isEnabled ? '' : 'none';
        modalOverlay.querySelector('#direct-google-settings-block').style.display = isEnabled ? 'none' : '';
        modalOverlay.querySelector('a[data-tab="sync"]').style.display = isEnabled ? '' : 'none';
        
        // Re-render service map UI with updated Supabase status
        const serviceMapContainer = modalOverlay.querySelector('#service-map-container');
        const currentServiceMap = {
            calendar: modalOverlay.querySelector('#calendar-provider-select').value,
            tasks: modalOverlay.querySelector('#tasks-provider-select').value,
            contacts: modalOverlay.querySelector('#contacts-provider-select').value,
            files: modalOverlay.querySelector('#files-provider-select').value,
            notes: modalOverlay.querySelector('#notes-provider-select').value,
        };
        serviceMapContainer.innerHTML = createServiceMappingUI(currentServiceMap, isEnabled);

        const authDesc = modalOverlay.querySelector('#auth-method-description');
        authDesc.textContent = isEnabled 
            ? 'Для работы ассистента необходимо войти в аккаунт Google через Supabase.' 
            : 'Для работы ассистента необходимо войти в аккаунт Google напрямую.';
        
        const syncTabButton = modalOverlay.querySelector('a[data-tab="sync"]');
        if (!isEnabled && syncTabButton.classList.contains('active')) {
            syncTabButton.classList.remove('active');
            modalOverlay.querySelector('a[data-tab="connections"]').click();
        }
    });

    // Auth action button
    const googleAuthButton = modalOverlay.querySelector('#google-auth-action-button');
    if (googleAuthButton) {
        googleAuthButton.addEventListener('click', () => {
             if (authState.isGoogleConnected) {
                onLogout();
             } else {
                onLogin();
             }
        });
    }

    // Sync Tab Logic
    const syncStatusList = modalOverlay.querySelector('#sync-status-list');
    const SYNC_NAMES = { Calendar: 'Календарь', Tasks: 'Задачи', Contacts: 'Контакты', Files: 'Файлы', Emails: 'Почта' };
    
    if (syncStatusList) {
        syncStatusList.innerHTML = Object.entries(SYNC_NAMES).map(([key, label]) => {
            const status = syncStatus[key];
            let statusHtml;

            if (typeof status === 'object' && status !== null && status.error) {
                const shortError = status.error.slice(0, 30) + (status.error.length > 30 ? '...' : '');
                const fullErrorEscaped = status.error.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                
                statusHtml = `
                    <button 
                        class="font-mono text-xs text-red-400 hover:underline cursor-pointer text-right"
                        data-action="analyze-error"
                        data-error-message='${fullErrorEscaped}'
                        data-error-context='Синхронизация: ${label}'
                        title="Проанализировать ошибку с помощью ИИ"
                    >
                        Ошибка: ${shortError}
                    </button>
                `;
            } else {
                statusHtml = `<span class="font-mono text-xs text-green-400">${timeAgo(status)}</span>`;
            }
            
            return `
                 <div class="py-2 border-b border-gray-700/50 last:border-b-0">
                    <div class="flex justify-between items-start">
                        <span class="text-gray-300 pt-0.5">${label}:</span>
                        ${statusHtml}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    const forceSyncButton = modalOverlay.querySelector('#force-sync-button');
    if (forceSyncButton) {
        forceSyncButton.disabled = !authState.isGoogleConnected || isSyncing;
        forceSyncButton.addEventListener('click', onForceSync);
    }
    
    // Fetch and render "About" tab content
    const aboutTab = modalOverlay.querySelector('#tab-about');
    if (aboutTab) {
        fetch('./app-info.json')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                const contactHtml = data.contact.startsWith('http')
                    ? `<a href="${data.contact}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">Telegram</a>`
                    : `<a href="mailto:${data.contact}" class="text-blue-400 hover:underline">${data.contact}</a>`;

                aboutTab.innerHTML = `
                    <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                        <h3 class="text-lg font-semibold">Секретарь+</h3>
                        <p class="text-sm text-gray-400">Версия: ${data.version}</p>
                        <p class="text-sm text-gray-400">Автор: ${data.author}</p>
                        <p class="text-sm text-gray-400">Связь с автором: ${contactHtml}</p>
                    </div>
                    <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                        <h3 class="text-lg font-semibold mb-2">История изменений</h3>
                        <div class="space-y-4 max-h-60 overflow-y-auto pr-2">
                            ${data.changelog.map(log => `
                                <div>
                                    <h4 class="font-semibold text-gray-200">Версия ${log.version} (${log.date})</h4>
                                    <ul class="list-disc list-inside text-sm text-gray-400 mt-1 space-y-1">
                                        ${log.changes.map(change => `<li>${change}</li>`).join('')}
                                    </ul>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            })
            .catch(error => {
                console.error("Could not load app info:", error);
                aboutTab.innerHTML = `<p class="text-red-400">Не удалось загрузить информацию о приложении.</p>`;
            });
    }


    return modalOverlay;
}