import { GoogleGenAI, Type } from "@google/genai";

document.addEventListener('DOMContentLoaded', () => {
    const wizardSteps = document.querySelectorAll('.wizard-step');
    const navLinks = document.querySelectorAll('#wizard-nav .nav-link');
    const mobileNavSelect = document.getElementById('mobile-nav-select');
    const { createClient } = window.supabase;
    const SESSION_STORAGE_KEY = 'secretary-plus-setup-keys';
    const PROXY_STORAGE_KEY = 'secretary-plus-setup-proxies';

    let currentStep = 0;
    let authChoice = null; // 'supabase' or 'direct'
    let selectedProxies = [];

    // --- UTILITY & API FUNCTIONS (SELF-CONTAINED FOR THIS PAGE) ---
    async function findProxiesWithGemini(apiKey) {
        if (!apiKey) throw new Error("Ключ Gemini API не предоставлен.");
        const ai = new GoogleGenAI({ apiKey });
        const model = 'gemini-2.5-flash';
        const prompt = `Найди 10 общедоступных (бесплатных) прокси-серверов, которые могут работать с Google API из разных стран. Предоставь ответ в формате JSON. Каждый объект должен содержать поля "url", "country" и "city". Пример: [{"url": "https://example.com/proxy", "country": "USA", "city": "California"}]`;
        try {
            const response = await ai.models.generateContent({
                model: model,
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
        if (!proxyUrl || !apiKey) return { status: 'error', speed: null };
        const testEndpoint = `${proxyUrl}/v1beta/models?key=${apiKey}`;
        const startTime = performance.now();
        try {
            const response = await fetch(testEndpoint, { method: 'GET' });
            if (response.ok) {
                const data = await response.json();
                if (data.models && Array.isArray(data.models)) {
                    return { status: 'ok', speed: Math.round(performance.now() - startTime) };
                }
            }
            return { status: 'error', speed: null };
        } catch (error) {
            return { status: 'error', speed: null };
        }
    }

    // --- UI & NAVIGATION ---
    const adjustNavForChoice = () => {
        const supabaseNavLink = document.querySelector('a[href="#supabase-setup"]');
        const proxyNavLink = document.querySelector('a[href="#proxy-setup"]');

        if (authChoice === 'direct') {
            supabaseNavLink.classList.add('disabled');
            proxyNavLink.classList.add('disabled');
            document.querySelector('a[href="#google-cloud-setup"]').innerHTML = '2. Настройка Google Cloud';
            document.querySelector('a[href="#gemini-setup"]').innerHTML = '3. Настройка Gemini API';
            document.querySelector('a[href="#final-step"]').innerHTML = '4. Завершение';
            document.getElementById('final-supabase-inputs').style.display = 'none';
        } else { // supabase or null
            supabaseNavLink.classList.remove('disabled');
            proxyNavLink.classList.remove('disabled');
            document.querySelector('a[href="#google-cloud-setup"]').innerHTML = '3. Настройка Google Cloud';
            document.querySelector('a[href="#gemini-setup"]').innerHTML = '4. Настройка Gemini API';
            document.querySelector('a[href="#proxy-setup"]').innerHTML = '5. (Опц.) Настройка Прокси';
            document.querySelector('a[href="#final-step"]').innerHTML = '6. Завершение';
            document.getElementById('final-supabase-inputs').style.display = 'block';
        }
        populateMobileNav(); // Repopulate mobile nav with correct steps
    };
    
    const populateMobileNav = () => {
        mobileNavSelect.innerHTML = '';
        navLinks.forEach(link => {
            if (link.classList.contains('disabled')) return;
            const option = document.createElement('option');
            option.value = link.dataset.step;
            option.textContent = link.textContent;
            mobileNavSelect.appendChild(option);
        });
    };

    const showStep = (stepIndex) => {
        // Skip disabled steps
        if (authChoice === 'direct') {
            if (stepIndex === 2 || stepIndex === 5) { // Skip supabase and proxy
                stepIndex = currentStep < stepIndex ? stepIndex + 1 : stepIndex - 1;
            }
        }
        
        wizardSteps.forEach((step, index) => {
            step.style.display = index === stepIndex ? 'block' : 'none';
        });

        navLinks.forEach((link, index) => {
            link.classList.remove('active', 'completed');
            if (index < stepIndex) {
                link.classList.add('completed');
            } else if (index === stepIndex) {
                link.classList.add('active');
            }
        });
        
        mobileNavSelect.value = stepIndex;
        document.querySelector('main').scrollTo(0, 0);
        currentStep = stepIndex;
        window.location.hash = wizardSteps[currentStep].id;
    };
    
    mobileNavSelect.addEventListener('change', (e) => {
        const stepIndex = parseInt(e.target.value, 10);
        showStep(stepIndex);
    });

    document.body.addEventListener('click', (e) => {
        const choiceCard = e.target.closest('.choice-card');
        if (choiceCard) {
            authChoice = choiceCard.dataset.choice;
            document.getElementById('google-supabase-instructions').style.display = authChoice === 'supabase' ? 'block' : 'none';
            document.getElementById('google-direct-instructions').style.display = authChoice === 'direct' ? 'block' : 'none';
            adjustNavForChoice();
            showStep(authChoice === 'supabase' ? 2 : 3);
            return;
        }

        const navTarget = e.target.closest('.wizard-nav-button, .nav-link');
        if (!navTarget || navTarget.classList.contains('disabled')) return;

        e.preventDefault();
        let nextStep = -1;
        if (navTarget.matches('.next-button')) nextStep = parseInt(navTarget.dataset.next, 10);
        else if (navTarget.matches('.back-button')) nextStep = parseInt(navTarget.dataset.back, 10);
        else if (navTarget.matches('.nav-link')) nextStep = parseInt(navTarget.dataset.step, 10);
        
        if (nextStep >= 0 && nextStep < wizardSteps.length) showStep(nextStep);
    });

    // --- COPY ---
    document.querySelectorAll('.copy-button').forEach(button => {
        button.addEventListener('click', () => {
            const target = document.getElementById(button.dataset.copyTarget);
            if (!target) return;
            navigator.clipboard.writeText(target.textContent.trim()).then(() => {
                const originalText = button.querySelector('.copy-text').textContent;
                button.querySelector('.copy-text').textContent = 'Скопировано!';
                setTimeout(() => {
                    button.querySelector('.copy-text').textContent = originalText;
                }, 2000);
            });
        });
    });
    
    // --- PROXY SETUP ---
    const findProxiesBtn = document.getElementById('find-proxies-ai');
    const proxyStatusEl = document.getElementById('proxy-finder-status');
    const foundContainer = document.getElementById('found-proxies-container');
    const selectedContainer = document.getElementById('selected-proxies-container');

    const renderProxyItem = (proxy, containerType) => {
        const isSelected = containerType === 'selected';
        const item = document.createElement('div');
        item.className = 'proxy-item';
        item.dataset.url = proxy.url;
        item.innerHTML = `
            <div class="proxy-status-dot" data-status="${proxy.status || 'untested'}"></div>
            <div class="proxy-item-info">
                <p class="proxy-item-url">${proxy.url}</p>
                <p class="proxy-item-details">
                    <span>${proxy.geolocation}</span>
                    <span class="speed-info" style="display: ${proxy.speed ? 'inline' : 'none'};"> | ${proxy.speed} мс</span>
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
        const item = foundContainer.querySelector(`.proxy-item[data-url="${url}"]`);
        if (!item) return;
        item.querySelector('.proxy-status-dot').dataset.status = status;
        const speedEl = item.querySelector('.speed-info');
        if (speed) {
            speedEl.textContent = ` | ${speed} мс`;
            speedEl.style.display = 'inline';
        } else {
            speedEl.style.display = 'none';
        }
    };

    const renderSelectedProxies = () => {
        if (selectedProxies.length === 0) {
            selectedContainer.innerHTML = `<p class="text-gray-400 text-center py-4">Добавьте прокси из списка слева, чтобы сохранить их.</p>`;
        } else {
            selectedContainer.innerHTML = '';
            selectedProxies.forEach(p => selectedContainer.appendChild(renderProxyItem(p, 'selected')));
        }
    };

    findProxiesBtn.addEventListener('click', async () => {
        const apiKey = document.getElementById('wizard-gemini-api-key').value.trim();
        if (!apiKey) {
            proxyStatusEl.className = 'status-message status-error';
            proxyStatusEl.textContent = 'Ошибка: Введите ваш Gemini API Key на предыдущем шаге.';
            return;
        }
        proxyStatusEl.className = 'status-message status-loading';
        proxyStatusEl.textContent = 'Ищем прокси с помощью ИИ... Это может занять до минуты.';
        findProxiesBtn.disabled = true;

        try {
            const proxies = await findProxiesWithGemini(apiKey);
            foundContainer.innerHTML = '';
            proxies.forEach(p => {
                const proxyData = { ...p, geolocation: `${p.country}, ${p.city || ''}`.replace(/, $/, '') };
                foundContainer.appendChild(renderProxyItem(proxyData, 'found'));
            });
            proxyStatusEl.className = 'status-message status-success';
            proxyStatusEl.textContent = `Найдено ${proxies.length} прокси. Протестируйте и добавьте лучшие.`;
        } catch (error) {
            proxyStatusEl.className = 'status-message status-error';
            proxyStatusEl.textContent = error.message;
        } finally {
            findProxiesBtn.disabled = false;
        }
    });

    foundContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const item = target.closest('.proxy-item');
        if (!item) return;

        const proxyUrl = item.dataset.url;
        
        if (target.matches('.test-btn')) {
            target.disabled = true;
            target.textContent = '...';
            updateProxyUI(proxyUrl, { status: 'testing' });
            const apiKey = document.getElementById('wizard-gemini-api-key').value.trim();
            const result = await testProxyConnection(proxyUrl, apiKey);
            updateProxyUI(proxyUrl, result);
            target.disabled = false;
            target.textContent = 'Тест';
        }

        if (target.matches('.add-btn')) {
            if (selectedProxies.some(p => p.url === proxyUrl)) return;
            const geolocation = item.querySelector('.proxy-item-details span').textContent;
            selectedProxies.push({ url: proxyUrl, geolocation, alias: geolocation });
            renderSelectedProxies();
        }
    });

    selectedContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.proxy-item');
        if (item && e.target.matches('.remove-btn')) {
            selectedProxies = selectedProxies.filter(p => p.url !== item.dataset.url);
            renderSelectedProxies();
        }
    });

    // --- FINAL STEP & SAVE ---
    const saveButton = document.getElementById('save-and-login-button');
    const finalStatusContainer = document.getElementById('final-status-container');
    const finalFormInputs = document.getElementById('final-form-inputs');
    
    saveButton.addEventListener('click', async () => {
        finalStatusContainer.innerHTML = '';
        finalStatusContainer.className = '';

        const settings = {
            supabaseUrl: document.getElementById('final-supabase-url').value.trim(),
            supabaseAnonKey: document.getElementById('final-supabase-anon-key').value.trim(),
            googleClientId: document.getElementById('final-google-client-id').value.trim(),
            geminiApiKey: document.getElementById('final-gemini-api-key').value.trim(),
            isSupabaseEnabled: authChoice === 'supabase',
        };

        if ((settings.isSupabaseEnabled && (!settings.supabaseUrl || !settings.supabaseAnonKey)) || !settings.geminiApiKey) {
            finalStatusContainer.className = 'status-message status-error';
            finalStatusContainer.textContent = 'Ошибка: Пожалуйста, заполните обязательные поля.';
            return;
        }

        try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(settings));
            sessionStorage.setItem(PROXY_STORAGE_KEY, JSON.stringify(selectedProxies));
            finalStatusContainer.className = 'status-message status-loading';
            finalStatusContainer.textContent = 'Сохраняем ключи и перенаправляем на страницу входа Google...';
            
            const supabase = createClient(settings.supabaseUrl, settings.supabaseAnonKey);
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.href }
            });
            if (error) throw error;
        } catch (error) {
             finalStatusContainer.className = 'status-message status-error';
             finalStatusContainer.textContent = `Ошибка: ${error.message}`;
             sessionStorage.removeItem(SESSION_STORAGE_KEY);
             sessionStorage.removeItem(PROXY_STORAGE_KEY);
        }
    });

    const handlePostAuthSave = async () => {
        const storedKeys = sessionStorage.getItem(SESSION_STORAGE_KEY);
        const storedProxies = sessionStorage.getItem(PROXY_STORAGE_KEY);
        if (!storedKeys) return;

        showStep(6);
        finalFormInputs.style.display = 'none';
        saveButton.style.display = 'none';
        
        finalStatusContainer.className = 'status-message status-loading';
        finalStatusContainer.textContent = 'Аутентификация пройдена. Сохраняем настройки в вашем аккаунте...';

        try {
            const settings = JSON.parse(storedKeys);
            const proxies = JSON.parse(storedProxies || '[]');
            const supabase = createClient(settings.supabaseUrl, settings.supabaseAnonKey);
            
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!session) throw new Error("Не удалось получить сессию пользователя после аутентификации.");

            const { error: rpcError } = await supabase.rpc('upsert_user_settings', { new_settings: settings });
            if (rpcError) throw rpcError;
            
            if (proxies.length > 0) {
                const proxiesToSave = proxies.map(p => ({
                    url: p.url,
                    alias: p.alias,
                    geolocation: p.geolocation,
                    is_active: true,
                    priority: 10,
                    user_id: session.user.id
                }));
                const { error: proxyError } = await supabase.from('proxies').insert(proxiesToSave);
                if (proxyError) throw proxyError;
            }

            finalStatusContainer.className = 'status-message status-success';
            finalStatusContainer.innerHTML = `Настройки успешно сохранены! Вы можете закрыть эту вкладку и вернуться в приложение.`;
            
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            sessionStorage.removeItem(PROXY_STORAGE_KEY);
            history.pushState("", document.title, window.location.pathname + window.location.search);

        } catch(error) {
            console.error("Post-auth save failed:", error);
            finalStatusContainer.className = 'status-message status-error';
            finalStatusContainer.textContent = `Не удалось сохранить настройки: ${error.message}`;
        }
    };
    
    // --- DEEP LINKING & INITIALIZATION ---
    const handleDeepLink = () => {
        if (window.location.hash.includes('access_token')) {
            handlePostAuthSave();
            return;
        }

        const hash = window.location.hash;
        const link = hash ? document.querySelector(`#wizard-nav a[href="${hash}"]`) : null;
        if (link && !link.classList.contains('disabled')) {
            const step = parseInt(link.dataset.step, 10);
             if (!isNaN(step)) {
                showStep(step);
                return;
             }
        }
        showStep(0);
    };
    
    adjustNavForChoice();
    handleDeepLink();
});