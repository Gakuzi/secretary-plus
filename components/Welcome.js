import { GoogleIcon, SupabaseIcon, CalendarIcon, FileIcon, UsersIcon, ChartBarIcon, CheckSquareIcon } from './icons/Icons.js';

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
            
        const contactActionHtml = isSupabaseEnabled
            ? `
                <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Найди контакт Иван Петров"}'>
                    <div class="welcome-action-icon bg-green-500/20 text-green-400">${UsersIcon}</div>
                    <div>
                        <h3 class="font-semibold text-gray-100">Найти контакт</h3>
                        <p class="text-sm text-gray-400">Быстрый поиск по базе контактов</p>
                    </div>
                </div>
            `
            : `
                 <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Найди контакт Иван Петров"}'>
                    <div class="welcome-action-icon bg-green-500/20 text-green-400">${UsersIcon}</div>
                    <div>
                        <h3 class="font-semibold text-gray-100">Найти контакт</h3>
                        <p class="text-sm text-gray-400">Прямой поиск в Google Contacts</p>
                    </div>
                </div>
            `;

        container.innerHTML = `
            <div class="max-w-3xl w-full">
                ${connectionStatusHtml}
                <h2 class="text-3xl font-bold mt-6 mb-4">Чем могу помочь?</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                    <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Что у меня сегодня в календаре?"}'>
                        <div class="welcome-action-icon bg-blue-500/20 text-blue-400">${CalendarIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Расписание на сегодня</h3>
                            <p class="text-sm text-gray-400">Показать все события из календаря</p>
                        </div>
                    </div>
                    <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Покажи мои задачи"}'>
                        <div class="welcome-action-icon bg-yellow-500/20 text-yellow-400">${CheckSquareIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Мои задачи</h3>
                            <p class="text-sm text-gray-400">Показать список активных дел</p>
                        </div>
                    </div>
                    ${contactActionHtml}
                    <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Найди документ с планом проекта"}'>
                        <div class="welcome-action-icon bg-purple-500/20 text-purple-400">${FileIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Найти документ</h3>
                            <p class="text-sm text-gray-400">Найти файлы на Диске или в базе</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    return container;
}