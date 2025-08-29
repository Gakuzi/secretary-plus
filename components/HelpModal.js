import { QuestionMarkCircleIcon, CodeIcon, AlertTriangleIcon, SettingsIcon, TelegramIcon } from './icons/Icons.js';
import { getSettings } from '../utils/storage.js';
import { SUPABASE_CONFIG } from '../config.js';

// --- EMBEDDED CONTENT ---

const README_CONTENT = `
### 🚀 Основные функции
- **🧠 Интеллектуальный ассистент:** Распознает естественный язык для выполнения сложных задач.
- **☁️ Облачная синхронизация:** Хранит ваши контакты и файлы в Supabase для быстрого доступа и интеграции между сервисами.
- **🗣️ Мультимодальный ввод:** Общайтесь с помощью текста, голоса или изображений.
- **📅 Интеграция с Google:** Управляйте Google Календарем, Контактами и Диском прямо из чата.
- **🃏 Интерактивные карточки:** Получайте результаты в виде наглядных карточек с действиями.
- **🔒 Безопасность:** Ваши данные защищены с помощью аутентификации Supabase и политик безопасности на уровне строк (RLS).
`;

// A simple markdown to HTML converter, duplicated for use in this component.
function markdownToHTML(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')     // Italic
        .replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-700 text-sm rounded px-1 py-0.5">$1</code>') // Inline code
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 dark:text-blue-400 hover:underline">$1</a>') // Link
        .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>') // h3
        .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>') // h2
        .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>') // h1
        .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>') // li
        .replace(/\n/g, '<br>'); // Newlines
}


