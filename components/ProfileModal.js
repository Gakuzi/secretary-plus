import * as Icons from './icons/Icons.js';
import { getSyncStatus } from '../utils/storage.js';


// --- HELPERS ---
const ROLE_DISPLAY_MAP = {
    owner: { text: 'Владелец', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
    admin: { text: 'Администратор', class: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
    manager: { text: 'Менеджер', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    user: { text: 'Пользователь', class: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200' }
};

const ACTION_NAMES = {
    'get_calendar_events': 'Просмотр календаря',
    'create_calendar_event': 'Создание событий',
    'delete_calendar_event': 'Удаление событий',
    'get_tasks': 'Просмотр задач',
    'create_task': 'Создание задач',
    'update_task': 'Обновление задач',
    'delete_task': 'Удаление задач',
    'get_recent_emails': 'Чтение почты',
    'send_email': 'Отправка Email',
    'delete_email': 'Удаление писем',
    'find_documents': 'Поиск документов',
    'get_recent_files': 'Поиск недавних файлов',
    'create_google_doc': 'Создание Google Docs',
    'create_google_sheet': 'Создание Google Sheets',
    'create_google_doc_with_content': 'Создание Docs с текстом',
    'propose_document_with_content': 'Предложение документа',
    'find_contacts': 'Поиск контактов',
    'perform_contact_action': 'Действия с контактами',
    'create_note': 'Создание заметок',
    'find_notes': 'Поиск заметок',
    'summarize_and_save_memory': 'Сохранение в память',
    'recall_memory': 'Чтение из памяти',
};

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#f97316', '#eab308', '#6366f1', '#ec4899', '#06b6d4', '#22c55e', '#a855f7', '#f43f5e'];

const ROLES = ['owner', 'admin', 'manager', 'user'];

function createDataViewerModal(title, data, error, onClose) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[52] p-4 animate-fadeIn';
    
    let contentHtml = '';
    if (error) {
        contentHtml = `<div class="p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-200 rounded-md">${error}</div>`;
    } else if (!data || data.length === 0) {
        contentHtml = `<p class="text-slate-500 dark:text-slate-400 text-center py-8">Данные еще не синхронизированы или отсутствуют.</p>`;
    } else {
        const headers = Object.keys(data[0]);
        contentHtml = `
            <div class="overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table class="w-full text-xs text-left">
                    <thead class="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                        <tr>${headers.map(h => `<th class="p-2 truncate">${h}</th>`).join('')}</tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        ${data.map(row => `
                            <tr>${headers.map(h => {
                                let value = row[h];
                                if (typeof value === 'object' && value !== null) {
                                    value = JSON.stringify(value);
                                }
                                return `<td class="p-2 max-w-xs truncate" title="${value}">${value}</td>`;
                            }).join('')}</tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 class="text-lg font-bold">Просмотр: ${title} (10 последних)</h3>
                <button data-action="close-viewer" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">&times;</button>
            </header>
            <main class="p-4 flex-1 overflow-auto">${contentHtml}</main>
        </div>
    `;

    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-action="close-viewer"]')) {
            onClose();
        }
    });

    return modal;
}

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

function renderStatsTab(statsData) {
     if (!statsData || Object.keys(statsData).length === 0) {
        return `<div class="text-center p-8 text-slate-500 dark:text-slate-400">Нет данных для статистики.</div>`;
    }
    return `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                <h4 class="font-bold text-lg">Динамика активности (по дням)</h4>
                <div class="h-64 mt-2"><canvas id="activity-chart"></canvas></div>
            </div>
             <div class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                <h4 class="font-bold text-lg">Анализ действий</h4>
                <div class="h-64 mt-2 flex items-center justify-center"><canvas id="actions-chart"></canvas></div>
            </div>
            <div class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                <h4 class="font-bold text-lg">Самые активные пользователи</h4>
                <div class="h-64 mt-2"><canvas id="users-chart"></canvas></div>
            </div>
             <div class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                <h4 class="font-bold text-lg">Анализ ответов ассистента</h4>
                <div class="h-64 mt-2 flex items-center justify-center"><canvas id="responses-chart"></canvas></div>
            </div>
        </div>
    `;
}

function renderSyncTab(syncTasks, syncStatus, isSyncingAll, syncingSingle) {
    if (syncTasks.length === 0) {
        return `<div class="text-center p-8 text-slate-500 dark:text-slate-400">Нет включенных служб для синхронизации. Включите их в <button data-action="open-settings" class="text-blue-500 hover:underline">Настройках</button>.</div>`;
    }
    const syncItemsHtml = syncTasks.map(task => {
        const lastSyncData = syncStatus[task.name];
        let statusText = 'Никогда';
        let statusColor = 'text-slate-400 dark:text-slate-500';
        let errorDetails = null;

        if (lastSyncData) {
            if (lastSyncData.error) {
                statusText = 'Ошибка';
                statusColor = 'text-red-600 dark:text-red-400';
                errorDetails = lastSyncData.error;
            } else if (lastSyncData.lastSync) {
                statusText = new Date(lastSyncData.lastSync).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                statusColor = 'text-green-600 dark:text-green-400';
            }
        }
        
        const isSyncing = syncingSingle === task.name;

        return `
            <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 flex flex-col justify-between border-l-4 ${errorDetails ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}">
                <div>
                    <div class="flex items-center gap-3">
                        <span class="w-6 h-6 text-slate-500 dark:text-slate-400">${Icons[task.icon] || ''}</span>
                        <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100">${task.label}</h4>
                    </div>
                    <div class="mt-2 text-xs">
                        <span class="font-semibold text-slate-500 dark:text-slate-400">Последняя синх.:</span>
                        <span class="font-mono ml-1 ${statusColor}" title="${errorDetails || ''}">${statusText}</span>
                    </div>
                </div>
                <div class="mt-4 flex gap-2">
                    <button data-action="run-single-sync" data-task-name="${task.name}" class="flex-1 px-3 py-2 text-sm bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md font-semibold flex items-center justify-center gap-1" ${isSyncing ? 'disabled' : ''}>
                       ${isSyncing ? `<div class="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>` : Icons.RefreshCwIcon.replace('width="24"', 'width="16"')}
                       <span>Синхр.</span>
                    </button>
                    <button data-action="view-data" data-table-name="${task.tableName}" data-label="${task.label}" class="flex-1 px-3 py-2 text-sm bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md font-semibold flex items-center justify-center gap-1">
                        ${Icons.DatabaseIcon.replace('width="24"', 'width="16"')}
                        <span>Данные</span>
                    </button>
                </div>
            </div>`;
    }).join('');

    return `
        <section class="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
            <div class="text-center sm:text-left">
                <h3 class="font-semibold text-slate-800 dark:text-slate-200">Общая информация и действия</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">Проверьте соединение с базой данных или запустите полную синхронизацию всех сервисов.</p>
            </div>
            <div class="flex items-center gap-2">
                 <button data-action="test-connection" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold flex items-center gap-2">
                    <span>Проверить подключение</span>
                    <div id="connection-test-status" class="w-20 text-left"></div>
                </button>
                <button data-action="run-all-syncs" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold flex items-center gap-2" ${isSyncingAll ? 'disabled' : ''}>
                    ${isSyncingAll ? `<div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div> <span>Синхронизация...</span>` : 'Синхронизировать всё'}
                </button>
            </div>
        </section>
        <section class="mt-6">
             <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                ${syncItemsHtml}
            </div>
        </section>
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

export function createProfileModal({ currentUserProfile, supabaseService, syncTasks, onClose, onLogout, onRunSingleSync, onRunAllSyncs }) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fadeIn';

    const isAdmin = currentUserProfile.role === 'admin' || currentUserProfile.role === 'owner';
    const isSupabaseEnabled = !!supabaseService;
    
    let state = {
        isSyncingAll: false,
        syncingSingle: null,
    };

    const TABS = [
        { id: 'profile', label: 'Профиль', icon: Icons.UserIcon, enabled: true },
        { id: 'sync', label: 'Синхронизация', icon: Icons.DatabaseIcon, enabled: isSupabaseEnabled },
        { id: 'stats', label: 'Статистика', icon: Icons.ChartBarIcon, enabled: isAdmin && isSupabaseEnabled },
        { id: 'users', label: 'Пользователи', icon: Icons.UsersIcon, enabled: isAdmin && isSupabaseEnabled },
        { id: 'history', label: 'История чата', icon: Icons.FileIcon, enabled: isAdmin && isSupabaseEnabled },
        { id: 'danger', label: 'Опасная зона', icon: Icons.AlertTriangleIcon, enabled: isSupabaseEnabled },
    ];

    const availableTabs = TABS.filter(tab => tab.enabled);

    modalOverlay.innerHTML = `
        <div id="profile-modal-content" class="bg-white dark:bg-slate-800 w-full max-w-6xl h-full sm:h-auto sm:max-h-[90vh] rounded-lg shadow-xl flex flex-col sm:flex-row">
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

    const initializeChart = (canvasId, type, data, options) => {
        setTimeout(() => {
            const canvas = document.getElementById(canvasId);
            if(canvas) {
                new Chart(canvas.getContext('2d'), { type, data, options });
            }
        }, 100);
    };

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
                    contentContainer.innerHTML = renderSyncTab(syncTasks, getSyncStatus(), state.isSyncingAll, state.syncingSingle);
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
                    const statsData = await supabaseService.getFullStats();
                    contentContainer.innerHTML = renderStatsTab(statsData);
                    
                    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                    const textColor = isDarkMode ? '#cbd5e1' : '#334155';
                    
                    if (statsData.actions_by_day?.length) {
                        initializeChart('activity-chart', 'line', {
                            labels: statsData.actions_by_day.map(d => new Date(d.date).toLocaleDateString('ru-RU')),
                            datasets: [{ label: 'Действий в день', data: statsData.actions_by_day.map(d => d.count), borderColor: '#3b82f6', tension: 0.1, fill: false }]
                        }, { scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { color: gridColor } } } });
                    }
                    if (statsData.actions_by_function?.length) {
                         initializeChart('actions-chart', 'pie', {
                            labels: statsData.actions_by_function.map(d => ACTION_NAMES[d.function_name] || d.function_name),
                            datasets: [{ data: statsData.actions_by_function.map(d => d.count), backgroundColor: CHART_COLORS }]
                        }, { plugins: { legend: { labels: { color: textColor } } } });
                    }
                     if (statsData.actions_by_user?.length) {
                        initializeChart('users-chart', 'bar', {
                            labels: statsData.actions_by_user.map(d => d.full_name),
                            datasets: [{ label: 'Всего действий', data: statsData.actions_by_user.map(d => d.count), backgroundColor: CHART_COLORS[1] }]
                        }, { scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { color: gridColor } } }, indexAxis: 'y' });
                    }
                    if(statsData.responses_by_type?.length) {
                         initializeChart('responses-chart', 'doughnut', {
                            labels: statsData.responses_by_type.map(d => d.type === 'card' ? 'Интерактивные' : 'Текстовые'),
                            datasets: [{ data: statsData.responses_by_type.map(d => d.count), backgroundColor: [CHART_COLORS[2], CHART_COLORS[3]] }]
                        }, { plugins: { legend: { labels: { color: textColor } } } });
                    }
                    break;
                case 'danger':
                    contentContainer.innerHTML = renderDangerZoneTab();
                    break;
            }
        } catch (error) {
            console.error(`Error loading tab ${tabId}:`, error);
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
                case 'delete-settings':
                    if (confirm('Вы уверены, что хотите удалить все ваши настройки из облака? Это действие необратимо.')) {
                        await supabaseService.deleteUserSettings();
                        window.location.reload();
                    }
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
                case 'test-connection': {
                    const statusEl = modalOverlay.querySelector('#connection-test-status');
                    if (!statusEl) return;
                    statusEl.innerHTML = `<div class="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"></div>`;
                    try {
                        await supabaseService.testConnection();
                        statusEl.innerHTML = `<span class="text-green-500 font-semibold">✓ Успешно</span>`;
                    } catch (error) {
                        statusEl.innerHTML = `<span class="text-red-500 font-semibold">✗ Ошибка</span>`;
                    }
                    break;
                }
                 case 'run-all-syncs': {
                    state.isSyncingAll = true;
                    switchTab('sync');
                    await onRunAllSyncs();
                    state.isSyncingAll = false;
                    switchTab('sync');
                    break;
                }
                case 'run-single-sync': {
                    const taskName = target.dataset.taskName;
                    state.syncingSingle = taskName;
                    switchTab('sync');
                    try {
                        await onRunSingleSync(taskName);
                    } catch(err) {
                        // error is handled inside, just need to update UI
                    }
                    state.syncingSingle = null;
                    switchTab('sync');
                    break;
                }
                case 'view-data': {
                    const tableName = target.dataset.tableName;
                    const label = target.dataset.label;
                    subModalContainer.innerHTML = `<div class="fixed inset-0 bg-black/10 flex items-center justify-center z-[53]"><div class="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full"></div></div>`;
                    const { data, error } = await supabaseService.getSampleData(tableName);
                    const viewerModal = createDataViewerModal(label, data, error ? error.message : null, () => subModalContainer.innerHTML = '');
                    subModalContainer.innerHTML = '';
                    subModalContainer.appendChild(viewerModal);
                    break;
                }
                case 'open-settings': {
                    // This is a special action to bridge modals. We assume the main `showSettingsModal` is available globally.
                    onClose(); // Close the current modal first
                    document.querySelector('#settings-button').click(); // Then open the settings modal
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
