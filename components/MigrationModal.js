import * as Icons from './icons/Icons.js';

export function createMigrationModal() {
    const modalElement = document.createElement('div');
    modalElement.id = 'migration-modal';
    modalElement.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4';
    
    modalElement.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 text-center">
            <div id="migration-spinner" class="mx-auto h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div id="migration-icon" class="hidden mx-auto h-12 w-12"></div>
            <h3 id="migration-title" class="text-xl font-bold mt-4">Проверка базы данных...</h3>
            <p id="migration-status" class="text-sm text-slate-500 dark:text-slate-400 mt-2">Пожалуйста, подождите.</p>
            <div id="migration-actions" class="mt-6 space-x-2"></div>
        </div>
    `;

    const spinner = modalElement.querySelector('#migration-spinner');
    const iconContainer = modalElement.querySelector('#migration-icon');
    const title = modalElement.querySelector('#migration-title');
    const status = modalElement.querySelector('#migration-status');
    const actions = modalElement.querySelector('#migration-actions');

    const updateState = (state, message = '', error = null) => {
        spinner.classList.add('hidden');
        iconContainer.classList.remove('hidden');
        actions.innerHTML = '';

        switch (state) {
            case 'checking':
                spinner.classList.remove('hidden');
                title.textContent = 'Проверка базы данных...';
                status.textContent = message || 'Определяем текущую версию схемы...';
                break;
            case 'required':
                iconContainer.innerHTML = Icons.AlertTriangleIcon;
                iconContainer.className = 'mx-auto h-12 w-12 text-yellow-500';
                title.textContent = 'Требуется обновление базы данных';
                status.innerHTML = `Структура вашей базы данных устарела. Для корректной работы приложения необходимо её обновить. <br><strong class="mt-2 block">Все кэшированные данные будут удалены и синхронизированы заново.</strong>`;
                 actions.innerHTML = `
                    <button data-action="migrate" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Начать обновление</button>
                `;
                break;
            case 'migrating':
                spinner.classList.remove('hidden');
                title.textContent = 'Обновление базы данных...';
                status.textContent = message;
                break;
            case 'success':
                iconContainer.innerHTML = Icons.CheckSquareIcon;
                iconContainer.className = 'mx-auto h-12 w-12 text-green-500';
                title.textContent = 'База данных обновлена!';
                status.textContent = message || 'Приложение перезагрузится через 3 секунды...';
                break;
            case 'error':
                iconContainer.innerHTML = Icons.AlertTriangleIcon;
                iconContainer.className = 'mx-auto h-12 w-12 text-red-500';
                title.textContent = 'Ошибка обновления!';
                status.innerHTML = `Не удалось обновить базу данных.<br><strong class="mt-2 block">${error || 'Неизвестная ошибка.'}</strong>`;
                actions.innerHTML = `
                    <button data-action="retry" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Повторить</button>
                `;
                break;
             case 'not-configured':
                iconContainer.innerHTML = Icons.SettingsIcon;
                iconContainer.className = 'mx-auto h-12 w-12 text-yellow-500';
                title.textContent = 'Автоматическое обновление не настроено';
                status.textContent = 'Для автоматического обновления схемы БД необходимо настроить "Управляющий воркер". Запустите мастер для его настройки.';
                 actions.innerHTML = `
                    <button data-action="open-wizard" class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-md font-semibold">Настроить Воркер</button>
                `;
                break;
        }
    };
    
    return { element: modalElement, updateState };
}