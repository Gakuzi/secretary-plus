import * as Icons from './icons/Icons.js';
import { createStatsModal } from './StatsModal.js';
import { createDataManagerModal } from './DataManagerModal.js';

// --- HELPERS ---
const ROLE_DISPLAY_MAP = {
    owner: { text: 'Владелец', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
    admin: { text: 'Администратор', class: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
    manager: { text: 'Менеджер', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    user: { text: 'Пользователь', class: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200' }
};

const ROLES = ['owner', 'admin', 'manager', 'user'];

// --- TAB CONTENT RENDERERS ---

function renderProfileTab(profile) {
    const roleInfo = ROLE_DISPLAY_MAP[profile.role] || ROLE_DISPLAY_MAP.user;
    return `
        <div class="text-center p-6">
            <img src="${profile.avatar_url}" alt="${profile.full_name}" class="w-24 h-24 rounded-full mx-auto shadow-md mb-4">
            <h3 class="text-2xl font-bold text-slate-900 dark:text-slate-100">${profile.full_name}</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">${profile.email}</p>
            <span class="inline-block mt-3 px-3 py-1 text-xs font-semibold rounded-full ${roleInfo.class}">${roleInfo.text}</span>
        </div>
        <div class="p-6 border-t border-slate-200 dark:border-slate-700">
             <button data-action="logout" class="w-full flex items-center justify-center gap-2 text-center px-4 py-2 text-sm font-semibold rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors">
                Выйти из аккаунта
            </button>
        </div>
    `;
}

function renderUsersTab(users, currentUserId) {
    const usersHtml = users.map(user => {
        const roleInfo = ROLE_DISPLAY_MAP[user.role] || ROLE_DISPLAY_MAP.user;
        const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('ru-RU') : 'Никогда';
        
        // Owner cannot be changed, others can
        const canChangeRole = user.role !== 'owner';
        const roleSelector = canChangeRole ? `
            <select data-action="change-role" data-user-id="${user.id}" class="bg-transparent text-xs p-1 rounded border border-slate-300 dark:border-slate-600 focus:ring-blue-500 focus:border-blue-500">
                ${ROLES.map(role => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${ROLE_DISPLAY_MAP[role].text}</option>`).join('')}
            </select>
        ` : `<span class="px-2 py-1 text-xs font-semibold rounded-full ${roleInfo.class}">${roleInfo.text}</span>`;

        return `
            <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <div class="flex items-center gap-3">
                    <img src="${user.avatar_url}" class="w-10 h-10 rounded-full" alt="${user.full_name}">
                    <div>
                        <p class="font-bold text-sm text-slate-800 dark:text-slate-100">${user.full_name} ${user.id === currentUserId ? '<span class="text-blue-500">(Вы)</span>' : ''}</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${user.email}</p>
                        <p class="text-xs text-slate-400 dark:text-slate-500">Вход: ${lastSignIn}</p>
                    </div>
                </div>
                <div>${roleSelector}</div>
            </div>
        `;
    }).join('');
    return `<div class="space-y-3">${usersHtml}</div>`;
}

function renderHistoryTab(history) {
    if (!history || history.length === 0) {
        return `<p class="text-center text-slate-500 dark:text-slate-400 p-8">История чата пуста.</p>`;
    }

    const historyHtml = history.map(msg => {
        const senderClass = msg.sender === 'user' ? 'bg-blue-50 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-slate-50 text-slate-800 dark:bg-slate-900/50 dark:text-slate-300';
        return `
            <div class="p-3 rounded-lg ${senderClass}">
                <div class="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <div class="flex items-center gap-2">
                         <img src="${msg.avatar_url}" class="w-5 h-5 rounded-full" alt="">
                         <span class="font-semibold">${msg.full_name || msg.email}</span>
                    </div>
                    <span>${new Date(msg.created_at).toLocaleString('ru-RU')}</span>
                </div>
                <p class="text-sm">${msg.text_content || ' '}</p>
                ${msg.card_data ? `<pre class="mt-2 p-2 bg-slate-200 dark:bg-slate-800 rounded text-xs overflow-auto">${JSON.stringify(msg.card_data, null, 2)}</pre>` : ''}
            </div>
        `;
    }).join('');
    return `<div class="space-y-3">${historyHtml}</div>`;
}

function renderStatsTab() {
    return `
        <h3 class="text-xl font-bold">Статистика использования</h3>
        <p class="text-sm text-slate-600 dark:text-slate-400 my-4">Статистика показывает, какие инструменты ассистента используются чаще всего. Данные агрегированы по всем пользователям в вашей базе данных.</p>
        <button data-action="show-stats" class="w-full max-w-sm mx-auto flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold transition-colors">
            ${Icons.ChartBarIcon}
            <span>Показать статистику</span>
        </button>
    `;
}

function renderSyncTab() {
     return `
        <h3 class="text-xl font-bold">Управление данными</h3>
        <p class="text-sm text-slate-600 dark:text-slate-400 my-4">Откройте "Центр управления данными", чтобы просматривать синхронизированную информацию, запускать синхронизацию вручную и отслеживать статусы.</p>
        <button data-action="open-data-manager" class="w-full max-w-sm mx-auto flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold transition-colors">
            ${Icons.DatabaseIcon}
            <span>Открыть Центр управления</span>
        </button>
    `;
}

function renderDangerZoneTab() {
    return `
        <div class="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600 rounded-lg">
            <h4 class="font-bold text-red-800 dark:text-red-200">Удаление данных из облака</h4>
            <p class="text-xs text-red-700 dark:text-red-300 mt-1 mb-3">
                Это действие необратимо удалит **только ваши личные настройки**, сохраненные в облаке Supabase (ключи, предпочтения). 
                Ваши синхронизированные данные (контакты, файлы и т.д.) и аккаунт останутся нетронутыми.
            </p>
            <button data-action="delete-settings" class="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-semibold">Удалить мои настройки</button>
        </div>
    `;
}

// --- MAIN COMPONENT ---

export function createProfileModal({ currentUserProfile, supabaseService, onClose, onLogout, onLaunchDataManager }) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fadeIn';

    const isAdmin = currentUserProfile.role === 'admin' || currentUserProfile.role === 'owner';
    const isSupabaseEnabled = !!supabaseService;

    const TABS = [
        { id: 'profile', label: 'Профиль', icon: Icons.UserIcon, enabled: true },
        { id: 'sync', label: 'Синхронизация', icon: Icons.DatabaseIcon, enabled: isSupabaseEnabled },
        { id: 'stats', label: 'Статистика', icon: Icons.ChartBarIcon, enabled: isSupabaseEnabled },
        { id: 'users', label: 'Пользователи', icon: Icons.UsersIcon, enabled: isAdmin && isSupabaseEnabled },
        { id: 'history', label: 'История чата', icon: Icons.FileIcon, enabled: isAdmin && isSupabaseEnabled },
        { id: 'danger', label: 'Опасная зона', icon: Icons.AlertTriangleIcon, enabled: isSupabaseEnabled },
    ];

    const availableTabs = TABS.filter(tab => tab.enabled);

    modalOverlay.innerHTML = `
        <div id="profile-modal-content" class="bg-white dark:bg-slate-800 w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] rounded-lg shadow-xl flex flex-col sm:flex-row">
            <header class="p-4 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 w-full sm:w-56 flex-shrink-0">
                <div class="flex items-center justify-between sm:flex-col sm:items-start sm:h-full">
                     <h2 class="text-lg font-bold">Профиль и Управление</h2>
                     <nav class="flex flex-row sm:flex-col sm:space-y-1 mt-0 sm:mt-4 w-full">
                        ${availableTabs.map(tab => `
                            <button class="profile-tab-button ${tab.id === 'profile' ? 'active' : ''}" data-tab="${tab.id}">
                                <span class="w-5 h-5">${tab.icon}</span>
                                <span>${tab.label}</span>
                            </button>
                        `).join('')}
                     </nav>
                     <div class="hidden sm:block sm:mt-auto sm:w-full">
                        <button data-action="close" class="w-full text-center px-4 py-2 text-sm font-medium rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                            Закрыть
                        </button>
                     </div>
                </div>
            </header>
            <main id="profile-tab-content" class="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900/50">
                <!-- Tab content will be rendered here -->
            </main>
        </div>
    `;

    const contentContainer = modalOverlay.querySelector('#profile-tab-content');
    const subModalContainer = document.createElement('div'); // Container for modals launched from this one
    modalOverlay.appendChild(subModalContainer);

    const switchTab = async (tabId) => {
        modalOverlay.querySelectorAll('.profile-tab-button').forEach(btn => btn.classList.remove('active'));
        modalOverlay.querySelector(`.profile-tab-button[data-tab="${tabId}"]`).classList.add('active');
        
        contentContainer.innerHTML = `<div class="flex justify-center items-center h-full"><div class="animate-spin h-8 w-8 border-4 border-slate-300 border-t-transparent rounded-full"></div></div>`;

        try {
            switch (tabId) {
                case 'profile':
                    contentContainer.innerHTML = renderProfileTab(currentUserProfile);
                    break;
                case 'sync':
                    contentContainer.innerHTML = renderSyncTab();
                    break;
                case 'users':
                    const users = await supabaseService.getAllUserProfiles();
                    contentContainer.innerHTML = renderUsersTab(users, currentUserProfile.id);
                    break;
                case 'history':
                    const history = await supabaseService.getChatHistoryForAdmin();
                    contentContainer.innerHTML = renderHistoryTab(history);
                    break;
                case 'stats':
                    contentContainer.innerHTML = renderStatsTab();
                    break;
                case 'danger':
                    contentContainer.innerHTML = renderDangerZoneTab();
                    break;
            }
        } catch (error) {
            contentContainer.innerHTML = `<p class="text-red-500 p-4">Не удалось загрузить данные: ${error.message}</p>`;
        }
    };
    
    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (target) {
            const action = target.dataset.action;
            switch (action) {
                case 'close': onClose(); break;
                case 'logout': onLogout(); break;
                case 'open-data-manager':
                    onLaunchDataManager();
                    onClose(); // Close the profile modal after launching the data manager
                    break;
                case 'delete-settings':
                    if (confirm('Вы уверены, что хотите удалить все ваши настройки из облака? Это действие необратимо.')) {
                        await supabaseService.deleteUserSettings();
                        window.location.reload();
                    }
                    break;
                case 'show-stats':
                    const statsData = await supabaseService.getActionStats();
                    const statsModal = createStatsModal(statsData, () => statsModal.remove());
                    subModalContainer.appendChild(statsModal);
                    break;
                case 'change-role': {
                    const userId = target.dataset.userId;
                    const newRole = target.value;
                    if(confirm(`Вы уверены, что хотите изменить роль пользователя на "${ROLE_DISPLAY_MAP[newRole].text}"?`)) {
                        try {
                            await supabaseService.updateUserRole(userId, newRole);
                            switchTab('users'); // Refresh the tab
                        } catch(err) {
                            alert(`Ошибка: ${err.message}`);
                        }
                    } else {
                        target.value = target.querySelector('option[selected]').value; // Revert dropdown
                    }
                    break;
                }
            }
            return;
        }

        const tabButton = e.target.closest('.profile-tab-button');
        if (tabButton) {
            switchTab(tabButton.dataset.tab);
            return;
        }
        
        // Close if clicking outside the modal content
        if (!e.target.closest('#profile-modal-content')) {
            onClose();
        }
    };
    
    modalOverlay.addEventListener('click', handleAction);
    modalOverlay.addEventListener('change', (e) => { // For select dropdown
         if (e.target.dataset.action === 'change-role') {
            handleAction(e);
         }
    });

    // Initial render
    switchTab('profile');

    return modalOverlay;
}