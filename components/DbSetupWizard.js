




import * as Icons from './icons/Icons.js';
import { SupabaseService } from '../services/supabase/SupabaseService.js';
import { FULL_MIGRATION_SQL } from '../services/supabase/migrations.js';

const WIZARD_STEPS = [
    { id: 'intro', title: 'Введение' },
    { id: 'create-function', title: 'Создание Edge Function' },
    { id: 'deploy-code', title: 'Развертывание кода' },
    { id: 'set-secrets', title: 'Настройка секретов' },
    { id: 'test-and-save', title: 'Тест и сохранение' },
    { id: 'execute-sql', title: 'Выполнение миграции' },
];

const EDGE_FUNCTION_CODE = `
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.2/mod.js';

// Заголовки CORS для preflight и обычных запросов
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Обработка CORS preflight запросов
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // 1. Получаем секреты из переменных окружения
    const DATABASE_URL = Deno.env.get('DATABASE_URL');
    const ADMIN_SECRET_TOKEN = Deno.env.get('ADMIN_SECRET_TOKEN');

    if (!DATABASE_URL || !ADMIN_SECRET_TOKEN) {
      throw new Error('Database URL или Admin Token не установлены в секретах функции.');
    }

    // 2. Извлекаем SQL-запрос и токен из тела запроса
    const { sql: sqlQuery, admin_token: requestToken } = await req.json();

    // 3. Проверяем токен администратора
    if (requestToken !== ADMIN_SECRET_TOKEN) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Неверный токен.' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (!sqlQuery || typeof sqlQuery !== 'string') {
      return new Response(JSON.stringify({ error: 'Bad Request: "sql" параметр отсутствует или неверен.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 4. Выполняем SQL-запрос
    const sql = postgres(DATABASE_URL);
    // .unsafe() необходим для выполнения "сырой" SQL строки
    const result = await sql.unsafe(sqlQuery);
    await sql.end();

    // 5. Возвращаем результат
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
`.trim();

