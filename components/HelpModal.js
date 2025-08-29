import { QuestionMarkCircleIcon, CodeIcon, AlertTriangleIcon, SettingsIcon } from './icons/Icons.js';
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

const PROXY_SETUP_MD = `
# Инструкция по настройке Прокси-воркера
Этот воркер необходим для обхода региональных ограничений Gemini API. Он будет перенаправлять ваши запросы и добавлять необходимые CORS-заголовки.
---
### Шаг 1: Создание Cloudflare Worker
1.  Войдите в [панель управления Cloudflare](https://dash.cloudflare.com/).
2.  В меню слева выберите **Workers & Pages**.
3.  Нажмите **Create application** > **Create Worker**.
4.  Дайте воркеру уникальное имя (например, \\\`my-gemini-proxy-123\\\`) и нажмите **Deploy**.
### Шаг 2: Редактирование кода воркера
1.  После развертывания нажмите **Configure Worker** (или **Edit code**).
2.  Удалите весь существующий код и вставьте следующий:
\\\`\\\`\\\`javascript
// Адрес API Gemini
const GEMINI_API_HOST = "generativelanguage.googleapis.com";

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // Перенаправляем все запросы на API Gemini
  url.host = GEMINI_API_HOST;

  // Создаем новый запрос с измененным URL
  const newRequest = new Request(url, request);
  
  // Отправляем запрос к API
  const response = await fetch(newRequest);

  // Создаем новый ответ, чтобы можно было добавить CORS-заголовки
  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Access-Control-Allow-Origin", "*");
  newResponse.headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  newResponse.headers.set("Access-Control-Allow-Headers", "*");

  return newResponse;
}
\\\`\\\`\\\`
3.  Нажмите **Save and Deploy**.
4.  **Скопируйте URL** этого воркера (например, \`https://my-gemini-proxy-123.workers.dev\`).
5.  Вставьте этот URL в соответствующее поле в **Менеджере прокси** в приложении "Секретарь+".
`;

const SUPABASE_SETUP_MD = `
# Настройка Supabase для "Секретарь+"
Это руководство поможет вам настроить проект Supabase, который будет использоваться как безопасная база данных и сервис аутентификации для приложения.
---
### Шаг 1: Создание проекта
1.  [Откройте панель управления Supabase](https://supabase.com/dashboard/projects) и нажмите **"New project"**.
2.  Придумайте имя проекта, сгенерируйте и сохраните надежный пароль от базы данных.
3.  Выберите регион и нажмите **"Create new project"**.
### Шаг 2: Выполнение SQL-скрипта
1.  В меню вашего нового проекта выберите **SQL Editor** (редактор SQL).
2.  Нажмите **"+ New query"**.
3.  Скопируйте и вставьте весь SQL-скрипт из файла \\\`SUPABASE_SETUP.md\\\` (находится в корне проекта) в редактор.
4.  Нажмите **"RUN"**. Этот скрипт создаст все необходимые таблицы и настроит политики безопасности.
`;


