import { GoogleGenAI, Type } from "@google/genai";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants.js";

document.addEventListener('DOMContentLoaded', () => {
    const { createClient } = window.supabase;

    // --- STATE ---
    let state = {
        supabaseClient: null,
        user: null,
        settings: {},
        selectedProxies: [],
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
        saveKeys: document.getElementById('save-keys-button'),
        findProxies: document.getElementById('find-proxies-ai'),
        saveProxies: document.getElementById('save-proxies-button'),
        goToApp: document.getElementById('go-to-app-button'),
    };
    
    const containers = {
        authStatus: document.getElementById('auth-status-container'),
        userProfile: document.getElementById('user-profile-display'),
        keysStatus: document.getElementById('keys-status-container'),
        proxyFinderStatus: document.getElementById('proxy-finder-status'),
        proxyStatus: document.getElementById('proxy-status-container'),
        foundProxies: document.getElementById('found-proxies-container'),
        selectedProxies: document.getElementById('selected-proxies-container'),
        proxyTestModal: document.getElementById('proxy-test-modal-container'),
    };

    // --- UTILITY & API FUNCTIONS ---
    const setStatus = (container, type, message) => {
        container.className = `status-message status-${type}`;
        container.textContent = message;
        container.style.display = 'block';
    };
    
    async function findProxiesWithGemini(apiKey) {
        if (!apiKey) throw new Error("Ключ Gemini API не предоставлен.");
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `Найди 10 общедоступных (бесплатных) прокси-серверов, которые могут работать с Google API из разных стран. Предоставь ответ в формате JSON. Каждый объект должен содержать поля "url", "country" и "city". Пример: [{"url": "https://example.com/proxy", "country": "USA", "city": "California"}]`;
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
        // Use a lightweight endpoint for checking functionality
        const testEndpoint = `${proxyUrl}/v1beta/models?key=${apiKey}`;
        const startTime = performance.now();
        try {
            const response = await fetch(testEndpoint, { method: 'GET' });
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
        
        containers.userProfile.innerHTML = `
            <div class="flex items-center gap-3">
                <img src="${state.user.user_metadata.avatar_url}" alt="Avatar" class="w-10 h-10 rounded-full">
                <div>
                    <p class="font-semibold">${state.user.user_metadata.full_name}</p>
                    <p class="text-xs text-gray-400">${state.user.email}</p>
                </div>
            </div>
        `;
        containers.userProfile.style.display = 'block';
        steps.auth.dataset.status = 'completed';

        // Load settings from DB
        const { data, error } = await state.supabaseClient.from('user_settings').select('settings').single();
        if (error && error.code !== 'PGRST116') throw error;
        
        state.settings = data ? data.settings : {};
        inputs.geminiApiKey.value = state.settings.geminiApiKey || '';
        inputs.googleClientId.value = state.settings.googleClientId || '';
        
        const { data: proxiesData, error: proxiesError } = await state.supabaseClient.from('proxies').select('*').order('priority');
        if (proxiesError) throw proxiesError;
        state.selectedProxies = proxiesData || [];
        renderSelectedProxies();

        // Auto-navigate to next step
        setStatus(containers.authStatus, 'loading', 'Загружаем ваши настройки и переходим к следующему шагу...');
        setTimeout(() => {
            showStep('keys');
        }, 1500);
    };
    
    // --- EVENT HANDLERS ---
    
    buttons.connectLogin.addEventListener('click', async () => {
        buttons.connectLogin.disabled = true;
        buttons.connectLogin.textContent = 'Подключение...';
        setStatus(containers.authStatus, 'loading', 'Перенаправляем на страницу входа Google...');
        const { error } = await state.supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.href }
        });
        if (error) {
             setStatus(containers.authStatus, 'error', `Ошибка: ${error.message}`);
             buttons.connectLogin.disabled = false;
             buttons.connectLogin.textContent = 'Войти через Google';
        }
    });

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

        const { error } = await state.supabaseClient.rpc('upsert_user_settings', { new_settings: settingsUpdate });

        if (error) {
            setStatus(containers.keysStatus, 'error', `Ошибка сохранения: ${error.message}`);
            buttons.saveKeys.disabled = false;
            buttons.saveKeys.textContent = 'Сохранить и продолжить';
        } else {
            state.settings = settingsUpdate;
            setStatus(containers.keysStatus, 'success', 'Ключи успешно сохранены в вашем аккаунте.');
            steps.keys.dataset.status = 'completed';
            // Auto-navigate to next step
            setTimeout(() => {
                 showStep('proxy');
            }, 1000);
        }
    });

    buttons.findProxies.addEventListener('click', async () => {
        if (!state.settings.geminiApiKey) {
            setStatus(containers.proxyFinderStatus, 'error', 'Сначала сохраните Gemini API ключ на предыдущем шаге.');
            return;
        }
        setStatus(containers.proxyFinderStatus, 'loading', 'Ищем прокси с помощью ИИ... Это может занять до минуты.');
        buttons.findProxies.disabled = true;
        buttons.findProxies.textContent = 'Поиск...';

        try {
            const foundProxies = await findProxiesWithGemini(state.settings.geminiApiKey);
            const existingUrls = new Set(state.selectedProxies.map(p => p.url));
            const newProxies = foundProxies.filter(p => p.url && !existingUrls.has(p.url));

            containers.foundProxies.innerHTML = '';
            if (newProxies.length === 0) {
                 containers.foundProxies.innerHTML = `<p class="text-gray-400 text-center py-4">Новых прокси не найдено.</p>`;
            } else {
                newProxies.forEach(p => {
                    const proxyData = { ...p, geolocation: `${p.country}, ${p.city || ''}`.replace(/, $/, '') };
                    containers.foundProxies.appendChild(renderProxyItem(proxyData, 'found'));
                });
            }
            setStatus(containers.proxyFinderStatus, 'success', `Найдено ${newProxies.length} новых прокси. Протестируйте и добавьте лучшие.`);
        } catch (error) {
            setStatus(containers.proxyFinderStatus, 'error', error.message);
        } finally {
            buttons.findProxies.disabled = false;
            buttons.findProxies.textContent = 'Найти прокси с помощью ИИ';
        }
    });
    
    buttons.saveProxies.addEventListener('click', async () => {
        setStatus(containers.proxyStatus, 'loading', 'Сохраняем список прокси...');
        buttons.saveProxies.disabled = true;
        try {
            // Delete proxies that were removed by the user
            const currentProxyUrls = new Set(state.selectedProxies.map(p => p.url));
            const { data: existingProxies, error: fetchError } = await state.supabaseClient.from('proxies').select('id, url');
            if(fetchError) throw fetchError;

            const proxiesToDelete = existingProxies.filter(p => !currentProxyUrls.has(p.url));
            if (proxiesToDelete.length > 0) {
                const { error: deleteError } = await state.supabaseClient.from('proxies').delete().in('id', proxiesToDelete.map(p => p.id));
                if (deleteError) throw deleteError;
            }

            // Upsert the current list
            if (state.selectedProxies.length > 0) {
                const proxiesToUpsert = state.selectedProxies.map((p, index) => ({
                    user_id: state.user.id,
                    url: p.url,
                    alias: p.alias || p.geolocation,
                    geolocation: p.geolocation,
                    is_active: true,
                    priority: index,
                    last_status: p.last_status,
                    last_speed_ms: p.last_speed_ms
                }));
                const { error: upsertError } = await state.supabaseClient.from('proxies').upsert(proxiesToUpsert, { onConflict: 'user_id, url' });
                if (upsertError) throw upsertError;
            }
            
            setStatus(containers.proxyStatus, 'success', 'Список прокси сохранен.');
            steps.proxy.dataset.status = 'completed';
            showStep('final');
        } catch (error) {
            setStatus(containers.proxyStatus, 'error', `Ошибка сохранения: ${error.message}`);
        } finally {
            buttons.saveProxies.disabled = false;
        }
    });

    buttons.goToApp.addEventListener('click', () => {
        localStorage.setItem('setup_completed', 'true');
        // This will trigger the listener in the main app to reload
        window.close(); // Close the setup tab
    });

    document.body.addEventListener('click', e => {
        const navButton = e.target.closest('[data-nav-target]');
        if (navButton) {
            showStep(navButton.dataset.navTarget);
        }
    });

    // --- PROXY LISTS LOGIC ---
    
    function showProxyTestModal(proxyData) {
        containers.proxyTestModal.innerHTML = `
            <div class="proxy-test-modal-overlay">
                <div class="proxy-test-modal-content">
                    <div class="modal-header">
                        <h3 class="step-subtitle">Тестирование прокси</h3>
                    </div>
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

            const result = await testProxyConnection(proxyData.url, state.settings.geminiApiKey);
            
            updateProxyUI(proxyData.url, result);
            
            const isOk = result.status === 'ok';
            body.innerHTML = `
                <p class="proxy-item-url">${proxyData.url}</p>
                <p class="proxy-item-details">${proxyData.geolocation}</p>
                <div class="mt-4">
                    <p class="status-message ${isOk ? 'status-success' : 'status-error'}">
                        Статус: ${isOk ? 'Работает' : 'Ошибка'}
                        ${isOk && result.speed ? ` (Скорость: ${result.speed} мс)` : ''}
                        ${!isOk ? `<br><span class="text-xs">${result.message}</span>` : ''}
                    </p>
                </div>
            `;

            footer.innerHTML = `
                <button class="wizard-nav-button prev-button retry-button">Повторить</button>
                <button class="wizard-nav-button prev-button close-button">Закрыть</button>
                ${isOk ? '<button class="wizard-nav-button next-button accept-button">Принять</button>' : ''}
            `;

            footer.querySelector('.retry-button').onclick = runTest;
            footer.querySelector('.close-button').onclick = close;
            const acceptButton = footer.querySelector('.accept-button');
            if (acceptButton) {
                acceptButton.onclick = () => {
                    if (!state.selectedProxies.some(p => p.url === proxyData.url)) {
                        state.selectedProxies.push({ 
                            url: proxyData.url, 
                            geolocation: proxyData.geolocation, 
                            alias: proxyData.geolocation,
                            last_status: result.status,
                            last_speed_ms: result.speed
                        });
                        renderSelectedProxies();
                    }
                    close();
                };
            }
        };

        runTest();
    }

    const renderProxyItem = (proxy, containerType) => {
        const isSelected = containerType === 'selected';
        const item = document.createElement('div');
        item.className = 'proxy-item';
        item.dataset.url = proxy.url;
        item.dataset.geo = proxy.geolocation;
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
                 ${isSelected ? `<button class="remove-btn">Удалить</button>` : ''}
            </div>
        `;
        return item;
    };

    const updateProxyUI = (url, { status, speed }) => {
        document.querySelectorAll(`.proxy-item[data-url="${url}"]`).forEach(item => {
             const dot = item.querySelector('.proxy-status-dot');
            dot.dataset.status = status;
            item.dataset.lastStatus = status;
            const speedEl = item.querySelector('.speed-info');
            if (speed) {
                speedEl.textContent = ` · ${speed} мс`;
                speedEl.style.display = 'inline';
                item.dataset.lastSpeed = speed;
            } else {
                speedEl.style.display = 'none';
            }
        });
    };
    
    const renderSelectedProxies = () => {
        containers.selectedProxies.innerHTML = '';
        if (state.selectedProxies.length === 0) {
            containers.selectedProxies.innerHTML = `<p class="text-gray-400 text-center py-4">Выбранные прокси появятся здесь.</p>`;
        } else {
            state.selectedProxies.forEach(p => containers.selectedProxies.appendChild(renderProxyItem(p, 'selected')));
        }
    };

    containers.foundProxies.addEventListener('click', async (e) => {
        const target = e.target;
        const item = target.closest('.proxy-item');
        if (!item) return;

        const proxyData = {
            url: item.dataset.url,
            geolocation: item.dataset.geo,
        };
        
        if (target.matches('.test-btn')) {
            showProxyTestModal(proxyData);
        }
    });

    containers.selectedProxies.addEventListener('click', (e) => {
        const item = e.target.closest('.proxy-item');
        if (!item) return;
        const proxyUrl = item.dataset.url;
        
        if (e.target.matches('.remove-btn')) {
            state.selectedProxies = state.selectedProxies.filter(p => p.url !== proxyUrl);
            renderSelectedProxies();
        }
        if (e.target.matches('.test-btn')) {
             showProxyTestModal({ url: proxyUrl, geolocation: item.dataset.geo });
        }
    });
    
    // --- INITIALIZATION ---
    
    const initialize = async () => {
        showStep('auth');
        state.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        state.supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) {
                if (!state.user) {
                    state.user = session.user;
                    await renderAuthenticatedState();
                }
            } else if (event === 'SIGNED_OUT') {
                state.user = null;
                showStep('auth');
                buttons.connectLogin.style.display = 'block';
                containers.userProfile.style.display = 'none';
                containers.authStatus.style.display = 'none';
            }

            // Clean up URL after OAuth redirect
            if (window.location.hash.includes('access_token')) {
                history.replaceState(null, document.title, window.location.pathname + window.location.search);
            }
        });
    };

    initialize();
});