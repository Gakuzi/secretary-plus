import * as Icons from './icons/Icons.js';
import { getSettings } from '../utils/storage.js';
import { FULL_MIGRATION_SQL } from '../services/supabase/migrations.js';

export function createMigrationModal({ supabaseService, onClose }) {
    const modalElement = document.createElement('div');
    modalElement.id = 'migration-modal';
    modalElement.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 animate-fadeIn';

    let state = 'checking'; // 'checking', 'required', 'not-configured', 'migrating', 'success', 'error'
    let errorMessage = '';

    const render = () => {
        let iconHtml, titleText, statusText, actionsHtml = '';

        switch (state) {
            case 'checking':
                iconHtml = `<div class="mx-auto h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>`;
                titleText = 'Проверка конфигурации...';
                statusText = 'Проверяем возможность автоматического обновления...';
                break;
            case 'required':
                iconHtml = `<div class="mx-auto h-12 w-12 text-yellow-500">${Icons.AlertTriangleIcon}</div>`;
                titleText = 'Требуется обновление базы данных';
                statusText = 'Структура вашей базы данных устарела. Для корректной работы приложения необходимо её обновить. <br><strong class="mt-2 block">Все кэшированные данные будут удалены и синхронизированы заново.</strong>';
                actionsHtml = `<button data-action="close" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Отмена</button>
                               <button data-action="migrate" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Начать обновление</button>`;
                break;
            case 'migrating':
                iconHtml = `<div class="mx-auto h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>`;
                titleText = 'Обновление базы данных...';
                statusText = 'Это может занять до минуты. Пожалуйста, не закрывайте вкладку.';
                break;
            case 'success':
                iconHtml = `<div class="mx-auto h-12 w-12 text-green-500">${Icons.CheckSquareIcon}</div>`;
                titleText = 'База данных успешно обновлена!';
                statusText = 'Приложение будет перезагружено через 3 секунды...';
                break;
            case 'error':
                iconHtml = `<div class="mx-auto h-12 w-12 text-red-500">${Icons.AlertTriangleIcon}</div>`;
                titleText = 'Ошибка обновления!';
                statusText = `Не удалось обновить базу данных.<br><strong class="mt-2 block">${errorMessage}</strong>`;
                actionsHtml = `<button data-action="close" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Закрыть</button>
                               <button data-action="retry" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Повторить</button>`;
                break;
            case 'not-configured':
                iconHtml = `<div class="mx-auto h-12 w-12 text-yellow-500">${Icons.WandIcon}</div>`;
                titleText = 'Автоматическое обновление не настроено';
                statusText = 'Для выполнения этой операции необходим "Управляющий воркер". Запустите пошаговый мастер, чтобы его настроить.';
                actionsHtml = `<button data-action="close" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Отмена</button>
                               <button data-client-action="open_db_setup_wizard" class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-md font-semibold">Запустить Мастер настройки</button>`;
                break;
        }

        modalElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 text-center relative">
                <button data-action="close" class="absolute top-2 right-2 p-1 rounded-full text-2xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Закрыть">&times;</button>
                ${iconHtml}
                <h3 class="text-xl font-bold mt-4">${titleText}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-2">${statusText}</p>
                <div class="mt-6 flex justify-center gap-2">${actionsHtml}</div>
            </div>
        `;
    };

    const runCheck = () => {
        const settings = getSettings();
        if (!settings.managementWorkerUrl || !settings.adminSecretToken) {
            state = 'not-configured';
        } else {
            state = 'required';
        }
        render();
    };

    const runMigration = async () => {
        state = 'migrating';
        render();
        try {
            await supabaseService.executeSqlViaFunction(FULL_MIGRATION_SQL);
            state = 'success';
            render();
            setTimeout(() => window.location.reload(), 3000);
        } catch (error) {
            errorMessage = error.message;
            state = 'error';
            render();
        }
    };
    
    modalElement.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        const action = actionTarget?.dataset.action;

        // Handle close actions first
        if (action === 'close' || (!actionTarget && e.target === modalElement)) {
            if (onClose) onClose();
            return;
        }

        if (!action) return;

        switch(action) {
            case 'migrate':
                if (confirm('Это действие удалит существующие кэшированные таблицы и создаст их заново. Вы уверены?')) {
                    runMigration();
                }
                break;
            case 'retry':
                runCheck();
                break;
        }
    });

    render();
    // Initial check to determine the first state to show
    setTimeout(runCheck, 500);

    return { element: modalElement };
}