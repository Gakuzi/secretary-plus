import * as Icons from './icons/Icons.js';

export function createHelpModal({ onClose }) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn';
    
    modalOverlay.innerHTML = `
        <div class="bg-white dark:bg-slate-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-lg shadow-xl" id="help-content">
            <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <h2 class="text-xl sm:text-2xl font-bold flex items-center gap-2">${Icons.QuestionMarkCircleIcon} Центр Помощи</h2>
                <button id="close-help" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Закрыть помощь">&times;</button>
            </header>
            
            <main class="flex-1 p-6 overflow-y-auto">
                <div class="prose dark:prose-invert max-w-none">
                    <h3>🚀 Основные функции</h3>
                    <ul>
                        <li><strong>Интеллектуальный ассистент:</strong> Распознает естественный язык для выполнения сложных задач.</li>
                        <li><strong>Облачная синхронизация:</strong> Хранит ваши данные в Supabase для быстрого доступа и интеграции.</li>
                        <li><strong>Мультимодальный ввод:</strong> Общайтесь с помощью текста, голоса или изображений.</li>
                        <li><strong>Интеграция с Google:</strong> Управляйте Google Календарем, Контактами и Диском.</li>
                        <li><strong>Автоматическая отказоустойчивость:</strong> Система сама обходит региональные блокировки и решает проблемы с лимитами API, вам не нужно ничего настраивать.</li>
                    </ul>

                    <h3>🤔 Часто задаваемые вопросы</h3>
                    <p><strong>Нужно ли мне настраивать API ключи или прокси?</strong><br>
                    Нет. Вся сложная настройка выполняется на стороне администратора системы. Вам достаточно войти в свой аккаунт Google.</p>
                    
                    <p><strong>Мои данные в безопасности?</strong><br>
                    Да. Приложение использует политики безопасности на уровне строк (RLS) в Supabase, что гарантирует, что вы можете получить доступ только к своим собственным данным.</p>

                    <p><strong>Что делать, если что-то не работает?</strong><br>
                    Попробуйте перезагрузить страницу. Если проблема не исчезла, свяжитесь с администратором вашего экземпляра приложения.</p>
                </div>
            </main>
        </div>
    `;
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay || e.target.closest('#close-help')) {
            onClose();
        }
    });

    return modalOverlay;
}