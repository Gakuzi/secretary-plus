document.addEventListener('DOMContentLoaded', () => {

    // --- COPY TO CLIPBOARD ---
    const copyButtons = document.querySelectorAll('.copy-button');
    copyButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.copyTarget;
            const targetElement = document.getElementById(targetId);
            if (!targetElement) return;

            navigator.clipboard.writeText(targetElement.textContent.trim())
                .then(() => {
                    const originalText = button.querySelector('.copy-text').textContent;
                    const checkIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5"></path></svg>`;
                    const originalIcon = button.querySelector('svg').outerHTML;

                    button.innerHTML = `${checkIcon}<span class="copy-text">Скопировано!</span>`;
                    button.style.color = '#34d399'; // emerald-400
                    
                    setTimeout(() => {
                        button.innerHTML = `${originalIcon}<span class="copy-text">${originalText}</span>`;
                        button.style.color = '';
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy text: ', err);
                });
        });
    });


    // --- SCROLLSPY & SMOOTH SCROLL ---
    const sections = document.querySelectorAll('.guide-section');
    const navLinks = document.querySelectorAll('.nav-link');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${id}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }, { rootMargin: '-30% 0px -70% 0px' }); // Activates when the section is in the middle 40% of the viewport

    sections.forEach(section => observer.observe(section));
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                // Manually scroll to have better control over position
                const headerOffset = 40; // Add some padding from the top
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });
            }
        });
    });


    // --- DEEP LINKING ON LOAD ---
    const handleDeepLink = () => {
        const hash = window.location.hash;
        if (hash) {
            const targetElement = document.querySelector(hash);
            if (targetElement) {
                // Use a timeout to ensure the page has finished laying out
                setTimeout(() => {
                     const headerOffset = 40;
                     const elementPosition = targetElement.getBoundingClientRect().top;
                     const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                     window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                }, 100);
            }
        }
    };
    
    // Handle initial load
    handleDeepLink();
});