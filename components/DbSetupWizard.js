import * as Icons from './icons/Icons.js';
import { SupabaseService } from '../services/supabase/SupabaseService.js';

const WIZARD_STEPS = [
    { id: 'intro', title: 'Введение' },
    { id: 'get-connection-string', title: 'Строка подключения' },
    { id: 'create-worker', title: 'Создание Воркера' },
    { id: 'deploy-code', title: 'Код Воркера' },
    { id: 'test-save', title: 'Тест и Сохранение' },
];

const MANAGEMENT_WORKER_CODE = `
// **FIX**: Reverted CDN to unpkg.com with a full, explicit module path for maximum compatibility in Cloudflare Workers.
// This is an alternative to esm.sh which was causing module resolution errors.
import postgres from 'https://unpkg.com/postgres@3.4.4/esm/index.js';

// Use the modern ES Modules format for Cloudflare Workers
export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight requests (OPTIONS method)
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                },
            });
        }

        // Standard CORS headers for all actual responses
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        };

        // Handle simple GET requests for status checks (e.g., browser pings)
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok' }), { headers: corsHeaders });
        }

        // Only allow POST method for executing queries
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: corsHeaders });
        }

        try {
            // In ES Modules format, secrets are on the 'env' object
            if (!env.DATABASE_URL) {
                throw new Error('DATABASE_URL secret is not defined in worker settings.');
            }

            // Establish connection to the database
            const sql = postgres(env.DATABASE_URL, {
                ssl: 'require',      // Required for Supabase connections
                max: 1,              // Use a single connection in a serverless environment
                connect_timeout: 10, // 10-second timeout for the connection
            });

            // Get the SQL query from the request body
            const { query } = await request.json();
            if (!query) {
                return new Response(JSON.stringify({ error: 'The "query" parameter is missing in the request body.' }), { status: 400, headers: corsHeaders });
            }

            // Execute the provided query
            const result = await sql.unsafe(query);

            // IMPORTANT: Always close the connection in a serverless function
            await sql.end();

            // Return the successful result
            return new Response(JSON.stringify(result), {
                status: 200,
                headers: corsHeaders,
            });

        } catch (error) {
            console.error('Worker Error:', error.message);
            // Return a detailed error message for easier debugging on the client-side
            return new Response(JSON.stringify({ error: \`Worker execution failed: \${error.message}\` }), {
                status: 500,
                headers: corsHeaders,
            });
        }
    }
};
`.trim();

const DB_SETUP_SQL = `
-- Enable Row Level Security
alter table public.calendar_events enable row level security;
alter table public.contacts enable row level security;
alter table public.files enable row level security;
alter table public.tasks enable row level security;
alter table public.emails enable row level security;
alter table public.notes enable row level security;
alter table public.chat_memory enable row level security;
alter table public.user_settings enable row level security;
alter table public.action_stats enable row level security;
alter table public.proxies enable row level security;

-- Drop existing policies to prevent conflicts
drop policy if exists "Enable all access for authenticated users" on public.calendar_events;
drop policy if exists "Enable all access for authenticated users" on public.contacts;
drop policy if exists "Enable all access for authenticated users" on public.files;
drop policy if exists "Enable all access for authenticated users" on public.tasks;
drop policy if exists "Enable all access for authenticated users" on public.emails;
drop policy if exists "Enable all access for authenticated users" on public.notes;
drop policy if exists "Enable all access for authenticated users" on public.chat_memory;
drop policy if exists "Enable all access for authenticated users" on public.user_settings;
drop policy if exists "Enable all access for authenticated users" on public.action_stats;
drop policy if exists "Enable all access for authenticated users" on public.proxies;

-- Create policies for each table
create policy "Enable all access for authenticated users" on public.calendar_events for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.contacts for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.files for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.tasks for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.emails for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.notes for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.chat_memory for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.user_settings for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.action_stats for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.proxies for all to authenticated using (auth.uid() = user_id);
`.trim();


