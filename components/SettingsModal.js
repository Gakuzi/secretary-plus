export function createSettingsModal(currentSettings, providers, onSave, onClose) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
    
    const redirectUri = window.location.origin + window.location.pathname;

    modalOverlay.innerHTML = `
        <div class="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6 m-4" id="settings-content">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-2xl font-bold">Настройки</h2>
                <button id="close-settings" class="p-1 rounded-full hover:bg-gray-700">&times;</button>
            </div>

            <div class="space-y-6">
                <div>
                    <h3 class="text-lg font-semibold mb-2">Провайдеры</h3>
                    <select id="provider-select" class="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2">
                        ${Object.values(providers).map(p => `<option value="${p.getId()}" ${currentSettings.activeProviderId === p.getId() ? 'selected' : ''}>${p.getName()}</option>`).join('')}
                    </select>
                </div>
                
                <div id="google-settings" class="${currentSettings.activeProviderId === 'google' ? '' : 'hidden'}">
                    <label for="google-client-id" class="block text-sm font-medium text-gray-300 mb-1">Google Client ID</label>
                    <input type="text" id="google-client-id" class="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value="${currentSettings.googleClientId}">
                     <div class="mt-4 p-3 bg-gray-900 rounded-md border border-gray-700">
                        <h4 class="font-semibold text-gray-200">Инструкция по авторизации Google</h4>
                        <p class="text-xs text-gray-400 mt-1">Добавьте следующий URI в "Авторизованные URI перенаправления" в [настройках OAuth 2.0](https://console.cloud.google.com/apis/credentials):</p>
                        <div class="flex items-center mt-2 bg-gray-800 p-2 rounded-md">
                            <input type="text" readonly id="redirect-uri-input" value="${redirectUri}" class="flex-1 bg-transparent text-sm text-gray-300 focus:outline-none">
                            <button id="copy-uri-button" class="ml-2 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded">Копировать</button>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 class="text-lg font-semibold mb-2">Gemini API</h3>
                    <label for="gemini-api-key" class="block text-sm font-medium text-gray-300 mb-1">Gemini API Key</label>
                    <input type="password" id="gemini-api-key" class="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value="${currentSettings.geminiApiKey || ''}">
                    <p class="text-xs text-gray-400 mt-1">Ваш ключ хранится локально и никогда не передается на сервер. Получить ключ можно в <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">Google AI Studio</a>.</p>
                </div>

                <div class="flex justify-end pt-4 border-t border-gray-700">
                    <button id="save-settings" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">Сохранить</button>
                </div>
            </div>
        </div>
    `;

    const closeButton = modalOverlay.querySelector('#close-settings');
    const saveButton = modalOverlay.querySelector('#save-settings');
    const providerSelect = modalOverlay.querySelector('#provider-select');
    const googleSettingsDiv = modalOverlay.querySelector('#google-settings');
    const copyUriButton = modalOverlay.querySelector('#copy-uri-button');

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            onClose();
        }
    });
    
    closeButton.addEventListener('click', onClose);

    saveButton.addEventListener('click', () => {
        const newSettings = {
            googleClientId: modalOverlay.querySelector('#google-client-id').value,
            geminiApiKey: modalOverlay.querySelector('#gemini-api-key').value,
            activeProviderId: providerSelect.value,
        };
        onSave(newSettings);
    });

    providerSelect.addEventListener('change', (e) => {
        googleSettingsDiv.classList.toggle('hidden', e.target.value !== 'google');
    });
    
    copyUriButton.addEventListener('click', () => {
        navigator.clipboard.writeText(redirectUri).then(() => {
            copyUriButton.textContent = 'Скопировано!';
            setTimeout(() => { copyUriButton.textContent = 'Копировать'; }, 2000);
        });
    });

    return modalOverlay;
}