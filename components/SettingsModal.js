import * as Icons from './icons/Icons.js';
import { getSettings, saveSettings, getSyncStatus } from '../utils/storage.js';
import { createProxyManagerModal } from './ProxyManagerModal.js';
import { createMigrationModal } from './MigrationModal.js';
import { createDbSetupWizard } from './DbSetupWizard.js';

// --- HELPERS ---
const ROLE_DISPLAY_MAP = {
    owner: { text: 'Владелец', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
    admin: { text: 'Администратор', class: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
    user: { text: 'Пользователь', class: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200' }
};

const ACTION_NAMES = {
    'get_calendar_events': 'Просмотр календаря', 'create_calendar_event': 'Создание событий', 'delete_calendar_event': 'Удаление событий',
    'get_tasks': 'Просмотр задач', 'create_task': 'Создание задач', 'update_task': 'Обновление задач', 'delete_task': 'Удаление задач',
    'get_recent_emails': 'Чтение почты', 'send_email': 'Отправка Email', 'delete_email': 'Удаление писем',
    'find_documents': 'Поиск документов', 'get_recent_files': 'Поиск недавних файлов',
    'create_google_doc': 'Создание Google Docs', 'create_google_sheet': 'Создание Google Sheets',
    'create_google_doc_with_content': 'Создание Docs с текстом', 'propose_document_with_content': 'Предложение документа',
    'find_contacts': 'Поиск контактов', 'perform_contact_action': 'Действия с контактами',
    'create_note': 'Создание заметок', 'find_notes': 'Поиск заметок',
    'summarize_and_save_memory': 'Сохранение в память', 'recall_memory': 'Чтение из памяти',
};

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#f97316', '#eab308', '#6366f1', '#ec4899', '#06b6d4', '#22c55e', '#a855f7', '#f43f5e'];
const ROLES = ['owner', 'admin', 'user'];
const maskApiKey = (key) => (!key || key.length < 10) ? 'Неверный ключ' : `${key.substring(0, 5)}...${key.substring(key.length - 4)}`;

// --- TAB RENDERERS ---

function renderErrorTab(errorMessage) {
    return `
        <div class="p-6 text-center">
            <div class="w-12 h-12 mx-auto text-red-500">${Icons.AlertTriangleIcon}</div>
            <h3 class="mt-4 text-lg font-bold">Ошибка загрузки данных</h3>
            <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">Не удалось загрузить данные для этой вкладки. Вероятно, структура базы данных устарела.</p>
            <p class="mt-1 text-xs font-mono bg-slate-100 dark:bg-slate-900 p-2 rounded-md">${errorMessage}</p>
            <button data-client-action="open_migration_modal" class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">Запустить Мастер Обновления</button>
        </div>
    `;
}


function renderUsersTab(users, currentUserId, currentUserRole) {
    const usersHtml = users.map(user => {
        const roleInfo = ROLE_DISPLAY_MAP[user.role] || ROLE_DISPLAY_MAP.user;
        const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('ru-RU') : 'Никогда';
        
        const canChangeRole = currentUserRole === 'owner' && user.id !== currentUserId;
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

function renderApiKeysTab(keys) {
    // Defensive check to prevent crash on null/undefined data
    if (!keys) {
        return '<p class="text-center text-slate-500 dark:text-slate-400">Не удалось загрузить ключи. Попробуйте обновить вкладку.</p>';
    }

    const keysHtml = keys.map(key => `
        <div class="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3" data-key-id="${key.id}">
            <div class="flex items-center justify-between">
                <p class="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">${maskApiKey(key.api_key)}</p>
                <div class="flex items-center gap-2">
                    <label class="toggle-switch">
                        <input type="checkbox" data-action="update-key-field" data-field="is_active" ${key.is_active ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <button data-action="delete-key" data-key-id="${key.id}" class="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full">${Icons.TrashIcon.replace(/width="24" height="24"/g, 'width="16" height="16"')}</button>
                </div>
            </div>
            <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                    <label class="font-medium text-xs text-slate-500">Описание</label>
                    <input type="text" value="${key.description || ''}" data-action="update-key-field" data-field="description" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-1.5 text-sm" placeholder="Например, 'Основной ключ'">
                </div>
                <div>
                    <label class="font-medium text-xs text-slate-500">Приоритет</label>
                    <input type="number" value="${key.priority}" data-action="update-key-field" data-field="priority" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-1.5 text-sm" placeholder="0">
                </div>
            </div>
        </div>
    `).join('');

    return `
        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg text-sm text-blue-800 dark:text-blue-200 mb-6">
            <h3 class="font-bold">Управление общим пулом ключей Gemini API</h3>
            <p class="mt-1">Добавленные здесь ключи будут использоваться всеми пользователями системы. Ассистент будет автоматически переключаться между активными ключами (начиная с наименьшего приоритета) в случае, если один из них исчерпает лимиты.</p>
        </div>
        <div class="space-y-3 mb-6">${keys.length > 0 ? keysHtml : '<p class="text-center text-slate-500">Нет добавленных ключей.</p>'}</div>
        <div class="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
            <h4 class="font-semibold text-lg mb-3">Добавить новый ключ</h4>
            <div class="space-y-3">
                <div> <label class="font-medium text-sm">API Ключ</label> <input type="password" id="new-key-input" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 text-sm" placeholder="Введите полный ключ API..."> </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div> <label class="font-medium text-sm">Описание</label> <input type="text" id="new-key-desc-input" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 text-sm" placeholder="Например, 'Резервный ключ'"> </div>
                     <div> <label class="font-medium text-sm">Приоритет</label> <input type="number" id="new-key-priority-input" value="10" class="w-full mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 text-sm"> </div>
                </div>
                <button data-action="add-key" class="w-full mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center justify-center gap-2">Добавить ключ</button>
            </div>
        </div>
    `;
}

function renderProxiesTab() {
    return `
        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg text-sm text-blue-800 dark:text-blue-200">
            <h3 class="font-bold">Управление прокси-серверами</h3>
            <p class="mt-1">Прокси-серверы необходимы для обхода региональных ограничений Gemini API. Здесь вы можете добавлять серверы вручную, находить их с помощью ИИ, тестировать соединение и устанавливать приоритет использования.</p>
        </div>
        <div class="mt-6 flex justify-center">
            <button data-action="open-proxy-manager" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center gap-2">${Icons.GlobeIcon}<span>Открыть Менеджер прокси</span></button>
        </div>
    `;
}

function renderSyncTab(tasks, state) {
     const syncItemsHtml = tasks.map(task => {
        const lastSyncData = state.syncStatus[task.name];
        let statusText = 'Никогда';
        let statusColor = 'text-slate-400 dark:text-slate-500';
        let errorDetails = null;

        if (lastSyncData) {
            if (lastSyncData.error) { statusText = 'Ошибка'; statusColor = 'text-red-600 dark:text-red-400'; errorDetails = lastSyncData.error; } 
            else if (lastSyncData.lastSync) { statusText = new Date(lastSyncData.lastSync).toLocaleString('ru-RU'); statusColor = 'text-green-600 dark:text-green-400'; }
        }
        
        const isSyncing = state.syncingSingle === task.name;
        const syncButtonHtml = task.providerFn ? `
            <button data-action="run-single-sync" data-task-name="${task.name}" class="flex-1 px-3 py-1.5 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md font-semibold flex items-center justify-center gap-1" ${isSyncing ? 'disabled' : ''}>
               ${isSyncing ? `<div class="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>` : Icons.RefreshCwIcon.replace('width="24"', 'width="16"')} <span>Синхр.</span>
            </button>` : `<div class="flex-1"></div>`;

        return `
            <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 flex flex-col justify-between border-l-4 ${errorDetails ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}">
                <div>
                    <div class="flex items-center gap-3"> <span class="w-6 h-6 text-slate-500 dark:text-slate-400">${Icons[task.icon] || ''}</span> <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100">${task.label}</h4> </div>
                    <div class="mt-2 text-xs"> <span class="font-semibold text-slate-500 dark:text-slate-400">Последняя синх.:</span> <span class="font-mono ml-1 ${statusColor}" title="${errorDetails || ''}">${statusText}</span> </div>
                </div>
                <div class="mt-4 flex gap-2"> ${syncButtonHtml} </div>
            </div>`;
    }).join('');

    let testStatusHtml = '';
    if (state.isTestingConnection) { testStatusHtml = `<div class="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"></div>`; } 
    else if (state.testStatus === 'ok') { testStatusHtml = `<span class="text-green-500 font-semibold">✓ Успешно</span>`; } 
    else if (state.testStatus === 'error') { testStatusHtml = `<span class="text-red-500 font-semibold">✗ Ошибка</span>`; }

    return `
        <section class="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
            <div> <h3 class="font-semibold text-slate-800 dark:text-slate-200">Общая информация и действия</h3> <p class="text-xs text-slate-500 dark:text-slate-400">Проверьте соединение с базой данных или запустите полную синхронизацию.</p> </div>
            <div class="flex items-center gap-2">
                 <button data-action="test-connection" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold flex items-center gap-2"> <span>Проверить</span> <div class="w-20 text-left">${testStatusHtml}</div> </button>
                <button data-action="run-all-syncs" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold flex items-center gap-2" ${state.isSyncingAll ? 'disabled' : ''}> ${state.isSyncingAll ? `<div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div> <span>Синхронизация...</span>` : 'Синхронизировать всё'} </button>
            </div>
        </section>
        <section class="mt-6"> <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"> ${tasks.length > 0 ? syncItemsHtml : `<div class="col-span-full text-center p-8 text-slate-500 dark:text-slate-400">Нет включенных служб.</div>`} </div> </section>
    `;
}

function renderSchemaTab() {
    return `
        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg text-sm text-blue-800 dark:text-blue-200 mb-6">
            <h3 class="font-bold">Управление схемой БД и Воркером</h3>
            <p class="mt-1">Для безопасного автоматического обновления схемы базы данных (миграции) необходим "Управляющий воркер". Этот пошаговый мастер поможет вам его настроить.</p>
        </div>
        
        <div class="text-center">
            <button data-client-action="open_db_setup_wizard" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center gap-2 mx-auto">
                ${Icons.WandIcon}
                <span>Открыть Мастер настройки Воркера</span>
            </button>
            <p class="text-xs text-slate-500 mt-3">Мастер проведет вас по всем шагам создания функции в Supabase.</p>
        </div>
        
        <div class="mt-8 border-t border-slate-200 dark:border-slate-700 pt-6">
             <h4 class="font-semibold text-lg mb-3">Ручная миграция</h4>
             <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">Если автоматическое обновление не удалось, вы всегда можете запустить полную миграцию вручную.</p>
            <button data-client-action="open_migration_modal" class="w-full px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-md font-semibold flex items-center justify-center gap-2">
                ${Icons.DatabaseIcon} <span>Открыть Мастер Ручной Миграции БД</span>
            </button>
        </div>
    `;
}


function renderStatsTab(statsData) {
     if (!statsData || Object.keys(statsData).length === 0) { return `<div class="text-center p-8 text-slate-500 dark:text-slate-400">Нет данных для статистики.</div>`; }
    return `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow"> <h4 class="font-bold text-lg">Динамика активности (по дням)</h4> <div class="h-64 mt-2"><canvas id="activity-chart"></canvas></div> </div>
            <div class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow"> <h4 class="font-bold text-lg">Анализ действий</h4> <div class="h-64 mt-2 flex items-center justify-center"><canvas id="actions-chart"></canvas></div> </div>
            <div class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow"> <h4 class="font-bold text-lg">Самые активные пользователи</h4> <div class="h-64 mt-2"><canvas id="users-chart"></canvas></div> </div>
            <div class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow"> <h4 class="font-bold text-lg">Анализ ответов ассистента</h4> <div class="h-64 mt-2 flex items-center justify-center"><canvas id="responses-chart"></canvas></div> </div>
        </div>
    `;
}

function renderHistoryTab(history) {
    if (!history || history.length === 0) { return `<p class="text-center text-slate-500 dark:text-slate-400 p-8">История чата пуста.</p>`; }
    const historyHtml = history.map(msg => {
        const senderClass = msg.sender === 'user' ? 'bg-blue-50 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-slate-50 text-slate-800 dark:bg-slate-900/50 dark:text-slate-300';
        return `
            <div class="p-3 rounded-lg ${senderClass}">
                <div class="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <div class="flex items-center gap-2"> <img src="${msg.avatar_url}" class="w-5 h-5 rounded-full" alt=""> <span class="font-semibold">${msg.full_name || msg.email}</span> </div>
                    <span>${new Date(msg.created_at).toLocaleString('ru-RU')}</span>
                </div>
                <p class="text-sm">${msg.text_content || ' '}</p>
                ${msg.card_data ? `<pre class="mt-2 p-2 bg-slate-200 dark:bg-slate-800 rounded text-xs overflow-auto">${JSON.stringify(msg.card_data, null, 2)}</pre>` : ''}
            </div>
        `;
    }).join('');
    return `<div class="space-y-3">${historyHtml}</div>`;
}


// --- MAIN COMPONENT ---
export function createSettingsModal({ supabaseService, allSyncTasks, onClose, onRunSingleSync, onRunAllSyncs }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn';
    
    let state = {
        currentTab: 'users',
        isLoading: false,
        error: null,
        users: [],
        history: [],
        stats: null,
        apiKeys: [],
        isTestingConnection: false,
        testStatus: 'idle',
        syncStatus: getSyncStatus(),
        isSyncingAll: false,
        syncingSingle: null,
    };

    const TABS = [
        { id: 'users', label: 'Пользователи', icon: Icons.UsersIcon },
        { id: 'apiKeys', label: 'API Ключи', icon: Icons.CodeIcon },
        { id: 'proxies', label: 'Прокси', icon: Icons.GlobeIcon },
        { id: 'sync', label: 'Синхронизация', icon: Icons.RefreshCwIcon },
        { id: 'schema', label: 'Схема БД', icon: Icons.DatabaseIcon },
        { id: 'stats', label: 'Аналитика', icon: Icons.ChartBarIcon },
        { id: 'history', label: 'История чата', icon: Icons.FileIcon },
    ];
    
    const switchTab = async (tabId) => {
        state.currentTab = tabId;
        state.isLoading = true;
        state.error = null;
        render();

        try {
            switch(tabId) {
                case 'users': 
                    const [users, currentUser] = await Promise.all([
                        supabaseService.getAllUserProfiles(),
                        supabaseService.getCurrentUserProfile()
                    ]);
                    state.users = users;
                    state.currentUserRole = currentUser.role;
                    break;
                case 'apiKeys': state.apiKeys = await supabaseService.getAllSharedGeminiKeysForAdmin(); break;
                case 'history': state.history = await supabaseService.getChatHistoryForAdmin(); break;
                case 'stats': state.stats = await supabaseService.getFullStats(); break;
            }
        } catch (error) {
            console.error(`Failed to load data for tab ${tabId}:`, error);
            state.error = error.message;
        } finally {
            state.isLoading = false;
            render();
        }
    };

    const render = () => {
        const contentContainer = document.createElement('div');
        contentContainer.className = 'h-full';

        if (state.isLoading) {
            contentContainer.innerHTML = `<div class="flex items-center justify-center h-full"><div class="animate-spin h-10 w-10 border-4 border-slate-300 border-t-transparent rounded-full"></div></div>`;
        } else if (state.error) {
            contentContainer.innerHTML = renderErrorTab(state.error);
        } else {
            switch (state.currentTab) {
                case 'users': contentContainer.innerHTML = renderUsersTab(state.users, supabaseService.client.auth.getUser().id, state.currentUserRole); break;
                case 'apiKeys': contentContainer.innerHTML = renderApiKeysTab(state.apiKeys); break;
                case 'proxies': contentContainer.innerHTML = renderProxiesTab(); break;
                case 'sync': contentContainer.innerHTML = renderSyncTab(allSyncTasks, state); break;
                case 'schema': contentContainer.innerHTML = renderSchemaTab(); break;
                case 'stats': contentContainer.innerHTML = renderStatsTab(state.stats); break;
                case 'history': contentContainer.innerHTML = renderHistoryTab(state.history); break;
            }
        }

        const tabButtonsHtml = TABS.map(tab => `
            <button class="profile-tab-button ${state.currentTab === tab.id ? 'active' : ''}" data-tab-id="${tab.id}">
                <span class="w-5 h-5">${tab.icon}</span> <span>${tab.label}</span>
            </button>
        `).join('');

        modalElement.innerHTML = `
            <div id="settings-content" class="bg-white dark:bg-slate-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-lg shadow-xl text-slate-800 dark:text-slate-100">
                <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <h2 class="text-xl sm:text-2xl font-bold">Центр Управления</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Закрыть">&times;</button>
                </header>
                <main class="flex-1 flex flex-col sm:flex-row overflow-hidden bg-slate-50 dark:bg-slate-900/70">
                    <aside class="w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 p-2 sm:p-4 flex-shrink-0 bg-white dark:bg-slate-800">
                         <nav class="flex flex-row sm:flex-col sm:space-y-1 w-full justify-around">${tabButtonsHtml}</nav>
                    </aside>
                    <div class="flex-1 p-4 sm:p-6 overflow-y-auto" id="settings-tab-content"></div>
                </main>
                 <div id="sub-modal-container"></div>
            </div>
        `;
        
        modalElement.querySelector('#settings-tab-content').appendChild(contentContainer);

        if (state.currentTab === 'stats' && state.stats && !state.isLoading && !state.error && window.Chart) {
             setTimeout(() => {
                const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const textColor = isDarkMode ? '#e2e8f0' : '#334155';
                const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                if(document.getElementById('activity-chart') && state.stats.actions_by_day) new Chart(document.getElementById('activity-chart'), { type: 'line', data: { labels: state.stats.actions_by_day.map(d => new Date(d.date).toLocaleDateString('ru-RU')), datasets: [{ label: 'Действия', data: state.stats.actions_by_day.map(d => d.count), borderColor: '#3b82f6', tension: 0.1, fill: false }] }, options: { scales: { y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { color: gridColor } } }, plugins: { legend: { labels: { color: textColor } } } } });
                if (document.getElementById('actions-chart') && state.stats.actions_by_function) new Chart(document.getElementById('actions-chart'), { type: 'doughnut', data: { labels: state.stats.actions_by_function.map(d => ACTION_NAMES[d.function_name] || d.function_name), datasets: [{ data: state.stats.actions_by_function.map(d => d.count), backgroundColor: CHART_COLORS }] }, options: { plugins: { legend: { position: 'right', labels: { color: textColor, boxWidth: 20 } } } } });
                if(document.getElementById('users-chart') && state.stats.actions_by_user) new Chart(document.getElementById('users-chart'), { type: 'bar', data: { labels: state.stats.actions_by_user.map(d => d.full_name), datasets: [{ label: 'Действия', data: state.stats.actions_by_user.map(d => d.count), backgroundColor: '#10b981' }] }, options: { indexAxis: 'y', scales: { y: { ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { color: gridColor } } }, plugins: { legend: { display: false } } } });
                if(document.getElementById('responses-chart') && state.stats.responses_by_type) new Chart(document.getElementById('responses-chart'), { type: 'pie', data: { labels: state.stats.responses_by_type.map(d => d.type === 'card' ? 'Карточки' : 'Текст'), datasets: [{ data: state.stats.responses_by_type.map(d => d.count), backgroundColor: ['#8b5cf6', '#ef4444'] }] }, options: { plugins: { legend: { position: 'top', labels: { color: textColor } } } } });
             }, 0);
        }
    };
    
    modalElement.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-tab-id], [data-action]');
        if (!target) { if (e.target === modalElement || !e.target.closest('#settings-content')) { onClose(); } return; }

        if (target.dataset.tabId) { switchTab(target.dataset.tabId); }
        if (target.dataset.action) {
            const action = target.dataset.action;
            const subModalContainer = modalElement.querySelector('#sub-modal-container');
            switch(action) {
                case 'close': onClose(); break;
                case 'delete-key': {
                    const keyId = target.dataset.keyId;
                    if (confirm('Удалить этот ключ?')) {
                        try {
                            await supabaseService.deleteSharedGeminiKey(keyId);
                            await switchTab('apiKeys');
                        } catch (err) {
                            alert(`Не удалось удалить ключ: ${err.message}`);
                        }
                    }
                    break;
                }
                case 'add-key': {
                    const apiKey = modalElement.querySelector('#new-key-input').value.trim();
                    const description = modalElement.querySelector('#new-key-desc-input').value.trim();
                    const priority = parseInt(modalElement.querySelector('#new-key-priority-input').value, 10);
                    if (!apiKey) {
                        alert('Ключ API не может быть пустым.');
                        return;
                    }
                    try {
                        await supabaseService.addSharedGeminiKey({ apiKey, description, priority });
                        await switchTab('apiKeys');
                    } catch (err) {
                        alert(`Не удалось добавить ключ: ${err.message}`);
                    }
                    break;
                }
                 case 'open-proxy-manager': {
                    const manager = createProxyManagerModal({ supabaseService, onClose: () => subModalContainer.innerHTML = '' });
                    subModalContainer.appendChild(manager);
                    break;
                }
                case 'test-connection': {
                    state.isTestingConnection = true; state.testStatus = 'idle'; render();
                    try { await supabaseService.testConnection(); state.testStatus = 'ok'; } catch (error) { state.testStatus = 'error'; } 
                    finally { state.isTestingConnection = false; render(); }
                    break;
                }
                case 'run-all-syncs': {
                    state.isSyncingAll = true; render();
                    try { await onRunAllSyncs(); } catch (err) {}
                    finally { state.isSyncingAll = false; state.syncStatus = getSyncStatus(); render(); }
                    break;
                }
                case 'run-single-sync': {
                    const taskName = target.dataset.taskName;
                    state.syncingSingle = taskName; render();
                    try { await onRunSingleSync(taskName); } catch (err) {}
                    finally { state.syncingSingle = null; state.syncStatus = getSyncStatus(); render(); }
                    break;
                }
            }
        }
    });
    
     modalElement.addEventListener('change', async (e) => {
        const roleTarget = e.target.closest('[data-action="change-role"]');
        if (roleTarget) {
            const userId = roleTarget.dataset.userId;
            const newRole = roleTarget.value;
            if (confirm(`Изменить роль для пользователя на "${newRole}"?`)) {
                try { 
                    await supabaseService.updateUserRole(userId, newRole); 
                    await switchTab('users'); 
                } catch (error) { 
                    alert(`Ошибка: ${error.message}`);
                    await switchTab('users'); 
                }
            } else {
                await switchTab('users');
            }
        }

        const keyFieldTarget = e.target.closest('[data-action="update-key-field"]');
        if (keyFieldTarget) {
            const keyId = keyFieldTarget.closest('[data-key-id]').dataset.keyId;
            const field = keyFieldTarget.dataset.field;
            let value = keyFieldTarget.type === 'checkbox' ? keyFieldTarget.checked : keyFieldTarget.value;
            
            const performUpdate = async () => {
                const updates = { [field]: field === 'priority' ? (parseInt(value, 10) || 0) : value };
                try {
                    await supabaseService.updateSharedGeminiKey(keyId, updates);
                } catch (err) {
                    alert(`Ошибка обновления ключа: ${err.message}`);
                    // Revert UI on failure by reloading the tab data
                    await switchTab('apiKeys');
                }
            };

            if (field === 'priority' || field === 'description') {
                 // Debounce input updates
                clearTimeout(keyFieldTarget.debounceTimer);
                keyFieldTarget.debounceTimer = setTimeout(performUpdate, 500);
            } else {
                 // Update checkbox immediately
                 await performUpdate();
            }
        }
    });

    switchTab('users'); // Load initial tab
    return modalElement;
}