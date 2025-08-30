import { getSettings, saveGoogleToken, getGoogleToken, clearGoogleToken } from '../utils/storage.js';
import * as Icons from './icons/Icons.js';
import { createProxyManagerModal } from './ProxyManagerModal.js';
import { DB_SCHEMAS } from '../services/supabase/schema.js';


export function createSetupWizard({ onComplete, googleProvider, supabaseService, googleClientId, resumeState = null }) {
    const wizardElement = document.createElement('div');
    wizardElement.className = 'fixed inset-0 bg-slate-900 z-50 flex items-center justify-center p-4';
    
    let state = {
        currentStep: 0,
        config: getSettings(),
        authChoice: getSettings().isSupabaseEnabled ? 'supabase' : 'direct',
        isAuthenticated: false,
        userProfile: null,
        isLoading: false,
        // For DB Worker Step
        dbTestStatus: 'idle',
        dbLogOutput: 'Ожидание...',
        dbSqlSuccess: false,
    };

    if (resumeState) {
        state = { ...state, ...resumeState };
    }

    const STEPS = [
        { id: 'welcome', title: 'Добро пожаловать' },
        { id: 'connection', title: 'Способ подключения' },
        { id: 'auth', title: 'Аутентификация' },
        { id: 'gemini', title: 'Ключ Gemini API' },
        { id: 'services', title: 'Службы и Поля' },
        { id: 'proxy', title: 'Настройка Прокси' },
        { id: 'database', title: 'Управляющий воркер' },
        { id: 'finish', title: 'Завершение' },
    ];
    
    const saveStateToSession = () => {
        sessionStorage.setItem('wizardState', JSON.stringify(state));
    };

    const renderStepContent = () => {
        const contentEl = wizardElement.querySelector('#wizard-content');
        const footerEl = wizardElement.querySelector('#wizard-footer');
        if(!contentEl || !footerEl) return;
        
        contentEl.innerHTML = '';
        footerEl.innerHTML = '';

        if (state.currentStep > 0) {
            const backBtn = document.createElement('button');
            backBtn.className = 'px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold';
            backBtn.textContent = 'Назад';
            backBtn.dataset.action = 'back';
            footerEl.appendChild(backBtn);
        } else {
            const exitBtn = document.createElement('button');
            exitBtn.className = 'px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold';
            exitBtn.textContent = 'Выйти';
            exitBtn.dataset.action = 'exit';
            footerEl.appendChild(exitBtn);
        }
        
        const addNextButton = (text = 'Далее', isSkip = false, disabled = false) => {
            const nextBtn = document.createElement('button');
            nextBtn.className = `px-6 py-2 rounded-md font-semibold text-white ${isSkip ? 'bg-slate-500 hover:bg-slate-600' : 'bg-blue-600 hover:bg-blue-700'} disabled:bg-slate-400 dark:disabled:bg-slate-500`;
            nextBtn.textContent = text;
            nextBtn.dataset.action = 'next';
            nextBtn.disabled = disabled;
            footerEl.appendChild(nextBtn);
        };

        switch (STEPS[state.currentStep].id) {
            case 'welcome':
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Настройка «Секретарь+»</h2>
                    <p class="text-slate-600 dark:text-slate-300">Этот мастер поможет вам настроить все необходимые параметры для работы приложения.</p>`;
                addNextButton('Начать');
                break;
            case 'connection':
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Выбор способа подключения</h2>
                    <p class="mb-6 text-slate-500 dark:text-slate-400"><strong>Рекомендуется использовать Supabase</strong> для синхронизации, управления прокси и других расширенных функций.</p>
                    <div class="grid md:grid-cols-2 gap-6">
                        <div class="choice-card p-4 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-all hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-blue-500 dark:hover:border-blue-500 ${state.authChoice === 'supabase' ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-md' : ''}" data-choice="supabase">
                            <h3 class="font-bold text-lg">Supabase (Рекомендуется)</h3>
                            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Синхронизация, управление прокси, роли пользователей.</p>
                        </div>
                        <div class="choice-card p-4 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-all hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-blue-500 dark:hover:border-blue-500 ${state.authChoice === 'direct' ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-md' : ''}" data-choice="direct">
                            <h3 class="font-bold text-lg">Прямое подключение Google</h3>
                            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Простой режим, настройки хранятся только в браузере.</p>
                        </div>
                    </div>`;
                addNextButton();
                break;
            case 'auth':
                let authContent;
                if(state.isLoading) {
                    authContent = `<div class="text-center"><div class="animate-spin h-8 w-8 border-4 border-slate-300 border-t-transparent rounded-full mx-auto mb-2"></div><p>Ожидание...</p></div>`;
                } else if (state.isAuthenticated && state.userProfile) {
                     authContent = `
                        <div class="text-center text-green-600 dark:text-green-400 flex flex-col items-center">
                           <div class="w-12 h-12 mb-3">${Icons.CheckSquareIcon}</div>
                           <p class="font-semibold">Вы вошли как</p>
                           <p class="text-sm text-slate-600 dark:text-slate-300">${state.userProfile.email}</p>
                        </div>
                    `;
                } else {
                     authContent = `<button data-action="login" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center gap-2">${Icons.GoogleIcon}<span>Войти через Google</span></button>`;
                }

                contentEl.innerHTML = `
                     <h2 class="text-2xl font-bold mb-4">Аутентификация</h2>
                     <p class="mb-6 text-slate-500 dark:text-slate-400">Войдите в свой аккаунт Google, чтобы предоставить приложению необходимые разрешения.</p>
                     <div class="p-6 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center min-h-[200px]">
                        ${authContent}
                     </div>`;
                addNextButton('Далее', false, !state.isAuthenticated);
                break;
             case 'gemini':
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Ключ Gemini API</h2>
                    <p class="mb-6 text-slate-500 dark:text-slate-400">Получите ключ Gemini API из Google AI Studio. Он необходим для работы ассистента.</p>
                     <div class="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <p class="text-xs text-slate-500 dark:text-slate-400 mb-4"><a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">Получить ключ здесь &rarr;</a></p>
                        <div>
                            <label class="text-sm font-medium">Gemini API Key</label>
                            <input type="password" id="geminiApiKey" class="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 mt-1" value="${state.config.geminiApiKey || ''}">
                        </div>
                    </div>`;
                addNextButton();
                break;
             case 'services': {
                const servicesHtml = Object.entries(DB_SCHEMAS)
                    .filter(([key]) => key !== 'profiles' && key !== 'user_settings' && key !== 'proxies') // Exclude internal tables
                    .map(([key, schema]) => {
                        const isEnabled = state.config.enabledServices[key];
                        const fieldsHtml = schema.fields
                            .filter(field => !['id', 'user_id', 'created_at', 'updated_at'].includes(field.name)) // Exclude common fields
                            .map(field => {
                                const isChecked = state.config.serviceFieldConfig[key]?.[field.name] ?? false;
                                return `
                                    <div class="flex items-center gap-3 py-1.5 px-4" title="${field.description}">
                                        <input type="checkbox" id="field-${key}-${field.name}" data-service="${key}" data-field="${field.name}" ${isChecked ? 'checked' : ''} ${!isEnabled ? 'disabled' : ''} class="w-4 h-4 rounded text-blue-600 bg-slate-200 dark:bg-slate-600 border-slate-300 dark:border-slate-500 focus:ring-blue-500">
                                        <label for="field-${key}-${field.name}" class="text-sm text-slate-700 dark:text-slate-300 flex-1">${field.name}</label>
                                        <span class="font-mono text-xs text-slate-400 dark:text-slate-500">${field.type.split(' ')[0]}</span>
                                    </div>
                                `;
                            }).join('');

                        return `
                            <details class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg" ${isEnabled ? 'open' : ''}>
                                <summary class="p-3 cursor-pointer flex justify-between items-center font-semibold">
                                    <div class="flex items-center gap-3">
                                        <span class="w-5 h-5 text-slate-600 dark:text-slate-300">${Icons[schema.icon]}</span>
                                        <span>${schema.label}</span>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" data-service-toggle="${key}" ${isEnabled ? 'checked' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </summary>
                                <div class="border-t border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/50">
                                    ${fieldsHtml}
                                </div>
                            </details>
                        `;
                    }).join('');
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Службы и Поля</h2>
                    <p class="mb-6 text-slate-500 dark:text-slate-400">Выберите, какие сервисы и какие конкретные поля вы хотите синхронизировать. Это напрямую влияет на то, какие данные будут храниться в вашей базе.</p>
                    <div class="space-y-3">${servicesHtml}</div>
                `;
                addNextButton();
                break;
            }
             case 'proxy':
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Настройка Прокси</h2>
                    <p class="mb-6 text-slate-500 dark:text-slate-400">Прокси-серверы необходимы для обхода региональных ограничений Gemini API. Вы можете управлять ими здесь.</p>
                     <div class="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div class="flex items-center justify-between py-2">
                            <label for="use-proxy-toggle" class="font-medium text-slate-700 dark:text-slate-300">Использовать прокси-серверы</label>
                            <label class="toggle-switch">
                                <input type="checkbox" id="use-proxy-toggle" ${state.config.useProxy ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <p class="text-xs text-slate-500 mt-1">Требует включенного режима Supabase.</p>
                        <button data-action="manage-proxies" class="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md font-semibold text-sm transition-colors">
                            ${Icons.SettingsIcon} <span>Открыть Менеджер прокси</span>
                        </button>
                    </div>
                `;
                addNextButton();
                break;
            case 'database':
                let dbTestStatusHtml;
                switch(state.dbTestStatus) {
                    case 'testing': dbTestStatusHtml = `<span class="text-yellow-500">Тестирование...</span>`; break;
                    case 'ok': dbTestStatusHtml = `<span class="text-green-500">✓ Соединение успешно!</span>`; break;
                    case 'error': dbTestStatusHtml = `<span class="text-red-500">✗ Ошибка соединения.</span>`; break;
                    default: dbTestStatusHtml = `<span>Ожидание теста...</span>`;
                }

                contentEl.innerHTML = `
                     <h2 class="text-2xl font-bold mb-4">Управляющий воркер</h2>
                     <p class="mb-2 text-slate-500 dark:text-slate-400">Этот воркер нужен для безопасного обновления схемы вашей базы данных. Если вы настраиваете его впервые, следуйте инструкции.</p>
                     <p class="mb-6 text-xs text-slate-500 dark:text-slate-400">(Если вы не хотите настраивать воркер сейчас, этот шаг можно пропустить и вернуться к нему позже из настроек).</p>
                     <div class="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-4">
                        <div>
                            <label for="function-url-input" class="font-semibold text-sm">URL функции (db-admin):</label>
                            <input type="url" id="function-url-input" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-sm" placeholder="https://....supabase.co/functions/v1/db-admin" value="${state.config.managementWorkerUrl}">
                        </div>
                        <div>
                            <label for="admin-token-input" class="font-semibold text-sm">Секретный токен (ADMIN_SECRET_TOKEN):</label>
                            <input type="password" id="admin-token-input" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-sm" value="${state.config.adminSecretToken}">
                        </div>
                        <div class="flex justify-between items-center">
                            <button data-action="test-db" class="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-md font-semibold">${state.isLoading ? '...' : 'Проверить'}</button>
                            <div class="text-sm font-semibold">${dbTestStatusHtml}</div>
                        </div>
                     </div>
                `;
                if (state.dbTestStatus === 'ok') {
                    addNextButton('Далее');
                } else {
                    addNextButton('Далее', false, true); // Disabled next button
                }
                addNextButton('Пропустить', true);
                break;
            case 'finish':
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">🎉 Настройка завершена!</h2>
                    <p class="mb-6 text-slate-500 dark:text-slate-400">Нажмите "Завершить", чтобы сохранить настройки и запустить приложение.</p>
                    <div class="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 text-sm space-y-2">
                        <p><strong>Режим:</strong> ${state.authChoice === 'supabase' ? 'Supabase' : 'Прямое подключение'}</p>
                        <p><strong>Google Аккаунт:</strong> ${state.userProfile?.email || 'Не выполнен вход'}</p>
                        <p><strong>Gemini API Ключ:</strong> ${state.config.geminiApiKey ? '✓ Указан' : '✗ Не указан'}</p>
                         <p><strong>Управляющий воркер:</strong> ${state.config.managementWorkerUrl ? '✓ Настроен' : '✗ не настроен'}</p>
                    </div>`;
                const finishBtn = document.createElement('button');
                finishBtn.className = 'px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold';
                finishBtn.textContent = 'Завершить и запустить';
                finishBtn.dataset.action = 'finish';
                footerEl.appendChild(finishBtn);
                break;
        }
    };
    
    const render = () => {
        const stepIndex = state.currentStep;
        const stepConfig = STEPS[stepIndex];

        let authIndicatorHtml = '';
        if (state.isAuthenticated && state.userProfile) {
            const name = state.userProfile.name || state.userProfile.full_name;
            const imageUrl = state.userProfile.imageUrl || state.userProfile.avatar_url;
            authIndicatorHtml = `
                <div class="flex items-center gap-2 text-sm">
                    <img src="${imageUrl}" alt="${name}" class="w-8 h-8 rounded-full">
                    <span class="font-medium text-slate-600 dark:text-slate-300 hidden sm:inline">${name}</span>
                </div>
            `;
        }

        wizardElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col relative text-slate-800 dark:text-slate-100">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div id="wizard-header-left" class="flex items-center gap-4">
                        ${authIndicatorHtml}
                        <div>
                             <h1 class="text-xl font-bold">Мастер Настройки Секретарь+</h1>
                            <p class="text-sm text-slate-500 dark:text-slate-400">Шаг ${stepIndex + 1} из ${STEPS.length}: ${stepConfig.title}</p>
                        </div>
                    </div>
                    <button data-action="exit" class="ml-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400">&times;</button>
                </header>
                <main class="flex-1 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/70" id="wizard-content"></main>
                <footer class="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center" id="wizard-footer"></footer>
                <div id="sub-modal-container"></div>
            </div>`;
        renderStepContent();
    };

    const collectInputs = () => {
        const geminiInput = wizardElement.querySelector('#geminiApiKey');
        if (geminiInput) state.config.geminiApiKey = geminiInput.value.trim();
        
        const urlInput = wizardElement.querySelector('#function-url-input');
        if (urlInput) state.config.managementWorkerUrl = urlInput.value.trim();

        const tokenInput = wizardElement.querySelector('#admin-token-input');
        if (tokenInput) state.config.adminSecretToken = tokenInput.value.trim();
        
        const proxyToggle = wizardElement.querySelector('#use-proxy-toggle');
        if (proxyToggle) state.config.useProxy = proxyToggle.checked;

        // Collect service and field toggles
        wizardElement.querySelectorAll('[data-service-toggle]').forEach(toggle => {
            const serviceKey = toggle.dataset.serviceToggle;
            state.config.enabledServices[serviceKey] = toggle.checked;
        });
        wizardElement.querySelectorAll('input[type="checkbox"][data-service][data-field]').forEach(checkbox => {
            const service = checkbox.dataset.service;
            const field = checkbox.dataset.field;
            if (!state.config.serviceFieldConfig[service]) {
                state.config.serviceFieldConfig[service] = {};
            }
            state.config.serviceFieldConfig[service][field] = checkbox.checked;
        });
    };
    
    const handleNext = async () => {
        collectInputs();
        
        let nextStepIndex = state.currentStep + 1;
        
        // Skip Proxy & DB worker steps if not using Supabase
        while (nextStepIndex < STEPS.length) {
            const nextStepId = STEPS[nextStepIndex].id;
            if ((nextStepId === 'database' || nextStepId === 'proxy') && state.authChoice !== 'supabase') {
                nextStepIndex++;
            } else {
                break;
            }
        }
        
        if (nextStepIndex < STEPS.length) {
            state.currentStep = nextStepIndex;
            render();
        }
    };
    
    const handleBack = () => {
        collectInputs();
        let prevStepIndex = state.currentStep - 1;
        
         while (prevStepIndex >= 0) {
            const prevStepId = STEPS[prevStepIndex].id;
            if ((prevStepId === 'database' || prevStepId === 'proxy') && state.authChoice !== 'supabase') {
                prevStepIndex--;
            } else {
                break;
            }
        }

        if (prevStepIndex >= 0) {
            state.currentStep = prevStepIndex;
            render();
        }
    };

    const handleDirectGoogleAuthSuccess = async (tokenResponse) => {
        state.isLoading = true;
        render();

        if (tokenResponse && !tokenResponse.error) {
            saveGoogleToken(tokenResponse.access_token);
            googleProvider.setAuthToken(tokenResponse.access_token);

            try {
                const profile = await googleProvider.getUserProfile();
                state.isAuthenticated = true;
                state.userProfile = profile;
            } catch (error) {
                console.error("Failed to get Google profile after login:", error);
                alert("Не удалось получить профиль Google после входа. Пожалуйста, попробуйте еще раз.");
                clearGoogleToken();
            }
        } else {
            alert(`Ошибка входа Google: ${tokenResponse.error_description || tokenResponse.error}`);
        }
        
        state.isLoading = false;
        saveStateToSession();
        render(); // Re-render with profile or cleared state
        if (state.isAuthenticated) {
            setTimeout(handleNext, 500);
        }
    };

    const handleLogin = async () => {
        state.isLoading = true;
        render();
        saveStateToSession();
        
        if (state.authChoice === 'supabase') {
            await supabaseService.signInWithGoogle();
        } else {
            googleProvider.initClient(googleClientId, handleDirectGoogleAuthSuccess);
            googleProvider.authenticate();
        }
    };

    const checkAuthStatusOnResume = async () => {
        state.isLoading = true;
        render();

        if (state.authChoice === 'supabase' && supabaseService) {
            const { data: { session } } = await supabaseService.client.auth.getSession();
            if (session) googleProvider.setAuthToken(session.provider_token);
        } else {
             const directToken = getGoogleToken();
             if (directToken) googleProvider.setAuthToken(directToken);
        }

        if (googleProvider.token) {
            try {
                const profile = await googleProvider.getUserProfile();
                state.isAuthenticated = true;
                state.userProfile = profile;
                 if (state.authChoice === 'supabase') {
                    const cloudSettings = await supabaseService.getUserSettings();
                    if (cloudSettings) state.config = { ...state.config, ...cloudSettings };
                }
            } catch {
                state.isAuthenticated = false; state.userProfile = null;
                if(state.authChoice === 'direct') clearGoogleToken();
            }
        }
        
        state.isLoading = false;
        render();

        // If auth succeeded, automatically move to the next step.
        const authStepIndex = STEPS.findIndex(s => s.id === 'auth');
        if (state.isAuthenticated && state.currentStep === authStepIndex) {
            setTimeout(handleNext, 500);
        }
    };

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action], [data-choice], [data-service-toggle]');
        if (!target) return;

        const action = target.dataset.action;
        const choice = target.dataset.choice;
        const serviceToggle = target.dataset.serviceToggle;

        if(serviceToggle) {
             const isChecked = e.target.checked;
             state.config.enabledServices[serviceToggle] = isChecked;
             // Enable/disable field checkboxes when service is toggled
             wizardElement.querySelectorAll(`input[data-service="${serviceToggle}"]`).forEach(el => el.disabled = !isChecked);
             return;
        }

        if (choice) {
            state.authChoice = choice;
            state.config.isSupabaseEnabled = choice === 'supabase';
            render();
            return;
        }

        switch (action) {
            case 'next': await handleNext(); break;
            case 'back': handleBack(); break;
            case 'login': await handleLogin(); break;
            case 'exit': 
                sessionStorage.removeItem('wizardState');
                onComplete(getSettings()); // Exit with old settings
                break;
            case 'finish': 
                collectInputs();
                if (state.authChoice === 'supabase' && supabaseService) {
                    try { await supabaseService.saveUserSettings(state.config); } catch (err) { console.warn("Could not save settings during wizard completion:", err.message); }
                }
                sessionStorage.removeItem('wizardState');
                onComplete(state.config); 
                break;
            case 'test-db':
                collectInputs();
                state.isLoading = true; state.dbTestStatus = 'testing'; render();
                try {
                    const result = await supabaseService.executeSqlViaFunction(state.config.managementWorkerUrl, state.config.adminSecretToken, 'SELECT 1;');
                    state.dbLogOutput = `Успешно! Ответ сервера:\n${JSON.stringify(result, null, 2)}`;
                    state.dbTestStatus = 'ok';
                } catch(error) {
                    state.dbLogOutput = `Ошибка соединения:\n\n${error.message}`;
                    state.dbTestStatus = 'error';
                } finally {
                    state.isLoading = false; render();
                }
                break;
            case 'manage-proxies': {
                const subModalContainer = wizardElement.querySelector('#sub-modal-container');
                const manager = createProxyManagerModal({
                    supabaseService,
                    apiKey: state.config.geminiApiKey,
                    onClose: () => subModalContainer.innerHTML = '',
                });
                subModalContainer.appendChild(manager);
                break;
            }
        }
    };
    
    wizardElement.addEventListener('click', handleAction);
    wizardElement.addEventListener('change', handleAction); // For toggles

    // Initial render / resume
    if (resumeState) {
        checkAuthStatusOnResume();
    } else {
        render();
    }
    
    return wizardElement;
}
