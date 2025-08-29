import * as Icons from './icons/Icons.js';

const WIZARD_STEPS = [
    { id: 'intro', title: 'Введение' },
    { id: 'get-token', title: 'Токен Supabase' },
    { id: 'create-worker', title: 'Создание Воркера' },
    { id: 'deploy-code', title: 'Код Воркера' },
    { id: 'test-save', title: 'Тест и Сохранение' },
];

const MANAGEMENT_WORKER_CODE = `
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    if (request.method === 'OPTIONS') {
        return handleOptions(request);
    }
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // IMPORTANT: Replace with YOUR project reference ID
    const PROJECT_REF = 'YOUR_PROJECT_REF';
    const SUPABASE_API_URL = \`https://api.supabase.com/v1/projects/\${PROJECT_REF}/query\`;

    try {
        const { query } = await request.json();
        if (!query) {
            return new Response(JSON.stringify({ error: '"query" parameter is missing.' }), { status: 400, headers: corsHeaders() });
        }

        const response = await fetch(SUPABASE_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': \`Bearer \${SUPABASE_MANAGEMENT_TOKEN}\`, // Token from Environment Variables
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: query }),
        });

        const responseText = await response.text();
        const headers = corsHeaders();
        for (let [key, value] of response.headers) {
            if (key.toLowerCase().startsWith('content-')) {
                headers[key] = value;
            }
        }

        if (!response.ok) {
            console.error('Supabase API Error:', responseText);
            return new Response(responseText, { status: response.status, headers });
        }
        
        return new Response(responseText, { status: response.status, headers });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders() });
    }
}

function handleOptions(request) {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

function corsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}
`.trim();

// Simple markdown helper for this component
function markdownToHTML(text) {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}


