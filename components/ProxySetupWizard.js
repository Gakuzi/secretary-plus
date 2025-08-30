import * as Icons from './icons/Icons.js';
import { testProxyConnection } from '../services/geminiService.js';
import { getSettings } from '../utils/storage.js';

const WIZARD_STEPS = [
    { id: 'intro', title: 'Введение' },
    { id: 'create-worker', title: 'Создание Воркера' },
    { id: 'deploy-code', title: 'Код и Развертывание' },
    { id: 'save-url', title: 'Тест и Сохранение' },
];

const PROXY_WORKER_CODE = `
// The host for the Gemini API
const GEMINI_API_HOST = "generativelanguage.googleapis.com";

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
        return handleOptions(request);
    }

    const url = new URL(request.url);
    url.host = GEMINI_API_HOST;

    const modifiedRequest = new Request(url, request);

    try {
        const response = await fetch(modifiedRequest);
        const modifiedResponse = new Response(response.body, response);
        
        // Add CORS headers
        modifiedResponse.headers.set("Access-Control-Allow-Origin", "*");
        modifiedResponse.headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
        modifiedResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, x-goog-api-client, x-goog-api-key");

        return modifiedResponse;

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500,
            headers: { 
                'Content-Type': 'application/json', 
                'Access-Control-Allow-Origin': '*' 
            } 
        });
    }
}

function handleOptions(request) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-client, x-goog-api-key',
    };
    return new Response(null, { headers });
}
`.trim();


