import { GoogleIcon, FileIcon, CalendarIcon, UsersIcon, EmailIcon } from './icons/Icons.js';

export function createWelcomeScreen({ onLogin, onShowAbout }) {
    const container = document.createElement('div');
    container.className = 'h-full w-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 p-4 sm:p-8 overflow-hidden relative';

    const features = [
        { icon: CalendarIcon, text: 'Управление календарями' },
        { icon: EmailIcon, text: 'Анализ почты' },
        { icon: UsersIcon, text: 'Поиск по контактам' },
        { icon: FileIcon, text: 'Работа с документами' }
    ];

    container.innerHTML = `
        <div class="absolute inset-0 bg-grid-slate-300/[0.2] dark:bg-grid-slate-700/[0.2] [mask-image:linear-gradient(to_bottom,white_20%,transparent_100%)]"></div>
        
        <div class="relative z-10 flex flex-col items-center text-center max-w-3xl animate-fadeIn">
            <div id="welcome-logo-container" class="w-16 h-16 mb-4">
                <img src="https://cdn3.iconfinder.com/data/icons/user-icon-1/100/06-1User-512.png" alt="Логотип Секретарь+">
            </div>
            <h1 class="text-4xl sm:text-6xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                Секретарь+
            </h1>
            <p class="mt-4 text-lg sm:text-xl text-slate-600 dark:text-slate-300">
                Ваш интеллектуальный центр продуктивности.
            </p>

            <div class="my-8 flex flex-wrap justify-center gap-4 sm:gap-6">
                ${features.map(f => `
                    <div class="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                        <span class="w-5 h-5">${f.icon}</span>
                        <span>${f.text}</span>
                    </div>
                `).join('')}
            </div>

            <button id="login-button" class="flex items-center justify-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-full font-semibold text-white text-lg transition-transform hover:scale-105 shadow-lg">
                <span class="w-6 h-6">${GoogleIcon}</span>
                <span>Войти через Google</span>
            </button>
            
            <div class="mt-12 text-center text-xs text-slate-500 dark:text-slate-400">
                <p>Разработано: <a href="https://t.me/eklimov" target="_blank" rel="noopener noreferrer" class="font-semibold hover:underline">Климов Евгений</a></p>
                <button id="about-button" class="mt-1 font-semibold hover:underline">О приложении</button>
            </div>
        </div>
    `;

    container.querySelector('#login-button').addEventListener('click', onLogin);
    container.querySelector('#about-button').addEventListener('click', onShowAbout);

    return container;
}