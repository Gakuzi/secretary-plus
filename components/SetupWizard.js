import { getSettings } from '../utils/storage.js';
import { SupabaseService } from '../services/supabase/SupabaseService.js';
import { testProxyConnection, findProxiesWithGemini } from '../services/geminiService.js';
import * as Icons from './icons/Icons.js';

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

    const initSupabase = () => {
        if (!supabaseService && state.authChoice === 'supabase') {
            supabaseService = new SupabaseService(supabaseConfig.url, supabaseConfig.anonKey);
        }
    };
    
    const showProxyManagerModal = () => {
        const managerContainer = document.createElement('div');
        managerContainer.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[51]'; // Higher z-index
        
        let proxyState = {
            saved: [],
            found: [],
            isLoading: false,
            draggedItemId: null
        };

        const renderManager = () => {
            const savedProxiesHtml = proxyState.saved.map((p, index) => {
                 let statusIndicatorClass = 'status-untested';
                 if (p.last_status === 'ok') statusIndicatorClass = 'status-ok';
                 if (p.last_status === 'error') statusIndicatorClass = 'status-error';

                return `
                <div class="proxy-list-item bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700" draggable="true" data-id="${p.id}" data-index="${index}">
                    <div class="flex-shrink-0 cursor-grab text-slate-400 dark:text-slate-500" title="Перетащить для изменения приоритета">${Icons.MenuIcon}</div>
                     <label class="toggle-switch" style="transform: scale(0.7); margin: 0 -4px;">
                        <input type="checkbox" data-action="toggle-proxy" data-id="${p.id}" ${p.is_active ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <div class="status-indicator ${statusIndicatorClass}" title="Статус: ${p.last_status || 'untested'}"></div>
                    <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.url}</div>
                    ${p.last_status === 'ok' && p.last_speed_ms ? `<span class="text-xs text-slate-500 dark:text-slate-400">${p.last_speed_ms}ms</span>` : ''}
                    <div class="flex items-center gap-1">
                        <button data-action="retest-proxy" data-id="${p.id}" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded">Тест</button>
                        <button data-action="delete-proxy" data-id="${p.id}" class="p-1 text-xs bg-red-700 dark:bg-red-800 hover:bg-red-600 dark:hover:bg-red-700 text-white rounded-full leading-none">${Icons.TrashIcon.replace('width="24" height="24"', 'width="12" height="12"')}</button>
                    </div>
                </div>`;
            }).join('');

            const foundProxiesHtml = proxyState.found.map(p => `
                 <div class="proxy-list-item bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700">
                    <div class="status-indicator status-untested"></div>
                    <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.location ? `${p.location}: ` : ''}${p.url}</div>
                    <div class="flex items-center gap-1">
                        <button data-action="test-found-proxy" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded">Тест</button>
                        <button data-action="add-proxy-from-found" data-url="${p.url}" data-location="${p.location || ''}" class="px-2 py-0.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded">Добавить</button>
                    </div>
                </div>`).join('');
            
            managerContainer.innerHTML = `
                <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl w-full max-w-2xl flex flex-col h-full sm:h-auto sm:max-h-[80vh] animate-fadeIn">
                    <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                        <h3 class="text-lg font-bold">Менеджер прокси-серверов</h3>
                        <button data-action="close-manager" class="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">&times;</button>
                    </header>
                    <main class="p-4 space-y-4 overflow-y-auto bg-slate-50 dark:bg-slate-900/70">
                        <div>
                            <h4 class="font-semibold mb-2">Мои прокси (приоритет сверху вниз)</h4>
                            <div id="saved-proxy-list-dnd" class="space-y-2 p-2 bg-slate-100 dark:bg-slate-900/50 rounded-md min-h-[80px]">
                                ${proxyState.isLoading && proxyState.saved.length === 0 ? '<p class="text-center text-sm text-slate-500">Загрузка...</p>' : proxyState.saved.length === 0 ? '<p class="text-center text-sm text-slate-500">Список пуст.</p>' : savedProxiesHtml}
                            </div>
                        </div>
                        <div>
                            <h4 class="font-semibold mb-2">Поиск прокси</h4>
                            <div id="found-proxy-list" class="space-y-2">
                                ${proxyState.isLoading && proxyState.found.length > 0 ? '<p class="text-center text-sm text-slate-500">Поиск...</p>' : proxyState.found.length > 0 ? foundProxiesHtml : ''}
                            </div>
                        </div>
                    </main>
                    <footer class="p-4 bg-slate-100 dark:bg-slate-700/50 flex justify-between items-center">
                        <button data-action="add-proxy-manual" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md font-semibold text-sm">Добавить вручную</button>
                        <button data-action="find-proxies-ai" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold text-sm" ${proxyState.isLoading ? 'disabled' : ''}>${proxyState.isLoading ? 'Поиск...' : 'Найти с помощью ИИ'}</button>
                    </footer>
                </div>
            `;
        };

        const loadSavedProxies = async () => {
            proxyState.isLoading = true;
            renderManager();
            try {
                proxyState.saved = await supabaseService.getProxies();
            } catch(e) { alert(`Ошибка загрузки прокси: ${e.message}`); }
            finally { 
                proxyState.isLoading = false;
                renderManager();
            }
        };

        const handleManagerAction = async (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            const id = target.dataset.id;
            const url = target.dataset.url;

            switch(action) {
                case 'close-manager': managerContainer.remove(); break;
                case 'toggle-proxy':
                    const is_active = e.target.checked;
                    await supabaseService.updateProxy(id, { is_active });
                    await loadSavedProxies();
                    break;
                case 'delete-proxy':
                    if (confirm('Удалить этот прокси?')) {
                        await supabaseService.deleteProxy(id);
                        await loadSavedProxies();
                    }
                    break;
                case 'find-proxies-ai':
                    collectInputs();
                    if (!state.config.geminiApiKey) {
                        alert('Пожалуйста, сначала укажите ваш Gemini API ключ на предыдущем шаге.');
                        return;
                    }
                    proxyState.isLoading = true;
                    proxyState.found = [];
                    renderManager();
                    try {
                        const proxies = await findProxiesWithGemini({ apiKey: state.config.geminiApiKey });
                        proxyState.found = proxies;
                    } catch(err) { alert(`Ошибка: ${err.message}`); }
                    finally {
                        proxyState.isLoading = false;
                        renderManager();
                    }
                    break;
                case 'add-proxy-manual': {
                    const newUrl = prompt('Введите URL прокси:');
                    if (newUrl) {
                        try {
                            new URL(newUrl);
                            await supabaseService.addProxy({ url: newUrl.trim(), is_active: true, priority: proxyState.saved.length });
                            await loadSavedProxies();
                        } catch(err) { alert(`Ошибка: ${err.message}`); }
                    }
                    break;
                }
                 case 'add-proxy-from-found':
                    try {
                        await supabaseService.addProxy({ url: url, is_active: true, geolocation: target.dataset.location, priority: proxyState.saved.length });
                        proxyState.found = proxyState.found.filter(p => p.url !== url);
                        await loadSavedProxies();
                    } catch(err) { alert(`Ошибка: ${err.message}`); }
                    break;
                case 'retest-proxy':
                case 'test-found-proxy':
                    target.textContent = '...';
                    target.disabled = true;
                    collectInputs();
                    const result = await testProxyConnection({ proxyUrl: url, apiKey: state.config.geminiApiKey });
                     if (id) {
                        await supabaseService.updateProxy(id, { last_status: result.status, last_speed_ms: result.speed });
                        await loadSavedProxies();
                     } else {
                        alert(`Тест ${result.status === 'ok' ? 'пройден' : 'не пройден'}\nСкорость: ${result.speed || 'N/A'}\n${result.message}`);
                        target.textContent = 'Тест';
                        target.disabled = false;
                     }
                    break;
            }
        };
        
        const handleDragAndDrop = (container) => {
            container.addEventListener('dragstart', e => {
                proxyState.draggedItemId = e.target.dataset.id;
                e.target.style.opacity = '0.5';
            });
            container.addEventListener('dragend', e => {
                 e.target.style.opacity = '1';
                 proxyState.draggedItemId = null;
            });
            container.addEventListener('dragover', e => {
                e.preventDefault();
                const afterElement = getDragAfterElement(container, e.clientY);
                const draggable = document.querySelector('[data-id="' + proxyState.draggedItemId + '"]');
                if (afterElement == null) {
                    container.appendChild(draggable);
                } else {
                    container.insertBefore(draggable, afterElement);
                }
            });
            container.addEventListener('drop', async e => {
                e.preventDefault();
                const orderedIds = [...container.querySelectorAll('[data-id]')].map(el => el.dataset.id);
                const updates = orderedIds.map((id, index) => ({ id: id, priority: index }));
                try {
                     await supabaseService.client.from('proxies').upsert(updates);
                     await loadSavedProxies();
                } catch(err) {
                    alert('Не удалось сохранить новый порядок.');
                    await loadSavedProxies();
                }
            });
        };

        function getDragAfterElement(container, y) {
            const draggableElements = [...container.querySelectorAll('[draggable="true"]:not([style*="opacity: 0.5"])')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }

        managerContainer.addEventListener('click', handleManagerAction);
        managerContainer.addEventListener('change', (e) => {
            if(e.target.closest('[data-action="toggle-proxy"]')) handleManagerAction(e);
        });
        
        renderManager();
        wizardElement.appendChild(managerContainer);
        handleDragAndDrop(managerContainer.querySelector('#saved-proxy-list-dnd'));
        loadSavedProxies();
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

        const addNextButton = (text = 'Далее', skip = false) => {
            const nextBtn = document.createElement('button');
            nextBtn.className = `px-6 py-2 rounded-md font-semibold text-white ${skip ? 'bg-slate-500 hover:bg-slate-600' : 'bg-blue-600 hover:bg-blue-700'}`;
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
                contentEl.innerHTML = `
                     <h2 class="text-2xl font-bold mb-4">Аутентификация</h2>
                     <p class="mb-6 text-slate-500 dark:text-slate-400">Войдите в свой аккаунт Google, чтобы предоставить приложению разрешения.</p>
                     <div class="p-6 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center min-h-[200px]">
                        ${state.isLoading ? `<div class="text-center"><p>Ожидание...</p></div>` :
                         state.isAuthenticated && state.userProfile ? `
                            <div class="text-center">
                                <img src="${state.userProfile.imageUrl}" class="w-20 h-20 rounded-full mx-auto mb-4">
                                <p class="font-bold text-lg">${state.userProfile.name}</p>
                                <p class="text-sm text-slate-500 dark:text-slate-400">${state.userProfile.email}</p>
                                <p class="text-green-600 dark:text-green-400 mt-4">✓ Вход выполнен успешно</p>
                            </div>` : 
                            `<button data-action="login" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center gap-2">${Icons.GoogleIcon}<span>Войти через Google</span></button>`
                        }
                     </div>`;
                addNextButton(state.isAuthenticated ? 'Далее' : 'Пропустить', !state.isAuthenticated);
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
                addNextButton('Пропустить');
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
        wizardElement.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col relative text-slate-800 dark:text-slate-100">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <h1 class="text-xl font-bold">Мастер Настройки Секретарь+</h1>
                        <p class="text-sm text-slate-500 dark:text-slate-400">Шаг ${stepIndex + 1} из ${STEPS.length}: ${stepConfig.title}</p>
                    </div>
                    <button data-action="exit" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></button>
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
    
    const handleNext = async () => {
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
        const { ...stateToSave } = state;
        const resumeData = { ...stateToSave, currentStep: 2 };
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