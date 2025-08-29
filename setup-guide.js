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
        const testEndpoint = `${proxyUrl}/v1beta/models?key=${apiKey}`;
        const startTime = performance.now();
        try {
            const response = await fetch(testEndpoint, { method: 'GET' });
            if (response.ok) {
                const data = await response.json();
                if (data.models && Array.isArray(data.models)) {
                    return { status: 'ok', speed: Math.round(performance.now() - startTime), message: 'OK' };
                }
            }
            return { status: 'error', speed: null, message: `Status: ${response.status}` };
        } catch (error) {
            return { status: 'error', speed: null, message: 'Fetch failed' };
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
            <div class="step-navigation mt-4">
                 <div></div> <!-- Spacer -->
                 <button class="wizard-nav-button next-button" data-nav-target="keys">Продолжить</button>
            </div>
        `;
        containers.userProfile.style.display = 'block';
        steps.auth.dataset.status = 'completed';

        const { data, error } = await state.supabaseClient.from('user_settings').select('settings').single();
        if (error && error.code !== 'PGRST116') throw error;
        
        state.settings = data ? data.settings : {};
        inputs.geminiApiKey.value = state.settings.geminiApiKey || '';
        inputs.googleClientId.value = state.settings.googleClientId || '';
        
        const { data: proxiesData, error: proxiesError } = await state.supabaseClient.from('proxies').select('*');
        if (proxiesError) throw proxiesError;
        state.selectedProxies = proxiesData || [];
        renderSelectedProxies();
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
        } else {
            state.settings = settingsUpdate;
            setStatus(containers.keysStatus, 'success', 'Ключи успешно сохранены в вашем аккаунте.');
            steps.keys.dataset.status = 'completed';
            showStep('proxy');
        }
        buttons.saveKeys.disabled = false;
        buttons.saveKeys.textContent = 'Сохранить и продолжить';
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
            const newProxies = foundProxies.filter(p => !existingUrls.has(p.url));

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
            const proxiesToUpsert = state.selectedProxies.map((p, index) => ({
                user_id: state.user.id, // CRITICAL FIX for RLS
                url: p.url,
                alias: p.alias || p.geolocation,
                geolocation: p.geolocation,
                is_active: true,
                priority: index,
                last_status: p.last_status,
                last_speed_ms: p.last_speed_ms
            }));

            if(proxiesToUpsert.length > 0) {
                const { error } = await state.supabaseClient.from('proxies').upsert(proxiesToUpsert, { onConflict: 'user_id, url' });
                if (error) throw error;
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
        // Use localStorage to signal completion to the main app window
        localStorage.setItem('setup_completed', 'true');
        window.close();
    });

    document.body.addEventListener('click', e => {
        const navButton = e.target.closest('[data-nav-target]');
        if (navButton) {
            showStep(navButton.dataset.navTarget);
        }
    });

    // --- PROXY LISTS LOGIC ---
    
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
                ${!isSelected ? `<button class="test-btn">Тест</button><button class="add-btn">Добавить</button>` : ''}
                ${isSelected ? `<button class="remove-btn">Удалить</button>` : ''}
            </div>
        `;
        return item;
    };

    const updateProxyUI = (url, { status, speed }) => {
        const item = containers.foundProxies.querySelector(`.proxy-item[data-url="${url}"]`);
        if (!item) return;
        const dot = item.querySelector('.proxy-status-dot');
        dot.dataset.status = status;
        item.dataset.lastStatus = status; // Save status for adding later
        const speedEl = item.querySelector('.speed-info');
        if (speed) {
            speedEl.textContent = ` · ${speed} мс`;
            speedEl.style.display = 'inline';
            item.dataset.lastSpeed = speed; // Save speed for adding later
        } else {
            speedEl.style.display = 'none';
        }
    };
    
    const renderSelectedProxies = () => {
        if (state.selectedProxies.length === 0) {
            containers.selectedProxies.innerHTML = `<p class="text-gray-400 text-center py-4">Выбранные прокси появятся здесь.</p>`;
        } else {
            containers.selectedProxies.innerHTML = '';
            state.selectedProxies.forEach(p => containers.selectedProxies.appendChild(renderProxyItem(p, 'selected')));
        }
    };

    containers.foundProxies.addEventListener('click', async (e) => {
        const target = e.target;
        const item = target.closest('.proxy-item');
        if (!item) return;

        const proxyUrl = item.dataset.url;
        
        if (target.matches('.test-btn')) {
            target.disabled = true;
            target.textContent = '...';
            updateProxyUI(proxyUrl, { status: 'testing' });
            const result = await testProxyConnection(proxyUrl, state.settings.geminiApiKey);
            updateProxyUI(proxyUrl, result);
            target.disabled = false;
            target.textContent = 'Тест';
        }

        if (target.matches('.add-btn')) {
            if (state.selectedProxies.some(p => p.url === proxyUrl)) return;
            state.selectedProxies.push({ 
                url: proxyUrl, 
                geolocation: item.dataset.geo, 
                alias: item.dataset.geo,
                last_status: item.dataset.lastStatus,
                last_speed_ms: item.dataset.lastSpeed
            });
            renderSelectedProxies();
        }
    });

    containers.selectedProxies.addEventListener('click', (e) => {
        const item = e.target.closest('.proxy-item');
        if (item && e.target.matches('.remove-btn')) {
            state.selectedProxies = state.selectedProxies.filter(p => p.url !== item.dataset.url);
            renderSelectedProxies();
        }
    });
    
    // --- INITIALIZATION ---
    
    const initialize = async () => {
        showStep('auth');
        state.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        state.supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) {
                if (!state.user) { // Prevent re-rendering if user is already set
                    state.user = session.user;
                    await renderAuthenticatedState();
                }
            } else if (event === 'SIGNED_OUT') {
                state.user = null;
                // Reset to initial state
                showStep('auth');
                buttons.connectLogin.style.display = 'block';
                containers.userProfile.style.display = 'none';
                containers.authStatus.style.display = 'none';
            }

            // Clean URL from auth tokens after processing
            if (window.location.hash.includes('access_token')) {
                history.replaceState(null, document.title, window.location.pathname + window.location.search);
            }
        });

        // Check for existing session on page load
        const { data: { session } } = await state.supabaseClient.auth.getSession();
        if (session) {
            state.user = session.user;
            await renderAuthenticatedState();
        }
    };

    initialize();
});