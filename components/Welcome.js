import { GoogleIcon, SupabaseIcon } from './icons/Icons.js';

export function createWelcomeScreen({ isGoogleConnected, isSupabaseEnabled }) {
    const container = document.createElement('div');
    container.className = 'flex flex-col items-center justify-center h-full text-center p-8 welcome-screen-container';

    if (!isGoogleConnected) {
        container.innerHTML = `
            <div class="max-w-md">
                <h2 class="text-3xl font-bold mb-2">Начните работу</h2>
                <p class="text-gray-500 dark:text-gray-400 mb-6">Для использования ассистента необходимо войти в аккаунт Google и предоставить необходимые разрешения.</p>
                <button id="open-wizard-from-welcome" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold text-white transition-colors">
                    Перейти к настройкам и войти
                </button>
            </div>
        `;
    } else {
        const connectionStatusHtml = isSupabaseEnabled
            ? `
                <div class="inline-flex items-center gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-4 py-2 text-sm">
                    <div class="w-5 h-5 text-green-500 dark:text-green-400">${SupabaseIcon}</div>
                    <span class="font-medium text-gray-600 dark:text-gray-300">Подключено через <strong>Supabase</strong>. Доступен быстрый поиск.</span>
                </div>
            `
            : `
                <div class="inline-flex items-center gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-4 py-2 text-sm">
                    <div class="w-5 h-5">${GoogleIcon}</div>
                    <span class="font-medium text-gray-600 dark:text-gray-300">Подключено напрямую к <strong>Google</strong>. Синхронизация недоступна.</span>
                </div>
            `;
            
        const welcomeActions = [
            { label: 'Утренняя сводка', prompt: 'Подготовь утреннюю сводку: ключевые встречи и задачи на сегодня.' },
            { label: 'Срочные задачи', prompt: 'Какие задачи требуют срочного внимания?' },
            { label: 'Анализ почты', prompt: 'Проанализируй последние письма и выдели главное.' },
            { label: 'Найти время в календаре', prompt: 'Найди в моем календаре свободный слот на 1 час на этой неделе.' },
            { label: 'Создать напоминание', prompt: 'Напомни мне подготовить отчет к концу недели.' },
            { label: 'Последние таблицы', prompt: 'Найди все таблицы, которые я недавно открывал.' }
        ];

        const actionsHtml = welcomeActions.map(action => {
            const payload = JSON.stringify({ prompt: action.prompt });
            return `
                <button class="welcome-prompt-button p-3 sm:p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-all text-left font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600" data-action="welcome_prompt" data-payload='${payload}'>
                    ${action.label}
                </button>
            `;
        }).join('');
        
        container.innerHTML = `
            <div class="max-w-4xl w-full">
                ${connectionStatusHtml}
                <h2 class="text-3xl font-bold mt-6 mb-4">Чем могу помочь?</h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 justify-center items-center gap-3">
                    ${actionsHtml}
                </div>
            </div>
        `;
    }

    return container;
}