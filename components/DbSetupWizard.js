import * as Icons from './icons/Icons.js';
import { getSettings, saveSettings } from '../utils/storage.js';
import { SUPABASE_CONFIG } from '../config.js';

const WORKER_CODE = `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sendResponse = (body, status) => {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret-token',
  });
  return new Response(JSON.stringify(body), { headers, status });
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret-token' 
    }});
  }
  if (req.method !== 'POST') {
    return sendResponse({ error: 'Method Not Allowed' }, 405);
  }
  
  const adminSecretToken = req.headers.get('x-admin-secret-token');
  if (!adminSecretToken || adminSecretToken !== Deno.env.get('ADMIN_SECRET_TOKEN')) {
    return sendResponse({ error: 'Forbidden: Invalid or missing admin secret token' }, 403);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  );

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return sendResponse({ error: 'Missing Authorization header' }, 401);
    }
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    
    if (userError || !user) {
      return sendResponse({ error: 'Authentication failed: ' + (userError ? userError.message : 'Unknown reason') }, 401);
    }

    const { data: userProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError || !userProfile || !['admin', 'owner'].includes(userProfile.role)) {
       return sendResponse({ error: 'Forbidden: User is not an admin or owner' }, 403);
    }
  
    const { sql_query } = await req.json();
    if (!sql_query || typeof sql_query !== 'string') {
      return sendResponse({ error: 'sql_query is required and must be a string' }, 400);
    }
    
    // Use an RPC call to a SECURITY DEFINER function for safe execution
    const { error: rpcExecError } = await supabaseAdmin.rpc('execute_sql_as_postgres', { query: sql_query });

    if (rpcExecError) {
      console.error('SQL Execution Error:', rpcExecError);
      return sendResponse({ error: 'SQL execution failed: ' + rpcExecError.message }, 500);
    }

    return sendResponse({ message: 'SQL executed successfully' }, 200);

  } catch (e) {
    console.error('Unexpected error:', e);
    return sendResponse({ error: 'Internal Server Error: ' + e.message }, 500);
  }
});`;

const HELPER_SQL = `CREATE OR REPLACE FUNCTION public.execute_sql_as_postgres(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    EXECUTE query;
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_sql_as_postgres(text) TO service_role;`;


