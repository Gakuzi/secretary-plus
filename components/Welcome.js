import { GoogleIcon, SupabaseIcon } from './icons/Icons.js';

export function createWelcomeScreen({ isGoogleConnected, isSupabaseEnabled }) {
    const container = document.createElement('div');
    container.className = 'flex flex-col items-center justify-center h-full text-center p-8 welcome-screen-container';

    if (!isGoogleConnected) {
        container.innerHTML = `
            <div class="max-w-md">
                <h2 class="text-3xl font-bold mb-2">Начните работу</h2>
                <p class="text-gray-400 mb-6">Для использования ассистента необходимо войти в аккаунт Google и предоставить необходимые разрешения.</p>
                <button id="open-settings-from-welcome" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors">
                    Перейти к настройкам и войти
                </button>
            </div>
        `;
    } else {
        const connectionStatusHtml = isSupabaseEnabled
            ? `
                <div class="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-sm">
                    <div class="w-5 h-5 text-green-400">${SupabaseIcon}</div>
                    <span class="font-medium text-gray-300">Подключено через <strong>Supabase</strong>. Доступен быстрый поиск.</span>
                </div>
            `
            : `
                <div class="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-sm">
                    <div class="w-5 h-5">${GoogleIcon}</div>
                    <span class="font-medium text-gray-300">Подключено напрямую к <strong>Google</strong>. Синхронизация недоступна.</span>
                </div>
            `;
            
        const welcomeActions = [
            { label: 'Расписание на сегодня', prompt: 'Покажи моё расписание на сегодня.' },
            { label: 'Задачи на эту неделю', prompt: 'Какие у меня задачи на эту неделю?' },
            { label: 'Последние 3 письма', prompt: 'Покажи последние 3 письма в моей почте.' },
            { label: 'Недавно измененные файлы', prompt: 'Найди документы, которые я недавно изменял.' },
            { label: 'Запланировать встречу', prompt: 'Помоги мне запланировать встречу с коллегой на завтра.' },
            { label: 'Создать быструю заметку', prompt: 'Создай быструю заметку о том, что нужно купить продукты.' }
        ];

        const actionsHtml = welcomeActions.map(action => {
            const payload = JSON.stringify({ prompt: action.prompt });
            return `
                <button class="welcome-prompt-button" data-action="welcome_prompt" data-payload='${payload}'>
                    ${action.label}
                </button>
            `;
        }).join('');
        
        container.innerHTML = `
            <div class="max-w-4xl w-full">
                ${connectionStatusHtml}
                <h2 class="text-3xl font-bold mt-6 mb-4">Чем могу помочь?</h2>
                <div class="flex flex-wrap justify-center items-center gap-3">
                    ${actionsHtml}
                </div>
            </div>
        `;
    }

    return container;
}