document.addEventListener('DOMContentLoaded', () => {
    const wizardSteps = document.querySelectorAll('.wizard-step');
    const navLinks = document.querySelectorAll('#wizard-nav .nav-link');
    const { createClient } = window.supabase;
    const SESSION_STORAGE_KEY = 'secretary-plus-setup-keys';

    let currentStep = 0;
    let authChoice = null; // 'supabase' or 'direct'

    const adjustNavForChoice = () => {
        const supabaseNavLink = document.querySelector('a[href="#supabase-setup"]');
        
        if (authChoice === 'direct') {
            supabaseNavLink.classList.add('disabled');
            document.querySelector('a[href="#google-cloud-setup"]').innerHTML = '2. Настройка Google Cloud';
            document.querySelector('a[href="#proxy-setup"]').innerHTML = '3. (Опц.) Настройка Прокси';
            document.querySelector('a[href="#gemini-setup"]').innerHTML = '4. Настройка Gemini API';
            document.querySelector('a[href="#final-step"]').innerHTML = '5. Завершение';
            document.getElementById('final-supabase-inputs').style.display = 'none';
        } else { // supabase or null
            supabaseNavLink.classList.remove('disabled');
            document.querySelector('a[href="#google-cloud-setup"]').innerHTML = '3. Настройка Google Cloud';
            document.querySelector('a[href="#proxy-setup"]').innerHTML = '4. (Опц.) Настройка Прокси';
            document.querySelector('a[href="#gemini-setup"]').innerHTML = '5. Настройка Gemini API';
            document.querySelector('a[href="#final-step"]').innerHTML = '6. Завершение';
            document.getElementById('final-supabase-inputs').style.display = 'block';
        }
    };

    const showStep = (stepIndex) => {
        // Skip disabled steps
        if (authChoice === 'direct' && stepIndex === 2) {
            stepIndex = currentStep < 2 ? 3 : 1; // if going forward, skip to 3, if back, skip to 1
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
        
        // Scroll to top of main content
        document.querySelector('main').scrollTo(0, 0);
        currentStep = stepIndex;
        window.location.hash = wizardSteps[currentStep].id;
    };

    // --- NAVIGATION ---
    document.body.addEventListener('click', (e) => {
        let target = e.target;
        
        // Handle choice cards
        const choiceCard = target.closest('.choice-card');
        if (choiceCard) {
            authChoice = choiceCard.dataset.choice;
            document.getElementById('google-supabase-instructions').style.display = authChoice === 'supabase' ? 'block' : 'none';
            document.getElementById('google-direct-instructions').style.display = authChoice === 'direct' ? 'block' : 'none';
            adjustNavForChoice();
            showStep(authChoice === 'supabase' ? 2 : 3);
            return;
        }

        // Handle nav buttons and links
        const navTarget = target.closest('.wizard-nav-button, .nav-link');
        if (!navTarget || navTarget.classList.contains('disabled')) return;

        e.preventDefault();

        let nextStep = -1;
        if (navTarget.matches('.next-button')) {
            nextStep = parseInt(navTarget.dataset.next, 10);
        } else if (navTarget.matches('.back-button')) {
            nextStep = parseInt(navTarget.dataset.back, 10);
        } else if (navTarget.matches('.nav-link')) {
            nextStep = parseInt(navTarget.dataset.step, 10);
        }
        
        if (nextStep >= 0 && nextStep < wizardSteps.length) {
            showStep(nextStep);
        }
    });


    // --- COPY ---
    const copyButtons = document.querySelectorAll('.copy-button');
    copyButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.copyTarget;
            const targetElement = document.getElementById(targetId);
            if (!targetElement) return;

            navigator.clipboard.writeText(targetElement.textContent.trim())
                .then(() => {
                    const originalText = button.querySelector('.copy-text').textContent;
                    const checkIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"></path></svg>`;
                    const originalIcon = button.querySelector('svg').outerHTML;

                    button.innerHTML = `${checkIcon}<span class="copy-text">Скопировано!</span>`;
                    button.style.color = '#34d399';
                    
                    setTimeout(() => {
                        button.innerHTML = `${originalIcon}<span class="copy-text">${originalText}</span>`;
                        button.style.color = '';
                    }, 2000);
                });
        });
    });

    // --- SUPABASE AUTO-SETUP ---
    const runSqlButton = document.getElementById('run-sql-auto');
    const tokenInput = document.getElementById('supabase-token-input');
    const projectIdInput = document.getElementById('supabase-project-id');
    const progressContainer = document.getElementById('auto-setup-progress');
    const resultContainer = document.getElementById('auto-setup-result');

    const progressSteps = [
        { id: 'connect', text: 'Подключение к Supabase Management API...' },
        { id: 'execute', text: 'Выполнение SQL-скрипта...' },
        { id: 'verify', text: 'Проверка ответа...' },
    ];

    function updateProgress(stepId, status, message = null) {
        const stepElement = document.getElementById(`progress-step-${stepId}`);
        if (stepElement) {
            stepElement.dataset.status = status;
            if (message) {
                const textElement = stepElement.querySelector('span');
                textElement.textContent = message;
            }
        }
    }

    runSqlButton.addEventListener('click', async () => {
        const accessToken = tokenInput.value.trim();
        const projectId = projectIdInput.value.trim();
        const sqlContent = document.getElementById('sql-script-content').textContent.trim();

        // --- 1. Validation ---
        resultContainer.innerHTML = '';
        resultContainer.className = '';
        resultContainer.classList.add('hidden');
        tokenInput.style.borderColor = '';
        projectIdInput.style.borderColor = '';

        if (!accessToken || !projectId) {
            resultContainer.className = 'status-message status-error';
            resultContainer.textContent = 'Ошибка: Пожалуйста, введите токен доступа и ID проекта.';
            resultContainer.classList.remove('hidden');
            if (!accessToken) tokenInput.style.borderColor = '#ef4444';
            if (!projectId) projectIdInput.style.borderColor = '#ef4444';
            return;
        }

        // --- 2. Initialize UI ---
        runSqlButton.disabled = true;
        runSqlButton.textContent = 'Выполняется...';
        progressContainer.classList.remove('hidden');
        progressContainer.innerHTML = progressSteps.map(step => `
            <div class="progress-step" id="progress-step-${step.id}" data-status="pending">
                <span class="progress-step-text">${step.text}</span>
            </div>
        `).join('');

        try {
            // --- 3. Execute Steps ---
            updateProgress('connect', 'loading');
            await new Promise(res => setTimeout(res, 500)); // Simulate connection
            updateProgress('connect', 'success');

            updateProgress('execute', 'loading');
            const response = await fetch(`https://api.supabase.com/v1/projects/${projectId}/sql`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ "query": sqlContent })
            });
            updateProgress('execute', 'success');

            updateProgress('verify', 'loading');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            updateProgress('verify', 'success');

            // --- 4. Show Success ---
            resultContainer.className = 'status-message status-success';
            resultContainer.textContent = 'Успешно! Схема базы данных настроена. Можете переходить к следующему шагу.';
            resultContainer.classList.remove('hidden');

        } catch (error) {
            // --- 5. Show Error ---
            console.error('Auto-setup failed:', error);
            progressSteps.forEach(step => {
                const stepElement = document.getElementById(`progress-step-${step.id}`);
                if (stepElement.dataset.status === 'loading') {
                    updateProgress(step.id, 'error', `Ошибка на шаге: ${step.text}`);
                }
            });
            resultContainer.className = 'status-message status-error';
            resultContainer.textContent = `Ошибка выполнения: ${error.message}. Проверьте правильность токена и ID проекта. Вы можете попробовать ручной метод.`;
            resultContainer.classList.remove('hidden');
        } finally {
            runSqlButton.disabled = false;
            runSqlButton.textContent = 'Запустить автоматическую настройку';
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
            isSupabaseEnabled: true, // This flow is only for Supabase users
        };

        if (!settings.supabaseUrl || !settings.supabaseAnonKey || !settings.geminiApiKey) {
            finalStatusContainer.className = 'status-message status-error';
            finalStatusContainer.textContent = 'Ошибка: Пожалуйста, заполните поля Supabase URL, Supabase Anon Key и Gemini API Key.';
            return;
        }

        try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(settings));
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
        }
    });

    const handlePostAuthSave = async () => {
        const storedKeys = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!storedKeys) return;

        showStep(6); // Ensure we are on the final step
        finalFormInputs.style.display = 'none'; // Hide inputs, show status
        saveButton.style.display = 'none';
        
        finalStatusContainer.className = 'status-message status-loading';
        finalStatusContainer.textContent = 'Аутентификация пройдена. Сохраняем настройки в вашем аккаунте...';

        try {
            const settings = JSON.parse(storedKeys);
            const supabase = createClient(settings.supabaseUrl, settings.supabaseAnonKey);
            
            // Wait for session to be available
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!session) throw new Error("Не удалось получить сессию пользователя после аутентификации.");

            // RPC function `upsert_user_settings` is defined in the SQL script
            const { error: rpcError } = await supabase.rpc('upsert_user_settings', { new_settings: settings });
            if (rpcError) throw rpcError;

            finalStatusContainer.className = 'status-message status-success';
            finalStatusContainer.innerHTML = `Настройки успешно сохранены! Вы можете закрыть эту вкладку и вернуться в приложение.`;
            
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            // Clear the hash from URL
            history.pushState("", document.title, window.location.pathname + window.location.search);

        } catch(error) {
            console.error("Post-auth save failed:", error);
            finalStatusContainer.className = 'status-message status-error';
            finalStatusContainer.textContent = `Не удалось сохранить настройки: ${error.message}`;
        }
    };
    
    // --- DEEP LINKING & INITIALIZATION ---
    const handleDeepLink = () => {
        // If the URL has auth tokens, it's a redirect from Google.
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
        showStep(0); // Show first step by default
    };
    
    adjustNavForChoice();
    handleDeepLink();
});