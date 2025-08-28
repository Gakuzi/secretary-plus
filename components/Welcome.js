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
            
        // By defining actions as a JavaScript array and using JSON.stringify,
        // we avoid complex and error-prone manual string escaping in the template literal.
        const welcomeActions = [
            { 
                prompt: "Что у меня сегодня в календаре?", 
                icon: CalendarIcon, 
                iconClass: 'bg-blue-500/20 text-blue-400',
                title: 'Расписание на сегодня', 
                desc: 'Показать все события из календаря' 
            },
            { 
                prompt: "Создай встречу с Иваном Петровым завтра в 11:00", 
                icon: CalendarIcon, 
                iconClass: 'bg-blue-500/20 text-blue-400',
                title: 'Создать встречу', 
                desc: 'Быстро запланировать новое событие' 
            },
            { 
                prompt: "Покажи мои задачи", 
                icon: CheckSquareIcon, 
                iconClass: 'bg-yellow-500/20 text-yellow-400',
                title: 'Мои задачи', 
                desc: 'Показать список активных дел' 
            },
            { 
                prompt: "Найди контакт Иван Петров", 
                icon: UsersIcon, 
                iconClass: 'bg-green-500/20 text-green-400',
                title: 'Найти контакт', 
                desc: 'Поиск по имени, фамилии или email' 
            },
            { 
                prompt: "Позвони Ивану Петрову", 
                icon: UsersIcon, 
                iconClass: 'bg-green-500/20 text-green-400',
                title: 'Позвонить контакту', 
                desc: 'Инициировать звонок или письмо' 
            },
            { 
                prompt: "Найди документ с планом проекта", 
                icon: FileIcon, 
                iconClass: 'bg-purple-500/20 text-purple-400',
                title: 'Найти документ', 
                desc: 'Найти файлы на Диске или в базе' 
            },
            { 
                prompt: "Создай заметку: Идеи для отпуска. 1. Поездка в горы. 2. Отдых на море.", 
                icon: FileIcon, 
                iconClass: 'bg-orange-500/20 text-orange-400',
                title: 'Создать заметку', 
                desc: 'Быстро сохранить идею или мысль' 
            },
            { 
                prompt: "Какие у меня последние 3 письма?", 
                icon: EmailIcon, 
                iconClass: 'bg-red-500/20 text-red-400',
                title: 'Последние письма', 
                desc: 'Просмотреть входящие в Gmail' 
            },
            { 
                prompt: 'Создай документ с названием "Итоги встречи" и добавь туда краткое резюме нашего последнего разговора', 
                icon: FileIcon, 
                iconClass: 'bg-purple-500/20 text-purple-400',
                title: 'Создать документ', 
                desc: 'Использовать контекст чата для GDocs' 
            },
        ];

        const actionsHtml = welcomeActions.map(action => {
            const payload = JSON.stringify({ prompt: action.prompt });
            return `
                <div class="welcome-action-card" data-action="welcome_prompt" data-payload='${payload}'>
                    <div class="welcome-action-icon ${action.iconClass}">${action.icon}</div>
                    <div>
                        <h3 class="font-semibold text-gray-100">${action.title}</h3>
                        <p class="text-sm text-gray-400">${action.desc}</p>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = `
            <div class="max-w-4xl w-full">
                ${connectionStatusHtml}
                <h2 class="text-3xl font-bold mt-6 mb-4">Чем могу помочь?</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                    ${actionsHtml}
                </div>
            </div>
        `;
    }

    return container;
}