export function createHelpModal({ onClose, settings, analyzeErrorFn, onRelaunchWizard, onLaunchDbWizard, onLaunchProxyWizard, initialTab = 'about' }) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4';
    
    modalOverlay.innerHTML = `
        <div class="bg-white dark:bg-gray-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-lg shadow-xl" id="help-content">
            <header class="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <h2 class="text-xl sm:text-2xl font-bold flex items-center gap-2">${QuestionMarkCircleIcon} Центр Помощи</h2>
                <button id="close-help" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" aria-label="Закрыть помощь">&times;</button>
            </header>
            
            <main class="flex-1 flex flex-col sm:flex-row overflow-hidden bg-gray-50 dark:bg-gray-900/70">
                <!-- Mobile Tabs -->
                <nav class="sm:hidden flex-shrink-0 border-b border-gray-200 dark:border-gray-700 p-2 flex items-center justify-around gap-1 text-xs bg-white dark:bg-gray-800">
                    <a href="#about" class="settings-tab-button text-center flex-1" data-tab="about">О приложении</a>
                    <a href="#instructions" class="settings-tab-button text-center flex-1" data-tab="instructions">Инструкции</a>
                    <a href="#error-analysis" class="settings-tab-button text-center flex-1" data-tab="error-analysis">Анализ</a>
                    <a href="#tools" class="settings-tab-button text-center flex-1" data-tab="tools">Инструменты</a>
                    <a href="#contact" class="settings-tab-button text-center flex-1" data-tab="contact">Связь</a>
                </nav>
                <!-- Desktop Sidebar -->
                <aside class="hidden sm:flex w-52 border-r border-gray-200 dark:border-gray-700 p-4 flex-shrink-0 bg-white dark:bg-gray-800">
                    <nav class="flex flex-col space-y-2 w-full">
                        <a href="#about" class="settings-tab-button text-left" data-tab="about">О приложении</a>
                        <a href="#instructions" class="settings-tab-button text-left" data-tab="instructions">Инструкции</a>
                        <a href="#error-analysis" class="settings-tab-button active text-left" data-tab="error-analysis">Анализ ошибок</a>
                        <a href="#tools" class="settings-tab-button text-left" data-tab="tools">Инструменты</a>
                        <a href="#contact" class="settings-tab-button text-left" data-tab="contact">Связь с автором</a>
                    </nav>
                </aside>
                <div class="flex-1 p-4 sm:p-6 overflow-y-auto" id="help-tabs-content">
                    
                    <!-- About Tab -->
                     <div id="tab-about" class="settings-tab-content hidden prose prose-invert max-w-none text-gray-700 dark:text-gray-300">
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Что такое "Секретарь+"?</h2>
                        <p>
                           **Секретарь+** — это интеллектуальный веб-ассистент, созданный для централизации и управления вашей цифровой продуктивностью. Используя мощь Gemini от Google и облачную платформу Supabase, приложение предоставляет единый разговорный интерфейс для взаимодействия с вашими календарями, контактами, документами и другими сервисами.
                        </p>
                        ${markdownToHTML(README_CONTENT)}
                    </div>

                    <!-- Error Analysis Tab -->
                    <div id="tab-error-analysis" class="settings-tab-content space-y-6">
                        <div class="p-4 bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-200">Диагностика с помощью ИИ</h3>
                            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">Столкнулись с проблемой? Вставьте полное сообщение об ошибке в поле ниже, и ассистент проанализирует её, предложив решение.</p>
                            <div class="space-y-2">
                                <label for="error-input-area" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Сообщение об ошибке:</label>
                                <textarea id="error-input-area" class="w-full h-32 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-mono text-sm" placeholder="Например: Could not find the 'created_time' column of 'files' in the schema cache"></textarea>
                            </div>
                            <div id="error-validation-message" class="text-red-500 text-sm mt-2 h-5"></div>
                            <button id="analyze-error-button" class="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-md font-semibold transition-colors">
                                Проанализировать
                            </button>
                        </div>
                        <div id="error-analysis-result" class="p-4 bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700" style="display: none;">
                            <!-- AI analysis result will be displayed here -->
                        </div>
                    </div>

                    <!-- Instructions Tab -->
                    <div id="tab-instructions" class="settings-tab-content hidden space-y-6">
                        <div class="p-4 bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                             <h3 class="text-lg font-semibold">Настройка базы данных и синхронизации</h3>
                             <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">Для работы облачной синхронизации и автоматического обновления схемы БД необходим "Управляющий воркер". Наш мастер поможет вам его настроить.</p>
                             <button data-action="launch-db-wizard" class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold transition-colors">
                                ${Icons.DatabaseIcon}
                                <span>Запустить мастер настройки БД</span>
                            </button>
                        </div>
                        <div class="p-4 bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                             <h3 class="text-lg font-semibold">Настройка Прокси-воркера</h3>
                             <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">Прокси-воркер нужен для обхода региональных ограничений Gemini API. Этот мастер поможет вам создать и настроить его в Cloudflare.</p>
                             <button data-action="launch-proxy-wizard" class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold transition-colors">
                                ${Icons.CodeIcon}
                                <span>Запустить мастер настройки Прокси</span>
                            </button>
                        </div>
                    </div>

                    <!-- Tools Tab -->
                    <div id="tab-tools" class="settings-tab-content hidden space-y-6">
                         <div class="p-4 bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-200">Мастер настройки базы данных</h3>
                             <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">
                                Запустите интерактивный мастер для пошаговой настройки "Управляющего воркера", который необходим для безопасного обновления схемы вашей базы данных.
                            </p>
                             <button data-action="launch-db-wizard" class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold transition-colors">
                                ${Icons.SettingsIcon}
                                <span>Запустить мастер настройки БД</span>
                            </button>
                        </div>
                         <div class="p-4 bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-200">Сброс и повторная настройка</h3>
                            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">
                                Если вы хотите начать настройку с самого начала или считаете, что допустили ошибку, вы можете перезапустить мастер.
                            </p>
                            <div class="text-sm p-3 rounded-md bg-yellow-100/50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300 flex items-start gap-3">
                                <div class="w-5 h-5 flex-shrink-0 mt-0.5">${AlertTriangleIcon}</div>
                                <div>
                                    <p class="font-bold">Внимание:</p>
                                    <p>Это действие удалит все ваши текущие настройки, сохраненные в браузере (включая API ключи). Настройки, синхронизированные с Supabase, останутся без изменений.</p>
                                </div>
                            </div>
                            <button id="relaunch-wizard-button" class="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold transition-colors">
                                Перезапустить Мастер Настройки
                            </button>
                        </div>
                    </div>
                    
                    <!-- Contact Tab -->
                    <div id="tab-contact" class="settings-tab-content hidden space-y-6">
                        <div class="p-4 bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-200">Обратная связь</h3>
                            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">Если у вас есть вопросы, предложения или вы столкнулись с ошибкой, которую не удалось решить, вы можете связаться с автором напрямую.</p>
                            <a href="https://t.me/eklimov" target="_blank" class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-md font-semibold transition-colors">
                                ${TelegramIcon.replace('fill="currentColor"', 'fill="white"')}
                                <span>Написать в Telegram</span>
                            </a>
                             <p class="text-xs text-gray-500 mt-4 text-center">
                                Автор: Климов Евгений
                            </p>
                        </div>
                    </div>


                </div>
            </main>
        </div>
    `;

    const handleAction = (e) => {
        const relaunchButton = e.target.closest('#relaunch-wizard-button');
         if (relaunchButton) {
            onRelaunchWizard();
            return;
         }

        const launchDbWizardButton = e.target.closest('[data-action="launch-db-wizard"]');
        if (launchDbWizardButton) {
            onLaunchDbWizard();
            return;
        }

        const launchProxyWizardButton = e.target.closest('[data-action="launch-proxy-wizard"]');
        if (launchProxyWizardButton) {
            onLaunchProxyWizard();
            return;
        }

        const analyzeButton = e.target.closest('#analyze-error-button');
        if (analyzeButton) {
            const textarea = modalOverlay.querySelector('#error-input-area');
            const validationMsg = modalOverlay.querySelector('#error-validation-message');
            const resultContainer = modalOverlay.querySelector('#error-analysis-result');
            const errorText = textarea.value.trim();

            if (!errorText) {
                validationMsg.textContent = 'Пожалуйста, вставьте сообщение об ошибке.';
                return;
            }
            validationMsg.textContent = '';
            analyzeButton.disabled = true;
            analyzeButton.innerHTML = `<div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div> <span>Анализ...</span>`;
            resultContainer.style.display = 'block';
            resultContainer.innerHTML = `<div class="flex items-center justify-center h-48"><div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;
            
            analyzeErrorFn(errorText).then(analysis => {
                resultContainer.innerHTML = `<div class="prose prose-invert max-w-none text-gray-700 dark:text-gray-300">${markdownToHTML(analysis)}</div>`;
            }).catch(err => {
                resultContainer.innerHTML = `<p class="text-red-400">Не удалось выполнить анализ: ${err.message}</p>`;
            }).finally(() => {
                analyzeButton.disabled = false;
                analyzeButton.textContent = 'Проанализировать';
            });
        }
    };
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay || e.target.closest('#close-help')) {
            onClose();
        }

        const tabButton = e.target.closest('.settings-tab-button');
        if (tabButton) {
            e.preventDefault();
            const tabId = tabButton.dataset.tab;

            modalOverlay.querySelectorAll('.settings-tab-button').forEach(btn => btn.classList.remove('active'));
            modalOverlay.querySelectorAll(`.settings-tab-button[data-tab="${tabId}"]`).forEach(btn => btn.classList.add('active'));

            modalOverlay.querySelectorAll('.settings-tab-content').forEach(content => {
                content.classList.toggle('hidden', content.id !== `tab-${tabId}`);
            });
        }

        handleAction(e);
    });

    const activateInitialTab = () => {
        modalOverlay.querySelectorAll('.settings-tab-button').forEach(btn => btn.classList.remove('active'));
        modalOverlay.querySelectorAll('.settings-tab-content').forEach(content => content.classList.add('hidden'));

        modalOverlay.querySelectorAll(`.settings-tab-button[data-tab="${initialTab}"]`).forEach(btn => btn.classList.add('active'));
        const initialTabContent = modalOverlay.querySelector(`#tab-${initialTab}`);
        if (initialTabContent) {
            initialTabContent.classList.remove('hidden');
        }
    };

    activateInitialTab();
    return modalOverlay;
}