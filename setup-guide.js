document.addEventListener('DOMContentLoaded', () => {
    const wizardSteps = document.querySelectorAll('.wizard-step');
    const navLinks = document.querySelectorAll('.nav-link');
    const wizardNav = document.getElementById('wizard-nav');
    let currentStep = 0;

    const showStep = (stepIndex) => {
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
        
        window.scrollTo(0, 0);
        currentStep = stepIndex;
    };

    // --- NAVIGATION ---
    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('.wizard-nav-button, .nav-link');
        if (!target) return;

        e.preventDefault();

        let nextStep = -1;
        if (target.matches('.next-button')) {
            nextStep = parseInt(target.dataset.next, 10);
        } else if (target.matches('.back-button')) {
            nextStep = parseInt(target.dataset.back, 10);
        } else if (target.matches('.nav-link')) {
            nextStep = parseInt(target.dataset.step, 10);
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
        if (hash) {
            const link = wizardNav.querySelector(`a[href="${hash}"]`);
            if (link) {
                const step = parseInt(link.dataset.step, 10);
                 if (!isNaN(step)) {
                    showStep(step);
                 }
            }
        } else {
             showStep(0); // Show first step by default
        }
    };
    
    handleDeepLink();
});