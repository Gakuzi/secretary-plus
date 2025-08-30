import * as Icons from './icons/Icons.js';
import { FULL_MIGRATION_SQL } from '../services/supabase/migrations.js';

export function createDbExecutionModal({ onExecute, onClose }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4 animate-fadeIn';

    let state = {
        isLoading: false,
        logOutput: 'Ожидание выполнения...',
        executionSuccess: false,
        currentSql: FULL_MIGRATION_SQL,
    };

    const render = () => {
        let footerHtml = '';
        if (state.executionSuccess) {
            footerHtml = `<button data-action="close" class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold">Готово (Перезагрузка)</button>`;
        } else {
            footerHtml = `
                <button data-action="close" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Отмена</button>
                <button data-action="execute" class="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold disabled:bg-slate-500" ${state.isLoading ? 'disabled' : ''}>
                    ${state.isLoading ? 'Выполнение...' : 'Выполнить'}
                </button>
            `;
        }

        modalElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg shadow-2xl w-full max-w-3xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col relative">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h2 class="text-xl font-bold flex items-center gap-2">${Icons.DatabaseIcon} Редактор и Миграция БД</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">&times;</button>
                </header>
                <main class="flex-1 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 space-y-4">
                    <div class="p-3 bg-yellow-100/50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300 rounded-md text-sm flex items-start gap-2">
                        <div class="w-5 h-5 flex-shrink-0 mt-0.5">${Icons.AlertTriangleIcon}</div>
                        <div>
                            <p class="font-bold">Внимание:</p>
                            <p>Выполнение этого скрипта приведет к удалению и пересозданию всех таблиц с кэшированными данными (события, контакты, файлы и т.д.). Убедитесь, что у вас есть резервная копия, если это необходимо.</p>
                        </div>
                    </div>
                    <div>
                        <div class="flex justify-between items-center mb-1">
                            <label for="sql-script-area" class="font-semibold text-sm">SQL-скрипт для выполнения:</label>
                             <button data-action="copy-sql" class="text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-2 py-1 rounded-md transition-colors">Копировать</button>
                        </div>
                        <textarea id="sql-script-area" class="w-full h-48 mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none" readonly>${state.currentSql}</textarea>
                    </div>
                    <div>
                        <label class="font-semibold text-sm">Лог выполнения:</label>
                        <div class="w-full h-24 mt-1 bg-slate-900 text-slate-200 border border-slate-700 rounded-md p-2 font-mono text-xs overflow-y-auto whitespace-pre-wrap">${state.logOutput}</div>
                    </div>
                </main>
                <footer class="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center gap-2">${footerHtml}</footer>
            </div>
        `;
    };

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) {
            if (e.target === modalElement) onClose();
            return;
        }

        const action = target.dataset.action;
        const sqlTextarea = modalElement.querySelector('#sql-script-area');

        switch (action) {
            case 'close':
                if (state.executionSuccess) {
                    window.location.reload(); // Reload to apply schema changes
                }
                onClose();
                break;
            case 'copy-sql':
                navigator.clipboard.writeText(sqlTextarea.value);
                alert('SQL-скрипт скопирован в буфер обмена.');
                break;
            case 'execute':
                const sqlToExecute = sqlTextarea.value.trim();
                if (!sqlToExecute) {
                    alert('SQL-скрипт не может быть пустым.');
                    return;
                }
                if (!confirm('Вы уверены, что хотите выполнить этот скрипт? Это действие может быть необратимым.')) {
                    return;
                }
                state.isLoading = true;
                state.executionSuccess = false;
                state.logOutput = 'Выполнение миграции...';
                render();
                try {
                    const result = await onExecute(sqlToExecute);
                    state.logOutput = `УСПЕШНО! База данных настроена.\n\nОтвет сервера:\n${JSON.stringify(result, null, 2)}`;
                    state.executionSuccess = true;
                } catch (error) {
                    state.logOutput = `ОШИБКА!\n\n${error.message}\n\nПроверьте настройки Управляющего воркера и попробуйте снова.`;
                } finally {
                    state.isLoading = false;
                    render();
                }
                break;
        }
    };

    modalElement.addEventListener('click', handleAction);
    
    render();
    return modalElement;
}