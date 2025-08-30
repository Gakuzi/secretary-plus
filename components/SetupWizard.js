import { getSettings, saveGoogleToken } from '../utils/storage.js';
import { SupabaseService } from '../services/supabase/SupabaseService.js';
import * as Icons from './icons/Icons.js';
import { createProxyManagerModal } from './ProxyManagerModal.js';

export function createSetupWizard({ onComplete, onExit, googleProvider, supabaseConfig, googleClientId, resumeState = null }) {
    const wizardElement = document.createElement('div');
    wizardElement.className = 'fixed inset-0 bg-slate-900 z-50 flex items-center justify-center p-4';
    
    let state = {
        currentStep: 0,
        config: getSettings(),
        authChoice: getSettings().isSupabaseEnabled ? 'supabase' : 'direct',
        isAuthenticated: false,
        userProfile: null,
        isLoading: false,
    };

    let supabaseService = null;

    if (resumeState) {
        state = { ...state, ...resumeState };
    }

    const STEPS = [
        { id: 'welcome', title: 'Добро пожаловать' },
        { id: 'connection', title: 'Способ подключения' },
        { id: 'auth', title: 'Аутентификация' },
        { id: 'gemini', title: 'Gemini API' },
        { id: 'proxies', title: 'Прокси' },
        { id: 'finish', title: 'Завершение' },
    ];
    
    let render; // Forward-declare
    let handleNext; // Forward-declare

    const initSupabase = () => {
        if (!supabaseService && state.authChoice === 'supabase') {
            supabaseService = new SupabaseService(supabaseConfig.url, supabaseConfig.anonKey);
        }
    };
    
    const showProxyManagerModal = () => {
        initSupabase();
        if (!supabaseService) {
            alert("Ошибка: Сервис Supabase не инициализирован. Невозможно открыть менеджер прокси.");
            return;
        }

        const manager = createProxyManagerModal({
            supabaseService: supabaseService,
            onClose: () => {
                manager.remove();
            },
        });
        wizardElement.appendChild(manager);
    };

    const renderStepContent = () => {
        const contentEl = wizardElement.querySelector('#wizard-content');
        const footerEl = wizardElement.querySelector('#wizard-footer');
        contentEl.innerHTML = '';
        footerEl.innerHTML = '';

        if (state.currentStep > 0) {
            const backBtn = document.createElement('button');
            backBtn.className = 'px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold';
            backBtn.textContent = 'Назад';
            backBtn.dataset.action = 'back';
            footerEl.appendChild(backBtn);
        } else {
            footerEl.appendChild(document.createElement('div'));
        }

        const addNextButton = (text = 'Далее', isSkip = false) => {
            const nextBtn = document.createElement('button');
            nextBtn.className = `px-6 py-2 rounded-md font-semibold text-white ${isSkip ? 'bg-slate-500 hover:bg-slate-600' : 'bg-blue-600 hover:bg-blue-700'}`;
            nextBtn.textContent = text;
            nextBtn.dataset.action = 'next';
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
                    <p class="mb-6 text-slate-500 dark:text-slate-400"><strong>Рекомендуется использовать Supabase</strong> для синхронизации и расширенных функций.</p>
                    <div class="grid md:grid-cols-2 gap-6">
                        <div class="choice-card p-4 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-all hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-blue-500 dark:hover:border-blue-500 ${state.authChoice === 'supabase' ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-md' : ''}" data-choice="supabase">
                            <h3 class="font-bold text-lg">Supabase (Рекомендуется)</h3>
                            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Синхронизация настроек и данных, управление прокси.</p>
                        </div>
                        <div class="choice-card p-4 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-all hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-blue-500 dark:hover:border-blue-500 ${state.authChoice === 'direct' ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-md' : ''}" data-choice="direct">
                            <h3 class="font-bold text-lg">Прямое подключение Google</h3>
                            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Простой режим, настройки хранятся только в браузере.</p>
                        </div>
                    </div>`;
                addNextButton();
                break;
            case 'auth':
                // The content for the auth step. If the user is already authenticated (from a redirect),
                // this step will be shown briefly before automatically advancing.
                contentEl.innerHTML = `
                     <h2 class="text-2xl font-bold mb-4">Аутентификация</h2>
                     <p class="mb-6 text-slate-500 dark:text-slate-400">Войдите в свой аккаунт Google, чтобы предоставить приложению разрешения.</p>
                     <div class="p-6 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center min-h-[200px]">
                        ${state.isLoading ? `<div class="text-center"><div class="animate-spin h-8 w-8 border-4 border-slate-300 border-t-transparent rounded-full mx-auto mb-2"></div><p>Ожидание...</p></div>` :
                         state.isAuthenticated ? `
                            <div class="text-center">
                                <p class="text-green-600 dark:text-green-400 font-semibold">✓ Вход выполнен успешно. Переход...</p>
                            </div>` : 
                            `<button data-action="login" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center gap-2">${Icons.GoogleIcon}<span>Войти через Google</span></button>`
                        }
                     </div>`;
                addNextButton('Пропустить', true);
                break;
             case 'gemini':
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Gemini API</h2>
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
            case 'proxies':
                 contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Настройка Прокси (Опционально)</h2>
                    <p class="mb-6 text-slate-500 dark:text-slate-400">Если API Gemini недоступен в вашем регионе, вы можете настроить прокси-серверы для обхода ограничений.</p>
                    <div class="p-6 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-4">
                        <div class="flex items-center gap-4">
                            <label for="use-proxy-toggle-wizard" class="font-medium">Использовать прокси</label>
                            <label class="toggle-switch">
                                <input type="checkbox" id="use-proxy-toggle-wizard" ${state.config.useProxy ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <button data-action="manage-proxies" class="w-full max-w-sm flex items-center justify-center gap-2 px-4 py-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md font-semibold transition-colors">
                            ${Icons.SettingsIcon}
                            <span>Открыть менеджер прокси</span>
                        </button>
                    </div>
                `;
                addNextButton('Далее');
                break;
            case 'finish':
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">🎉 Настройка завершена!</h2>
                    <p class="mb-6 text-slate-500 dark:text-slate-400">Нажмите "Завершить", чтобы сохранить настройки и запустить приложение.</p>
                    <div class="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 text-sm space-y-2">
                        <p><strong>Режим:</strong> ${state.authChoice === 'supabase' ? 'Supabase' : 'Прямое подключение'}</p>
                        <p><strong>Google Аккаунт:</strong> ${state.userProfile?.email || 'Не выполнен вход'}</p>
                        <p><strong>Gemini API Ключ:</strong> ${state.config.geminiApiKey ? '✓ Указан' : '✗ Не указан'}</p>
                    </div>`;
                const finishBtn = document.createElement('button');
                finishBtn.className = 'px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold';
                finishBtn.textContent = 'Завершить и запустить';
                finishBtn.dataset.action = 'finish';
                footerEl.appendChild(finishBtn);
                break;
        }
    };
    
    render = () => {
        const stepIndex = STEPS.findIndex(s => s.id === STEPS[state.currentStep].id);
        const stepConfig = STEPS[stepIndex];

        let authIndicatorHtml = '';
        if (state.isAuthenticated && state.userProfile) {
            authIndicatorHtml = `
                <div class="flex items-center gap-2 text-sm">
                    <img src="${state.userProfile.imageUrl}" alt="${state.userProfile.name}" class="w-6 h-6 rounded-full">
                    <span class="font-medium text-slate-600 dark:text-slate-300 hidden sm:inline">${state.userProfile.name}</span>
                </div>
            `;
        }

        wizardElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col relative text-slate-800 dark:text-slate-100">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div class="flex-1">
                        <h1 class="text-xl font-bold">Мастер Настройки Секретарь+</h1>
                        <p class="text-sm text-slate-500 dark:text-slate-400">Шаг ${stepIndex + 1} из ${STEPS.length}: ${stepConfig.title}</p>
                    </div>
                    ${authIndicatorHtml}
                    <button data-action="exit" class="ml-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></button>
                </header>
                <main class="flex-1 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/70" id="wizard-content"></main>
                <footer class="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center" id="wizard-footer"></footer>
            </div>`;
        renderStepContent();
    };

    const collectInputs = () => {
        const newConfig = { ...state.config };
        const geminiInput = wizardElement.querySelector('#geminiApiKey');
        const useProxyToggle = wizardElement.querySelector('#use-proxy-toggle-wizard');
        if (geminiInput) newConfig.geminiApiKey = geminiInput.value.trim();
        if (useProxyToggle) newConfig.useProxy = useProxyToggle.checked;
        state.config = newConfig;
    };
    
    handleNext = async () => {
        collectInputs();
        
        let nextStepIndex = state.currentStep + 1;
        
        // Skip Gemini step if key already exists from previous session/cloud
        if (nextStepIndex < STEPS.length && STEPS[nextStepIndex].id === 'gemini' && state.config.geminiApiKey) {
            nextStepIndex++;
        }
        // Skip Proxies step if not using Supabase
        if (nextStepIndex < STEPS.length && STEPS[nextStepIndex].id === 'proxies' && state.authChoice !== 'supabase') {
            nextStepIndex++;
        }
        
        if (nextStepIndex < STEPS.length) {
            state.currentStep = nextStepIndex;
            if (STEPS[state.currentStep].id === 'proxies' && state.authChoice === 'supabase') {
                initSupabase();
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
        state.isLoading = true;
        render(); // Show loading indicator
        
        const { ...stateToSave } = state;
        const authStepIndex = STEPS.findIndex(s => s.id === 'auth');
        const resumeData = { ...stateToSave, currentStep: authStepIndex };
        sessionStorage.setItem('wizardState', JSON.stringify(resumeData));

        if (state.authChoice === 'supabase') {
            initSupabase();
            await supabaseService.signInWithGoogle();
        } else {
            googleProvider.initClient(googleClientId, (tokenResponse) => {
                if (tokenResponse && !tokenResponse.error) {
                    // CRITICAL FIX: Save token before reloading to prevent race condition on mobile.
                    saveGoogleToken(tokenResponse.access_token);
                    googleProvider.setAuthToken(tokenResponse.access_token);
                    window.location.reload();
                } else {
                    alert(`Ошибка входа Google: ${tokenResponse.error_description || tokenResponse.error}`);
                    sessionStorage.removeItem('wizardState');
                    state.isLoading = false;
                    render();
                }
            });
            googleProvider.authenticate();
        }
    };

    const checkAuthStatus = async () => {
        state.isLoading = true;
        render();

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
        
        state.isLoading = false;

        const authStepIndex = STEPS.findIndex(s => s.id === 'auth');
        if (state.isAuthenticated && state.currentStep === authStepIndex) {
            render(); // Render the success message briefly
            setTimeout(() => {
                handleNext();
            }, 1000); // Wait 1 second before automatically advancing
        } else {
            render();
        }
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
            case 'exit': onExit(); break;
            case 'finish': 
                collectInputs();
                if (supabaseService) {
                    await supabaseService.saveUserSettings(state.config);
                }
                sessionStorage.removeItem('wizardState');
                onComplete(state.config); 
                break;
            case 'manage-proxies':
                showProxyManagerModal();
                break;
        }
    };
    
    wizardElement.addEventListener('click', handleAction);
    wizardElement.addEventListener('change', (e) => {
        const useProxyToggle = e.target.closest('#use-proxy-toggle-wizard');
        if (useProxyToggle) {
            state.config.useProxy = useProxyToggle.checked;
        }
    });

    if (resumeState) {
        checkAuthStatus();
    } else {
        render();
    }
    
    return wizardElement;
}