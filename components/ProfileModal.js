import * as Icons from './icons/Icons.js';

export function createProfileModal({ currentUserProfile, onClose, onLogout, onDelete }) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fadeIn';

    const roleDisplayMap = {
        owner: { text: 'Владелец', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
        admin: { text: 'Администратор', class: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
        manager: { text: 'Менеджер', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
        user: { text: 'Пользователь', class: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200' }
    };
    const currentUserRoleInfo = roleDisplayMap[currentUserProfile.role] || roleDisplayMap.user;

    modalOverlay.innerHTML = `
        <div id="profile-modal-content" class="bg-white dark:bg-slate-800 w-full max-w-sm rounded-lg shadow-xl flex flex-col">
            <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
                <h2 class="text-lg font-bold">Профиль</h2>
                <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Закрыть">&times;</button>
            </header>

            <main class="p-6 space-y-4">
                <div class="text-center">
                    <img src="${currentUserProfile.avatar_url}" alt="${currentUserProfile.full_name}" class="w-24 h-24 rounded-full mx-auto shadow-md">
                    <p class="text-xl font-bold mt-3 text-slate-900 dark:text-slate-100">${currentUserProfile.full_name}</p>
                    <p class="text-sm text-slate-500 dark:text-slate-400">${currentUserProfile.email}</p>
                    <span class="inline-block mt-2 px-3 py-1 text-xs font-semibold rounded-full ${currentUserRoleInfo.class}">
                        ${currentUserRoleInfo.text}
                    </span>
                </div>
                <div class="space-y-2">
                     <button data-action="logout" class="w-full text-center px-4 py-2 text-sm font-semibold rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors">
                        Выйти из аккаунта
                    </button>
                    <button data-action="toggle-danger-zone" class="w-full text-center px-4 py-2 text-sm font-medium rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                        Опасная зона
                    </button>
                </div>
                 <div id="danger-zone" class="hidden p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600 rounded-lg transition-all">
                    <h5 class="font-bold text-red-800 dark:text-red-200">Удаление данных</h5>
                    <p class="text-xs text-red-700 dark:text-red-300 mt-1 mb-3">Это действие необратимо удалит все ваши облачные настройки из Supabase.</p>
                    <button data-action="delete" class="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-semibold">Удалить из облака</button>
                </div>
            </main>
        </div>
    `;

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) {
            if (!e.target.closest('#profile-modal-content')) {
                onClose();
            }
            return;
        }

        const action = target.dataset.action;

        switch (action) {
            case 'close': onClose(); break;
            case 'logout': onLogout(); break;
            case 'delete': onDelete(); break;
            case 'toggle-danger-zone':
                e.preventDefault();
                modalOverlay.querySelector('#danger-zone')?.classList.toggle('hidden');
                break;
        }
    };

    modalOverlay.addEventListener('click', handleAction);

    return modalOverlay;
}