export function createDbSetupWizard({ settings, supabaseConfig, onClose, onSave }) {
    const wizardElement = document.createElement('div');
    wizardElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4';

    let state = {
        currentStep: 0,
        projectRef: new URL(supabaseConfig.url).hostname.split('.')[0] || '',
        workerUrl: settings.managementWorkerUrl || '',
        testStatus: 'untested', // 'untested', 'testing', 'ok', 'error'
        testMessage: '',
    };
    
    const render = () => {
        const stepConfig = WIZARD_STEPS[state.currentStep];
        
        let contentHtml = '';
        let isNextDisabled = false;

        switch (stepConfig.id) {
            case 'intro':
                contentHtml = markdownToHTML(`
                    <p class="mb-4">Этот мастер поможет вам настроить **"Управляющий воркер"** — безопасный сервис для автоматического обновления схемы вашей базы данных Supabase.</p>
                    <p class="mb-4">Это необходимо для добавления новых функций в приложение без риска потери данных.</p>
                    <div class="p-3 bg-gray-900 border border-gray-700 rounded-md text-sm space-y-2">
                        <p><strong>Что вам понадобится:</strong></p>
                        <ul class="list-disc list-inside text-gray-400">
                            <li>Аккаунт <a href="https://cloudflare.com" target="_blank" class="text-blue-400 hover:underline">Cloudflare</a> (бесплатного тарифа достаточно).</li>
                            <li>Токен доступа к вашему аккаунту Supabase.</li>
                        </ul>
                    </div>
                `);
                break;

            case 'get-token':
                contentHtml = `
                    <p class="mb-4">Сначала необходимо сгенерировать токен доступа (Access Token) для вашего аккаунта Supabase.</p>
                    <ol class="list-decimal list-inside space-y-2 text-gray-300 mb-4">
                        <li>Откройте <a href="https://supabase.com/dashboard/account/tokens" target="_blank" class="text-blue-400 hover:underline">страницу токенов Supabase</a> в новой вкладке.</li>
                        <li>Нажмите <strong>Generate New Token</strong>.</li>
                        <li>Дайте ему имя (например, \`secretary-plus-manager\`) и нажмите <strong>Generate token</strong>.</li>
                        <li class="font-semibold text-yellow-300">Сразу скопируйте токен. Он больше не будет показан.</li>
                    </ol>
                    <p>Этот токен понадобится на следующем шаге. Не закрывайте его и ни с кем не делитесь.</p>
                `;
                break;
            
            case 'create-worker':
                contentHtml = `
                    <p class="mb-4">Теперь создайте новый Cloudflare Worker и безопасно сохраните в него ваш токен.</p>
                    <ol class="list-decimal list-inside space-y-2 text-gray-300">
                        <li>В <a href="https://dash.cloudflare.com/" target="_blank" class="text-blue-400 hover:underline">панели Cloudflare</a>, перейдите в <strong>Workers & Pages</strong> и создайте новый воркер.</li>
                        <li>Перейдите в настройки созданного воркера: <strong>Settings &rarr; Variables</strong>.</li>
                        <li>В разделе **Environment Variables**, нажмите **Add variable**.</li>
                        <li>Заполните поля:
                            <ul class="list-disc list-inside ml-6 my-2 p-3 bg-gray-900 rounded-md border border-gray-600 font-mono text-sm">
                                <li>Variable name: <code class="text-green-400">SUPABASE_MANAGEMENT_TOKEN</code></li>
                                <li>Value: <em>(вставьте ваш токен из Supabase)</em></li>
                            </ul>
                        </li>
                        <li>Нажмите на иконку замка, чтобы <strong>Encrypt</strong> (зашифровать) переменную, и сохраните.</li>
                    </ol>
                `;
                break;
            
            case 'deploy-code':
                const codeWithRef = MANAGEMENT_WORKER_CODE.replace('YOUR_PROJECT_REF', state.projectRef || 'YOUR_PROJECT_REF');
                contentHtml = `
                    <p class="mb-4">Вернитесь в редактор кода вашего воркера, удалите всё содержимое и вставьте код ниже.</p>
                     <div class="mb-4">
                        <label for="project-ref-input" class="font-semibold text-sm">Ваш Supabase Project ID:</label>
                        <input type="text" id="project-ref-input" class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1 font-mono text-sm" value="${state.projectRef}" placeholder="abcdefghijklmnopqrst">
                        <p class="text-xs text-gray-500 mt-1">ID был автоматически определен из ваших настроек. При необходимости исправьте его.</p>
                    </div>
                    <div class="rounded-md border border-gray-700">
                        <div class="flex justify-between items-center bg-gray-900 px-4 py-2 text-xs text-gray-400 rounded-t-md">
                            <span>JAVASCRIPT (CLOUDFLARE WORKER)</span>
                            <button class="text-xs font-semibold bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded-md transition-colors" data-action="copy-code">Копировать</button>
                        </div>
                        <pre class="p-4 bg-gray-900/50 rounded-b-md overflow-x-auto"><code id="worker-code-block" class="text-sm whitespace-pre font-mono">${codeWithRef}</code></pre>
                    </div>
                     <p class="mt-4">После вставки кода нажмите <strong>Save and Deploy</strong> в интерфейсе Cloudflare.</p>
                `;
                isNextDisabled = !state.projectRef;
                break;

            case 'test-save':
                let statusHtml = '';
                if(state.testStatus === 'testing') {
                    statusHtml = `<div class="flex items-center gap-2 text-yellow-400"><div class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div><span>Тестирование...</span></div>`;
                } else if (state.testStatus === 'ok') {
                    statusHtml = `<div class="flex items-center gap-2 text-green-400 font-semibold">✓ ${state.testMessage}</div>`;
                } else if (state.testStatus === 'error') {
                    statusHtml = `<div class="flex flex-col text-red-400"><span class="font-semibold">✗ Ошибка</span><span class="text-xs">${state.testMessage}</span></div>`;
                }

                contentHtml = `
                    <p class="mb-4">Скопируйте URL вашего развернутого воркера и вставьте его в поле ниже.</p>
                    <div class="mb-4">
                        <label for="worker-url-input" class="font-semibold text-sm">URL Управляющего Воркера:</label>
                        <div class="flex items-stretch gap-2 mt-1">
                            <input type="url" id="worker-url-input" class="flex-1 bg-gray-700 border border-gray-600 rounded-md p-2 font-mono text-sm" placeholder="https://my-manager.example.workers.dev" value="${state.workerUrl}">
                            <button data-action="test-worker" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md font-semibold text-sm" ${state.testStatus === 'testing' ? 'disabled' : ''}>Тест</button>
                        </div>
                    </div>
                    <div id="test-status-container" class="min-h-[40px] p-3 bg-gray-900/50 rounded-md flex items-center justify-center text-sm">
                        ${statusHtml || '<span class="text-gray-500">Ожидание теста...</span>'}
                    </div>
                `;
                break;
        }

        const footerHtml = `
            <div class="flex-1">
                ${state.currentStep > 0 ? `<button data-action="back" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold">Назад</button>` : ''}
            </div>
            ${state.currentStep < WIZARD_STEPS.length - 1 ? 
                `<button data-action="next" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed" ${isNextDisabled ? 'disabled' : ''}>Далее</button>` : 
                `<button data-action="finish" class="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed" ${state.testStatus !== 'ok' ? 'disabled' : ''}>Сохранить и закрыть</button>`
            }
        `;

        wizardElement.innerHTML = `
            <div class="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col relative animate-fadeIn">
                <header class="p-4 border-b border-gray-700 flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold">Мастер настройки базы данных</h2>
                        <p class="text-sm text-gray-400">Шаг ${state.currentStep + 1} / ${WIZARD_STEPS.length}: ${stepConfig.title}</p>
                    </div>
                    <button data-action="close" class="p-2 rounded-full hover:bg-gray-700">&times;</button>
                </header>
                <main class="flex-1 p-6 overflow-y-auto">${contentHtml}</main>
                <footer class="p-4 border-t border-gray-700 flex justify-between items-center">${footerHtml}</footer>
            </div>
        `;
    };
    
    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;

        // Collect inputs before changing step
        const projectRefInput = wizardElement.querySelector('#project-ref-input');
        const workerUrlInput = wizardElement.querySelector('#worker-url-input');
        if (projectRefInput) state.projectRef = projectRefInput.value.trim();
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
                const newSettings = { ...settings, managementWorkerUrl: state.workerUrl };
                onSave(newSettings);
                break;
            case 'copy-code':
                const codeElement = wizardElement.querySelector('#worker-code-block');
                navigator.clipboard.writeText(codeElement.textContent).then(() => {
                    target.textContent = 'Скопировано!';
                    setTimeout(() => { target.textContent = 'Копировать'; }, 2000);
                });
                break;
            case 'test-worker':
                state.testStatus = 'testing';
                state.testMessage = '';
                render();
                
                try {
                    if (!state.workerUrl) throw new Error('URL воркера не указан.');
                    const response = await fetch(state.workerUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: 'SELECT 1;' }),
                    });
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Воркер вернул ошибку ${response.status}: ${errorText}`);
                    }
                    const data = await response.json();
                    if (!Array.isArray(data) || data[0]['?column?'] !== 1) {
                         // Check for a common error from Supabase API when token is missing/wrong in the worker
                        if (JSON.stringify(data).includes("Authentication failed")) {
                             throw new Error('Ошибка аутентификации. Проверьте токен, сохраненный в переменных окружения воркера.');
                        }
                        throw new Error('Воркер вернул неожиданный ответ.');
                    }
                    state.testStatus = 'ok';
                    state.testMessage = 'Проверка пройдена успешно!';
                } catch (error) {
                    console.error('Worker test failed:', error);
                    state.testStatus = 'error';
                    state.testMessage = error.message;
                }
                render();
                break;
        }
    };
    
    wizardElement.addEventListener('click', handleAction);
    wizardElement.addEventListener('input', (e) => {
        const projectRefInput = e.target.closest('#project-ref-input');
        if (projectRefInput) {
            state.projectRef = projectRefInput.value.trim();
            const codeBlock = wizardElement.querySelector('#worker-code-block');
            if (codeBlock) {
                 codeBlock.textContent = MANAGEMENT_WORKER_CODE.replace('YOUR_PROJECT_REF', state.projectRef || 'YOUR_PROJECT_REF');
            }
            // Re-render footer to enable/disable button
            const footerEl = wizardElement.querySelector('footer');
            const isNextDisabled = !state.projectRef;
             footerEl.querySelector('[data-action="next"]').disabled = isNextDisabled;
        }
        const workerUrlInput = e.target.closest('#worker-url-input');
        if(workerUrlInput) {
            state.workerUrl = workerUrlInput.value.trim();
        }
    });

    render();
    return wizardElement;
}