export function createDbSetupWizard({ settings, supabaseConfig, onClose, onSave }) {
    const wizardElement = document.createElement('div');
    wizardElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4';

    let state = {
        currentStep: 0,
        isLoading: false,
        logOutput: 'Ожидание...',
        functionUrl: settings.managementWorkerUrl || '',
        adminToken: settings.adminSecretToken || '',
        testStatus: 'idle', // idle, testing, ok, error
        sqlExecutionSuccess: false,
    };

    const render = () => {
        const stepConfig = WIZARD_STEPS[state.currentStep];
        let contentHtml = '';

        switch(stepConfig.id) {
            case 'intro':
                contentHtml = `
                    <p class="mb-4">Добро пожаловать в мастер настройки базы данных. Он поможет вам создать **Supabase Edge Function** — безопасный способ для приложения автоматически управлять структурой вашей БД.</p>
                    <div class="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 text-blue-800 dark:text-blue-200 rounded-md text-sm space-y-2">
                        <p><strong>Зачем это нужно?</strong></p>
                        <ul class="list-disc list-inside text-blue-700 dark:text-blue-300">
                            <li><strong>Безопасность:</strong> Приложение никогда не получает прямого доступа к вашей базе данных с правами администратора.</li>
                            <li><strong>Автоматизация:</strong> Позволяет приложению самостоятельно применять обновления (миграции) схемы, избавляя вас от ручного выполнения SQL-скриптов.</li>
                            <li><strong>Простота:</strong> После однократной настройки система будет работать автоматически.</li>
                        </ul>
                    </div>
                `;
                break;
            case 'create-function':
                contentHtml = `
                    <p class="mb-4">Войдите в ваш проект на <a href="https://supabase.com/dashboard" target="_blank" class="text-blue-500 hover:underline">Supabase</a> и создайте новую Edge Function.</p>
                    <ol class="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-300">
                        <li>В меню слева выберите иконку <strong>Edge Functions</strong>.</li>
                        <li>Нажмите кнопку <strong>Create a new function</strong>.</li>
                        <li>Дайте функции имя <strong>db-admin</strong> и нажмите <strong>Create function</strong>.</li>
                    </ol>
                    <p class="mt-4 text-sm text-slate-500">После создания вы будете перенаправлены в редактор кода.</p>
                `;
                break;
            case 'deploy-code':
                contentHtml = `
                     <p class="mb-4">Теперь замените весь стандартный код в редакторе на код, представленный ниже. Это настроит вашу функцию для безопасного приема SQL-запросов.</p>
                    <div class="rounded-md border border-slate-200 dark:border-slate-700">
                        <div class="flex justify-between items-center bg-slate-100 dark:bg-slate-900 px-4 py-2 text-xs text-slate-500 dark:text-slate-400 rounded-t-md">
                            <span>TYPESCRIPT (DB-ADMIN/INDEX.TS)</span>
                            <button class="text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-2 py-1 rounded-md transition-colors" data-action="copy-code">Копировать</button>
                        </div>
                        <pre class="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-b-md overflow-x-auto max-h-60"><code id="function-code-block" class="text-sm whitespace-pre font-mono">${EDGE_FUNCTION_CODE}</code></pre>
                    </div>
                     <p class="mt-4">После вставки кода нажмите <strong>Deploy</strong> (внизу справа в редакторе Supabase).</p>
                `;
                break;
            case 'set-secrets':
                contentHtml = `
                    <p class="mb-4">Для безопасной работы функции необходимо добавить два секрета (секретные переменные).</p>
                    <ol class="list-decimal list-inside space-y-3 text-slate-700 dark:text-slate-300">
                        <li>В настройках вашей функции <strong>db-admin</strong> перейдите на вкладку <strong>Secrets</strong>.</li>
                        <li>
                            <strong>Добавьте первый секрет:</strong>
                            <ul class="list-disc list-inside ml-6 bg-slate-100 dark:bg-slate-900/50 p-2 rounded my-1 text-sm">
                                <li><strong>Name:</strong> <code class="font-mono text-xs">DATABASE_URL</code></li>
                                <li><strong>Value:</strong> Ваша строка подключения к БД (Найдите её в <code class="font-mono text-xs">Project Settings &gt; Database &gt; Connection string</code>).</li>
                            </ul>
                        </li>
                         <li>
                            <strong>Добавьте второй секрет:</strong>
                            <ul class="list-disc list-inside ml-6 bg-slate-100 dark:bg-slate-900/50 p-2 rounded my-1 text-sm">
                                <li><strong>Name:</strong> <code class="font-mono text-xs">ADMIN_SECRET_TOKEN</code></li>
                                <li><strong>Value:</strong> Придумайте и вставьте сюда любой надежный пароль. <strong>Сохраните его</strong>, он понадобится на следующем шаге.</li>
                            </ul>
                        </li>
                    </ol>
                     <p class="mt-4">После добавления секретов **обязательно заново разверните функцию**, нажав <strong>Deploy</strong>.</p>
                `;
                break;
            case 'test-and-save':
                let testStatusHtml;
                switch(state.testStatus) {
                    case 'testing': testStatusHtml = `<span class="text-yellow-500">Тестирование...</span>`; break;
                    case 'ok': testStatusHtml = `<span class="text-green-500">✓ Соединение успешно!</span>`; break;
                    case 'error': testStatusHtml = `<span class="text-red-500">✗ Ошибка соединения.</span>`; break;
                    default: testStatusHtml = `<span>Ожидание теста...</span>`;
                }
                 contentHtml = `
                    <p class="mb-4">Почти готово! Вставьте URL вашей функции и секретный токен, который вы создали на предыдущем шаге, чтобы проверить соединение.</p>
                     <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label for="function-url-input" class="font-semibold text-sm">URL функции (db-admin):</label>
                            <input type="url" id="function-url-input" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-sm" placeholder="https://<project-ref>.supabase.co/functions/v1/db-admin" value="${state.functionUrl}">
                        </div>
                        <div>
                             <label for="admin-token-input" class="font-semibold text-sm">Секретный токен (ADMIN_SECRET_TOKEN):</label>
                            <input type="password" id="admin-token-input" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-sm" value="${state.adminToken}">
                        </div>
                    </div>
                     <div class="mt-4">
                        <label class="font-semibold text-sm">Лог проверки:</label>
                        <div class="w-full h-24 mt-1 bg-slate-900 text-slate-200 border border-slate-700 rounded-md p-2 font-mono text-xs overflow-y-auto whitespace-pre-wrap">${state.logOutput}</div>
                    </div>
                    <div class="mt-4 flex justify-between items-center">
                        <button data-action="test" class="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-md font-semibold">${state.testStatus === 'testing' ? '...' : 'Проверить'}</button>
                        <div class="text-sm font-semibold">${testStatusHtml}</div>
                    </div>
                `;
                break;
            case 'execute-sql':
                 contentHtml = `
                    <p class="mb-4">Соединение установлено! Нажмите кнопку ниже, чтобы применить последнюю версию схемы к вашей базе данных. Это действие **удалит и пересоздаст таблицы с данными** для обеспечения полной совместимости.</p>
                     <div class="p-3 bg-yellow-100/50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300 rounded-md text-sm space-y-2">
                        <p><strong>Внимание:</strong> Это безопасно для ваших данных в Google, но все локально кэшированные данные (письма, файлы, контакты) в Supabase будут удалены и загружены заново. Ваши настройки и прокси-серверы сохранятся.</p>
                     </div>
                     <div class="mt-4">
                        <label for="sql-script-area" class="font-semibold text-sm">Скрипт полной миграции схемы:</label>
                        <textarea id="sql-script-area" class="w-full h-40 mt-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-xs" readonly>${FULL_MIGRATION_SQL}</textarea>
                    </div>
                    <div>
                        <label class="font-semibold text-sm">Лог выполнения:</label>
                        <div class="w-full h-24 mt-1 bg-slate-900 text-slate-200 border border-slate-700 rounded-md p-2 font-mono text-xs overflow-y-auto whitespace-pre-wrap">${state.logOutput}</div>
                    </div>
                 `;
                 break;
        }

        let footerHtml = `
            <div class="flex-1">
                ${state.currentStep > 0 ? `<button data-action="back" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Назад</button>` : ''}
            </div>
        `;
        
        if (state.currentStep < 4) { // Steps before test & save
             footerHtml += `<button data-action="next" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Далее</button>`;
        } else if (state.currentStep === 4) { // Test & save step
             footerHtml += `<button data-action="next" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold disabled:bg-slate-500" ${state.testStatus !== 'ok' ? 'disabled' : ''}>Далее</button>`;
        } else if (state.currentStep === 5) { // Execute SQL step
            if (state.sqlExecutionSuccess) {
                footerHtml += `<button data-action="close" class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold">Завершить</button>`;
            } else {
                footerHtml += `
                    <button data-action="execute" class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold disabled:bg-slate-500" ${state.isLoading ? 'disabled' : ''}>
                        ${state.isLoading ? 'Выполнение...' : 'Выполнить и завершить'}
                    </button>`;
            }
        }


        wizardElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg shadow-2xl w-full max-w-3xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col relative animate-fadeIn">
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

        // Persist input values across steps
        const urlInput = wizardElement.querySelector('#function-url-input');
        const tokenInput = wizardElement.querySelector('#admin-token-input');
        if (urlInput) state.functionUrl = urlInput.value.trim();
        if (tokenInput) state.adminToken = tokenInput.value.trim();

        switch (action) {
            case 'close': onClose(); break;
            case 'back': 
                if (state.currentStep > 0) state.currentStep--;
                render();
                break;
            case 'next':
                if (state.currentStep < WIZARD_STEPS.length - 1) {
                    state.currentStep++;
                    if (WIZARD_STEPS[state.currentStep].id === 'execute-sql') {
                         state.logOutput = 'Ожидание выполнения...';
                    }
                }
                render();
                break;
            case 'copy-code':
                 const codeElement = wizardElement.querySelector('#function-code-block');
                navigator.clipboard.writeText(codeElement.textContent).then(() => {
                    target.textContent = 'Скопировано!';
                    setTimeout(() => { target.textContent = 'Копировать'; }, 2000);
                });
                break;
            case 'test':
                 if (!state.functionUrl || !state.adminToken) {
                    state.logOutput = 'Ошибка: URL функции и токен должны быть заполнены.';
                    state.testStatus = 'error';
                    render();
                    return;
                }
                state.isLoading = true;
                state.testStatus = 'testing';
                state.logOutput = 'Отправка тестового запроса (SELECT 1)...';
                render();
                try {
                    const service = new SupabaseService(supabaseConfig.url, supabaseConfig.anonKey);
                    // Use a simple, harmless query for testing
                    const result = await service.executeSqlViaFunction(state.functionUrl, state.adminToken, 'SELECT 1;');
                    state.logOutput = `Успешно! Ответ сервера:\n${JSON.stringify(result, null, 2)}`;
                    state.testStatus = 'ok';
                    // Save valid settings temporarily in state
                    const newSettings = { 
                        ...settings, 
                        managementWorkerUrl: state.functionUrl,
                        adminSecretToken: state.adminToken,
                    };
                    onSave(newSettings); // Save immediately on successful test
                } catch(error) {
                    state.logOutput = `Ошибка соединения:\n\n${error.message}`;
                    state.testStatus = 'error';
                } finally {
                    state.isLoading = false;
                    render();
                }
                break;
            case 'execute':
                 const sqlScript = wizardElement.querySelector('#sql-script-area').value.trim();
                 state.isLoading = true;
                 state.sqlExecutionSuccess = false;
                 state.logOutput = 'Выполнение миграции...';
                 render();
                 try {
                    const service = new SupabaseService(supabaseConfig.url, supabaseConfig.anonKey);
                    const result = await service.executeSqlViaFunction(state.functionUrl, state.adminToken, sqlScript);
                    state.logOutput = `Успешно! База данных настроена.\nОтвет:\n${JSON.stringify(result, null, 2)}`;
                    state.sqlExecutionSuccess = true;
                 } catch(error) {
                    state.logOutput = `Ошибка выполнения:\n\n${error.message}`;
                 } finally {
                    state.isLoading = false;
                    render();
                 }
                 break;
        }
    };
    
    wizardElement.addEventListener('click', handleAction);

    render();
    return wizardElement;
}