import * as Icons from './icons/Icons.js';

const WIZARD_STEPS = [
    { id: 'intro', title: 'Введение' },
    { id: 'data-reset', title: 'Сброс данных' },
    { id: 'get-connection-string', title: 'Строка подключения' },
    { id: 'create-worker', title: 'Создание Воркера' },
    { id: 'deploy-code', title: 'Код Воркера' },
    { id: 'test-save', title: 'Тест и Сохранение' },
];

const MANAGEMENT_WORKER_CODE = `
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

// Standard CORS handling
function handleOptions(request) {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
    };
}

async function handleRequest(request) {
    if (request.method === 'OPTIONS') {
        return handleOptions(request);
    }
    if (request.method === 'GET') {
        return new Response(JSON.stringify({ status: 'ok' }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' }});
    }
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        // **FIX**: Dynamically import postgres.js inside the async handler.
        const { default: postgres } = await import('https://unpkg.com/postgres@3.4.4/esm/index.js');
        
        // DATABASE_URL is an Environment Variable in Cloudflare containing the full Postgres connection string.
        if (typeof DATABASE_URL === 'undefined') {
            throw new Error('DATABASE_URL secret is not defined in worker settings.');
        }

        const sql = postgres(DATABASE_URL, {
          ssl: 'require', // Supabase requires SSL
          max: 1,         // Use a single connection
          connect_timeout: 10,
        });

        const { query } = await request.json();
        if (!query) {
             return new Response(JSON.stringify({ error: '"query" parameter is missing.' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
        }

        const result = await sql.unsafe(query);
        await sql.end(); // Important: close the connection

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Worker Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }
}
`.trim();

const DATA_RESET_SQL = `
-- ВНИМАНИЕ: Этот скрипт удалит все данные из таблиц синхронизации!
-- Таблицы с настройками (user_settings, proxies, action_stats) затронуты не будут.
TRUNCATE 
    public.contacts, 
    public.files, 
    public.calendar_events, 
    public.tasks, 
    public.emails, 
    public.chat_memory
RESTART IDENTITY CASCADE;

-- Сообщение об успешном выполнении
SELECT 'Все таблицы данных синхронизации были успешно очищены.' as status;
`.trim();

