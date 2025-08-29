import * as Icons from './icons/Icons.js';

const WIZARD_STEPS = [
    { id: 'intro', title: 'Введение' },
    { id: 'create-worker', title: 'Создание Воркера' },
    { id: 'deploy-code', title: 'Код и Развертывание' },
    { id: 'save-url', title: 'Сохранение URL' },
];

const PROXY_WORKER_CODE = `
// The host for the Gemini API
const GEMINI_API_HOST = "generativelanguage.googleapis.com";

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

/**
 * Handles CORS preflight requests.
 * @param {Request} request
 * @returns {Response}
 */
function handleOptions(request) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-client, x-goog-api-key', // Important headers for Gemini SDK
    };
    return new Response(null, { headers });
}

/**
 * Fetches requests and adds CORS headers.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleRequest(request) {
    if (request.method === 'OPTIONS') {
        return handleOptions(request);
    }

    const url = new URL(request.url);
    url.host = GEMINI_API_HOST;

    const modifiedRequest = new Request(url, request);

    try {
        const response = await fetch(modifiedRequest);
        const modifiedResponse = new Response(response.body, response);
        
        // Set CORS headers on the response
        modifiedResponse.headers.set("Access-Control-Allow-Origin", "*");
        modifiedResponse.headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
        
        return modifiedResponse;

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
`.trim();


export function createProxySetupWizard({ onClose }) {
    const wizardElement = document.createElement('div');
    wizardElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4';

    let state = {
        currentStep: 0,
        workerUrl: '',
    };
    
    const render = () => {
        const stepConfig = WIZARD_STEPS[state.currentStep];
        
        let contentHtml = '';

        switch (stepConfig.id) {
            case 'intro':
                contentHtml = `
                    <p class="mb-4">Этот мастер поможет вам настроить **Прокси-воркер** — сервис для обхода региональных ограничений Gemini API.</p>
                    <p class="mb-4">Он будет безопасно перенаправлять ваши запросы к Google.</p>
                     <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-sm space-y-2">
                        <p><strong>Что вам понадобится:</strong></p>
                        <ul class="list-disc list-inside text-slate-600 dark:text-slate-400">
                            <li>Аккаунт <a href="https://cloudflare.com" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">Cloudflare</a> (бесплатного тарифа достаточно).</li>
                        </ul>
                    </div>
                `;
                break;

            case 'create-worker':
                contentHtml = `
                    <p class="mb-4">Войдите в ваш аккаунт Cloudflare и создайте новый Worker.</p>
                    <ol class="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-300">
                        <li>В <a href="https://dash.cloudflare.com/" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">панели Cloudflare</a>, перейдите в <strong>Workers & Pages</strong>.</li>
                        <li>Нажмите <strong>Create application</strong>, затем <strong>Create Worker</strong>.</li>
                        <li>Придумайте уникальное имя для воркера (например, \`my-gemini-proxy-123\`) и нажмите <strong>Deploy</strong>.</li>
                    </ol>
                `;
                break;
            
            case 'deploy-code':
                contentHtml = `
                    <p class="mb-4">Теперь перейдите в редактор кода вашего нового воркера (<strong>Edit code</strong>), удалите всё содержимое и вставьте код ниже.</p>
                    <div class="rounded-md border border-slate-200 dark:border-slate-700">
                        <div class="flex justify-between items-center bg-slate-100 dark:bg-slate-900 px-4 py-2 text-xs text-slate-500 dark:text-slate-400 rounded-t-md">
                            <span>JAVASCRIPT (CLOUDFLARE WORKER)</span>
                            <button class="text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-2 py-1 rounded-md transition-colors" data-action="copy-code">Копировать</button>
                        </div>
                        <pre class="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-b-md overflow-x-auto"><code id="worker-code-block" class="text-sm whitespace-pre font-mono">${PROXY_WORKER_CODE}</code></pre>
                    </div>
                     <p class="mt-4">После вставки кода нажмите <strong>Save and Deploy</strong> в интерфейсе Cloudflare. После этого вы можете перейти к следующему шагу.</p>
                `;
                break;

            case 'save-url':
                contentHtml = `
                    <p class="mb-4">Отлично! Теперь скопируйте URL вашего развернутого воркера и вставьте его в поле ниже.</p>
                    <p class="text-xs text-slate-500 mb-4">Этот URL будет добавлен в ваш список прокси в основных настройках приложения.</p>
                    <div class="mb-4">
                        <label for="worker-url-input" class="font-semibold text-sm">URL Прокси-воркера:</label>
                        <input type="url" id="worker-url-input" class="flex-1 w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-sm" placeholder="https://my-gemini-proxy.example.workers.dev" value="${state.workerUrl}">
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400">После сохранения вы можете управлять этим прокси через **Настройки &rarr; Прокси**.</p>
                `;
                break;
        }

        const footerHtml = `
            <div class="flex-1">
                ${state.currentStep > 0 ? `<button data-action="back" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Назад</button>` : ''}
            </div>
            ${state.currentStep < WIZARD_STEPS.length - 1 ? 
                `<button data-action="next" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Далее</button>` : 
                `<button data-action="finish" class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold disabled:bg-slate-400 dark:disabled:bg-slate-500" ${!state.workerUrl ? 'disabled' : ''}>Добавить и закрыть</button>`
            }
        `;

        wizardElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg shadow-2xl w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col relative animate-fadeIn">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold">Мастер настройки Прокси-воркера</h2>
                        <p class="text-sm text-slate-500 dark:text-slate-400">Шаг ${state.currentStep + 1} / ${WIZARD_STEPS.length}: ${stepConfig.title}</p>
                    </div>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">&times;</button>
                </header>
                <main class="flex-1 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">${contentHtml}</main>
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
                if (state.currentStep > 0) state.currentStep--;
                render();
                break;
            case 'next':
                if (state.currentStep < WIZARD_STEPS.length - 1) state.currentStep++;
                render();
                break;
            case 'finish':
                // This wizard doesn't save settings directly, it would call a function
                // to add the URL to the proxy list in Supabase.
                // For simplicity now, we just close. A full implementation would need the Supabase service.
                alert(`Прокси "${state.workerUrl}" должен быть добавлен вручную в Настройках > Прокси.`);
                onClose();
                break;
            case 'copy-code':
                const codeElement = wizardElement.querySelector('#worker-code-block');
                navigator.clipboard.writeText(codeElement.textContent).then(() => {
                    target.textContent = 'Скопировано!';
                    setTimeout(() => { target.textContent = 'Копировать'; }, 2000);
                });
                break;
        }
    };
    
    wizardElement.addEventListener('click', handleAction);
    wizardElement.addEventListener('input', (e) => {
        const workerUrlInput = e.target.closest('#worker-url-input');
        if (workerUrlInput) {
            state.workerUrl = workerUrlInput.value.trim();
            const finishButton = wizardElement.querySelector('[data-action="finish"]');
            if(finishButton) finishButton.disabled = !state.workerUrl;
        }
    });

    render();
    return wizardElement;
}