import { getSettings, saveSettings } from '../utils/storage.js';
import { SupabaseService } from '../services/supabase/SupabaseService.js';
import { testProxyConnection, extractProxiesWithGemini } from '../services/geminiService.js';
import * as Icons from './icons/Icons.js';

export function createSetupWizard({ onComplete, onExit, googleProvider, resumeState = null }) {
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
        statusMessage: '',
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
    
    // Forward-declare render so handlers can use it
    let render; 

    const addNextButton = (footerEl, text = 'Далее', skip = false) => {
        const nextBtn = document.createElement('button');
        nextBtn.className = `px-6 py-2 rounded-md font-semibold ${skip ? 'bg-gray-600 hover:bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}`;
        nextBtn.textContent = text;
        nextBtn.dataset.action = 'next';
        footerEl.appendChild(nextBtn);
    };

    const renderProxyList = async () => {
        if (!supabaseService || !state.isAuthenticated) return;
        state.isLoading = true;
        render(); // Re-render to show loading state
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
                           <button data-action="delete-proxy" data-id="${p.id}" class="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded">Удл.</button>
                        </div>
                    `).join('');
                }
            }
        } catch (e) {
            alert(`Ошибка загрузки прокси: ${e.message}`);
        } finally {
            state.isLoading = false;
            // We don't call render() here to avoid a loop. The UI will update on the next action.
        }
    }
    
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
                    <div class="grid md:grid-cols-2 gap-6">
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                             <h3 class="font-semibold text-lg mb-3">Список прокси</h3>
                             <div id="proxy-list-container" class="space-y-2 max-h-60 overflow-y-auto">${state.isLoading ? '<p>Загрузка...</p>' : ''}</div>
                        </div>
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                             <h3 class="font-semibold text-lg">Импорт с помощью ИИ</h3>
                             <p class="text-xs text-gray-400">Вставьте скопированный список прокси в поле ниже. ИИ автоматически найдет и добавит их.</p>
                             <textarea id="proxy-import-area" class="w-full h-24 bg-gray-900 border border-gray-600 rounded-md p-2 font-mono text-xs" placeholder="http://user:pass@host:port\nhttps://1.2.3.4:8080..."></textarea>
                             <button data-action="analyze-proxies" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-semibold">${state.isLoading ? 'Анализ...' : 'Проанализировать и добавить'}</button>
                             <div id="proxy-status-message" class="text-sm text-center h-5">${state.statusMessage}</div>
                        </div>
                    </div>
                `;
                if (!state.isLoading) renderProxyList();
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
    
    render = () => {
        const stepConfig = STEPS[state.currentStep];
        wizardElement.innerHTML = `
            <div class="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col">
                <header class="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <div>
                        <h1 class="text-xl font-bold text-white">Мастер Настройки Секретарь+</h1>
                        <p class="text-sm text-gray-400">Шаг ${state.currentStep + 1} из ${STEPS.length}: ${stepConfig.title}</p>
                    </div>
                    <button data-action="exit" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Вернуться в приложение">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </button>
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
    };

    const collectInputs = () => {
        const newConfig = { ...state.config };
        const inputs = wizardElement.querySelectorAll('input');
        inputs.forEach(input => {
            if (input.id) {
                newConfig[input.id] = input.type === 'checkbox' ? input.checked : input.value.trim();
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
        collectInputs();
        
        const resumeData = { ...state, currentStep: 3 };
        sessionStorage.setItem('wizardState', JSON.stringify(resumeData));

        if (state.authChoice === 'supabase') {
            if (!state.config.supabaseUrl || !state.config.supabaseAnonKey) {
                alert("Пожалуйста, введите Supabase URL и Anon Key.");
                sessionStorage.removeItem('wizardState');
                return;
            }
            try {
                supabaseService = new SupabaseService(state.config.supabaseUrl, state.config.supabaseAnonKey);
                await supabaseService.signInWithGoogle();
            } catch (e) {
                alert(`Ошибка подключения к Supabase: ${e.message}`);
                sessionStorage.removeItem('wizardState');
            }
        } else {
             if (!state.config.googleClientId) {
                alert("Пожалуйста, введите Google Client ID.");
                sessionStorage.removeItem('wizardState');
                return;
            }
            googleProvider.initClient(state.config.googleClientId, (tokenResponse) => {
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
        render();
    };
    
    wizardElement.addEventListener('click', async (e) => {
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
            case 'next': handleNext(); break;
            case 'back': handleBack(); break;
            case 'login': handleLogin(); break;
            case 'exit': onExit(); break;
            case 'finish': 
                collectInputs();
                state.config.proxies = state.proxies;
                onComplete(state.config); 
                break;
            case 'test-proxy': {
                const button = target;
                button.textContent = '...';
                const proxy = state.proxies.find(p => p.id === target.dataset.id);
                const result = await testProxyConnection({ proxyUrl: proxy.url, apiKey: state.config.geminiApiKey });
                await supabaseService.updateProxy(proxy.id, { last_status: result.status, last_checked_at: new Date().toISOString() });
                await renderProxyList();
                render(); // Full re-render to update the list
                break;
            }
            case 'delete-proxy': {
                if (confirm('Удалить этот прокси?')) {
                    await supabaseService.deleteProxy(target.dataset.id);
                    await renderProxyList();
                    render();
                }
                break;
            }
            case 'analyze-proxies': {
                const text = wizardElement.querySelector('#proxy-import-area').value.trim();
                if (!text || !state.config.geminiApiKey) {
                    alert('Пожалуйста, вставьте список прокси и убедитесь, что указан Gemini API Key.');
                    return;
                }
                state.isLoading = true;
                state.statusMessage = 'Анализ...';
                render();
                try {
                    const urls = await extractProxiesWithGemini({ text, apiKey: state.config.geminiApiKey });
                    if (urls.length === 0) {
                        state.statusMessage = 'Прокси не найдены.';
                    } else {
                        for (const url of urls) {
                            await supabaseService.addProxy({ url, alias: `Импорт ${new Date().toLocaleDateString()}` });
                        }
                        state.statusMessage = `✓ Добавлено ${urls.length} прокси.`;
                        await renderProxyList();
                    }
                } catch (err) {
                    state.statusMessage = `Ошибка: ${err.message}`;
                } finally {
                    state.isLoading = false;
                    render();
                }
                break;
            }
        }
    });
    
    // Initial render
    if (resumeState) {
        checkAuthStatus();
    } else {
        render();
    }
    
    return wizardElement;
}