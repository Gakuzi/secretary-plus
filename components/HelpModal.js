import { QuestionMarkCircleIcon, CodeIcon } from './icons/Icons.js';

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

export function createHelpModal(onClose, settings, analyzeErrorFn) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
    
    modalOverlay.innerHTML = `
        <div class="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col m-4" id="help-content">
            <header class="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                <h2 class="text-2xl font-bold flex items-center gap-2">${QuestionMarkCircleIcon} Центр Помощи</h2>
                <button id="close-help" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Закрыть помощь">&times;</button>
            </header>
            
            <main class="flex-1 flex overflow-hidden">
                <aside class="w-52 border-r border-gray-700 p-4">
                    <nav class="flex flex-col space-y-2">
                        <a href="#error-analysis" class="settings-tab-button active text-left" data-tab="error-analysis">Анализ ошибок</a>
                        <a href="#setup-guide" class="settings-tab-button" data-tab="setup-guide">Инструкция</a>
                        <a href="#dev-tools" class="settings-tab-button" data-tab="dev-tools">Инструменты</a>
                    </nav>
                </aside>
                <div class="flex-1 p-6 overflow-y-auto" id="help-tabs-content">
                    
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

                    <!-- Setup Guide Tab -->
                    <div id="tab-setup-guide" class="settings-tab-content hidden space-y-6">
                         <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                            <h3 class="text-lg font-semibold text-gray-200">Инструкция по настройке</h3>
                            <p class="text-sm text-gray-400 mt-1 mb-4">Для первоначальной настройки приложения и получения всех необходимых ключей (Google, Supabase, Gemini) воспользуйтесь нашим интерактивным руководством.</p>
                             <a href="./setup-guide.html" target="_blank" rel="noopener noreferrer" class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md font-semibold transition-colors">
                                Открыть инструкцию
                             </a>
                        </div>
                    </div>

                    <!-- Dev Tools Tab -->
                    <div id="tab-dev-tools" class="settings-tab-content hidden space-y-6">
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                            <h3 class="text-lg font-semibold text-gray-200">Инструменты разработчика</h3>
                            <p class="text-sm text-gray-400 mt-1 mb-4">Быстрый доступ для редактирования и отладки ассистента в Google AI Studio.</p>
                            <button id="edit-service-button" class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-md font-semibold transition-colors">
                                ${CodeIcon}
                                <span>Редактировать в AI Studio</span>
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;

    // --- Event Listeners ---
    modalOverlay.querySelector('#close-help').addEventListener('click', onClose);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) onClose();
    });

    // Tab switching logic
    const tabButtons = modalOverlay.querySelectorAll('.settings-tab-button');
    const tabContents = modalOverlay.querySelectorAll('.settings-tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = e.target.dataset.tab;

            tabButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');

            tabContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== `tab-${tabId}`);
            });
        });
    });

    // Error analysis logic
    const analyzeButton = modalOverlay.querySelector('#analyze-error-button');
    const errorInput = modalOverlay.querySelector('#error-input-area');
    const resultContainer = modalOverlay.querySelector('#error-analysis-result');
    const validationMessage = modalOverlay.querySelector('#error-validation-message');
    
    analyzeButton.addEventListener('click', async () => {
        validationMessage.textContent = ''; // Clear previous messages
        const errorMessage = errorInput.value.trim();

        if (!errorMessage) {
            validationMessage.textContent = "Пожалуйста, вставьте сообщение об ошибке.";
            return;
        }
        if (!settings.geminiApiKey) {
            validationMessage.textContent = "Ключ Gemini API не настроен. Добавьте его в настройках.";
            return;
        }

        resultContainer.style.display = 'block';
        resultContainer.innerHTML = `
            <div class="flex items-center justify-center h-48">
                <div class="loading-dots">
                    <div class="dot"></div> <div class="dot"></div> <div class="dot"></div>
                </div>
            </div>
        `;
        analyzeButton.disabled = true;
        analyzeButton.textContent = "Анализирую...";

        try {
            const analysis = await analyzeErrorFn(errorMessage);
            resultContainer.innerHTML = `<div class="prose prose-invert max-w-none">${markdownToHTML(analysis)}</div>`;
        } catch (error) {
            resultContainer.innerHTML = `<p class="text-red-400">Не удалось выполнить анализ: ${error.message}</p>`;
        } finally {
            analyzeButton.disabled = false;
            analyzeButton.textContent = "Проанализировать";
        }
    });

    // Dev tools button
    const editServiceButton = modalOverlay.querySelector('#edit-service-button');
    if (editServiceButton) {
        editServiceButton.addEventListener('click', () => {
            window.open('https://aistudio.google.com/app/apps/drive/1-YFIo56NWOtYuQYpZUWiPcMY323lJPuK?showAssistant=true&showPreview=true', '_blank');
        });
    }

    return modalOverlay;
}