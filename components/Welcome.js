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
            
        const contactExampleHtml = isSupabaseEnabled
            ? `
                <div class="bg-gray-800 p-4 rounded-lg">
                    <h3 class="font-semibold mb-1">👥 Найти контакт</h3>
                    <p class="text-gray-400">"Какой email у Ивана Петрова?"</p>
                </div>
            `
            : '';

        container.innerHTML = `
            <div class="max-w-2xl w-full">
                ${connectionStatusHtml}
                <h2 class="text-3xl font-bold mt-6 mb-2">Чем могу помочь?</h2>
                <p class="text-gray-400 mb-6">Напишите, что вы хотите сделать, или воспользуйтесь примерами ниже.</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left text-sm">
                    <div class="bg-gray-800 p-4 rounded-lg">
                        <h3 class="font-semibold mb-1">📅 Создать встречу</h3>
                        <p class="text-gray-400">"Созвон с командой завтра в 15:00 по проекту Альфа"</p>
                    </div>
                    <div class="bg-gray-800 p-4 rounded-lg">
                        <h3 class="font-semibold mb-1">📄 Найти документ</h3>
                        <p class="text-gray-400">"Найди презентацию по итогам квартала"</p>
                    </div>
                    ${contactExampleHtml}
                    <div class="bg-gray-800 p-4 rounded-lg">
                        <h3 class="font-semibold mb-1">📝 Создать документ</h3>
                        <p class="text-gray-400">"Создай документ 'План работ на май'"</p>
                    </div>
                </div>
            </div>
        `;
    }

    return container;
}