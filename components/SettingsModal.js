import * as Icons from './icons/Icons.js';

export function createSettingsModal({ settings, onClose, onSave }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4';
    
    modalElement.innerHTML = `
        <div id="settings-content" class="bg-white dark:bg-slate-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-lg shadow-xl">
            <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <h2 class="text-xl sm:text-2xl font-bold flex items-center gap-2">${Icons.SettingsIcon} Настройки</h2>
                <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Закрыть настройки">&times;</button>
            </header>

            <main class="flex-1 p-4 sm:p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/70">
                <div class="space-y-6">
                    <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Уведомления и Синхронизация</h3>
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <label for="email-polling-toggle" class="font-medium text-slate-700 dark:text-slate-300">Уведомлять о новых письмах</label>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="email-polling-toggle" ${settings.enableEmailPolling ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                             <div class="flex items-center justify-between">
                                <label for="auto-sync-toggle" class="font-medium text-slate-700 dark:text-slate-300">Фоновая синхронизация</label>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="auto-sync-toggle" ${settings.enableAutoSync ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                     <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Администрирование</h3>
                        <p class="text-xs text-slate-500 mt-1 mb-2">Управление общим пулом ключей API и прокси-серверов будет доступно здесь в будущих версиях.</p>
                    </div>
                </div>
            </main>

            <footer class="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center flex-shrink-0">
                <button data-action="save" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Сохранить и закрыть</button>
            </footer>
        </div>
    `;
    
    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        
        switch (action) {
            case 'close':
                onClose();
                break;
            case 'save': {
                const newSettings = { ...settings };
                newSettings.enableEmailPolling = modalElement.querySelector('#email-polling-toggle').checked;
                newSettings.enableAutoSync = modalElement.querySelector('#auto-sync-toggle').checked;
                onSave(newSettings);
                break;
            }
        }
    };

    modalElement.addEventListener('click', (e) => {
        if (e.target.closest('#settings-content')) {
             handleAction(e);
        } else {
            onClose();
        }
    });

    return modalElement;
}