export function createDbSetupWizard({ settings, supabaseConfig, onClose, onSave }) {
    const wizardElement = document.createElement('div');
    wizardElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4';

    let state = {
        currentStep: 0,
        workerUrl: settings.managementWorkerUrl || '',
        testStatus: 'untested',
        testMessage: '',
        isLoading: false,
    };
    
    const render = () => {
        const stepConfig = WIZARD_STEPS[state.currentStep];
        let contentHtml = '';

        switch (stepConfig.id) {
            case 'intro':
                contentHtml = `
                    <p class="mb-4">Этот мастер поможет вам настроить **Управляющий воркер**.</p>
                    <p class="mb-4">Он необходим для автоматического обновления структуры вашей базы данных (включения RLS, добавления таблиц и т.д.), чтобы вы всегда использовали последнюю версию приложения без ручного выполнения SQL-скриптов.</p>
                    <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-sm">
                        <p><strong>Что вам понадобится:</strong></p>
                        <ul class="list-disc list-inside text-slate-600 dark:text-slate-400">
                            <li>Доступ к вашему проекту в <a href="https://supabase.com" target="_blank" class="text-blue-500 hover:underline">Supabase</a>.</li>
                            <li>Аккаунт <a href="https://cloudflare.com" target="_blank" class="text-blue-500 hover:underline">Cloudflare</a> (бесплатного тарифа достаточно).</li>
                        </ul>
                    </div>
                `;
                break;

            case 'get-connection-string':
                const projectRef = supabaseConfig.url ? new URL(supabaseConfig.url).hostname.split('.')[0] : null;
                const dbUrl = projectRef ? `https://supabase.com/dashboard/project/${projectRef}/settings/database` : 'https://supabase.com/dashboard';

                contentHtml = `
                    <p class="mb-4">Сначала нам нужна строка подключения к вашей базе данных.</p>
                    <ol class="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-300">
                        <li>Перейдите в <a href="${dbUrl}" target="_blank" class="text-blue-500 hover:underline">настройки базы данных</a> вашего проекта Supabase.</li>
                        <li>Найдите раздел <strong>Connection string</strong> и выберите вкладку <strong>URI</strong>.</li>
                        <li>Скопируйте строку подключения. Она будет выглядеть так: <code class="text-xs">postgres://...</code></li>
                        <li><strong>Важно:</strong> Эту строку мы будем использовать на следующем шаге. Не вставляйте ее сюда, она будет безопасно добавлена в переменные окружения воркера.</li>
                    </ol>
                `;
                break;
            
            case 'create-worker':
                contentHtml = `
                    <p class="mb-4">Отлично. Теперь создайте Cloudflare Worker для управления базой данных.</p>
                     <ol class="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-300">
                        <li>В <a href="https://dash.cloudflare.com/" target="_blank" class="text-blue-500 hover:underline">панели Cloudflare</a>, перейдите в <strong>Workers & Pages</strong>.</li>
                        <li>Нажмите <strong>Create application</strong>, затем <strong>Create Worker</strong>.</li>
                        <li>Придумайте имя (например, \`supabase-db-manager\`) и нажмите <strong>Deploy</strong>.</li>
                        <li>После развертывания, перейдите в настройки воркера (<strong>Settings &rarr; Variables</strong>).</li>
                        <li>В разделе <strong>Environment Variables</strong>, нажмите <strong>Add variable</strong>.</li>
                        <li>Назовите переменную <code class="text-xs">DATABASE_URL</code>.</li>
                        <li>В поле <strong>Value</strong> вставьте строку подключения URI из Supabase, которую вы скопировали на прошлом шаге.</li>
                        <li>Нажмите <strong>Encrypt</strong>, чтобы безопасно сохранить переменную, затем нажмите <strong>Save</strong>.</li>
                    </ol>
                `;
                break;

            case 'deploy-code':
                 contentHtml = `
                    <p class="mb-4">Теперь вставьте код в ваш воркер.</p>
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
                let statusIndicatorClass = 'bg-slate-400';
                if (state.testStatus === 'ok') statusIndicatorClass = 'bg-green-500';
                if (state.testStatus === 'error') statusIndicatorClass = 'bg-red-500';
                if (state.isLoading) statusIndicatorClass = 'bg-yellow-500 animate-pulse';

                contentHtml = `
                    <p class="mb-4">Последний шаг: вставьте URL вашего воркера, чтобы приложение могло его использовать.</p>
                    <div class="flex items-end gap-2 mb-4">
                        <div class="flex-1">
                             <label for="worker-url-input" class="font-semibold text-sm">URL Управляющего воркера:</label>
                            <input type="url" id="worker-url-input" class="flex-1 w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-sm" placeholder="https://supabase-db-manager.example.workers.dev" value="${state.workerUrl}">
                        </div>
                        <button data-action="test-worker" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md font-semibold text-sm" ${state.isLoading || !state.workerUrl ? 'disabled' : ''}>Тест</button>
                    </div>
                     <div class="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-900/50 rounded-md border border-slate-200 dark:border-slate-700 h-12">
                        <div class="w-4 h-4 rounded-full ${statusIndicatorClass} transition-colors"></div>
                        <p id="test-status-message" class="text-sm font-medium text-slate-600 dark:text-slate-300">${state.testMessage || 'Готов к тестированию.'}</p>
                    </div>
                `;
                break;
        }

        const footerHtml = `
            <div class="flex-1">
                ${state.currentStep > 0 ? `<button data-action="back" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Назад</button>` : ''}
            </div>
            ${state.currentStep < WIZARD_STEPS.length - 1 ? 
                `<button data-action="next" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Далее</button>` : 
                `<button data-action="finish" class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold disabled:bg-slate-400 dark:disabled:bg-slate-500" ${state.testStatus !== 'ok' ? 'disabled' : ''}>Сохранить</button>`
            }
        `;

        wizardElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg shadow-2xl w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col relative animate-fadeIn">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold">Мастер настройки Базы Данных</h2>
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
                state.isLoading = true;
                state.testStatus = 'testing';
                state.testMessage = 'Проверка соединения...';
                render();

                try {
                    const service = new SupabaseService(supabaseConfig.url, supabaseConfig.anonKey);
                    // Test with a simple, non-destructive query
                    await service.executeSql(state.workerUrl, 'SELECT 1;');
                     state.testStatus = 'ok';
                     state.testMessage = 'Соединение успешно! Можно сохранять.';

                } catch(error) {
                    state.testStatus = 'error';
                    state.testMessage = `Ошибка: ${error.message}`;
                } finally {
                    state.isLoading = false;
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
            state.testStatus = 'untested';
            state.testMessage = 'URL изменен. Пожалуйста, протестируйте заново.';
            render();
        }
    });

    render();
    return wizardElement;
}