// Simple markdown helper for this component
function markdownToHTML(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code class="bg-slate-200 dark:bg-slate-700 text-sm rounded px-1 py-0.5">$1</code>');
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
                    <p class="mb-4">Этот мастер поможет вам настроить **Управляющий воркер** — безопасный сервис для автоматического обновления схемы вашей базы данных Supabase.</p>
                    <p class="mb-2 text-sm text-yellow-600 dark:text-yellow-400">Мы перешли на новый, более надежный метод прямого подключения к БД, так как старый API Supabase работал нестабильно.</p>
                    <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-sm space-y-2">
                        <p><strong>Что вам понадобится:</strong></p>
                        <ul class="list-disc list-inside text-slate-600 dark:text-slate-400">
                            <li>Аккаунт <a href="https://cloudflare.com" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">Cloudflare</a> (бесплатного тарифа достаточно).</li>
                            <li>Строка подключения к вашей базе данных Supabase.</li>
                        </ul>
                    </div>
                `);
                break;

            case 'data-reset':
                contentHtml = `
                    <p class="mb-4">Если вы хотите начать синхронизацию с чистого листа, вы можете очистить все таблицы с данными.</p>
                     <div class="text-sm p-3 rounded-md bg-yellow-100/50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300 flex items-start gap-3 mb-4">
                        <div class="w-5 h-5 flex-shrink-0 mt-0.5">${Icons.AlertTriangleIcon}</div>
                        <div>
                            <p class="font-bold">Внимание:</p>
                            <p>Это действие **необратимо** удалит все ваши синхронизированные контакты, файлы, события и т.д. Ваши настройки приложения останутся.</p>
                        </div>
                    </div>
                    <p class="text-sm text-slate-600 dark:text-slate-400 mb-2">Чтобы выполнить сброс:</p>
                    <ol class="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-300">
                        <li>Нажмите "Копировать SQL-скрипт".</li>
                        <li>Откройте <a href="https://supabase.com/dashboard/project/${state.projectRef}/sql/new" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">SQL Редактор вашего проекта Supabase</a>.</li>
                        <li>Вставьте скрипт и нажмите **"RUN"**.</li>
                    </ol>
                     <button class="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-md font-semibold transition-colors" data-action="copy-reset-sql">
                        ${Icons.CodeIcon} Копировать SQL-скрипт для сброса
                    </button>
                    <p class="mt-4 text-center text-sm text-slate-500">Если вы не хотите сбрасывать данные, просто нажмите "Далее".</p>
                `;
                break;

            case 'get-connection-string':
                contentHtml = `
                    <p class="mb-4">Вам понадобится **строка подключения (Connection String)** к вашей базе данных.</p>
                    <ol class="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-300 mb-4">
                        <li>Откройте <a href="https://supabase.com/dashboard/project/${state.projectRef}/settings/database" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">настройки базы данных вашего проекта Supabase</a>.</li>
                        <li>Найдите раздел <strong>Connection string</strong>.</li>
                        <li>Выберите вкладку <strong>URI</strong>.</li>
                        <li class="font-semibold text-yellow-500 dark:text-yellow-300">Скопируйте строку. Она содержит ваш пароль от БД, поэтому храните ее в секрете.</li>
                    </ol>
                    <p>Эта строка понадобится на следующем шаге.</p>
                `;
                break;
            
            case 'create-worker':
                contentHtml = `
                    <p class="mb-4">Теперь создайте новый Cloudflare Worker и безопасно сохраните в него вашу строку подключения.</p>
                    <ol class="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-300">
                        <li>В <a href="https://dash.cloudflare.com/" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">панели Cloudflare</a>, перейдите в <strong>Workers & Pages</strong> и создайте новый воркер.</li>
                        <li>Перейдите в настройки созданного воркера: <strong>Settings &rarr; Variables</strong>.</li>
                        <li>В разделе **Environment Variables**, нажмите **Add variable**.</li>
                        <li>Заполните поля:
                            <ul class="list-disc list-inside ml-6 my-2 p-3 bg-slate-100 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-600 font-mono text-sm">
                                <li>Variable name: <code class="text-green-600 dark:text-green-400">DATABASE_URL</code></li>
                                <li>Value: <em>(вставьте вашу строку подключения из Supabase)</em></li>
                            </ul>
                        </li>
                        <li>Нажмите на иконку замка, чтобы <strong>Encrypt</strong> (зашифровать) переменную, и сохраните.</li>
                    </ol>
                `;
                break;
            
            case 'deploy-code':
                contentHtml = `
                    <p class="mb-4">Вернитесь в редактор кода вашего воркера, удалите всё содержимое и вставьте код ниже.</p>
                     <p class="text-xs text-slate-500 mb-4">Этот код использует библиотеку \`postgres.js\` для прямого и безопасного подключения к вашей базе данных.</p>
                    <div class="rounded-md border border-slate-200 dark:border-slate-700">
                        <div class="flex justify-between items-center bg-slate-100 dark:bg-slate-900 px-4 py-2 text-xs text-slate-500 dark:text-slate-400 rounded-t-md">
                            <span>JAVASCRIPT (CLOUDFLARE WORKER)</span>
                            <button class="text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-2 py-1 rounded-md transition-colors" data-action="copy-code">Копировать</button>
                        </div>
                        <pre class="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-b-md overflow-x-auto"><code id="worker-code-block" class="text-sm whitespace-pre font-mono">${MANAGEMENT_WORKER_CODE}</code></pre>
                    </div>
                     <p class="mt-4">После вставки кода нажмите <strong>Save and Deploy</strong> в интерфейсе Cloudflare.</p>
                `;
                break;

            case 'test-save':
                let statusHtml = '';
                if(state.testStatus === 'testing') {
                    statusHtml = `<div class="flex items-center gap-2 text-yellow-600 dark:text-yellow-400"><div class="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div><span>Тестирование...</span></div>`;
                } else if (state.testStatus === 'ok') {
                    statusHtml = `<div class="flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold">✓ ${state.testMessage}</div>`;
                } else if (state.testStatus === 'error') {
                    statusHtml = `<div class="flex flex-col text-red-600 dark:text-red-400"><span class="font-semibold">✗ Ошибка</span><span class="text-xs">${state.testMessage}</span></div>`;
                }

                contentHtml = `
                    <p class="mb-4">Скопируйте URL вашего развернутого воркера и вставьте его в поле ниже.</p>
                    <div class="mb-4">
                        <label for="worker-url-input" class="font-semibold text-sm">URL Управляющего Воркера:</label>
                        <div class="flex items-stretch gap-2 mt-1">
                            <input type="url" id="worker-url-input" class="flex-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-sm" placeholder="https://my-manager.example.workers.dev" value="${state.workerUrl}">
                            <button data-action="test-worker" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md font-semibold text-sm" ${state.testStatus === 'testing' ? 'disabled' : ''}>Тест</button>
                        </div>
                    </div>
                    <div id="test-status-container" class="min-h-[40px] p-3 bg-slate-100 dark:bg-slate-900/50 rounded-md flex items-center justify-center text-sm">
                        ${statusHtml || '<span class="text-slate-500">Ожидание теста...</span>'}
                    </div>
                `;
                isNextDisabled = state.testStatus !== 'ok';
                break;
        }

        const footerHtml = `
            <div class="flex-1">
                ${state.currentStep > 0 ? `<button data-action="back" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Назад</button>` : ''}
            </div>
            ${state.currentStep < WIZARD_STEPS.length - 1 ? 
                `<button data-action="next" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold disabled:bg-slate-400 dark:disabled:bg-slate-500 disabled:cursor-not-allowed" ${isNextDisabled ? 'disabled' : ''}>Далее</button>` : 
                `<button data-action="finish" class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold disabled:bg-slate-400 dark:disabled:bg-slate-500 disabled:cursor-not-allowed" ${isNextDisabled ? 'disabled' : ''}>Сохранить и закрыть</button>`
            }
        `;

        wizardElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg shadow-2xl w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col relative animate-fadeIn">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold">Мастер настройки базы данных</h2>
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

        // Collect inputs before changing step
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
            case 'copy-reset-sql':
                 navigator.clipboard.writeText(DATA_RESET_SQL).then(() => {
                    target.innerHTML = `✓ Скопировано!`;
                    setTimeout(() => { target.innerHTML = `${Icons.CodeIcon} Копировать SQL-скрипт для сброса`; }, 2000);
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
                    
                    const responseJson = await response.json();
                    
                    if (!response.ok) {
                        throw new Error(`Воркер вернул ошибку ${response.status}: ${responseJson.error || 'Неизвестная ошибка'}`);
                    }

                    if (!Array.isArray(responseJson)) {
                        throw new Error(`Воркер вернул неожиданный ответ. Проверьте код и переменную DATABASE_URL.`);
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
        const workerUrlInput = e.target.closest('#worker-url-input');
        if(workerUrlInput) {
            state.workerUrl = workerUrlInput.value.trim();
             const finishButton = wizardElement.querySelector('[data-action="finish"]');
            if (finishButton) {
                // The finish button is on the same step, but next is not.
                // We disable it here, but the main render() handles re-enabling on successful test.
                finishButton.disabled = true;
            }
        }
    });

    render();
    return wizardElement;
}