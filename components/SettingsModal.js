import { FileIcon, SettingsIcon } from './icons/Icons.js';

export function createSettingsModal(currentSettings, providers, onSave, onClose, isUnsupportedDomain, onAuthenticate) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
    
    const redirectUri = window.location.origin + window.location.pathname;

    const fullSettingsHTML = `
        <div id="provider-settings" class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
             <h3 class="text-lg font-semibold text-gray-200 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z"/><path d="M12 12v-4"/><path d="m16 16-2-2"/></svg>
                Провайдеры Интеграций
            </h3>
            <p class="text-sm text-gray-400">Выберите сервис для управления вашими календарями, контактами и документами.</p>
            <select id="provider-select" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
                ${Object.values(providers).map(p => `<option value="${p.getId()}" ${currentSettings.activeProviderId === p.getId() ? 'selected' : ''}>${p.getName()}</option>`).join('')}
            </select>
        </div>

        <div id="google-settings" class="${currentSettings.activeProviderId === 'google' ? '' : 'hidden'} space-y-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
            <h4 class="font-semibold text-gray-200 text-md">Настройки Google</h4>
             <div class="space-y-2">
                <label for="google-client-id" class="block text-sm font-medium text-gray-300">Google Client ID</label>
                <input type="text" id="google-client-id" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" value="${currentSettings.googleClientId}">
            </div>
            <div class="mt-2 p-3 bg-gray-900 rounded-md border border-gray-600">
                <h5 class="font-semibold text-gray-300 text-sm">Как настроить авторизацию:</h5>
                <ol class="text-xs text-gray-400 mt-2 space-y-1 list-decimal list-inside">
                    <li>Откройте <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">Google Cloud Console</a>.</li>
                    <li>Выберите или создайте "OAuth 2.0 Client ID" типа "Web application".</li>
                    <li>В поле "Authorized redirect URIs" добавьте URI ниже:</li>
                </ol>
                <div class="flex items-center mt-2 bg-gray-800 p-2 rounded-md">
                    <input type="text" readonly id="redirect-uri-input" value="${redirectUri}" class="flex-1 bg-transparent text-sm text-gray-300 focus:outline-none">
                    <button id="copy-uri-button" class="ml-2 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors">Копировать</button>
                </div>
            </div>
            <div class="mt-4">
                <button id="auth-from-settings-button" class="w-full text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors font-semibold">Сохранить и подключить Google</button>
            </div>
        </div>
    `;

    modalOverlay.innerHTML = `
        <div class="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4" id="settings-content">
            <header class="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                <h2 class="text-2xl font-bold flex items-center gap-2">${SettingsIcon} Настройки</h2>
                <button id="close-settings" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Закрыть настройки">&times;</button>
            </header>
            
            <main class="p-6 space-y-6 overflow-y-auto">
                ${isUnsupportedDomain ? `
                <div class="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
                    <h3 class="font-bold">Режим Ограниченной Функциональности</h3>
                    <p class="text-sm mt-1">Приложение запущено в среде, которая не поддерживает безопасную авторизацию с внешними сервисами. Интеграции с Google отключены. Доступна только работа с Gemini API.</p>
                </div>
                ` : fullSettingsHTML}

                <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                    <h3 class="text-lg font-semibold text-gray-200 flex items-center gap-2">
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1V21c0 .8.7 1.5 1.5 1.5h8c.8 0 1.5-.7 1.5-1.5V6.9c0-.4-.2-.8-.5-1.1-.3-.3-.7-.5-1.1-.5Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                        Ключ Gemini API
                    </h3>
                    <div class="space-y-2">
                        <label for="gemini-api-key" class="block text-sm font-medium text-gray-300">Gemini API Key</label>
                        <input type="password" id="gemini-api-key" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" value="${currentSettings.geminiApiKey || ''}">
                    </div>
                    <p class="text-xs text-gray-400 mt-1">Ваш ключ хранится локально и никогда не передается. Получить ключ можно в <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">Google AI Studio</a>.</p>
                </div>

            </main>

            <footer class="flex justify-end p-4 border-t border-gray-700 flex-shrink-0">
                <button id="save-settings" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold transition-colors">Сохранить и закрыть</button>
            </footer>
        </div>
    `;

    const closeButton = modalOverlay.querySelector('#close-settings');
    const saveButton = modalOverlay.querySelector('#save-settings');

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            onClose();
        }
    });
    
    closeButton.addEventListener('click', onClose);

    saveButton.addEventListener('click', () => {
        const newSettings = { ...currentSettings };
        newSettings.geminiApiKey = modalOverlay.querySelector('#gemini-api-key').value.trim();

        if (!isUnsupportedDomain) {
            newSettings.googleClientId = modalOverlay.querySelector('#google-client-id').value.trim();
            newSettings.activeProviderId = modalOverlay.querySelector('#provider-select').value;
        }
        
        onSave(newSettings);
    });

    if (!isUnsupportedDomain) {
        const providerSelect = modalOverlay.querySelector('#provider-select');
        const googleSettingsDiv = modalOverlay.querySelector('#google-settings');
        const copyUriButton = modalOverlay.querySelector('#copy-uri-button');
        const authFromSettingsButton = modalOverlay.querySelector('#auth-from-settings-button');

        providerSelect.addEventListener('change', (e) => {
            googleSettingsDiv.classList.toggle('hidden', e.target.value !== 'google');
        });
        
        copyUriButton.addEventListener('click', () => {
            navigator.clipboard.writeText(redirectUri).then(() => {
                copyUriButton.textContent = 'Скопировано!';
                setTimeout(() => { copyUriButton.textContent = 'Копировать'; }, 2000);
            });
        });

        authFromSettingsButton.addEventListener('click', () => {
             const newSettings = { ...currentSettings };
             newSettings.geminiApiKey = modalOverlay.querySelector('#gemini-api-key').value.trim();
             newSettings.googleClientId = modalOverlay.querySelector('#google-client-id').value.trim();
             newSettings.activeProviderId = modalOverlay.querySelector('#provider-select').value;
            
             if (!newSettings.googleClientId) {
                alert('Пожалуйста, введите Google Client ID для подключения.');
                return;
             }

             onAuthenticate(newSettings);
        });
    }

    return modalOverlay;
}