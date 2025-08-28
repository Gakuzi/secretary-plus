import { GoogleIcon, SupabaseIcon, CalendarIcon, FileIcon, UsersIcon, ChartBarIcon, CheckSquareIcon, EmailIcon } from './icons/Icons.js';

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
            
        container.innerHTML = `
            <div class="max-w-4xl w-full">
                ${connectionStatusHtml}
                <h2 class="text-3xl font-bold mt-6 mb-4">Чем могу помочь?</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                    <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Что у меня сегодня в календаре?"}'>
                        <div class="welcome-action-icon bg-blue-500/20 text-blue-400">${CalendarIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Расписание на сегодня</h3>
                            <p class="text-sm text-gray-400">Показать все события из календаря</p>
                        </div>
                    </div>
                    <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Создай встречу с Иваном Петровым завтра в 11:00"}'>
                        <div class="welcome-action-icon bg-blue-500/20 text-blue-400">${CalendarIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Создать встречу</h3>
                            <p class="text-sm text-gray-400">Быстро запланировать новое событие</p>
                        </div>
                    </div>
                    <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Покажи мои задачи"}'>
                        <div class="welcome-action-icon bg-yellow-500/20 text-yellow-400">${CheckSquareIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Мои задачи</h3>
                            <p class="text-sm text-gray-400">Показать список активных дел</p>
                        </div>
                    </div>
                     <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Найди контакт Иван Петров"}'>
                        <div class="welcome-action-icon bg-green-500/20 text-green-400">${UsersIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Найти контакт</h3>
                            <p class="text-sm text-gray-400">Поиск по имени, фамилии или email</p>
                        </div>
                    </div>
                    <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Позвони Ивану Петрову"}'>
                        <div class="welcome-action-icon bg-green-500/20 text-green-400">${UsersIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Позвонить контакту</h3>
                            <p class="text-sm text-gray-400">Инициировать звонок или письмо</p>
                        </div>
                    </div>
                    <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Найди документ с планом проекта"}'>
                        <div class="welcome-action-icon bg-purple-500/20 text-purple-400">${FileIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Найти документ</h3>
                            <p class="text-sm text-gray-400">Найти файлы на Диске или в базе</p>
                        </div>
                    </div>
                    <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Создай заметку: Идеи для отпуска. 1. Поездка в горы. 2. Отдых на море."}'>
                        <div class="welcome-action-icon bg-orange-500/20 text-orange-400">${FileIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Создать заметку</h3>
                            <p class="text-sm text-gray-400">Быстро сохранить идею или мысль</p>
                        </div>
                    </div>
                     <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Какие у меня последние 3 письма?"}'>
                        <div class="welcome-action-icon bg-red-500/20 text-red-400">${EmailIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Последние письма</h3>
                            <p class="text-sm text-gray-400">Просмотреть входящие в Gmail</p>
                        </div>
                    </div>
                     <div class="welcome-action-card" data-action="welcome_prompt" data-payload='{"prompt": "Создай документ с названием `Итоги встречи` и добавь туда краткое резюме нашего последнего разговора"}'>
                        <div class="welcome-action-icon bg-purple-500/20 text-purple-400">${FileIcon}</div>
                        <div>
                            <h3 class="font-semibold text-gray-100">Создать документ</h3>
                            <p class="text-sm text-gray-400">Использовать контекст чата для GDocs</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    return container;
}