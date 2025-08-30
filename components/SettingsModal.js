import { getSettings, saveSettings } from '../utils/storage.js';
import * as Icons from './icons/Icons.js';

export function createSettingsModal({ settings, onClose, onSave, onLaunchDbWizard, onLaunchProxyManager, onLaunchDbExecutionModal, onLaunchDataManager }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4';
    
    const render = () => {
        modalElement.innerHTML = `
            <div id="settings-content" class="bg-white dark:bg-slate-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-lg shadow-xl">
                <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <h2 class="text-xl sm:text-2xl font-bold flex items-center gap-2">${Icons.SettingsIcon} Настройки</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Закрыть настройки">&times;</button>
                </header>

                <main class="flex-1 flex flex-col sm:flex-row overflow-hidden bg-slate-50 dark:bg-slate-900/70">
                    <aside class="w-full sm:w-52 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 p-2 sm:p-4 flex-shrink-0 bg-white dark:bg-slate-800">
                         <nav class="flex flex-row sm:flex-col sm:space-y-2 w-full justify-around">
                            <a href="#connections" class="settings-tab-button text-center sm:text-left active" data-tab="connections">Подключения</a>
                            <a href="#database" class="settings-tab-button text-center sm:text-left" data-tab="database">База данных</a>
                            <a href="#about" class="settings-tab-button text-center sm:text-left" data-tab="about">О приложении</a>
                        </nav>
                    </aside>

                    <div class="flex-1 p-4 sm:p-6 overflow-y-auto" id="settings-tabs-content">
                        <!-- Connections Tab -->
                        <div id="tab-connections" class="settings-tab-content space-y-6">
                            <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">API Ключи</h3>
                                <div class="space-y-4">
                                    <div>
                                        <label for="geminiApiKey" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Gemini API Key</label>
                                        <input type="password" id="geminiApiKey" class="mt-1 block w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" value="${settings.geminiApiKey || ''}">
                                        <p class="mt-1 text-xs text-slate-500">Ключ для доступа к моделям Gemini. <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">Получить ключ</a>.</p>
                                    </div>
                                </div>
                            </div>
                            <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Прокси</h3>
                                <div class="flex items-center justify-between py-2">
                                    <label for="use-proxy-toggle" class="font-medium text-slate-700 dark:text-slate-300">Использовать прокси-серверы</label>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="use-proxy-toggle" ${settings.useProxy ? 'checked' : ''} ${!settings.isSupabaseEnabled ? 'disabled' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <p class="text-xs text-slate-500 mt-1">Необходимо для обхода региональных ограничений. Требует включенного режима Supabase.</p>
                                <button data-action="manage-proxies" class="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md font-semibold text-sm transition-colors ${!settings.isSupabaseEnabled ? 'opacity-50 cursor-not-allowed' : ''}" ${!settings.isSupabaseEnabled ? 'disabled' : ''}>
                                    ${Icons.SettingsIcon} <span>Управление прокси</span>
                                </button>
                            </div>
                        </div>

                        <!-- Database Tab -->
                        <div id="tab-database" class="settings-tab-content hidden space-y-6">
                             <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Управление Базой Данных</h3>
                                <p class="text-sm text-slate-600 dark:text-slate-400 my-2">Для автоматического обновления схемы базы данных используется **Управляющий воркер**. Если вы столкнулись с ошибками синхронизации, запустите мастер для его настройки или проверки.</p>
                                <button data-action="launch-db-wizard" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold text-sm flex items-center justify-center gap-2">
                                    ${Icons.DatabaseIcon}
                                    <span>Запустить мастер настройки воркера</span>
                                </button>

                                <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                    <h4 class="font-semibold text-slate-800 dark:text-slate-200">Редактор и Миграция</h4>
                                    <p class="text-sm text-slate-600 dark:text-slate-400 my-2">Если воркер уже настроен, вы можете принудительно выполнить полную миграцию для обновления схемы или внести ручные изменения в SQL-скрипт.</p>
                                    <button data-action="launch-db-execution" class="w-full px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-md font-semibold text-sm flex items-center justify-center gap-2 ${!settings.managementWorkerUrl || !settings.adminSecretToken ? 'opacity-50 cursor-not-allowed' : ''}" ${!settings.managementWorkerUrl || !settings.adminSecretToken ? 'disabled' : ''}>
                                        ${Icons.CodeIcon}
                                        <span>Открыть SQL-редактор</span>
                                    </button>
                                </div>
                                <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                    <h4 class="font-semibold text-slate-800 dark:text-slate-200">Центр управления данными</h4>
                                    <p class="text-sm text-slate-600 dark:text-slate-400 my-2">Просмотр кэшированных данных, статусы и ручной запуск синхронизации.</p>
                                    <button data-action="launch-data-manager" class="w-full px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-md font-semibold text-sm flex items-center justify-center gap-2 ${!settings.isSupabaseEnabled ? 'opacity-50 cursor-not-allowed' : ''}" ${!settings.isSupabaseEnabled ? 'disabled' : ''}>
                                        ${Icons.DatabaseIcon}
                                        <span>Открыть Центр управления</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- About Tab -->
                        <div id="tab-about" class="settings-tab-content hidden prose prose-invert max-w-none text-slate-700 dark:text-slate-300">
                            <!-- App info will be injected here -->
                        </div>
                    </div>
                </main>

                <footer class="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center flex-shrink-0">
                    <button data-action="save" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Сохранить и закрыть</button>
                </footer>
            </div>
        `;
    };

    const loadAppInfo = async () => {
        try {
            const response = await fetch('./app-info.json');
            const info = await response.json();
            const aboutTab = modalElement.querySelector('#tab-about');
            if (aboutTab) {
                const changelogHtml = info.changelog.map(entry => `
                    <div class="mt-4">
                        <h4 class="font-semibold text-slate-900 dark:text-slate-100">Версия ${entry.version} <span class="text-sm font-normal text-slate-500 dark:text-slate-400">- ${entry.date}</span></h4>
                        <ul class="list-disc list-inside mt-1 text-sm">
                            ${entry.changes.map(change => `<li>${change}</li>`).join('')}
                        </ul>
                    </div>
                `).join('');

                aboutTab.innerHTML = `
                    <h3 class="text-2xl font-bold text-slate-900 dark:text-white">Секретарь+</h3>
                    <p><strong>Версия:</strong> ${info.version}</p>
                    <p><strong>Автор:</strong> ${info.author}</p>
                    <p><strong>Контакт:</strong> <a href="${info.contact}" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">Telegram</a></p>
                    <h3 class="text-xl font-bold mt-6 text-slate-900 dark:text-white">История изменений</h3>
                    ${changelogHtml}
                `;
            }
        } catch (error) {
            console.error('Failed to load app info:', error);
             const aboutTab = modalElement.querySelector('#tab-about');
             if(aboutTab) aboutTab.innerHTML = '<p>Не удалось загрузить информацию о приложении.</p>';
        }
    };
    
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
                newSettings.geminiApiKey = modalElement.querySelector('#geminiApiKey').value.trim();
                newSettings.useProxy = modalElement.querySelector('#use-proxy-toggle').checked;
                onSave(newSettings);
                break;
            }
            case 'manage-proxies':
                onLaunchProxyManager();
                break;
            case 'launch-db-wizard':
                onLaunchDbWizard();
                break;
            case 'launch-db-execution':
                onLaunchDbExecutionModal();
                break;
            case 'launch-data-manager':
                onLaunchDataManager();
                break;
        }
    };

    modalElement.addEventListener('click', (e) => {
        if (e.target.closest('#settings-content')) {
             handleAction(e);
             const tabButton = e.target.closest('.settings-tab-button');
             if (tabButton) {
                 e.preventDefault();
                 const tabId = tabButton.dataset.tab;

                 modalElement.querySelectorAll('.settings-tab-button').forEach(btn => btn.classList.remove('active'));
                 modalElement.querySelectorAll(`.settings-tab-button[data-tab="${tabId}"]`).forEach(btn => btn.classList.add('active'));

                 modalElement.querySelectorAll('.settings-tab-content').forEach(content => {
                     content.classList.toggle('hidden', content.id !== `tab-${tabId}`);
                 });
             }
        } else {
            onClose();
        }
    });

    render();
    loadAppInfo();
    
    // Activate initial tab if provided, otherwise default to connections
    const initialTab = 'connections';
    modalElement.querySelectorAll('.settings-tab-button').forEach(btn => btn.classList.remove('active'));
    modalElement.querySelectorAll('.settings-tab-content').forEach(content => content.classList.add('hidden'));

    modalElement.querySelectorAll(`.settings-tab-button[data-tab="${initialTab}"]`).forEach(btn => btn.classList.add('active'));
    const initialTabContent = modalElement.querySelector(`#tab-${initialTab}`);
    if (initialTabContent) {
        initialTabContent.classList.remove('hidden');
    }

    return modalElement;
}