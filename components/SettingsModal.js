import * as Icons from './icons/Icons.js';
import { DB_SCHEMAS } from '../services/supabase/schema.js';


export function createSettingsModal({ settings, onClose, onSave }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4';
    
    const render = () => {
        const syncableServices = ['calendar', 'tasks', 'contacts', 'files', 'emails', 'notes'];
        const servicesHtml = syncableServices.map(key => {
            const schema = DB_SCHEMAS[key];
            if (!schema) return '';
            return `
                <div class="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                    <label for="service-toggle-${key}" class="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <span class="w-5 h-5">${Icons[schema.icon] || ''}</span>
                        <span>${schema.label}</span>
                    </label>
                    <label class="toggle-switch">
                        <input type="checkbox" id="service-toggle-${key}" data-service-key="${key}" ${settings.enabledServices[key] ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            `;
        }).join('');

        modalElement.innerHTML = `
            <div id="settings-content" class="bg-white dark:bg-slate-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-lg shadow-xl">
                <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <h2 class="text-xl sm:text-2xl font-bold flex items-center gap-2">${Icons.SettingsIcon} Настройки</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Закрыть настройки">&times;</button>
                </header>

                <main class="flex-1 flex flex-col sm:flex-row overflow-hidden bg-slate-50 dark:bg-slate-900/70">
                    <aside class="w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 p-2 sm:p-4 flex-shrink-0 bg-white dark:bg-slate-800">
                         <nav class="flex flex-row sm:flex-col sm:space-y-2 w-full justify-around">
                            <a href="#general" class="settings-tab-button text-center sm:text-left active" data-tab="general">Общие</a>
                            <a href="#services" class="settings-tab-button text-center sm:text-left" data-tab="services">Службы</a>
                        </nav>
                    </aside>

                    <div class="flex-1 p-4 sm:p-6 overflow-y-auto" id="settings-tabs-content">
                        <!-- General Tab -->
                        <div id="tab-general" class="settings-tab-content space-y-6">
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

                        <!-- Services Tab -->
                        <div id="tab-services" class="settings-tab-content hidden space-y-6">
                            <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Службы для синхронизации</h3>
                                <p class="text-sm text-slate-600 dark:text-slate-400 my-2">Выберите, какие данные вы хотите синхронизировать с Supabase для быстрого поиска и анализа. Отключение службы не удалит уже синхронизированные данные.</p>
                                <div class="divide-y divide-slate-200 dark:divide-slate-700">${servicesHtml}</div>
                            </div>
                        </div>
                    </div>
                </main>

                <footer class="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center flex-shrink-0">
                    <button data-action="save" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Сохранить и закрыть</button>
                </footer>
            </div>
        `;
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
                newSettings.enableEmailPolling = modalElement.querySelector('#email-polling-toggle').checked;
                newSettings.enableAutoSync = modalElement.querySelector('#auto-sync-toggle').checked;
                // Collect service toggles
                modalElement.querySelectorAll('[data-service-key]').forEach(toggle => {
                    newSettings.enabledServices[toggle.dataset.serviceKey] = toggle.checked;
                });
                onSave(newSettings);
                break;
            }
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
    
    // Activate initial tab
    const initialTab = 'general';
    modalElement.querySelector(`.settings-tab-button[data-tab="${initialTab}"]`)?.classList.add('active');
    modalElement.querySelector(`#tab-${initialTab}`)?.classList.remove('hidden');

    return modalElement;
}