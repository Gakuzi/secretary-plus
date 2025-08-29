import { getSettings, saveSettings } from '../utils/storage.js';
import { SupabaseService } from '../services/supabase/SupabaseService.js';
import { testProxyConnection } from '../services/geminiService.js';
import * as Icons from './icons/Icons.js';

export function createSetupWizard({ onComplete, googleProvider, resumeState = null }) {
    const wizardElement = document.createElement('div');
    wizardElement.className = 'fixed inset-0 bg-gray-900 z-50 flex items-center justify-center';

    let state = {
        currentStep: 0,
        config: getSettings(),
        authChoice: getSettings().isSupabaseEnabled ? 'supabase' : 'direct',
        isAuthenticated: false,
        userProfile: null,
        proxies: [],
        isLoading: false,
    };

    let supabaseService = null;

    if (resumeState) {
        state = { ...state, ...resumeState };
    }

    const STEPS = [
        { id: 'welcome', title: 'Добро пожаловать' },
        { id: 'connection', title: 'Способ подключения' },
        { id: 'credentials', title: 'Ключи и доступы' },
        { id: 'auth', title: 'Аутентификация' },
        { id: 'gemini', title: 'Gemini API' },
        { id: 'proxies', title: 'Прокси (для Supabase)' },
        { id: 'finish', title: 'Завершение' },
    ];

    const render = () => {
        const stepConfig = STEPS[state.currentStep];
        wizardElement.innerHTML = `
            <div class="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col">
                <header class="p-4 border-b border-gray-700 flex-shrink-0">
                    <h1 class="text-xl font-bold text-white">Мастер Настройки Секретарь+</h1>
                    <p class="text-sm text-gray-400">Шаг ${state.currentStep + 1} из ${STEPS.length}: ${stepConfig.title}</p>
                </header>
                <main class="flex-1 p-6 overflow-y-auto" id="wizard-content">
                    <!-- Step content is rendered here -->
                </main>
                <footer class="p-4 border-t border-gray-700 flex justify-between items-center flex-shrink-0" id="wizard-footer">
                    <!-- Footer buttons are rendered here -->
                </footer>
            </div>
        `;
        renderStepContent();
        attachEventListeners();
    };

    const renderStepContent = () => {
        const contentEl = wizardElement.querySelector('#wizard-content');
        const footerEl = wizardElement.querySelector('#wizard-footer');
        contentEl.innerHTML = '';
        footerEl.innerHTML = '';

        // Back button (for all steps except the first)
        if (state.currentStep > 0) {
            const backBtn = document.createElement('button');
            backBtn.className = 'px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold';
            backBtn.textContent = 'Назад';
            backBtn.dataset.action = 'back';
            footerEl.appendChild(backBtn);
        } else {
            footerEl.appendChild(document.createElement('div')); // Placeholder for alignment
        }

        // Step-specific content and next button
        switch (state.currentStep) {
            case 0: // Welcome
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">Настройка «Секретарь+»</h2>
                    <p>Этот мастер поможет вам настроить все необходимые параметры для работы приложения, включая подключение к сервисам Google и получение API ключей.</p>
                    <p class="mt-2">Следуйте инструкциям на каждом шаге. Процесс займет около 5-10 минут.</p>
                `;
                addNextButton(footerEl, 'Начать');
                break;
            case 1: // Connection Choice
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">1. Выбор способа подключения</h2>
                    <p class="mb-6 text-gray-400">Приложение поддерживает два способа. <strong>Рекомендуется использовать Supabase.</strong></p>
                    <div class="grid md:grid-cols-2 gap-6">
                        <div class="choice-card ${state.authChoice === 'supabase' ? 'selected' : ''}" data-choice="supabase">
                            <h3 class="font-bold text-lg">Supabase (Рекомендуется)</h3>
                            <p class="text-sm text-gray-400 mt-1">Безопасная аутентификация и облачная база данных для синхронизации настроек, контактов, файлов и управления прокси.</p>
                            <ul class="text-xs mt-2 space-y-1 list-disc list-inside"><li>Быстрый поиск по данным</li><li>Синхронизация между устройствами</li><li>Управление прокси-серверами</li></ul>
                        </div>
                        <div class="choice-card ${state.authChoice === 'direct' ? 'selected' : ''}" data-choice="direct">
                            <h3 class="font-bold text-lg">Прямое подключение Google</h3>
                            <p class="text-sm text-gray-400 mt-1">Простой способ без базы данных. Настройки хранятся только в браузере. Синхронизация и управление прокси недоступны.</p>
                             <ul class="text-xs mt-2 space-y-1 list-disc list-inside"><li>Более простая настройка</li><li>Не требует базы данных</li></ul>
                        </div>
                    </div>
                `;
                addNextButton(footerEl);
                break;
            case 2: // Credentials
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">2. Ключи и доступы</h2>
                    <p class="mb-6 text-gray-400">Теперь необходимо получить ключи из Google Cloud и, если нужно, из Supabase.</p>
                    
                    ${state.authChoice === 'supabase' ? `
                    <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 mb-6">
                        <h3 class="font-semibold text-lg">Supabase</h3>
                        <p class="text-xs text-gray-400 mb-4">Создайте проект, выполните SQL скрипт и получите ключи. <a href="https://github.com/e210s/secretary-plus/blob/main/SUPABASE_SETUP.md" target="_blank" class="text-blue-400 hover:underline">Подробная инструкция &rarr;</a></p>
                        <div class="space-y-4">
                            <div>
                                <label class="text-sm font-medium">Supabase Project URL</label>
                                <input id="supabaseUrl" class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1" value="${state.config.supabaseUrl || ''}">
                            </div>
                            <div>
                                <label class="text-sm font-medium">Supabase Anon Key</label>
                                <input type="password" id="supabaseAnonKey" class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1" value="${state.config.supabaseAnonKey || ''}">
                            </div>
                        </div>
                    </div>` : ''}

                     <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                        <h3 class="font-semibold text-lg">Google Cloud</h3>
                        <p class="text-xs text-gray-400 mb-4">Создайте проект, включите необходимые API и получите Client ID. <a href="https://github.com/e210s/secretary-plus/blob/main/GOOGLE_CLOUD_SETUP.md" target="_blank" class="text-blue-400 hover:underline">Подробная инструкция &rarr;</a></p>
                        <div>
                            <label class="text-sm font-medium">Google Client ID</label>
                            <input id="googleClientId" class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1" value="${state.config.googleClientId || ''}">
                        </div>
                    </div>
                `;
                addNextButton(footerEl);
                break;
            case 3: // Authentication
                contentEl.innerHTML = `
                     <h2 class="text-2xl font-bold mb-4">3. Аутентификация</h2>
                     <p class="mb-6 text-gray-400">Теперь войдите в свой аккаунт Google, чтобы предоставить приложению необходимые разрешения.</p>
                     <div class="p-6 bg-gray-900/50 rounded-lg border border-gray-700 flex items-center justify-center min-h-[200px]">
                        ${state.isLoading ? `<div class="text-center"><p>Ожидание...</p></div>` :
                         state.isAuthenticated && state.userProfile ? `
                            <div class="text-center">
                                <img src="${state.userProfile.imageUrl}" class="w-20 h-20 rounded-full mx-auto mb-4">
                                <p class="font-bold text-lg">${state.userProfile.name}</p>
                                <p class="text-sm text-gray-400">${state.userProfile.email}</p>
                                <p class="text-green-400 mt-4">✓ Вход выполнен успешно</p>
                            </div>
                        ` : `
                            <button data-action="login" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold flex items-center gap-2">
                                ${Icons.GoogleIcon}
                                <span>Войти через Google</span>
                            </button>
                        `}
                     </div>
                `;
                addNextButton(footerEl, state.isAuthenticated ? 'Далее' : 'Пропустить', !state.isAuthenticated);
                break;
             case 4: // Gemini API
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">4. Gemini API</h2>
                    <p class="mb-6 text-gray-400">Получите ключ Gemini API из Google AI Studio. Он необходим для работы ассистента.</p>
                     <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                        <p class="text-xs text-gray-400 mb-4"><a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-blue-400 hover:underline">Получить ключ здесь &rarr;</a></p>
                        <div>
                            <label class="text-sm font-medium">Gemini API Key</label>
                            <input type="password" id="geminiApiKey" class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1" value="${state.config.geminiApiKey || ''}">
                        </div>
                    </div>
                `;
                addNextButton(footerEl);
                break;
            case 5: // Proxies
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">5. Настройка Прокси (Опционально)</h2>
                    <p class="mb-6 text-gray-400">Если API Gemini недоступен в вашем регионе, настройте прокси-сервер. <a href="https://github.com/e210s/secretary-plus/blob/main/PROXY_SETUP.md" target="_blank" class="text-blue-400 hover:underline">Инструкция по настройке &rarr;</a></p>
                    <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                        <div class="flex items-center justify-between mb-4">
                             <h3 class="font-semibold text-lg">Список прокси-серверов</h3>
                             <button data-action="add-proxy" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-md text-sm font-semibold whitespace-nowrap">Добавить</button>
                        </div>
                        <div id="proxy-list-container" class="space-y-2 max-h-60 overflow-y-auto"></div>
                    </div>
                    <div id="proxy-editor-container"></div>
                `;
                renderProxyList();
                addNextButton(footerEl);
                break;
            case 6: // Finish
                contentEl.innerHTML = `
                    <h2 class="text-2xl font-bold mb-4">🎉 Настройка завершена!</h2>
                    <p class="mb-6 text-gray-400">Все необходимые параметры настроены. Нажмите "Завершить", чтобы сохранить настройки и запустить приложение.</p>
                    <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 text-sm space-y-2">
                        <p><strong>Режим:</strong> ${state.authChoice === 'supabase' ? 'Supabase' : 'Прямое подключение'}</p>
                        <p><strong>Google Аккаунт:</strong> ${state.userProfile?.email || 'Не выполнен вход'}</p>
                        <p><strong>Gemini API Ключ:</strong> ${state.config.geminiApiKey ? '✓ Указан' : '✗ Не указан'}</p>
                        ${state.authChoice === 'supabase' ? `<p><strong>Прокси:</strong> ${state.proxies.length} настроено</p>` : ''}
                    </div>
                `;
                const finishBtn = document.createElement('button');
                finishBtn.className = 'px-6 py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold';
                finishBtn.textContent = 'Завершить и запустить';
                finishBtn.dataset.action = 'finish';
                footerEl.appendChild(finishBtn);
                break;
        }
    };

    const addNextButton = (footerEl, text = 'Далее', skip = false) => {
        const nextBtn = document.createElement('button');
        nextBtn.className = `px-6 py-2 rounded-md font-semibold ${skip ? 'bg-gray-600 hover:bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}`;
        nextBtn.textContent = text;
        nextBtn.dataset.action = 'next';
        footerEl.appendChild(nextBtn);
    };

    const collectInputs = () => {
        const newConfig = { ...state.config };
        const inputs = wizardElement.querySelectorAll('input');
        inputs.forEach(input => {
            if (input.id) {
                newConfig[input.id] = input.type === 'checkbox' ? input.checked : input.value;
            }
        });
        state.config = newConfig;
    };
    
    const handleNext = () => {
        collectInputs();
        let nextStep = state.currentStep + 1;
        // Skip proxies if not in supabase mode
        if (state.authChoice === 'direct' && nextStep === 5) {
            nextStep++;
        }
        if (nextStep < STEPS.length) {
            state.currentStep = nextStep;
            render();
        }
    };
    
    const handleBack = () => {
        collectInputs();
        let prevStep = state.currentStep - 1;
        // Skip proxies if not in supabase mode
        if (state.authChoice === 'direct' && prevStep === 5) {
            prevStep--;
        }
        if (prevStep >= 0) {
            state.currentStep = prevStep;
            render();
        }
    };

    const handleLogin = async () => {
        collectInputs(); // Save any credentials entered before login
        
        // Save current wizard state to session storage to resume after OAuth redirect
        const resumeData = { ...state, currentStep: 3 }; // Force resume at auth step
        sessionStorage.setItem('wizardState', JSON.stringify(resumeData));

        if (state.authChoice === 'supabase') {
            if (!supabaseService) {
                try {
                    supabaseService = new SupabaseService(state.config.supabaseUrl, state.config.supabaseAnonKey);
                } catch (e) {
                    alert(`Ошибка подключения к Supabase: ${e.message}`);
                    return;
                }
            }
            await supabaseService.signInWithGoogle();
        } else {
            googleProvider.initClient(state.config.googleClientId, async (tokenResponse) => {
                if (tokenResponse && !tokenResponse.error) {
                    googleProvider.setAuthToken(tokenResponse.access_token);
                    // Since this is a callback, we can't easily resume the wizard state here.
                    // The main app's resume logic will handle this. We just need to trigger a reload.
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
            if (!supabaseService && state.config.supabaseUrl && state.config.supabaseAnonKey) {
                supabaseService = new SupabaseService(state.config.supabaseUrl, state.config.supabaseAnonKey);
            }
            if (supabaseService) {
                const { data: { session } } = await supabaseService.client.auth.getSession();
                if (session) {
                    googleProvider.setAuthToken(session.provider_token);
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
        render(); // Re-render to show auth status
    };
    
    // --- PROXY LOGIC ---
    const renderProxyList = async () => {
        if (!supabaseService) return;
        state.isLoading = true;
        render();
        try {
            state.proxies = await supabaseService.getProxies();
            const container = wizardElement.querySelector('#proxy-list-container');
            if (container) {
                if (state.proxies.length === 0) {
                    container.innerHTML = `<p class="text-center text-gray-500 text-sm py-4">Прокси не добавлены.</p>`;
                } else {
                    container.innerHTML = state.proxies.map(p => `
                        <div class="bg-gray-800 p-2 rounded-md flex items-center gap-2 text-sm">
                           <div class="w-3 h-3 rounded-full ${p.last_status === 'ok' ? 'bg-green-500' : p.last_status === 'error' ? 'bg-red-500' : 'bg-gray-500'}"></div>
                           <div class="flex-1 truncate" title="${p.url}">${p.alias || p.url}</div>
                           <div class="text-xs text-gray-400">P: ${p.priority}</div>
                           <button data-action="test-proxy" data-id="${p.id}" class="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded">Тест</button>
                           <button data-action="edit-proxy" data-id="${p.id}" class="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded">Изм.</button>
                           <button data-action="delete-proxy" data-id="${p.id}" class="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded">Удл.</button>
                        </div>
                    `).join('');
                }
            }
        } catch (e) {
            alert(`Ошибка загрузки прокси: ${e.message}`);
        } finally {
            state.isLoading = false;
        }
    }
    
    // ... Other proxy functions (add, edit, delete, test) will be here
    const showProxyEditor = (proxy = null) => {
        // ... implementation from old SettingsModal
    };

    const attachEventListeners = () => {
        wizardElement.addEventListener('click', async (e) => {
            const target = e.target.closest('[data-action], [data-choice]');
            if (!target) return;

            const action = target.dataset.action;
            const choice = target.dataset.choice;
            
            if (choice) {
                state.authChoice = choice;
                state.config.isSupabaseEnabled = choice === 'supabase';
                render();
            }

            switch (action) {
                case 'next': handleNext(); break;
                case 'back': handleBack(); break;
                case 'login': handleLogin(); break;
                case 'finish': 
                    collectInputs();
                    state.config.proxies = state.proxies;
                    onComplete(state.config); 
                    break;
                // Proxy actions would be here
            }
        });
    };
    
    // Initial render
    if (resumeState) {
        checkAuthStatus();
    } else {
        render();
    }
    
    return wizardElement;
}
