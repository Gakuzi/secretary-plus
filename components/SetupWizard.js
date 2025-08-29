import { getSettings } from '../utils/storage.js';
import { SupabaseService } from '../services/supabase/SupabaseService.js';
import { testProxyConnection, findProxiesWithGemini } from '../services/geminiService.js';
import * as Icons from './icons/Icons.js';

export function createSetupWizard({ onComplete, onExit, googleProvider, supabaseConfig, googleClientId, resumeState = null }) {
    const wizardElement = document.createElement('div');
    wizardElement.className = 'fixed inset-0 bg-gray-900 z-50 flex items-center justify-center p-4';
    
    let abortController = null;

    let state = {
        currentStep: 0,
        config: getSettings(),
        authChoice: getSettings().isSupabaseEnabled ? 'supabase' : 'direct',
        isAuthenticated: false,
        userProfile: null,
        foundProxies: [],
        savedProxies: [],
        isLoading: false,
        statusMessage: '',
        testingProxyUrl: null,
    };

    let supabaseService = null;

    if (resumeState) {
        state = { ...state, ...resumeState };
    }

    // Simplified steps - credentials step is removed
    const STEPS = [
        { id: 'welcome', title: 'Добро пожаловать' },
        { id: 'connection', title: 'Способ подключения' },
        { id: 'auth', title: 'Аутентификация' },
        { id: 'gemini', title: 'Gemini API' },
        { id: 'proxies', title: 'Прокси' },
        { id: 'finish', title: 'Завершение' },
    ];
    
    let render; // Forward-declare

    const initSupabase = () => {
        if (!supabaseService && state.authChoice === 'supabase') {
            supabaseService = new SupabaseService(supabaseConfig.url, supabaseConfig.anonKey);
        }
    };
    
    const renderProxyManager = () => `
        <h2 class="text-2xl font-bold mb-4">Настройка Прокси (Опционально)</h2>
        <p class="mb-6 text-gray-400">Если API Gemini недоступен в вашем регионе, используйте ИИ для поиска и настройки прокси.</p>
        <div class="grid md:grid-cols-2 gap-6">
            <div>
                <button data-action="find-proxies" class="w-full mb-3 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-semibold" ${state.isLoading ? 'disabled' : ''}>
                    ${state.isLoading && !state.testingProxyUrl ? 'Поиск...' : 'Найти прокси с помощью ИИ'}
                </button>
                <h4 class="font-semibold mb-2">Найденные прокси</h4>
                <div id="found-proxy-list" class="space-y-2 max-h-40 overflow-y-auto pr-2">
                    ${state.isLoading && !state.testingProxyUrl ? `<p class="text-sm text-gray-500 text-center py-4">Поиск...</p>` :
                     state.foundProxies.length === 0 ? `<p class="text-sm text-gray-500 text-center py-4">Нажмите "Найти", чтобы начать.</p>` :
                     state.foundProxies.map(p => `
                        <div class="proxy-list-item">
                            <div class="status-indicator status-untested"></div>
                             <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.location ? `${p.location}: ` : ''}${p.url}</div>
                            <button data-action="test-proxy" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded">Тест</button>
                        </div>
                     `).join('')
                    }
                </div>
            </div>
            <div>
                <h4 class="font-semibold mb-2">Сохраненные прокси</h4>
                <div id="saved-proxy-list" class="space-y-2 max-h-48 overflow-y-auto pr-2">
                    ${state.savedProxies.length === 0 ? `<p class="text-sm text-gray-500 text-center py-4">Нет сохраненных прокси.</p>` :
                     state.savedProxies.map(p => `
                        <div class="proxy-list-item">
                            <div class="status-indicator ${p.last_status === 'ok' ? 'status-ok' : p.last_status === 'error' ? 'status-error' : 'status-untested'}" title="Статус: ${p.last_status}"></div>
                            <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.url}</div>
                        </div>
                     `).join('')
                    }
                </div>
            </div>
        </div>
    `;

    const renderStepContent = () => {
        const contentEl = wizardElement.querySelector('#wizard-content');
        const footerEl = wizardElement.querySelector('#wizard-footer');
        contentEl.innerHTML = '';
        footerEl.innerHTML = '';

        if (state.currentStep > 0) {
            const backBtn = document.createElement('button');
            backBtn.className = 'px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold';
            backBtn.textContent = 'Назад';
            backBtn.dataset.action = 'back';
            footerEl.appendChild(backBtn);
        } else {
            footerEl.appendChild(document.createElement('div'));
        }

        const addNextButton = (text = 'Далее', skip = false) => {
            const nextBtn = document.createElement('button');
            nextBtn.className = `px-6 py-2 rounded-md font-semibold ${skip ? 'bg-gray-600 hover:bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}`;
            nextBtn.textContent = text;
            nextBtn.dataset.action = 'next';
            footerEl.appendChild(nextBtn);
        };

        switch (STEPS[state.currentStep].id) {
            case 'welcome':
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Настройка «Секретарь+»</h2>
                    <p>Этот мастер поможет вам настроить все необходимые параметры для работы приложения.</p>`;
                addNextButton('Начать');
                break;
            case 'connection':
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Выбор способа подключения</h2>
                    <p class="mb-6 text-gray-400"><strong>Рекомендуется использовать Supabase</strong> для синхронизации и расширенных функций.</p>
                    <div class="grid md:grid-cols-2 gap-6">
                        <div class="choice-card ${state.authChoice === 'supabase' ? 'selected' : ''}" data-choice="supabase">
                            <h3 class="font-bold text-lg">Supabase (Рекомендуется)</h3>
                            <p class="text-sm text-gray-400 mt-1">Синхронизация настроек и данных, управление прокси.</p>
                        </div>
                        <div class="choice-card ${state.authChoice === 'direct' ? 'selected' : ''}" data-choice="direct">
                            <h3 class="font-bold text-lg">Прямое подключение Google</h3>
                            <p class="text-sm text-gray-400 mt-1">Простой режим, настройки хранятся только в браузере.</p>
                        </div>
                    </div>`;
                addNextButton();
                break;
            case 'auth':
                contentEl.innerHTML = `
                     <h2 class="text-2xl font-bold mb-4">Аутентификация</h2>
                     <p class="mb-6 text-gray-400">Войдите в свой аккаунт Google, чтобы предоставить приложению разрешения.</p>
                     <div class="p-6 bg-gray-900/50 rounded-lg border border-gray-700 flex items-center justify-center min-h-[200px]">
                        ${state.isLoading ? `<div class="text-center"><p>Ожидание...</p></div>` :
                         state.isAuthenticated && state.userProfile ? `
                            <div class="text-center">
                                <img src="${state.userProfile.imageUrl}" class="w-20 h-20 rounded-full mx-auto mb-4">
                                <p class="font-bold text-lg">${state.userProfile.name}</p>
                                <p class="text-sm text-gray-400">${state.userProfile.email}</p>
                                <p class="text-green-400 mt-4">✓ Вход выполнен успешно</p>
                            </div>` : 
                            `<button data-action="login" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold flex items-center gap-2">${Icons.GoogleIcon}<span>Войти через Google</span></button>`
                        }
                     </div>`;
                addNextButton(state.isAuthenticated ? 'Далее' : 'Пропустить', !state.isAuthenticated);
                break;
             case 'gemini':
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Gemini API</h2>
                    <p class="mb-6 text-gray-400">Получите ключ Gemini API из Google AI Studio. Он необходим для работы ассистента.</p>
                     <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                        <p class="text-xs text-gray-400 mb-4"><a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-blue-400 hover:underline">Получить ключ здесь &rarr;</a></p>
                        <div>
                            <label class="text-sm font-medium">Gemini API Key</label>
                            <input type="password" id="geminiApiKey" class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1" value="${state.config.geminiApiKey || ''}">
                        </div>
                    </div>`;
                addNextButton();
                break;
            case 'proxies':
                contentEl.innerHTML = renderProxyManager();
                addNextButton();
                break;
            case 'finish':
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">🎉 Настройка завершена!</h2>
                    <p class="mb-6 text-gray-400">Нажмите "Завершить", чтобы сохранить настройки и запустить приложение.</p>
                    <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 text-sm space-y-2">
                        <p><strong>Режим:</strong> ${state.authChoice === 'supabase' ? 'Supabase' : 'Прямое подключение'}</p>
                        <p><strong>Google Аккаунт:</strong> ${state.userProfile?.email || 'Не выполнен вход'}</p>
                        <p><strong>Gemini API Ключ:</strong> ${state.config.geminiApiKey ? '✓ Указан' : '✗ Не указан'}</p>
                    </div>`;
                const finishBtn = document.createElement('button');
                finishBtn.className = 'px-6 py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold';
                finishBtn.textContent = 'Завершить и запустить';
                finishBtn.dataset.action = 'finish';
                footerEl.appendChild(finishBtn);
                break;
        }
    };
    
    render = () => {
        const stepIndex = STEPS.findIndex(s => s.id === STEPS[state.currentStep].id);
        const stepConfig = STEPS[state.currentStep];
        wizardElement.innerHTML = `
            <div class="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col">
                <header class="p-4 border-b border-gray-700 flex justify-between items-center">
                    <div>
                        <h1 class="text-xl font-bold">Мастер Настройки Секретарь+</h1>
                        <p class="text-sm text-gray-400">Шаг ${stepIndex + 1} из ${STEPS.length}: ${stepConfig.title}</p>
                    </div>
                    <button data-action="exit" class="p-2 rounded-full hover:bg-gray-700"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></button>
                </header>
                <main class="flex-1 p-6 overflow-y-auto" id="wizard-content"></main>
                <footer class="p-4 border-t border-gray-700 flex justify-between items-center" id="wizard-footer"></footer>
                <div id="proxy-test-modal" class="hidden fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div id="proxy-test-modal-content" class="bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 flex flex-col items-center justify-center text-center"></div>
                </div>
            </div>`;
        renderStepContent();
    };

    const collectInputs = () => {
        const newConfig = { ...state.config };
        const geminiInput = wizardElement.querySelector('#geminiApiKey');
        if (geminiInput) newConfig.geminiApiKey = geminiInput.value.trim();
        state.config = newConfig;
    };
    
    const handleNext = async () => {
        collectInputs();
        
        let nextStepIndex = state.currentStep + 1;
        
        // Intelligent skip logic
        if (nextStepIndex < STEPS.length && STEPS[nextStepIndex].id === 'gemini' && state.config.geminiApiKey) {
            nextStepIndex++;
        }
        if (nextStepIndex < STEPS.length && STEPS[nextStepIndex].id === 'proxies' && state.authChoice !== 'supabase') {
            nextStepIndex++;
        }
        
        if (nextStepIndex < STEPS.length) {
            state.currentStep = nextStepIndex;
            if (STEPS[state.currentStep].id === 'proxies' && state.authChoice === 'supabase') {
                initSupabase();
                state.savedProxies = await supabaseService.getProxies();
            }
            render();
        }
    };
    
    const handleBack = () => {
        collectInputs();
        let prevStepIndex = state.currentStep - 1;
        
        if (prevStepIndex >= 0 && STEPS[prevStepIndex].id === 'proxies' && state.authChoice !== 'supabase') {
            prevStepIndex--;
        }

        if (prevStepIndex >= 0) {
            state.currentStep = prevStepIndex;
            render();
        }
    };

    const handleLogin = async () => {
        const resumeData = { ...state, currentStep: 2 }; // Return to Auth step
        sessionStorage.setItem('wizardState', JSON.stringify(resumeData));

        if (state.authChoice === 'supabase') {
            initSupabase();
            await supabaseService.signInWithGoogle();
        } else {
            googleProvider.initClient(googleClientId, (tokenResponse) => {
                if (tokenResponse && !tokenResponse.error) {
                    googleProvider.setAuthToken(tokenResponse.access_token);
                    window.location.reload();
                } else {
                    alert(`Ошибка входа Google: ${tokenResponse.error_description || tokenResponse.error}`);
                    sessionStorage.removeItem('wizardState');
                }
            });
            googleProvider.authenticate();
        }
    };

    const checkAuthStatus = async () => {
        if (state.authChoice === 'supabase') {
            initSupabase();
            const { data: { session } } = await supabaseService.client.auth.getSession();
            if (session) {
                googleProvider.setAuthToken(session.provider_token);
                const cloudSettings = await supabaseService.getUserSettings();
                if (cloudSettings) {
                    state.config = { ...state.config, ...cloudSettings };
                }
            }
        }
        if (googleProvider.token) {
            try {
                const profile = await googleProvider.getUserProfile();
                state.isAuthenticated = true;
                state.userProfile = profile;
            } catch {
                state.isAuthenticated = false;
                state.userProfile = null;
            }
        }
        render();
    };

    const runProxyTest = async (url) => {
        if (abortController) {
            abortController.abort();
        }
        abortController = new AbortController();
        const { signal } = abortController;

        state.testingProxyUrl = url;
        const modal = wizardElement.querySelector('#proxy-test-modal');
        const content = wizardElement.querySelector('#proxy-test-modal-content');
        modal.classList.remove('hidden');
        content.innerHTML = `
            <p class="font-semibold mb-2">Тестирование...</p>
            <p class="font-mono text-sm text-gray-400 break-all">${url}</p>
            <div class="loading-dots mt-4"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
            <button data-action="cancel-test" class="mt-6 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm">Отмена</button>
        `;
        const result = await testProxyConnection({ proxyUrl: url, signal });
        
        if (signal.aborted) {
            return;
        }
        
        if (result.status === 'cancelled') {
            modal.classList.add('hidden');
            abortController = null;
            return;
        }

         const testResultHtml = `
            <div class="w-full text-left text-sm mt-4 space-y-2">
                <div class="test-result-item">
                    <span class="test-result-label">Статус</span>
                    <span class="test-result-value font-bold ${result.status === 'ok' ? 'text-green-400' : 'text-red-400'}">${result.status === 'ok' ? 'УСПЕШНО' : 'ОШИБКА'}</span>
                </div>
                 ${result.speed !== null ? `<div class="test-result-item">
                    <span class="test-result-label">Пинг</span>
                    <span class="test-result-value">${result.speed} мс</span>
                </div>` : ''}
                ${result.geolocation ? `<div class="test-result-item">
                    <span class="test-result-label">IP адрес</span>
                    <span class="test-result-value">${result.geolocation}</span>
                </div>` : ''}
            </div>
             ${result.status !== 'ok' ? `<p class="text-xs text-gray-500 mt-2 text-center w-full">${result.message}</p>` : ''}
        `;
        
        content.innerHTML = `
            <p class="font-semibold text-lg mb-2">Результат теста</p>
            <p class="font-mono text-sm text-gray-400 break-all mb-2">${url}</p>
            ${testResultHtml}
            <div class="flex gap-3 mt-6">
                <button data-action="retest-proxy" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Повторить</button>
                <button data-action="reject-proxy" class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-md">Отклонить</button>
                ${result.status === 'ok' ? `<button data-action="use-proxy" data-speed="${result.speed}" data-geo="${result.geolocation || ''}" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md">Использовать</button>` : ''}
            </div>`;
        
        abortController = null;
    };

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action], [data-choice]');
        if (!target) return;

        const action = target.dataset.action;
        const choice = target.dataset.choice;

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
                if (abortController) abortController.abort();
                onExit(); 
                break;
            case 'finish': 
                collectInputs();
                if (supabaseService) {
                    await supabaseService.saveUserSettings(state.config);
                }
                onComplete(state.config); 
                break;
            case 'find-proxies': {
                state.isLoading = true;
                state.foundProxies = [];
                render();
                try {
                    const proxies = await findProxiesWithGemini({ apiKey: state.config.geminiApiKey });
                    state.foundProxies = proxies;
                } catch (err) {
                    alert(`Ошибка поиска прокси: ${err.message}`);
                } finally {
                    state.isLoading = false;
                    render();
                }
                break;
            }
            case 'test-proxy': {
                await runProxyTest(target.dataset.url);
                break;
            }
            case 'retest-proxy': {
                await runProxyTest(state.testingProxyUrl);
                break;
            }
            case 'cancel-test':
                if (abortController) {
                    abortController.abort();
                }
                break;
            case 'reject-proxy': {
                if (abortController) abortController.abort();
                state.foundProxies = state.foundProxies.filter(p => p.url !== state.testingProxyUrl);
                state.testingProxyUrl = null;
                wizardElement.querySelector('#proxy-test-modal').classList.add('hidden');
                render();
                break;
            }
            case 'use-proxy': {
                try {
                    const newProxy = await supabaseService.addProxy({ 
                        url: state.testingProxyUrl, 
                        last_status: 'ok',
                        last_speed_ms: target.dataset.speed,
                        geolocation: target.dataset.geo,
                    });
                    state.savedProxies.push(newProxy);
                    state.foundProxies = state.foundProxies.filter(p => p.url !== state.testingProxyUrl);
                    state.testingProxyUrl = null;
                    wizardElement.querySelector('#proxy-test-modal').classList.add('hidden');
                    render();
                } catch (err) {
                    alert(`Не удалось сохранить прокси: ${err.message}`);
                }
                break;
            }
        }
    };
    
    wizardElement.addEventListener('click', handleAction);

    if (resumeState) {
        checkAuthStatus();
    } else {
        render();
    }
    
    return wizardElement;
}