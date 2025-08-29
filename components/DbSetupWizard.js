
import * as Icons from './icons/Icons.js';
import { SupabaseService } from '../services/supabase/SupabaseService.js';
import { FULL_MIGRATION_SQL } from '../services/supabase/migrations.js';

export function createDbSetupWizard({ settings, supabaseConfig, onClose, onSave }) {
    const wizardElement = document.createElement('div');
    wizardElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4';

    let state = {
        isLoading: false,
        logOutput: 'Ожидание выполнения...',
        functionUrl: settings.managementWorkerUrl || '',
        adminToken: settings.adminSecretToken || '',
    };
    
    const render = () => {
        wizardElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg shadow-2xl w-full max-w-3xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col relative animate-fadeIn">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold flex items-center gap-2">${Icons.DatabaseIcon} Инструмент администратора БД</h2>
                        <p class="text-sm text-slate-500 dark:text-slate-400">Выполнение SQL через Supabase Edge Function</p>
                    </div>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">&times;</button>
                </header>
                <main class="flex-1 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 space-y-4">
                    <div>
                        <p class="mb-4">Этот инструмент позволяет безопасно выполнять SQL-запросы на вашей базе данных через **Supabase Edge Function**. Вставьте URL вашей функции и секретный токен, который вы задали в её настройках.</p>
                        <a href="https://github.com/Gakuzi/secretary-plus/discussions/1" target="_blank" class="text-blue-500 hover:underline text-sm">Нужна помощь в создании Edge Function? Нажмите здесь для инструкции.</a>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label for="function-url-input" class="font-semibold text-sm">URL функции (db-admin):</label>
                            <input type="url" id="function-url-input" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-sm" placeholder="https://<project>.supabase.co/functions/v1/db-admin" value="${state.functionUrl}">
                        </div>
                        <div>
                             <label for="admin-token-input" class="font-semibold text-sm">Секретный токен (ADMIN_TOKEN):</label>
                            <input type="password" id="admin-token-input" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-sm" value="${state.adminToken}">
                        </div>
                    </div>
                    <div>
                        <label for="sql-script-area" class="font-semibold text-sm">SQL-скрипт для выполнения:</label>
                        <textarea id="sql-script-area" class="w-full h-48 mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-xs">${FULL_MIGRATION_SQL}</textarea>
                    </div>
                    <div>
                        <label class="font-semibold text-sm">Лог выполнения:</label>
                        <div class="w-full h-24 mt-1 bg-slate-900 text-slate-200 border border-slate-700 rounded-md p-2 font-mono text-xs overflow-y-auto whitespace-pre-wrap">${state.logOutput}</div>
                    </div>

                </main>
                <footer class="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center">
                     <button data-action="execute" class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold disabled:bg-slate-500" ${state.isLoading ? 'disabled' : ''}>
                        ${state.isLoading ? `<div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>` : 'Выполнить'}
                    </button>
                </footer>
            </div>
        `;
    };
    
    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;
        
        state.functionUrl = wizardElement.querySelector('#function-url-input').value.trim();
        state.adminToken = wizardElement.querySelector('#admin-token-input').value.trim();

        switch (action) {
            case 'close': onClose(); break;
            case 'execute':
                const sqlScript = wizardElement.querySelector('#sql-script-area').value.trim();
                
                if (!state.functionUrl || !state.adminToken || !sqlScript) {
                    state.logOutput = 'Ошибка: URL функции, токен и SQL-скрипт должны быть заполнены.';
                    render();
                    return;
                }
                
                state.isLoading = true;
                state.logOutput = 'Выполнение запроса...';
                render();

                try {
                    const service = new SupabaseService(supabaseConfig.url, supabaseConfig.anonKey);
                    const result = await service.executeSqlViaFunction(state.functionUrl, state.adminToken, sqlScript);
                    
                    state.logOutput = `Успешно выполнено!\n\nОтвет сервера:\n${JSON.stringify(result, null, 2)}`;
                    
                    const newSettings = { 
                        ...settings, 
                        managementWorkerUrl: state.functionUrl,
                        adminSecretToken: state.adminToken,
                    };
                    onSave(newSettings); // Save successful settings

                } catch(error) {
                    state.logOutput = `Ошибка выполнения:\n\n${error.message}`;
                } finally {
                    state.isLoading = false;
                    render();
                }
                break;
        }
    };
    
    wizardElement.addEventListener('click', handleAction);

    render();
    return wizardElement;
}