// A simple markdown to HTML converter, duplicated for use in this component.
function markdownToHTML(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')     // Italic
        .replace(/`([^`]+)`/g, '<code class="bg-gray-700 text-sm rounded px-1 py-0.5">$1</code>') // Inline code
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">$1</a>') // Link
        .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>') // h3
        .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>') // h2
        .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>') // h1
        .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>') // li
        .replace(/\n/g, '<br>'); // Newlines
}


function createGuideFromMarkdown(markdown) {
    const settings = getSettings();
    const supabaseUrl = settings.isSupabaseEnabled ? settings.supabaseUrl || SUPABASE_CONFIG.url : '';
    const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : '';

    const parts = markdown.split('---');
    let partIndex = 0;
    const finalHtml = parts.map(part => {
        let inCodeBlock = false;
        let codeLang = '';
        let codeContent = '';
        let partHtml = '<div class="space-y-4">';
        
        part.trim().split('\n').forEach(line => {
            if (line.startsWith('```')) {
                if (inCodeBlock) {
                    const isManagementWorker = codeContent.includes('const PROJECT_REF = \'YOUR_PROJECT_REF\'');
                    let interactiveSection = '';
                    if (isManagementWorker) {
                         interactiveSection = `
                            <div class="p-3 bg-gray-900 border-t border-gray-700 text-sm">
                                <label for="project-ref-input-${partIndex}" class="font-semibold">Ваш Project ID:</label>
                                <input type="text" id="project-ref-input-${partIndex}" data-target-code-id="code-block-${partIndex}" class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1 font-mono text-sm" value="${projectRef}" placeholder="вставьте сюда ваш ID проекта">
                                <p class="text-xs text-gray-500 mt-1">ID был автоматически определен из ваших настроек Supabase.</p>
                            </div>
                         `;
                    }
                    // Replace placeholder in the initial render if value is available
                    const initialCode = projectRef ? codeContent.replace('YOUR_PROJECT_REF', projectRef) : codeContent;

                    partHtml += `
                        <div class="guide-code-block" data-block-id="code-block-${partIndex}">
                            <div class="flex justify-between items-center bg-gray-900 px-4 py-2 border-b border-gray-700 text-xs text-gray-400">
                                <span>${codeLang.toUpperCase()}</span>
                                <button class="copy-code-button" data-target-id="code-block-${partIndex}">Копировать</button>
                            </div>
                            <pre><code id="code-block-${partIndex}" data-original-code="${encodeURIComponent(codeContent.trim())}">${initialCode.trim()}</code></pre>
                             ${interactiveSection}
                        </div>`;
                    inCodeBlock = false;
                    codeContent = '';
                    partIndex++;
                } else {
                    inCodeBlock = true;
                    codeLang = line.substring(3).trim();
                }
            } else if (inCodeBlock) {
                codeContent += line + '\n';
            } else if (line.startsWith('# ')) {
                partHtml += `<h2 class="text-2xl font-bold border-b border-gray-700 pb-2">${line.substring(2)}</h2>`;
            } else if (line.startsWith('### ')) {
                 partHtml += `<h3 class="text-xl font-semibold mt-4">${line.substring(4)}</h3>`;
            } else if (line.trim().length > 0) {
                const processedLine = line
                 .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">$1</a>')
                 .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                 .replace(/`([^`]+)`/g, '<code class="bg-gray-700 text-sm rounded px-1 py-0.5">$1</code>');
                partHtml += `<p class="text-gray-300">${processedLine}</p>`;
            }
        });

        partHtml += '</div>';
        return partHtml;
    }).join('<hr class="my-8 border-gray-700">');

    return `<div class="prose prose-invert max-w-none">${finalHtml}</div>`;
}

export function createHelpModal({ onClose, settings, analyzeErrorFn, onRelaunchWizard, onLaunchDbWizard, initialTab = 'about' }) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4';
    
    modalOverlay.innerHTML = `
        <div class="bg-gray-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-lg shadow-xl" id="help-content">
            <header class="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                <h2 class="text-xl sm:text-2xl font-bold flex items-center gap-2">${QuestionMarkCircleIcon} Центр Помощи</h2>
                <button id="close-help" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Закрыть помощь">&times;</button>
            </header>
            
            <main class="flex-1 flex flex-col sm:flex-row overflow-hidden">
                <!-- Mobile Tabs -->
                <nav class="sm:hidden flex-shrink-0 border-b border-gray-700 p-2 flex items-center justify-around gap-1 text-xs">
                    <a href="#about" class="settings-tab-button text-center flex-1" data-tab="about">О приложении</a>
                    <a href="#instructions" class="settings-tab-button text-center flex-1" data-tab="instructions">Инструкции</a>
                    <a href="#error-analysis" class="settings-tab-button text-center flex-1" data-tab="error-analysis">Анализ</a>
                    <a href="#tools" class="settings-tab-button text-center flex-1" data-tab="tools">Инструменты</a>
                    <a href="#contact" class="settings-tab-button text-center flex-1" data-tab="contact">Связь</a>
                </nav>
                <!-- Desktop Sidebar -->
                <aside class="hidden sm:flex w-52 border-r border-gray-700 p-4 flex-shrink-0">
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
                     <div id="tab-about" class="settings-tab-content hidden prose prose-invert max-w-none">
                        <h2 class="text-2xl font-bold">Что такое "Секретарь+"?</h2>
                        <p class="text-gray-300">
                           **Секретарь+** — это интеллектуальный веб-ассистент, созданный для централизации и управления вашей цифровой продуктивностью. Используя мощь Gemini от Google и облачную платформу Supabase, приложение предоставляет единый разговорный интерфейс для взаимодействия с вашими календарями, контактами, документами и другими сервисами.
                        </p>
                        ${markdownToHTML(README_CONTENT)}
                    </div>

                    <!-- Error Analysis Tab -->
                    <div id="tab-error-analysis" class="settings-tab-content space-y-6">
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                            <h3 class="text-lg font-semibold text-gray-200">Диагностика с помощью ИИ</h3>
                            <p class="text-sm text-gray-400 mt-1 mb-4">Столкнулись с проблемой? Вставьте полное сообщение об ошибке в поле ниже, и ассистент проанализирует её, предложив решение.</p>
                            <div class="space-y-2">
                                <label for="error-input-area" class="block text-sm font-medium text-gray-300">Сообщение об ошибке:</label>
                                <textarea id="error-input-area" class="w-full h-32 bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-mono text-sm" placeholder="Например: Could not find the 'created_time' column of 'files' in the schema cache"></textarea>
                            </div>
                            <div id="error-validation-message" class="text-red-400 text-sm mt-2 h-5"></div>
                            <button id="analyze-error-button" class="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-md font-semibold transition-colors">
                                Проанализировать
                            </button>
                        </div>
                        <div id="error-analysis-result" class="p-4 bg-gray-900/50 rounded-lg border border-gray-700" style="display: none;">
                            <!-- AI analysis result will be displayed here -->
                        </div>
                    </div>

                    <!-- Instructions Tab -->
                    <div id="tab-instructions" class="settings-tab-content hidden"></div>

                    <!-- Tools Tab -->
                    <div id="tab-tools" class="settings-tab-content hidden space-y-6">
                         <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                            <h3 class="text-lg font-semibold text-gray-200">Мастер настройки базы данных</h3>
                             <p class="text-sm text-gray-400 mt-1 mb-4">
                                Запустите интерактивный мастер для пошаговой настройки "Управляющего воркера", который необходим для безопасного обновления схемы вашей базы данных.
                            </p>
                             <button data-action="launch-db-wizard" class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md font-semibold transition-colors">
                                ${Icons.SettingsIcon}
                                <span>Запустить мастер настройки БД</span>
                            </button>
                        </div>
                         <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                            <h3 class="text-lg font-semibold text-gray-200">Сброс и повторная настройка</h3>
                            <p class="text-sm text-gray-400 mt-1 mb-4">
                                Если вы хотите начать настройку с самого начала или считаете, что допустили ошибку, вы можете перезапустить мастер.
                            </p>
                            <div class="text-sm p-3 rounded-md bg-yellow-900/30 border border-yellow-700 text-yellow-300 flex items-start gap-3">
                                <div class="w-5 h-5 flex-shrink-0 mt-0.5">${AlertTriangleIcon}</div>
                                <div>
                                    <p class="font-bold">Внимание:</p>
                                    <p>Это действие удалит все ваши текущие настройки, сохраненные в браузере (включая API ключи). Настройки, синхронизированные с Supabase, останутся без изменений.</p>
                                </div>
                            </div>
                            <button id="relaunch-wizard-button" class="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold transition-colors">
                                Перезапустить Мастер Настройки
                            </button>
                        </div>
                    </div>
                    
                    <!-- Contact Tab -->
                    <div id="tab-contact" class="settings-tab-content hidden space-y-6">
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                            <h3 class="text-lg font-semibold text-gray-200">Обратная связь</h3>
                            <p class="text-sm text-gray-400 mt-1 mb-4">Если у вас есть вопросы, предложения или вы столкнулись с ошибкой, которую не удалось решить, вы можете связаться с автором напрямую.</p>
                            <a href="https://t.me/eklimov" target="_blank" class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 rounded-md font-semibold transition-colors">
                                ${Icons.TelegramIcon.replace('fill="currentColor"', 'fill="white"')}
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

    // --- Tab Loading ---
    const loadInstructions = () => {
        const guideContainer = modalOverlay.querySelector('#tab-instructions');
        if (guideContainer.innerHTML !== '') return; // Already loaded

        const combinedInstructions = `${SUPABASE_SETUP_MD}\n\n<br/><hr class="my-8 border-gray-700"><br/>\n\n${PROXY_SETUP_MD}`;
        guideContainer.innerHTML = createGuideFromMarkdown(combinedInstructions);
    };

    // --- Event Listeners ---
    modalOverlay.addEventListener('input', (e) => {
        const projectRefInput = e.target.closest('input[data-target-code-id]');
        if (projectRefInput) {
            const codeId = projectRefInput.dataset.targetCodeId;
            const codeElement = modalOverlay.querySelector(`#${codeId}`);
            if (codeElement) {
                const originalCode = decodeURIComponent(codeElement.dataset.originalCode);
                codeElement.textContent = originalCode.replace(/YOUR_PROJECT_REF/g, projectRefInput.value.trim() || 'YOUR_PROJECT_REF');
            }
        }
    });

    const handleAction = (e) => {
        const target = e.target.closest('[data-action]');
        if (target) {
            // Handle actions here if needed in the future
        }
        
        const copyButton = e.target.closest('.copy-code-button');
        if (copyButton) {
            const targetId = copyButton.dataset.targetId;
            const codeElement = modalOverlay.querySelector(`#${targetId}`);
            if (codeElement) {
                navigator.clipboard.writeText(codeElement.textContent).then(() => {
                    copyButton.textContent = 'Скопировано!';
                    setTimeout(() => { copyButton.textContent = 'Копировать'; }, 2000);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                    alert('Не удалось скопировать текст.');
                });
            }
        }

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
                resultContainer.innerHTML = `<div class="prose prose-invert max-w-none text-gray-300">${markdownToHTML(analysis)}</div>`;
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
            
            if (tabId === 'instructions') {
                loadInstructions();
            }
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
         if (initialTab === 'instructions') {
            loadInstructions();
        }
    };

    activateInitialTab();
    return modalOverlay;
}