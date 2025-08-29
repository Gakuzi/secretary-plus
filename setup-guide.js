import { GoogleGenAI, Type } from "@google/genai";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants.js";
import { SupabaseService } from './services/supabase/SupabaseService.js';


document.addEventListener('DOMContentLoaded', () => {

    // --- STATE ---
    let state = {
        supabaseService: null,
        user: null,
        settings: {},
        allProxies: [], // All proxies from DB for this user
        currentStep: 'auth',
    };
    
    // --- DOM ELEMENTS ---
    const steps = {
        auth: document.getElementById('step-auth'),
        keys: document.getElementById('step-keys'),
        proxy: document.getElementById('step-proxy'),
        final: document.getElementById('step-final'),
    };
    
    const inputs = {
        geminiApiKey: document.getElementById('gemini-api-key'),
        googleClientId: document.getElementById('google-client-id'),
    };

    const buttons = {
        connectLogin: document.getElementById('connect-login-button'),
        authContinue: document.getElementById('auth-continue-button'),
        wizardLogout: document.getElementById('wizard-logout-button'),
        saveKeys: document.getElementById('save-keys-button'),
        findProxies: document.getElementById('find-proxies-ai'),
        addProxyManual: document.getElementById('add-proxy-manual'),
        finishSetup: document.getElementById('finish-setup-button'),
        goToApp: document.getElementById('go-to-app-button'),
    };
    
    const containers = {
        authStatus: document.getElementById('auth-status-container'),
        userProfile: document.getElementById('user-profile-display'),
        authActions: document.getElementById('auth-actions'),
        keysStatus: document.getElementById('keys-status-container'),
        proxyFinderStatus: document.getElementById('proxy-finder-status'),
        proxyEditor: document.getElementById('proxy-editor-container'),
        allProxies: document.getElementById('all-proxies-container'),
        activeProxies: document.getElementById('active-proxies-container'),
        proxyTestModal: document.getElementById('proxy-test-modal-container'),
    };

    // --- UTILITY & API FUNCTIONS ---
    const setStatus = (container, type, message) => {
        container.className = `status-message status-${type}`;
        container.textContent = message;
        container.style.display = 'block';
    };
    
    async function findProxiesWithGemini(apiKey, existingUrls) {
        if (!apiKey) throw new Error("Ключ Gemini API не предоставлен.");
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `Найди 10 общедоступных (бесплатных) прокси-серверов, которые могут работать с Google API из разных стран.
        Предоставь ответ в формате JSON. Каждый объект должен содержать поля "url", "country" и "city".
        ВАЖНО: НЕ включай в ответ следующие URL: ${JSON.stringify(existingUrls)}.
        Пример: [{"url": "https://example.com/proxy", "country": "USA", "city": "California"}]`;
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                url: { type: Type.STRING },
                                country: { type: Type.STRING },
                                city: { type: Type.STRING }
                            },
                            required: ["url", "country"]
                        }
                    }
                }
            });
            return JSON.parse(response.text.trim());
        } catch (error) {
            console.error("Error finding proxies with Gemini:", error);
            throw new Error("Не удалось найти прокси с помощью ИИ. Проверьте API ключ и сетевое соединение.");
        }
    }

    async function testProxyConnection(proxyUrl, apiKey) {
        if (!proxyUrl || !apiKey) return { status: 'error', speed: null, message: 'Missing URL or API Key' };
        const testEndpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const proxiedEndpoint = `${proxyUrl}/${testEndpoint.substring(8)}`;
        const startTime = performance.now();
        try {
            const response = await fetch(proxiedEndpoint, { method: 'GET' });
            if (response.ok) {
                const data = await response.json();
                if (data.models && Array.isArray(data.models)) {
                    return { status: 'ok', speed: Math.round(performance.now() - startTime), message: 'Соединение успешно.' };
                }
                 return { status: 'error', speed: null, message: 'Ответ от прокси некорректен.' };
            }
            return { status: 'error', speed: null, message: `Статус ответа: ${response.status}` };
        } catch (error) {
            return { status: 'error', speed: null, message: 'Сетевая ошибка (CORS или недоступность).' };
        }
    }

    // --- UI RENDERING & STATE MANAGEMENT ---
    
    const showStep = (stepKey) => {
        state.currentStep = stepKey;
        const stepElement = steps[stepKey];
        if (!stepElement) return;
        Object.values(steps).forEach(s => s.style.display = 'none');
        stepElement.style.display = 'block';
        window.scrollTo(0, 0);
    };

    const renderAuthenticatedState = async () => {
        setStatus(containers.authStatus, 'success', `Вы вошли как ${state.user.email}`);
        buttons.connectLogin.style.display = 'none';
        
        const profileFragment = document.createDocumentFragment();
        const profileInfo = document.createElement('div');
        profileInfo.className = "flex items-center gap-3";
        profileInfo.innerHTML = `
            <img src="${state.user.user_metadata.avatar_url}" alt="Avatar" class="w-10 h-10 rounded-full">
            <div>
                <p class="font-semibold">${state.user.user_metadata.full_name}</p>
                <p class="text-xs text-gray-400">${state.user.email}</p>
            </div>
        `;
        profileFragment.appendChild(profileInfo);
        containers.userProfile.prepend(profileFragment);
        containers.userProfile.style.display = 'block';
        containers.authActions.style.display = 'flex';
        steps.auth.dataset.status = 'completed';
        
        setStatus(containers.authStatus, 'loading', 'Загружаем ваши настройки...');

        try {
            const dbSettings = await state.supabaseService.getUserSettings();
            state.settings = dbSettings || {};
            inputs.geminiApiKey.value = state.settings.geminiApiKey || '';
            inputs.googleClientId.value = state.settings.googleClientId || '';
            
            state.allProxies = await state.supabaseService.getProxies();
            renderAllProxies();
            renderActiveProxies();
            
            setStatus(containers.authStatus, 'success', 'Настройки загружены. Переходим к следующему шагу...');
            setTimeout(() => {
                if(state.currentStep === 'auth') showStep('keys');
            }, 1000);

        } catch (error) {
            console.error("Error loading user settings/proxies:", error);
            setStatus(containers.authStatus, 'error', `Не удалось загрузить настройки: ${error.message}. Вы можете продолжить вручную.`);
        }
    };
    
    const resetAuthState = () => {
        state.user = null;
        steps.auth.dataset.status = '';
        buttons.connectLogin.style.display = 'block';
        buttons.connectLogin.disabled = false;
        buttons.connectLogin.textContent = 'Войти через Google';
        containers.userProfile.style.display = 'none';
        const profileInfo = containers.userProfile.querySelector('.flex.items-center.gap-3');
        if (profileInfo) profileInfo.remove();
        containers.authActions.style.display = 'none';
        containers.authStatus.style.display = 'none';
        showStep('auth');
    }

    // --- EVENT HANDLERS ---
    
    buttons.connectLogin.addEventListener('click', async () => {
        buttons.connectLogin.disabled = true;
        buttons.connectLogin.textContent = 'Подключение...';
        setStatus(containers.authStatus, 'loading', 'Перенаправляем на страницу входа Google...');
        await state.supabaseService.signInWithGoogle();
    });

    buttons.wizardLogout.addEventListener('click', async () => {
        await state.supabaseService.signOut();
        resetAuthState();
    });
    
    buttons.authContinue.addEventListener('click', () => showStep('keys'));

    buttons.saveKeys.addEventListener('click', async () => {
        const settingsUpdate = {
            ...state.settings,
            geminiApiKey: inputs.geminiApiKey.value.trim(),
            googleClientId: inputs.googleClientId.value.trim(),
        };
        
        if (!settingsUpdate.geminiApiKey) {
            setStatus(containers.keysStatus, 'error', 'Ключ Gemini API является обязательным.');
            return;
        }
        
        setStatus(containers.keysStatus, 'loading', 'Сохранение...');
        buttons.saveKeys.disabled = true;
        buttons.saveKeys.textContent = 'Сохранение...'

        try {
            await state.supabaseService.saveUserSettings(settingsUpdate);
            state.settings = settingsUpdate;
            setStatus(containers.keysStatus, 'success', 'Ключи успешно сохранены.');
            steps.keys.dataset.status = 'completed';
            setTimeout(() => showStep('proxy'), 1000);
        } catch (error) {
            setStatus(containers.keysStatus, 'error', `Ошибка сохранения: ${error.message}`);
        } finally {
            buttons.saveKeys.disabled = false;
            buttons.saveKeys.textContent = 'Сохранить и продолжить';
        }
    });

    buttons.findProxies.addEventListener('click', async () => {
        if (!state.settings.geminiApiKey) {
            setStatus(containers.proxyFinderStatus, 'error', 'Сначала сохраните Gemini API ключ.');
            return;
        }
        setStatus(containers.proxyFinderStatus, 'loading', 'Ищем прокси с помощью ИИ... Это может занять до минуты.');
        buttons.findProxies.disabled = true;

        try {
            const existingUrls = state.allProxies.map(p => p.url);
            const foundProxies = await findProxiesWithGemini(state.settings.geminiApiKey, existingUrls);
            
            if (foundProxies.length > 0) {
                const newProxiesToSave = foundProxies.map(p => ({
                    url: p.url,
                    geolocation: `${p.country}, ${p.city || ''}`.replace(/, $/, ''),
                    user_id: state.user.id,
                }));
                await state.supabaseService.upsertProxies(newProxiesToSave);
                state.allProxies = await state.supabaseService.getProxies();
                renderAllProxies();
            }
            setStatus(containers.proxyFinderStatus, 'success', `Найдено и добавлено ${foundProxies.length} новых прокси. Теперь протестируйте их.`);
        } catch (error) {
            setStatus(containers.proxyFinderStatus, 'error', error.message);
        } finally {
            buttons.findProxies.disabled = false;
        }
    });
    
    buttons.finishSetup.addEventListener('click', () => {
        steps.proxy.dataset.status = 'completed';
        showStep('final');
    });

    buttons.goToApp.addEventListener('click', () => {
        if (window.opener) {
            window.opener.postMessage('setup_completed', window.location.origin);
            window.close();
        } else {
            window.location.href = './index.html';
        }
    });

    document.body.addEventListener('click', e => {
        const navButton = e.target.closest('[data-nav-target]');
        if (navButton) showStep(navButton.dataset.navTarget);
    });

    // --- PROXY LOGIC ---
    
    function showProxyEditor() {
        containers.proxyEditor.innerHTML = `
            <div class="input-group">
                <label for="proxy-url-input">URL Прокси</label>
                <input type="text" id="proxy-url-input" placeholder="https://proxy.example.com">
                <div id="proxy-url-error" class="note-text text-red-500 h-4"></div>
            </div>
            <div class="flex gap-2">
                <button id="save-manual-proxy" class="wizard-nav-button next-button">Сохранить</button>
                <button id="cancel-manual-proxy" class="wizard-nav-button prev-button">Отмена</button>
            </div>
        `;
        containers.proxyEditor.querySelector('#save-manual-proxy').onclick = async () => {
            const urlInput = containers.proxyEditor.querySelector('#proxy-url-input');
            const url = urlInput.value.trim();
            const errorDiv = containers.proxyEditor.querySelector('#proxy-url-error');
            if (!url) { errorDiv.textContent = 'URL не может быть пустым.'; return; }
            try { new URL(url); } catch { errorDiv.textContent = 'Неверный формат URL.'; return; }

            try {
                await state.supabaseService.addProxy({ url });
                state.allProxies = await state.supabaseService.getProxies();
                renderAllProxies();
                containers.proxyEditor.innerHTML = '';
            } catch (error) {
                errorDiv.textContent = error.message.includes('duplicate key') ? 'Этот прокси уже существует.' : error.message;
            }
        };
        containers.proxyEditor.querySelector('#cancel-manual-proxy').onclick = () => {
            containers.proxyEditor.innerHTML = '';
        };
    }
    buttons.addProxyManual.addEventListener('click', showProxyEditor);

    function showProxyTestModal(proxy) {
        containers.proxyTestModal.innerHTML = `
            <div class="proxy-test-modal-overlay">
                <div class="proxy-test-modal-content">
                    <div class="modal-header"><h3 class="step-subtitle">Тестирование прокси</h3></div>
                    <div class="modal-body"></div>
                    <div class="modal-footer"></div>
                </div>
            </div>
        `;
        const modal = containers.proxyTestModal.querySelector('.proxy-test-modal-overlay');
        const body = modal.querySelector('.modal-body');
        const footer = modal.querySelector('.modal-footer');
        const close = () => containers.proxyTestModal.innerHTML = '';
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

        const runTest = async () => {
            body.innerHTML = `<p class="status-loading">Тестирование...</p>`;
            footer.innerHTML = '';
            const result = await testProxyConnection(proxy.url, state.settings.geminiApiKey);
            
            // Update DB immediately
            const updateData = { last_status: result.status, last_checked_at: new Date().toISOString(), last_speed_ms: result.speed };
            const updatedProxy = await state.supabaseService.updateProxy(proxy.id, updateData);
            Object.assign(proxy, updatedProxy);
            
            // Update UI
            updateProxyItemUI(proxy);
            renderActiveProxies();
            
            const isOk = result.status === 'ok';
            body.innerHTML = `
                <p class="proxy-item-url">${proxy.url}</p>
                <p class="proxy-item-details">${proxy.geolocation || 'N/A'}</p>
                <div class="mt-4"><p class="status-message ${isOk ? 'status-success' : 'status-error'}">
                    Статус: ${isOk ? `Работает (Скорость: ${result.speed} мс)` : `Ошибка (${result.message})`}
                </p></div>
            `;
            footer.innerHTML = `
                <button class="wizard-nav-button prev-button retry-button">Повторить</button>
                <button class="wizard-nav-button prev-button reject-button">Отклонить</button>
                ${isOk ? '<button class="wizard-nav-button next-button accept-button">Принять</button>' : ''}
            `;
            footer.querySelector('.retry-button').onclick = runTest;
            footer.querySelector('.reject-button').onclick = async () => {
                await state.supabaseService.updateProxy(proxy.id, { is_active: false });
                proxy.is_active = false;
                renderActiveProxies();
                close();
            };
            const acceptButton = footer.querySelector('.accept-button');
            if (acceptButton) {
                acceptButton.onclick = async () => {
                    await state.supabaseService.updateProxy(proxy.id, { is_active: true });
                    proxy.is_active = true;
                    renderActiveProxies();
                    close();
                };
            }
        };
        runTest();
    }

    const renderProxyItem = (proxy) => {
        const item = document.createElement('div');
        item.className = 'proxy-item';
        item.dataset.proxyId = proxy.id;
        item.innerHTML = `
            <div class="proxy-status-dot" data-status="${proxy.last_status || 'untested'}"></div>
            <div class="proxy-item-info">
                <p class="proxy-item-url" title="${proxy.url}">${proxy.alias || proxy.url}</p>
                <p class="proxy-item-details">
                    <span>${proxy.geolocation || 'N/A'}</span>
                    <span class="speed-info" style="display: ${proxy.last_speed_ms ? 'inline' : 'none'};"> &middot; ${proxy.last_speed_ms} мс</span>
                </p>
            </div>
            <div class="proxy-item-actions">
                 <button class="test-btn">Тест</button>
                 <button class="remove-btn text-red-500">Удалить</button>
            </div>
        `;
        return item;
    };

    const updateProxyItemUI = (proxy) => {
        document.querySelectorAll(`.proxy-item[data-proxy-id="${proxy.id}"]`).forEach(item => {
            item.querySelector('.proxy-status-dot').dataset.status = proxy.last_status;
            const speedEl = item.querySelector('.speed-info');
            if (proxy.last_speed_ms) {
                speedEl.textContent = ` · ${proxy.last_speed_ms} мс`;
                speedEl.style.display = 'inline';
            } else {
                speedEl.style.display = 'none';
            }
        });
    };
    
    const renderAllProxies = () => {
        containers.allProxies.innerHTML = '';
        if (state.allProxies.length === 0) {
            containers.allProxies.innerHTML = `<p class="text-gray-400 text-center py-4">Список пуст.</p>`;
        } else {
            state.allProxies.forEach(p => containers.allProxies.appendChild(renderProxyItem(p)));
        }
    };

    const renderActiveProxies = () => {
        containers.activeProxies.innerHTML = '';
        const active = state.allProxies.filter(p => p.is_active);
        if (active.length === 0) {
            containers.activeProxies.innerHTML = `<p class="text-gray-400 text-center py-4">Нет активных прокси.</p>`;
        } else {
            active.forEach(p => containers.activeProxies.appendChild(renderProxyItem(p)));
        }
    };
    
    containers.allProxies.addEventListener('click', async (e) => {
        const item = e.target.closest('.proxy-item');
        if (!item) return;
        const proxyId = item.dataset.proxyId;
        const proxy = state.allProxies.find(p => p.id == proxyId);

        if (e.target.matches('.test-btn')) showProxyTestModal(proxy);
        if (e.target.matches('.remove-btn')) {
            if (confirm(`Удалить прокси ${proxy.url}?`)) {
                await state.supabaseService.deleteProxy(proxy.id);
                state.allProxies = state.allProxies.filter(p => p.id != proxyId);
                renderAllProxies();
                renderActiveProxies();
            }
        }
    });

    // --- INITIALIZATION ---
    
    const initialize = async () => {
        showStep('auth');
        state.supabaseService = new SupabaseService(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        state.supabaseService.onAuthStateChange(async (event, session) => {
            if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) {
                if (!state.user) {
                    state.user = session.user;
                    await renderAuthenticatedState();
                }
            } else if (event === 'SIGNED_OUT') {
                resetAuthState();
            }

            if (window.location.hash.includes('access_token')) {
                history.replaceState(null, document.title, window.location.pathname + window.location.search);
            }
        });
    };

    initialize();
});