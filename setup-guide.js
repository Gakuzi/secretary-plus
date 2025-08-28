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
                    button.querySelector('.copy-text').textContent = 'Скопировано!';
                    setTimeout(() => {
                        button.querySelector('.copy-text').textContent = originalText;
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
                targetElement.scrollIntoView({ behavior: 'smooth' });
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
                     targetElement.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }
        }
    };
    
    // Handle initial load
    handleDeepLink();
});
