document.addEventListener('DOMContentLoaded', () => {
    const wizardSteps = document.querySelectorAll('.wizard-step');
    const navLinks = document.querySelectorAll('#wizard-nav .nav-link');
    
    let currentStep = 0;
    let authChoice = null; // 'supabase' or 'direct'

    const adjustNavForChoice = () => {
        const supabaseNavLink = document.querySelector('a[href="#supabase-setup"]');
        const googleCloudNavLink = document.querySelector('a[href="#google-cloud-setup"]');

        if (authChoice === 'direct') {
            supabaseNavLink.classList.add('disabled');
            googleCloudNavLink.innerHTML = '2. Настройка Google Cloud';
            document.querySelector('a[href="#gemini-setup"]').innerHTML = '3. Настройка Gemini API';
            document.querySelector('a[href="#final-step"]').innerHTML = '4. Завершение';
        } else { // supabase or null
            supabaseNavLink.classList.remove('disabled');
            googleCloudNavLink.innerHTML = '3. Настройка Google Cloud';
            document.querySelector('a[href="#gemini-setup"]').innerHTML = '4. Настройка Gemini API';
            document.querySelector('a[href="#final-step"]').innerHTML = '5. Завершение';
        }
    };

    const showStep = (stepIndex) => {
        // Skip disabled steps
        if (authChoice === 'direct' && stepIndex === 2) {
            stepIndex = currentStep < 2 ? 3 : 1; // if going forward, skip to 3, if back, skip to 1
        }
        if (authChoice === 'supabase' && stepIndex < 2 && currentStep >=2) {
            // allows going back to choice
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
            document.getElementById('final-supabase-instructions').style.display = authChoice === 'supabase' ? 'block' : 'none';
            document.getElementById('final-direct-instructions').style.display = authChoice === 'direct' ? 'block' : 'none';
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


    // --- PASTE & COPY ---
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

    const pasteButtons = document.querySelectorAll('.paste-button');
    pasteButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const targetId = button.dataset.pasteTarget;
            const targetInput = document.getElementById(targetId);
            if (!targetInput) return;

            try {
                const text = await navigator.clipboard.readText();
                targetInput.value = text;
                button.textContent = 'Вставлено!';
                setTimeout(() => {
                    button.textContent = 'Вставить';
                }, 2000);
            } catch (err) {
                console.error('Failed to read clipboard contents: ', err);
                alert('Не удалось прочитать буфер обмена.');
            }
        });
    });
    
    // --- DEEP LINKING ON LOAD ---
    const handleDeepLink = () => {
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