export function createDbSetupWizard({ supabaseService, onComplete }) {
    const wizardElement = document.createElement('div');
    wizardElement.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fadeIn';
    
    let state = {
        currentStep: 0,
        settings: getSettings(),
        isLoading: false,
        testStatus: 'idle', // idle, testing, ok, error
    };
    
    const PROJECT_REF = SUPABASE_CONFIG.url.split('.')[0].split('//')[1];
    const EDGE_FUNCTIONS_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}/functions`;
    const SQL_EDITOR_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}/sql`;
    const API_SETTINGS_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api`;

    const STEPS = [
        { id: 'intro', title: 'Введение' },
        { id: 'create_function', title: 'Создание функции' },
        { id: 'add_code', title: 'Добавление кода' },
        { id: 'set_secrets', title: 'Настройка секретов' },
        { id: 'execute_sql', title: 'Выполнение SQL' },
        { id: 'final_config', title: 'Финальная настройка' },
    ];
    
    const render = () => {
        const stepConfig = STEPS[state.currentStep];
        let contentHtml = '';
        let footerHtml = '';
        let nextButtonDisabled = false;

        // --- Step Content ---
        switch (stepConfig.id) {
            case 'intro':
                contentHtml = `
                    <p class="mb-4">Этот мастер поможет вам настроить **"Управляющий Воркер"** — специальную защищенную функцию в Supabase.</p>
                    <p class="mb-4">Он необходим для того, чтобы приложение могло безопасно обновлять схему своей базы данных (например, добавлять новые таблицы) от вашего имени, не запрашивая у вас пароль от базы.</p>
                    <p>Процесс займет около 5 минут. Нажмите "Далее", чтобы начать.</p>
                `;
                break;
            case 'create_function':
                contentHtml = `
                    <p class="mb-4">1. Откройте раздел <strong>Edge Functions</strong> в вашей панели управления Supabase, нажав на кнопку ниже (откроется в новой вкладке).</p>
                    <a href="${EDGE_FUNCTIONS_URL}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold">${Icons.ExternalLinkIcon} Открыть Supabase</a>
                    <p class="mt-4 mb-4">2. Нажмите <strong>"Create a new function"</strong>.</p>
                    <p class="mb-4">3. Введите имя функции: <code class="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">db-admin</code> и нажмите <strong>"Create function"</strong>.</p>
                    <p class="mt-6">Как только функция будет создана, нажмите "Далее".</p>
                `;
                break;
            case 'add_code':
                 contentHtml = `
                    <p class="mb-4">1. Вы должны находиться в редакторе кода для функции <strong>db-admin</strong>.</p>
                    <p class="mb-4">2. Полностью удалите весь код, который там есть.</p>
                    <p class="mb-4">3. Нажмите кнопку ниже, чтобы скопировать готовый код воркера, и вставьте его в редактор Supabase.</p>
                    <button data-action="copy" data-text="${encodeURIComponent(WORKER_CODE)}" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">${Icons.FileIcon} Копировать код</button>
                    <p class="mt-4 mb-4">4. Нажмите <strong>"Save and deploy"</strong> в Supabase и дождитесь завершения развертывания.</p>
                 `;
                break;
            case 'set_secrets':
                 contentHtml = `
                    <p class="mb-4">1. На странице функции <strong>db-admin</strong> перейдите на вкладку <strong>Settings &gt; Secrets</strong>.</p>
                    <p class="mb-4">2. Вам нужно добавить <strong>три</strong> секрета. Нажмите кнопку ниже, чтобы скопировать нужный ключ, и вставьте его.</p>
                    <ul class="space-y-3 mt-4 text-sm">
                        <li class="flex items-center justify-between bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md">
                            <div><strong>Имя:</strong> <code class="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">ADMIN_SECRET_TOKEN</code><br><strong>Значение:</strong> Придумайте надежный пароль.</div>
                            <button data-action="copy" data-text="ADMIN_SECRET_TOKEN" class="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded text-xs font-semibold hover:bg-slate-300">Копировать имя</button>
                        </li>
                        <li class="flex items-center justify-between bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md">
                            <div><strong>Имя:</strong> <code class="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">SUPABASE_URL</code><br><strong>Значение:</strong> Ваш URL проекта.</div>
                            <a href="${API_SETTINGS_URL}" target="_blank" class="text-xs font-semibold text-blue-500 hover:underline">Найти его здесь</a>
                        </li>
                         <li class="flex items-center justify-between bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md">
                            <div><strong>Имя:</strong> <code class="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">SUPABASE_SERVICE_ROLE_KEY</code><br><strong>Значение:</strong> Ваш <code class="text-red-500">service_role</code> ключ.</div>
                            <a href="${API_SETTINGS_URL}" target="_blank" class="text-xs font-semibold text-blue-500 hover:underline">Найти его здесь</a>
                        </li>
                    </ul>
                    <p class="mt-4 text-xs text-yellow-600 dark:text-yellow-400"><strong>Внимание:</strong> Ключ <code>service_role</code> дает полный доступ к вашей базе. Обращайтесь с ним осторожно.</p>
                 `;
                break;
            case 'execute_sql':
                 contentHtml = `
                    <p class="mb-4">Теперь нужно создать специальную вспомогательную функцию в базе данных, которую будет использовать воркер.</p>
                    <p class="mb-4">1. Откройте <strong>SQL Editor</strong> в Supabase.</p>
                     <a href="${SQL_EDITOR_URL}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold">${Icons.ExternalLinkIcon} Открыть SQL Editor</a>
                    <p class="mt-4 mb-4">2. Нажмите <strong>"New query"</strong>.</p>
                    <p class="mb-4">3. Скопируйте SQL-код ниже, вставьте его в редактор и нажмите <strong>"RUN"</strong>.</p>
                    <button data-action="copy" data-text="${encodeURIComponent(HELPER_SQL)}" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">${Icons.FileIcon} Копировать SQL-код</button>
                 `;
                break;
            case 'final_config':
                let testStatusHtml;
                switch(state.testStatus) {
                    case 'testing': testStatusHtml = `<span class="text-yellow-500 flex items-center gap-2"><div class="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div> Тестирование...</span>`; break;
                    case 'ok': testStatusHtml = `<span class="text-green-500 font-bold">✓ Соединение успешно!</span>`; break;
                    case 'error': testStatusHtml = `<span class="text-red-500 font-bold">✗ Ошибка соединения.</span>`; break;
                    default: testStatusHtml = `<span class="text-slate-500">Ожидание...</span>`;
                }
                nextButtonDisabled = state.testStatus !== 'ok';

                contentHtml = `
                    <p class="mb-4">Отлично! Теперь введите данные вашего воркера в поля ниже, чтобы приложение могло его использовать.</p>
                    <div class="space-y-4">
                        <div>
                            <label for="worker-url-input" class="font-medium text-sm">URL Управляющего Воркера</label>
                            <div class="flex items-center gap-2">
                                <input type="url" id="worker-url-input" class="flex-1 mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 text-sm font-mono" placeholder="https://....supabase.co/functions/v1/db-admin" value="${state.settings.managementWorkerUrl || ''}">
                                <a href="${EDGE_FUNCTIONS_URL}" target="_blank" class="text-xs font-semibold text-blue-500 hover:underline mt-1">Скопировать URL</a>
                            </div>
                        </div>
                         <div>
                            <label for="worker-token-input" class="font-medium text-sm">Секретный токен (который вы придумали)</label>
                            <input type="password" id="worker-token-input" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 text-sm" value="${state.settings.adminSecretToken || ''}">
                        </div>
                    </div>
                    <div class="mt-6 flex justify-between items-center p-3 bg-slate-100 dark:bg-slate-900/50 rounded-md">
                        <button data-action="test-connection" class="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-md font-semibold text-sm" ${state.isLoading ? 'disabled' : ''}>Проверить соединение</button>
                        <div class="text-sm">${testStatusHtml}</div>
                    </div>
                `;
                break;
        }

        // --- Footer ---
        if (state.currentStep > 0) {
            footerHtml += `<button data-action="back" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Назад</button>`;
        }
        if (state.currentStep < STEPS.length - 1) {
            footerHtml += `<button data-action="next" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold" ${nextButtonDisabled ? 'disabled' : ''}>Далее</button>`;
        } else {
            footerHtml += `<button data-action="finish" class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold" ${nextButtonDisabled ? 'disabled' : ''}>Завершить и сохранить</button>`;
        }

        // --- Main Layout ---
        wizardElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] text-slate-800 dark:text-slate-100">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h2 class="text-xl font-bold flex items-center gap-2">${Icons.WandIcon} Мастер настройки Воркера</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">&times;</button>
                </header>
                <main class="flex-1 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
                    <div class="flex items-center gap-2 mb-6 text-xs">
                        ${STEPS.map((step, index) => {
                            const isCompleted = index < state.currentStep;
                            const isCurrent = index === state.currentStep;
                            let statusClass = 'bg-slate-200 dark:bg-slate-600 text-slate-500';
                            if (isCompleted) statusClass = 'bg-blue-600 text-white';
                            if (isCurrent) statusClass = 'ring-2 ring-blue-500 bg-white dark:bg-slate-700 text-blue-500';
                            return `<div class="flex items-center gap-2 ${index > 0 ? 'flex-1' : ''}">
                                ${index > 0 ? `<div class="h-px flex-1 ${isCompleted ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}"></div>` : ''}
                                <span class="h-6 w-6 rounded-full flex items-center justify-center font-bold text-sm ${statusClass} transition-all">${index + 1}</span>
                                <span class="font-semibold ${isCurrent ? 'text-blue-500' : 'text-slate-500'}">${step.title}</span>
                            </div>`;
                        }).join('')}
                    </div>
                    <div id="wizard-step-content">${contentHtml}</div>
                </main>
                <footer class="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">${footerHtml}</footer>
            </div>
        `;
    };

    const collectInputs = () => {
        const urlInput = wizardElement.querySelector('#worker-url-input');
        if (urlInput) state.settings.managementWorkerUrl = urlInput.value.trim();
        const tokenInput = wizardElement.querySelector('#worker-token-input');
        if (tokenInput) state.settings.adminSecretToken = tokenInput.value.trim();
    };

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) {
            if (e.target === wizardElement) onComplete();
            return;
        }

        const action = target.dataset.action;

        switch(action) {
            case 'close': onComplete(); break;
            case 'next': state.currentStep++; render(); break;
            case 'back': state.currentStep--; render(); break;
            case 'copy':
                try {
                    await navigator.clipboard.writeText(decodeURIComponent(target.dataset.text));
                    target.textContent = 'Скопировано!';
                    setTimeout(() => target.innerHTML = `${Icons.FileIcon} Копировать...`, 2000);
                } catch (err) {
                    alert('Не удалось скопировать. Пожалуйста, сделайте это вручную.');
                }
                break;
            case 'test-connection':
                collectInputs();
                state.isLoading = true; state.testStatus = 'testing'; render();
                try {
                    await supabaseService.executeSqlViaFunction('SELECT 1;');
                    state.testStatus = 'ok';
                } catch (error) {
                    console.error("Worker test failed:", error);
                    state.testStatus = 'error';
                    alert(`Ошибка соединения: ${error.message}`);
                } finally {
                    state.isLoading = false; render();
                }
                break;
            case 'finish':
                collectInputs();
                await supabaseService.saveUserSettings(state.settings);
                saveSettings(state.settings);
                onComplete();
                break;
        }
    };

    wizardElement.addEventListener('click', handleAction);
    render();
    return wizardElement;
}
