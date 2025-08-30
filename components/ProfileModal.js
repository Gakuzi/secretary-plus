import * as Icons from './icons/Icons.js';
import { getSyncStatus, getSettings, saveSettings } from '../utils/storage.js';
import { DB_SCHEMAS } from '../services/supabase/schema.js';


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
    `;
}

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

function renderAboutTab() {
    const container = document.createElement('div');
    container.className = 'prose dark:prose-invert max-w-none';
    container.innerHTML = `<div class="flex justify-center items-center p-8"><div class="animate-spin h-8 w-8 border-4 border-slate-300 border-t-transparent rounded-full"></div></div>`;
    
    fetch('./app-info.json')
        .then(response => response.json())
        .then(info => {
            container.innerHTML = `
                <p><strong>Версия:</strong> ${info.version}</p>
                <p><strong>Автор:</strong> ${info.author}</p>
                <p><strong>Связаться:</strong> <a href="${info.contact}" target="_blank" rel="noopener noreferrer">Telegram</a></p>
                <h3 class="mt-6">История изменений</h3>
                ${formatChangelog(info.changelog)}
            `;
        })
        .catch(error => {
            console.error("Failed to load app info:", error);
            container.innerHTML = `<p class="text-red-500">Не удалось загрузить информацию о приложении.</p>`;
        });
    return container;
}


function renderServicesTab(settings) {
    const syncableServices = ['calendar', 'tasks', 'contacts', 'files', 'emails', 'notes'];
    const servicesHtml = syncableServices.map(key => {
        const schema = DB_SCHEMAS[key];
        if (!schema) return '';
        return `
            <div class="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <label for="service-toggle-${key}" class="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-3">
                    <span class="w-5 h-5">${Icons[schema.icon] || ''}</span>
                    <span>${schema.label}</span>
                </label>
                <label class="toggle-switch">
                    <input type="checkbox" id="service-toggle-${key}" data-service-key="${key}" ${settings.enabledServices[key] ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `;
    }).join('');

    return `
        <div class="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Активные службы</h3>
            <p class="text-sm text-slate-600 dark:text-slate-400 my-2">Выберите, какие данные ассистент будет использовать и синхронизировать с облаком для быстрого поиска и анализа.</p>
            <div class="divide-y divide-slate-200 dark:divide-slate-700">${servicesHtml}</div>
        </div>
        <div class="p-4 mt-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
             <button data-action="save-services" class="w-full flex items-center justify-center gap-2 text-center px-4 py-2 text-sm font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                Сохранить настройки служб
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
        return `<div class="text-center p-8 text-slate-500 dark:text-slate-400">Нет включенных служб для синхронизации. Включите их на вкладке 'Службы'.</div>`;
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
                    <button data-action="run-single-sync" data-task-name="${task.name}" class="flex-1 px-3 py-1.5 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md font-semibold flex items-center justify-center gap-1" ${isSyncing ? 'disabled' : ''}>
                       ${isSyncing ? `<div class="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>` : Icons.RefreshCwIcon.replace('width="24"', 'width="16"')}
                       <span>Синхр.</span>
                    </button>
                    <button data-action="view-data" data-table-name="${task.tableName}" data-label="${task.label}" class="flex-1 px-3 py-1.5 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md font-semibold flex items-center justify-center gap-1">
                        ${Icons.DatabaseIcon.replace('width="24"', 'width="16"')}
                        <span>Данные</span>
                    </button>
                </div>
            </div>`;
    }).join('');

    return `
        <div class="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
            <div class="text-center sm:text-left">
                <h3 class="font-semibold text-slate-800 dark:text-slate-200">Общая информация</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">Здесь вы можете запустить синхронизацию всех сервисов вручную.</p>
            </div>
            <button data-action="run-all-syncs" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold flex items-center gap-2" ${isSyncingAll ? 'disabled' : ''}>
                ${isSyncingAll ? `<div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div> <span>Синхронизация...</span>` : 'Синхронизировать всё'}
            </button>
        </div>
        <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            ${syncItemsHtml}
        </div>
    `;
}

// --- MAIN COMPONENT ---
export function createProfileModal({ currentUserProfile, supabaseService, syncTasks, onClose, onLogout, onRunSingleSync, onRunAllSyncs }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn';
    
    let state = {
        currentTab: 'profile',
        isLoading: false,
        settings: getSettings(),
        // Sync tab state
        isSyncingAll: false,
        syncingSingle: null,
        syncStatus: getSyncStatus(),
        // Users tab state
        users: [],
        // History tab state
        history: [],
        // Stats tab state
        stats: null,
    };
    
    const role = (currentUserProfile.role || '').trim().toLowerCase();

    const ALL_TABS = [
        { id: 'profile', label: 'Профиль', icon: Icons.UserIcon, roles: ['user', 'admin', 'owner'] },
        { id: 'services', label: 'Службы', icon: Icons.SettingsIcon, roles: ['user', 'admin', 'owner'] },
        { id: 'sync', label: 'Синхронизация', icon: Icons.RefreshCwIcon, roles: ['admin', 'owner'] },
        { id: 'users', label: 'Пользователи', icon: Icons.UsersIcon, roles: ['admin', 'owner'] },
        { id: 'stats', label: 'Статистика', icon: Icons.ChartBarIcon, roles: ['admin', 'owner'] },
        { id: 'history', label: 'История чата', icon: Icons.FileIcon, roles: ['admin', 'owner'] },
        { id: 'about', label: 'О приложении', icon: Icons.QuestionMarkCircleIcon, roles: ['user', 'admin', 'owner'] }
    ];
    
    const visibleTabs = ALL_TABS.filter(tab => tab.roles.includes(role));

    const render = () => {
        const contentContainer = document.createElement('div');
        contentContainer.className = 'h-full';

        if (state.isLoading) {
            contentContainer.innerHTML = `<div class="flex items-center justify-center h-full"><div class="animate-spin h-10 w-10 border-4 border-slate-300 border-t-transparent rounded-full"></div></div>`;
        } else {
            switch (state.currentTab) {
                case 'profile': contentContainer.innerHTML = renderProfileTab(currentUserProfile); break;
                case 'services': contentContainer.innerHTML = renderServicesTab(state.settings); break;
                case 'about': contentContainer.appendChild(renderAboutTab()); break;
                case 'sync': contentContainer.innerHTML = renderSyncTab(syncTasks, state.syncStatus, state.isSyncingAll, state.syncingSingle); break;
                case 'users': contentContainer.innerHTML = renderUsersTab(state.users, currentUserProfile.id); break;
                case 'history': contentContainer.innerHTML = renderHistoryTab(state.history); break;
                case 'stats': contentContainer.innerHTML = renderStatsTab(state.stats); break;
                default: contentContainer.innerHTML = `<p>Выберите вкладку</p>`;
            }
        }

        const tabButtonsHtml = visibleTabs.map(tab => `
            <button class="profile-tab-button ${state.currentTab === tab.id ? 'active' : ''}" data-tab-id="${tab.id}">
                <span class="w-5 h-5">${tab.icon}</span>
                <span>${tab.label}</span>
            </button>
        `).join('');

        modalElement.innerHTML = `
            <div id="profile-content" class="bg-white dark:bg-slate-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-lg shadow-xl text-slate-800 dark:text-slate-100">
                <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <h2 class="text-xl sm:text-2xl font-bold">Профиль и Управление</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Закрыть профиль">&times;</button>
                </header>
                <main class="flex-1 flex flex-col sm:flex-row overflow-hidden bg-slate-50 dark:bg-slate-900/70">
                    <aside class="w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 p-2 sm:p-4 flex-shrink-0 bg-white dark:bg-slate-800 flex flex-col justify-between">
                         <nav class="flex flex-row sm:flex-col sm:space-y-1 w-full justify-around">${tabButtonsHtml}</nav>
                         <div class="p-2 sm:pt-4 mt-2 border-t border-slate-200 dark:border-slate-700">
                            <button data-action="logout" class="w-full flex items-center justify-center gap-2 text-center px-4 py-2 text-sm font-semibold rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors">
                                Выйти из аккаунта
                            </button>
                         </div>
                    </aside>
                    <div class="flex-1 p-4 sm:p-6 overflow-y-auto" id="profile-tab-content"></div>
                </main>
                 <div id="sub-modal-container"></div>
            </div>
        `;
        
        modalElement.querySelector('#profile-tab-content').appendChild(contentContainer);

        if (state.currentTab === 'stats' && state.stats && !state.isLoading) {
             setTimeout(() => {
                const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                const textColor = isDarkMode ? '#e2e8f0' : '#334155';
                const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

                const activityCanvas = document.getElementById('activity-chart');
                if(activityCanvas && state.stats.actions_by_day) new Chart(activityCanvas, { type: 'line', data: { labels: state.stats.actions_by_day.map(d => new Date(d.date).toLocaleDateString('ru-RU')), datasets: [{ label: 'Действия', data: state.stats.actions_by_day.map(d => d.count), borderColor: '#3b82f6', tension: 0.1, fill: false }] }, options: { scales: { y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { color: gridColor } } }, plugins: { legend: { labels: { color: textColor } } } } });
                const actionsCanvas = document.getElementById('actions-chart');
                if (actionsCanvas && state.stats.actions_by_function) new Chart(actionsCanvas, { type: 'doughnut', data: { labels: state.stats.actions_by_function.map(d => ACTION_NAMES[d.function_name] || d.function_name), datasets: [{ data: state.stats.actions_by_function.map(d => d.count), backgroundColor: CHART_COLORS }] }, options: { plugins: { legend: { position: 'right', labels: { color: textColor, boxWidth: 20 } } } } });
                const usersCanvas = document.getElementById('users-chart');
                if(usersCanvas && state.stats.actions_by_user) new Chart(usersCanvas, { type: 'bar', data: { labels: state.stats.actions_by_user.map(d => d.full_name), datasets: [{ label: 'Действия', data: state.stats.actions_by_user.map(d => d.count), backgroundColor: '#10b981' }] }, options: { indexAxis: 'y', scales: { y: { ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { color: gridColor } } }, plugins: { legend: { display: false } } } });
                const responsesCanvas = document.getElementById('responses-chart');
                if(responsesCanvas && state.stats.responses_by_type) new Chart(responsesCanvas, { type: 'pie', data: { labels: state.stats.responses_by_type.map(d => d.type === 'card' ? 'Карточки' : 'Текст'), datasets: [{ data: state.stats.responses_by_type.map(d => d.count), backgroundColor: ['#8b5cf6', '#ef4444'] }] }, options: { plugins: { legend: { position: 'top', labels: { color: textColor } } } } });
             }, 0);
        }
    };
    
    const switchTab = async (tabId) => {
        state.currentTab = tabId;
        state.isLoading = true;
        render();

        try {
            switch(tabId) {
                case 'sync': state.syncStatus = getSyncStatus(); break;
                case 'users': state.users = await supabaseService.getAllUserProfiles(); break;
                case 'history': state.history = await supabaseService.getChatHistoryForAdmin(); break;
                case 'stats': state.stats = await supabaseService.getFullStats(); break;
            }
        } catch (error) {
            console.error(`Failed to load data for tab ${tabId}:`, error);
            modalElement.querySelector('#profile-tab-content').innerHTML = `<p class="p-4 text-red-500">Не удалось загрузить данные: ${error.message}</p>`;
        }
        
        state.isLoading = false;
        render();
    };

    modalElement.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-tab-id], [data-action]');
        if (!target) {
             if (e.target === modalElement || !e.target.closest('#profile-content')) {
                onClose();
            }
            return;
        }

        if (target.dataset.tabId) {
            switchTab(target.dataset.tabId);
        }

        if (target.dataset.action) {
            const action = target.dataset.action;
            const subModalContainer = modalElement.querySelector('#sub-modal-container');

            switch(action) {
                case 'close': onClose(); break;
                case 'logout': if(confirm('Вы уверены, что хотите выйти?')) onLogout(); break;
                case 'save-services': {
                    const newSettings = { ...state.settings };
                    modalElement.querySelectorAll('[data-service-key]').forEach(toggle => {
                        newSettings.enabledServices[toggle.dataset.serviceKey] = toggle.checked;
                    });
                    state.settings = newSettings;
                    saveSettings(newSettings);
                    if (supabaseService) {
                        try { 
                            await supabaseService.saveUserSettings(newSettings); 
                            alert("Настройки служб сохранены.");
                        } catch (e) { 
                            console.error("Failed to save service settings", e);
                            alert(`Ошибка сохранения настроек: ${e.message}`);
                        }
                    }
                    break;
                }
                case 'run-all-syncs': {
                    state.isSyncingAll = true; render();
                    try { await onRunAllSyncs(); } catch(err) {/* ignore */}
                    state.syncStatus = getSyncStatus(); state.isSyncingAll = false; render();
                    break;
                }
                 case 'run-single-sync': {
                    const taskName = target.dataset.taskName;
                    state.syncingSingle = taskName; render();
                    try { await onRunSingleSync(taskName); } catch(err) {/* ignore */}
                    state.syncStatus = getSyncStatus(); state.syncingSingle = null; render();
                    break;
                }
                case 'view-data': {
                    const tableName = target.dataset.tableName;
                    const label = target.dataset.label;
                    subModalContainer.innerHTML = `<div class="fixed inset-0 bg-black/10 flex items-center justify-center z-[53]"><div class="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full"></div></div>`;
                    const { data, error } = await supabaseService.getSampleData(tableName);
                    const modal = createDataViewerModal(label, data, error ? error.message : null, () => subModalContainer.innerHTML = '');
                    subModalContainer.innerHTML = '';
                    subModalContainer.appendChild(modal);
                    break;
                }
            }
        }
    });
    
     modalElement.addEventListener('change', async (e) => {
        const target = e.target.closest('[data-action="change-role"]');
        if (target) {
            const userId = target.dataset.userId;
            const newRole = target.value;
            if (confirm(`Вы уверены, что хотите изменить роль для пользователя на "${newRole}"?`)) {
                try {
                    await supabaseService.updateUserRole(userId, newRole);
                    state.users = await supabaseService.getAllUserProfiles(); // Refresh users list
                    render();
                } catch (error) {
                    alert(`Ошибка: ${error.message}`);
                    const user = state.users.find(u => u.id === userId); // Revert select box if cancelled
                    if (user) target.value = user.role;
                }
            }
        }
    });

    render();
    return modalElement;
}