export function createProxySetupWizard({ supabaseService, onClose }) {
    const wizardElement = document.createElement('div');
    wizardElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4';

    let state = {
        currentStep: 0,
        workerUrl: '',
        isTesting: false,
        testStatus: 'idle', // idle, ok, error
        testResult: '',
    };
    
    const render = () => {
        const stepConfig = WIZARD_STEPS[state.currentStep];
        
        const stepperHtml = WIZARD_STEPS.map((step, index) => {
            const isCompleted = index < state.currentStep;
            const isActive = index === state.currentStep;
            let statusClass = 'bg-slate-300 dark:bg-slate-600';
            if (isCompleted) statusClass = 'bg-blue-600';
            if (isActive) statusClass = 'bg-blue-600 ring-4 ring-blue-500/30';
            return `
                <div class="flex items-center">
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full ${statusClass} flex items-center justify-center text-white font-bold text-sm">
                            ${isCompleted ? '✓' : index + 1}
                        </div>
                        <span class="ml-3 font-medium ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}">${step.title}</span>
                    </div>
                    ${index < WIZARD_STEPS.length - 1 ? '<div class="flex-auto border-t-2 border-slate-300 dark:border-slate-600 mx-4"></div>' : ''}
                </div>
            `;
        }).join('');

        let contentHtml = '';
        switch (stepConfig.id) {
            case 'intro':
                contentHtml = `
                    <h3 class="text-xl font-semibold mb-2">Настройка Прокси-воркера</h3>
                    <p class="text-slate-600 dark:text-slate-400 mb-4">Этот мастер поможет вам настроить прокси-сервер в Cloudflare для обхода региональных ограничений Gemini API. Это займет не более 5 минут.</p>
                     <div class="p-4 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm">
                        <p><strong>Что вам понадобится:</strong></p>
                        <ul class="list-disc list-inside text-slate-600 dark:text-slate-400 mt-2">
                            <li>Аккаунт <a href="https://cloudflare.com" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">Cloudflare</a> (бесплатного тарифа достаточно).</li>
                        </ul>
                    </div>
                `;
                break;
            case 'create-worker':
                contentHtml = `
                    <h3 class="text-xl font-semibold mb-2">Создание Воркера</h3>
                    <p class="text-slate-600 dark:text-slate-400 mb-4">Войдите в ваш аккаунт Cloudflare и создайте новый Worker.</p>
                    <ol class="list-decimal list-inside space-y-3 text-slate-700 dark:text-slate-300">
                        <li>В <a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">панели Cloudflare</a>, перейдите в <strong>Workers & Pages</strong>.</li>
                        <li>Нажмите <strong>Create application</strong>, затем <strong>Create Worker</strong>.</li>
                        <li>Придумайте уникальное имя для воркера (например, \`my-gemini-proxy-123\`) и нажмите <strong>Deploy</strong>.</li>
                    </ol>
                `;
                break;
            case 'deploy-code':
                 contentHtml = `
                    <h3 class="text-xl font-semibold mb-2">Развертывание кода</h3>
                    <p class="text-slate-600 dark:text-slate-400 mb-4">Перейдите в редактор кода (<strong>Edit code</strong>), удалите всё содержимое и вставьте код ниже. Он настроит безопасную переадресацию запросов.</p>
                    <div class="rounded-lg border border-slate-200 dark:border-slate-700">
                        <div class="flex justify-between items-center bg-slate-100 dark:bg-slate-900 px-4 py-2 text-xs text-slate-500 dark:text-slate-400 rounded-t-lg">
                            <span>JAVASCRIPT (CLOUDFLARE WORKER)</span>
                            <button class="text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-2 py-1 rounded-md transition-colors" data-action="copy-code">Копировать</button>
                        </div>
                        <pre class="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-b-lg overflow-x-auto max-h-60"><code id="worker-code-block" class="text-sm whitespace-pre font-mono">${PROXY_WORKER_CODE}</code></pre>
                    </div>
                     <p class="mt-4 text-slate-600 dark:text-slate-400">После вставки кода нажмите <strong>Save and Deploy</strong> в интерфейсе Cloudflare.</p>
                `;
                break;
            case 'save-url':
                let testStatusHtml;
                switch(state.testStatus) {
                    case 'testing': testStatusHtml = `<div class="text-yellow-500 flex items-center gap-2"><div class="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>Тестирование...</div>`; break;
                    case 'ok': testStatusHtml = `<div class="text-green-500 font-semibold">✓ ${state.testResult}</div>`; break;
                    case 'error': testStatusHtml = `<div class="text-red-500 font-semibold">✗ ${state.testResult}</div>`; break;
                    default: testStatusHtml = ``;
                }
                contentHtml = `
                    <h3 class="text-xl font-semibold mb-2">Тест и Сохранение</h3>
                    <p class="text-slate-600 dark:text-slate-400 mb-4">Скопируйте URL вашего развернутого воркера (например, <code>https://my-proxy.user.workers.dev</code>), вставьте его и проверьте соединение.</p>
                    <div class="flex items-start gap-2">
                        <div class="flex-1">
                            <label for="worker-url-input" class="text-sm font-medium sr-only">URL Прокси-воркера:</label>
                            <input type="url" id="worker-url-input" class="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg p-3 font-mono text-sm" placeholder="https://..." value="${state.workerUrl}">
                        </div>
                        <button data-action="test-proxy" class="px-4 py-3 bg-slate-500 hover:bg-slate-600 text-white rounded-lg font-semibold h-full" ${state.isTesting || !state.workerUrl ? 'disabled' : ''}>Проверить</button>
                    </div>
                    <div class="mt-2 h-6 text-sm">${testStatusHtml}</div>
                `;
                break;
        }

        const footerHtml = `
            <div class="flex-1">
                ${state.currentStep > 0 ? `<button data-action="back" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Назад</button>` : ''}
            </div>
            ${state.currentStep < WIZARD_STEPS.length - 1 ? 
                `<button data-action="next" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Далее</button>` : 
                `<button data-action="finish" class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold disabled:bg-slate-400 dark:disabled:bg-slate-500" ${state.testStatus !== 'ok' ? 'disabled' : ''}>Завершить и сохранить</button>`
            }
        `;

        wizardElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] relative animate-fadeIn">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h2 class="text-xl font-bold">Мастер настройки Прокси</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">&times;</button>
                </header>
                <div class="p-6 border-b border-slate-200 dark:border-slate-700">
                    <div class="flex justify-between">${stepperHtml}</div>
                </div>
                <main class="flex-1 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 min-h-[200px]">${contentHtml}</main>
                <footer class="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">${footerHtml}</footer>
            </div>
        `;
    };
    
    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;

        const workerUrlInput = wizardElement.querySelector('#worker-url-input');
        if (workerUrlInput) state.workerUrl = workerUrlInput.value.trim();

        switch (action) {
            case 'close': onClose(); break;
            case 'back': 
                if (state.currentStep > 0) {
                    state.testStatus = 'idle'; // Reset test status when going back
                    state.currentStep--;
                }
                render();
                break;
            case 'next':
                if (state.currentStep < WIZARD_STEPS.length - 1) state.currentStep++;
                render();
                break;
            case 'finish':
                if (state.testStatus === 'ok' && state.workerUrl) {
                    try {
                        await supabaseService.addProxy({ url: state.workerUrl, geolocation: 'Cloudflare', is_active: true });
                        alert(`Прокси "${state.workerUrl}" успешно добавлен и активирован.`);
                        onClose();
                    } catch (err) {
                        alert(`Не удалось сохранить прокси: ${err.message}`);
                    }
                }
                break;
            case 'copy-code':
                const codeElement = wizardElement.querySelector('#worker-code-block');
                navigator.clipboard.writeText(codeElement.textContent).then(() => {
                    target.textContent = 'Скопировано!';
                    setTimeout(() => { target.textContent = 'Копировать'; }, 2000);
                });
                break;
            case 'test-proxy':
                state.isTesting = true;
                state.testStatus = 'testing';
                render();
                try {
                    const settings = getSettings();
                    if (!settings.geminiApiKey) throw new Error("Ключ Gemini API не найден в настройках.");
                    const result = await testProxyConnection({ proxyUrl: state.workerUrl, apiKey: settings.geminiApiKey });
                    if (result.status === 'ok') {
                        state.testStatus = 'ok';
                        state.testResult = `Соединение успешно (${result.speed} мс)`;
                    } else {
                        throw new Error(result.message);
                    }
                } catch(err) {
                    state.testStatus = 'error';
                    state.testResult = `Ошибка: ${err.message}`;
                } finally {
                    state.isTesting = false;
                    render();
                }
                break;
        }
    };
    
    wizardElement.addEventListener('click', handleAction);
    wizardElement.addEventListener('input', (e) => {
        const workerUrlInput = e.target.closest('#worker-url-input');
        if (workerUrlInput) {
            state.workerUrl = workerUrlInput.value.trim();
            const testButton = wizardElement.querySelector('[data-action="test-proxy"]');
            if(testButton) testButton.disabled = !state.workerUrl;
        }
    });

    render();
    return wizardElement;
}