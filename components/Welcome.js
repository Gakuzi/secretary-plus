export function createWelcomeScreen() {
    const container = document.createElement('div');
    container.className = 'flex flex-col items-center justify-center h-full text-center p-8 welcome-screen-container';
    container.innerHTML = `
        <div class="max-w-md">
            <h2 class="text-3xl font-bold mb-2">Добро пожаловать в Секретарь+</h2>
            <p class="text-gray-400 mb-6">Ваш интеллектуальный помощник для управления задачами, встречами и документами. Просто напишите, что вы хотите сделать.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left text-sm">
                <div class="bg-gray-800 p-4 rounded-lg">
                    <h3 class="font-semibold mb-1">📅 Создать встречу</h3>
                    <p class="text-gray-400">"Созвон с командой завтра в 15:00 по проекту Альфа"</p>
                </div>
                <div class="bg-gray-800 p-4 rounded-lg">
                    <h3 class="font-semibold mb-1">📄 Найти документ</h3>
                    <p class="text-gray-400">"Найди презентацию по итогам квартала"</p>
                </div>
                <div class="bg-gray-800 p-4 rounded-lg">
                    <h3 class="font-semibold mb-1">👥 Найти контакт</h3>
                    <p class="text-gray-400">"Какой email у Ивана Петрова?"</p>
                </div>
                 <div class="bg-gray-800 p-4 rounded-lg">
                    <h3 class="font-semibold mb-1">📝 Создать документ</h3>
                    <p class="text-gray-400">"Создай документ 'План работ на май'"</p>
                </div>
            </div>
        </div>
    `;
    return container;
}