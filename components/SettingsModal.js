import { SettingsIcon } from './icons/Icons.js';

export function createSettingsModal(currentSettings, authState, onSave, onClose, onLogin, onLogout, googleProvider, supabaseService) {
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
                <aside class="w-48 border-r border-gray-700 p-4">
                    <nav class="flex flex-col space-y-2">
                        <a href="#connections" class="settings-tab-button active text-left" data-tab="connections">Подключения</a>
                        <a href="#services" class="settings-tab-button" data-tab="services">Сервисы</a>
                        <a href="#api-keys" class="settings-tab-button" data-tab="api-keys">API Ключи</a>
                        <a href="#sync" class="settings-tab-button" data-tab="sync" ${!currentSettings.isSupabaseEnabled ? 'style="display: none;"' : ''}>Синхронизация</a>
                    </nav>
                </aside>
                <div class="flex-1 p-6 overflow-y-auto" id="settings-tabs-content">
                    
                    <!-- Connections Tab -->
                    <div id="tab-connections" class="settings-tab-content space-y-6">
                        
                        <!-- Step 0: Choose Method -->
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h3 class="text-lg font-semibold text-gray-200">Использовать Supabase</h3>
                                    <p class="text-sm text-gray-400">Рекомендуется для синхронизации и безопасности.</p>
                                </div>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="supabase-enabled-toggle" ${currentSettings.isSupabaseEnabled ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <!-- Step 1: Configure Method -->
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

                        <!-- Step 2: Connect Account -->
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

                    <!-- Services Tab -->
                    <div id="tab-services" class="settings-tab-content space-y-6 hidden">
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                            <h3 class="text-lg font-semibold text-gray-200">Провайдер сервисов</h3>
                            <p class="text-sm text-gray-400">Выберите основной сервис, с которым будет работать ассистент. В данный момент поддерживается только Google.</p>
                            <div class="space-y-3 pt-2">
                                <div class="flex items-center">
                                    <input type="radio" id="provider-google" name="service-provider" value="google" checked class="h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500">
                                    <label for="provider-google" class="ml-3 block text-sm font-medium text-gray-200">Google</label>
                                </div>
                                <div class="flex items-center opacity-50">
                                    <input type="radio" id="provider-apple" name="service-provider" value="apple" disabled class="h-4 w-4 text-blue-600 bg-gray-800 border-gray-600">
                                    <label for="provider-apple" class="ml-3 block text-sm font-medium text-gray-500">Apple (скоро)</label>
                                </div>
                                <div class="flex items-center opacity-50">
                                    <input type="radio" id="provider-outlook" name="service-provider" value="outlook" disabled class="h-4 w-4 text-blue-600 bg-gray-800 border-gray-600">
                                    <label for="provider-outlook" class="ml-3 block text-sm font-medium text-gray-500">Outlook (скоро)</label>
                                </div>
                                <div class="flex items-center opacity-50">
                                    <input type="radio" id="provider-yandex" name="service-provider" value="yandex" disabled class="h-4 w-4 text-blue-600 bg-gray-800 border-gray-600">
                                    <label for="provider-yandex" class="ml-3 block text-sm font-medium text-gray-500">Yandex (скоро)</label>
                                </div>
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
                            <h3 class="text-lg font-semibold text-gray-200">Синхронизация данных</h3>
                            <p class="text-sm text-gray-400">Синхронизируйте данные из Google, чтобы ассистент мог быстро находить контакты и документы.</p>
                            <div id="sync-status" class="text-sm text-gray-300"></div>
                            <div class="space-y-3 pt-2">
                                <button id="sync-contacts-button" ${!authState.isGoogleConnected ? 'disabled' : ''} class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md font-semibold transition-colors">Синхронизировать контакты Google</button>
                                <button id="sync-files-button" ${!authState.isGoogleConnected ? 'disabled' : ''} class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md font-semibold transition-colors">Синхронизировать файлы Google Drive</button>
                            </div>
                            ${!authState.isGoogleConnected ? '<p class="text-xs text-yellow-400 text-center">Для синхронизации необходимо войти в аккаунт Google.</p>' : ''}
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
            supabaseUrl: modalOverlay.querySelector('#supabase-url').value.trim(),
            supabaseAnonKey: modalOverlay.querySelector('#supabase-anon-key').value.trim(),
            geminiApiKey: modalOverlay.querySelector('#gemini-api-key').value.trim(),
            isSupabaseEnabled: modalOverlay.querySelector('#supabase-enabled-toggle').checked,
            // isGoogleEnabled is deprecated but kept for compatibility, we derive logic from isSupabaseEnabled
            isGoogleEnabled: true, 
            googleClientId: modalOverlay.querySelector('#google-client-id').value.trim(),
        };
        onSave(newSettings);
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) onClose();
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
    
    // Logic for Supabase toggle
    const supabaseToggle = modalOverlay.querySelector('#supabase-enabled-toggle');
    supabaseToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        modalOverlay.querySelector('#supabase-settings-block').style.display = isEnabled ? '' : 'none';
        modalOverlay.querySelector('#direct-google-settings-block').style.display = isEnabled ? 'none' : '';
        modalOverlay.querySelector('a[data-tab="sync"]').style.display = isEnabled ? '' : 'none';
        
        const authDesc = modalOverlay.querySelector('#auth-method-description');
        authDesc.textContent = isEnabled 
            ? 'Для работы ассистента необходимо войти в аккаунт Google через Supabase.' 
            : 'Для работы ассистента необходимо войти в аккаунт Google напрямую.';
        
        // If sync tab is active and we disable supabase, switch to connections
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

    // Sync buttons logic
    const syncContactsBtn = modalOverlay.querySelector('#sync-contacts-button');
    const syncFilesBtn = modalOverlay.querySelector('#sync-files-button');
    const syncStatusDiv = modalOverlay.querySelector('#sync-status');

    const handleSync = async (button, syncFunction, providerFunction, entityName, entityNamePlural) => {
        button.disabled = true;
        button.textContent = 'Синхронизация...';
        syncStatusDiv.innerHTML = `<p>Получаем ${entityNamePlural} из Google...</p>`;
        try {
            const items = await providerFunction();
            syncStatusDiv.innerHTML = `<p>Найдено ${items.length} ${entityNamePlural}. Сохраняем в Supabase...</p>`;
            const result = await syncFunction(items);
            syncStatusDiv.innerHTML = `<p class="text-green-400">Успешно синхронизировано ${result.synced} ${entityNamePlural}!</p>`;
        } catch (error) {
            console.error(`Sync error for ${entityName}:`, error);
            syncStatusDiv.innerHTML = `<p class="text-red-400">Ошибка синхронизации: ${error.message}</p>`;
        } finally {
            button.disabled = false;
            button.textContent = `Синхронизировать ${entityNamePlural} Google`;
        }
    };

    if (authState.isGoogleConnected && supabaseService) {
        syncContactsBtn.addEventListener('click', () => handleSync(
            syncContactsBtn,
            (items) => supabaseService.syncContacts(items),
            () => googleProvider.getAllContacts(),
            'контакт',
            'контакты'
        ));
        syncFilesBtn.addEventListener('click', () => handleSync(
            syncFilesBtn,
            (items) => supabaseService.syncFiles(items),
            () => googleProvider.getAllFiles(),
            'файл',
            'файлы'
        ));
    }

    return modalOverlay;
}