import * as Icons from './icons/Icons.js';

// A simple markdown-like formatter for the changelog
function formatChangelog(changelog) {
    return changelog.map(entry => `
        <div class="mt-4">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100">Версия ${entry.version} <span class="text-sm font-normal text-slate-500 dark:text-slate-400">- ${entry.date}</span></h4>
            <ul class="list-disc list-inside mt-1 text-sm space-y-1">
                ${entry.changes.map(change => `<li>${change}</li>`).join('')}
            </ul>
        </div>
    `).join('');
}

export function createAboutModal(onClose) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fadeIn';

    modalOverlay.innerHTML = `
        <div id="about-modal-content" class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 class="text-lg font-bold">О приложении "Секретарь+"</h3>
                <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">&times;</button>
            </header>
            <main class="p-6 flex-1 overflow-y-auto prose dark:prose-invert max-w-none">
                <div class="flex justify-center items-center"><div class="animate-spin h-8 w-8 border-4 border-slate-300 border-t-transparent rounded-full"></div></div>
            </main>
        </div>
    `;

    const mainContent = modalOverlay.querySelector('main');

    fetch('./app-info.json')
        .then(response => response.json())
        .then(info => {
            mainContent.innerHTML = `
                <p><strong>Версия:</strong> ${info.version}</p>
                <p><strong>Автор:</strong> ${info.author}</p>
                <p><strong>Связаться:</strong> <a href="${info.contact}" target="_blank" rel="noopener noreferrer">Telegram</a></p>
                <h3 class="mt-6">История изменений</h3>
                ${formatChangelog(info.changelog)}
            `;
        })
        .catch(error => {
            console.error("Failed to load app info:", error);
            mainContent.innerHTML = `<p class="text-red-500">Не удалось загрузить информацию о приложении.</p>`;
        });
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay || e.target.closest('[data-action="close"]')) {
            onClose();
        }
    });

    return modalOverlay;
}