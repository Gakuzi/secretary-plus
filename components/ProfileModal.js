import * as Icons from './icons/Icons.js';
import { getSyncStatus } from '../utils/storage.js';

// Simple markdown to HTML for AI analysis results
function markdownToHTML(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code class="bg-slate-200 dark:bg-slate-700 text-sm rounded px-1 py-0.5">$1</code>')
        .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
        .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
        .replace(/\n/g, '<br>');
}

// Function to create a simple modal for viewing data
function createDataViewerModal(title, data, warning, error, onClose) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[52] p-4 animate-fadeIn';
    
    let contentHtml = '';
    if (error) {
        contentHtml = `<div class="p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-200 rounded-md">${error}</div>`;
    } else if (data.length === 0) {
        contentHtml = `<p class="text-slate-500 dark:text-slate-400 text-center py-8">Данные еще не синхронизированы.</p>`;
    } else {
        const headers = Object.keys(data[0]);
        contentHtml = `
            ${warning ? `<p class="text-sm text-yellow-600 dark:text-yellow-400 mb-2">${warning}</p>` : ''}
            <div class="overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table class="w-full text-xs text-left">
                    <thead class="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                        <tr>${headers.map(h => `<th class="p-2 truncate">${h}</th>`).join('')}</tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        ${data.map(row => `
                            <tr>${headers.map(h => `<td class="p-2 truncate" title="${row[h]}">${row[h]}</td>`).join('')}</tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 class="text-lg font-bold">Просмотр данных: ${title}</h3>
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


export function createProfileModal(currentUserProfile, allUsers, chatHistory, settings, handlers, initialSyncStatus, syncTasks, supabaseUrl) {
    const { onClose, onSave, onLogout, onDelete, onForceSync, onAnalyzeError, onViewData, onLaunchDbWizard, onUpdateUserRole } = handlers;
    
    let activeTab = 'profile';
    const isOwner = currentUserProfile?.role === 'owner';
    const isAdmin = ['admin', 'owner'].includes(currentUserProfile?.role);

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn';

    const render = () => {
        const roleDisplayMap = {
            owner: { text: 'Владелец', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
            admin: { text: 'Администратор', class: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
            manager: { text: 'Менеджер', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
            user: { text: 'Пользователь', class: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200' }
        };
        const currentUserRoleInfo = roleDisplayMap[currentUserProfile.role] || roleDisplayMap.user;

        const profileTabHtml = `
            <div id="tab-profile" class="settings-tab-content grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Left Column: User Info & Actions -->
                <div class="lg:col-span-1 space-y-4">
                    <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                        <img src="${currentUserProfile.avatar_url}" alt="${currentUserProfile.full_name}" class="w-24 h-24 rounded-full mx-auto">
                        <p class="text-xl font-bold mt-3">${currentUserProfile.full_name}</p>
                        <p class="text-sm text-slate-500 dark:text-slate-400">${currentUserProfile.email}</p>
                        <span class="inline-block mt-2 px-3 py-1 text-xs font-semibold rounded-full ${currentUserRoleInfo.class}">
                            ${currentUserRoleInfo.text}
                        </span>
                    </div>
                    <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                         <h4 class="font-semibold text-slate-800 dark:text-slate-100 mb-2">Действия</h4>
                         <div class="space-y-2">
                             <button data-action="logout" class="w-full text-left px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">Выйти из аккаунта</button>
                             <a href="#" data-action="toggle-danger-zone" class="w-full text-left block px-3 py-2 text-sm font-medium rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">Опасная зона</a>
                         </div>
                    </div>
                    <div id="danger-zone" class="hidden p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600 rounded-lg">
                        <h5 class="font-bold text-red-800 dark:text-red-200">Удаление данных</h5>
                        <p class="text-xs text-red-700 dark:text-red-300 mt-1 mb-3">Это действие необратимо удалит все ваши облачные настройки.</p>
                        <button data-action="delete" class="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-semibold">Удалить из облака</button>
                    </div>
                </div>

                <!-- Right Column: Cloud Settings -->
                <div class="lg:col-span-2 p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <h3 class="text-lg font-semibold mb-3">Настройки в облаке</h3>
                    <div class="space-y-2">
                        <div class="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-700/50">
                            <label for="profile-email-polling-toggle" class="font-medium text-slate-700 dark:text-slate-300">Проактивные уведомления по почте</label>
                            <label class="toggle-switch"><input type="checkbox" id="profile-email-polling-toggle" ${settings.enableEmailPolling ? 'checked' : ''}><span class="toggle-slider"></span></label>
                        </div>
                        <div class="flex items-center justify-between py-2">
                            <label for="profile-auto-sync-toggle" class="font-medium text-slate-700 dark:text-slate-300">Автоматическая фоновая синхронизация</label>
                            <label class="toggle-switch"><input type="checkbox" id="profile-auto-sync-toggle" ${settings.enableAutoSync ? 'checked' : ''}><span class="toggle-slider"></span></label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const syncTabHtml = `<div id="tab-sync" class="settings-tab-content"></div>`;

        const adminTabHtml = isAdmin ? `
            <div id="tab-admin" class="settings-tab-content">
                <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <h3 class="text-lg font-semibold mb-3">Управление пользователями</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left">
                            <thead class="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 uppercase">
                                <tr>
                                    <th class="p-2">Пользователь</th>
                                    <th class="p-2">Роль</th>
                                    <th class="p-2">Последний вход</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${allUsers.map(user => {
                                    const canEditRole = isOwner && currentUserProfile.id !== user.id && user.role !== 'owner';
                                    return `
                                    <tr class="border-b border-slate-100 dark:border-slate-800">
                                        <td class="p-2 flex items-center gap-3">
                                            <img src="${user.avatar_url}" class="w-8 h-8 rounded-full" alt="">
                                            <div>
                                                <div class="font-medium text-slate-800 dark:text-slate-100">${user.full_name}</div>
                                                <div class="text-xs text-slate-500 dark:text-slate-400">${user.email}</div>
                                            </div>
                                        </td>
                                        <td class="p-2">
                                            <select data-action="change-role" data-user-id="${user.id}" class="bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed" ${!canEditRole ? 'disabled' : ''}>
                                                <option value="owner" ${user.role === 'owner' ? 'selected' : ''} disabled>Владелец</option>
                                                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Администратор</option>
                                                <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Менеджер</option>
                                                <option value="user" ${user.role === 'user' ? 'selected' : ''}>Пользователь</option>
                                            </select>
                                        </td>
                                        <td class="p-2 text-slate-500 dark:text-slate-400">${user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('ru-RU') : 'Неизвестно'}</td>
                                    </tr>
                                `}).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        ` : '';
        
        const analyticsTabHtml = isAdmin ? `<div id="tab-analytics" class="settings-tab-content"></div>` : '';

        modalOverlay.innerHTML = `
            <div id="profile-modal-content" class="bg-white dark:bg-slate-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-lg shadow-xl">
                <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <h2 class="text-xl font-bold">Панель Управления</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Закрыть">&times;</button>
                </header>

                <main class="flex-1 flex flex-col sm:flex-row overflow-hidden bg-slate-50 dark:bg-slate-900/70">
                    <aside class="w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 p-2 sm:p-4 flex-shrink-0 bg-white dark:bg-slate-800">
                         <nav class="flex flex-row sm:flex-col sm:space-y-1 w-full justify-start">
                            <a href="#profile" class="profile-tab-button" data-tab="profile">${Icons.UserIcon} <span>Мой профиль</span></a>
                            <a href="#sync" class="profile-tab-button" data-tab="sync">${Icons.RefreshCwIcon} <span>Синхронизация</span></a>
                            ${isAdmin ? `<a href="#admin" class="profile-tab-button" data-tab="admin">${Icons.UsersIcon} <span>Администрирование</span></a>` : ''}
                             ${isAdmin ? `<a href="#analytics" class="profile-tab-button" data-tab="analytics">${Icons.ChartBarIcon} <span>Аналитика</span></a>` : ''}
                        </nav>
                    </aside>
                    <div class="flex-1 p-4 sm:p-6 overflow-y-auto" id="profile-tabs-content">
                        ${profileTabHtml}
                        ${syncTabHtml}
                        ${adminTabHtml}
                        ${analyticsTabHtml}
                    </div>
                </main>
                
                <footer class="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center flex-shrink-0">
                    <button data-action="save" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Сохранить и закрыть</button>
                </footer>
            </div>
            <div id="data-viewer-container"></div>
        `;
        
        // --- DYNAMIC CONTENT RENDERING ---

        // Hide all tabs first
        modalOverlay.querySelectorAll('.settings-tab-content').forEach(el => el.classList.add('hidden'));

        // Show the active tab's content
        const activeContent = modalOverlay.querySelector(`#tab-${activeTab}`);
        if(activeContent) activeContent.classList.remove('hidden');

        // Highlight the active tab button
        modalOverlay.querySelectorAll('.profile-tab-button').forEach(btn => btn.classList.remove('active'));
        const activeButton = modalOverlay.querySelector(`.profile-tab-button[data-tab="${activeTab}"]`);
        if(activeButton) activeButton.classList.add('active');


        // Render content for specific tabs
        if (activeTab === 'sync') {
             const syncContainer = modalOverlay.querySelector('#tab-sync');
             renderSyncSection(syncContainer);
        }
        
        if (activeTab === 'analytics' && isAdmin) {
             const analyticsContainer = modalOverlay.querySelector('#tab-analytics');
             renderAnalyticsSection(analyticsContainer);
        }


        // Re-attach listeners after re-render
        attachEventListeners();
    };

    const renderSyncSection = (container) => {
        if (!container) return;

        // --- DIAGNOSTICS START ---
        if (!settings.isSupabaseEnabled) {
            container.innerHTML = `
                <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                    <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100">Синхронизация отключена</h3>
                    <p class="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-4">Для использования облачной синхронизации данных необходимо включить режим "Supabase" в настройках.</p>
                     <button data-client-action="open_settings" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm">Перейти в настройки</button>
                </div>`;
            return;
        }

        const currentStatus = getSyncStatus();
        const hasSchemaError = Object.values(currentStatus).some(s => 
            s.error && (s.error.includes('column') || s.error.includes('does not exist') || s.error.includes('constraint') || s.error.includes('relation'))
        );
        
        if (hasSchemaError) {
             container.innerHTML = `
                <div class="p-4 rounded-md bg-red-100/50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300">
                    <div class="flex items-start gap-3">
                        <div class="w-5 h-5 flex-shrink-0 mt-0.5">${Icons.AlertTriangleIcon}</div>
                        <div>
                            <p class="font-bold">Обнаружена критическая ошибка!</p>
                            <p class="text-sm mt-1 mb-3">Структура вашей базы данных устарела, что блокирует синхронизацию и сохранение настроек. Это может произойти после обновления приложения. Пожалуйста, обновите схему с помощью мастера, чтобы исправить проблему.</p>
                            <button data-action="launch-db-wizard" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-semibold">Запустить мастер настройки БД</button>
                        </div>
                    </div>
                </div>`;
            return;
        }
        // --- DIAGNOSTICS END ---

        const hasAnyError = Object.values(currentStatus).some(s => s.error);

        const buttonHtml = `
            <button data-action="force-sync" class="w-full sm:w-auto px-4 py-2 ${hasAnyError ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500'} text-slate-800 dark:text-white rounded-md text-sm font-semibold flex items-center justify-center gap-2">
                ${hasAnyError ? Icons.AlertTriangleIcon : Icons.RefreshCwIcon}
                <span>${hasAnyError ? 'Повторить синхронизацию' : 'Синхронизировать сейчас'}</span>
            </button>`;

        const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : null;

        const syncItemsHtml = syncTasks.map(task => {
            const lastSyncData = currentStatus[task.name];
            let statusText = 'Никогда не синхронизировалось';
            let statusColor = 'text-slate-400 dark:text-slate-500';
            let errorDetails = null;

            if (lastSyncData) {
                if (lastSyncData.error) {
                    statusText = 'Ошибка: ' + lastSyncData.error;
                    statusColor = 'text-red-600 dark:text-red-400';
                    errorDetails = lastSyncData.error;
                } else if (lastSyncData.lastSync) {
                    statusText = `Синхронизировано: ${new Date(lastSyncData.lastSync).toLocaleString('ru-RU')}`;
                    statusColor = 'text-green-600 dark:text-green-400';
                }
            }
            
            const tableLink = projectRef ? `https://supabase.com/dashboard/project/${projectRef}/editor/${task.tableName}` : '#';

            return `
                <div class="flex items-center justify-between text-sm py-2 border-b border-slate-200 dark:border-slate-700/50 last:border-b-0">
                    <div class="flex items-center gap-3">
                        <span class="w-5 h-5 text-slate-500 dark:text-slate-400">${Icons[task.icon] || ''}</span>
                        <div class="flex flex-col">
                            <span class="font-medium text-slate-800 dark:text-slate-200">${task.label}</span>
                            ${errorDetails ? 
                                `<button data-action="analyze-error" data-task-name="${task.label}" data-error-message="${encodeURIComponent(errorDetails)}" class="text-left text-xs ${statusColor} hover:underline truncate max-w-xs" title="${statusText}">${statusText}</button>` :
                                `<span class="text-xs ${statusColor}" title="${statusText}">${statusText}</span>`
                            }
                        </div>
                    </div>
                    <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                        <button data-action="view-data" data-table-name="${task.tableName}" data-label="${task.label}" title="Посмотреть данные" class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">${Icons.DatabaseIcon}</button>
                        <a href="${tableLink}" target="_blank" title="Открыть в Supabase" class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full ${!projectRef ? 'hidden' : ''}">${Icons.ExternalLinkIcon}</a>
                    </div>
                </div>`;
        }).join('');

        container.innerHTML = `
             <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                    <h3 class="text-lg font-semibold">Синхронизация данных</h3>
                    <div id="force-sync-button-wrapper">${buttonHtml}</div>
                </div>
                <div id="sync-status-list" class="space-y-1">${syncItemsHtml}</div>
            </div>`;
    };

    const renderAnalyticsSection = (container) => {
        if (!container) return;

        const groupedBySession = chatHistory.reduce((acc, msg) => {
            (acc[msg.session_id] = acc[msg.session_id] || []).push(msg);
            return acc;
        }, {});

        if (Object.keys(groupedBySession).length === 0) {
            container.innerHTML = `<p class="text-slate-500">История чатов пока пуста.</p>`;
            return;
        }

        const sessionsHtml = Object.entries(groupedBySession).map(([sessionId, messages]) => {
            const firstMessage = messages[messages.length - 1]; // Messages are sorted descending
            const user = firstMessage.user;
            const sessionDate = new Date(firstMessage.created_at).toLocaleString('ru-RU');

            const messagesHtml = messages.slice().reverse().map(msg => {
                const isUser = msg.sender === 'user';
                const avatar = isUser
                    ? `<img src="${user.avatar_url}" class="w-6 h-6 rounded-full" alt="user">`
                    : `<div class="w-6 h-6 rounded-full flex items-center justify-center text-xs bg-slate-200 dark:bg-slate-700">S+</div>`;
                
                let content = msg.text_content ? `<p class="text-sm">${msg.text_content}</p>` : '';
                if(msg.card_data) content += `<div class="mt-1 text-xs text-blue-500">[КАРТОЧКА: ${msg.card_data.type}]</div>`;
                if(msg.contextual_actions) content += `<div class="mt-1 text-xs text-indigo-500">[ДЕЙСТВИЯ]</div>`;

                return `
                    <div class="flex gap-2 py-1.5">
                        <div class="flex-shrink-0">${avatar}</div>
                        <div class="flex-1">${content}</div>
                    </div>
                `;
            }).join('');

            return `
                <details class="bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <summary class="p-3 cursor-pointer font-medium flex justify-between items-center">
                        <div>
                            <span>${user.user_data?.email || 'Неизвестный пользователь'}</span>
                            <span class="ml-2 text-xs text-slate-500">${sessionDate}</span>
                        </div>
                         <span class="text-xs text-slate-400">Сессия: ${sessionId.slice(0,8)}...</span>
                    </summary>
                    <div class="p-3 border-t border-slate-200 dark:border-slate-700">
                        ${messagesHtml}
                    </div>
                </details>
            `;
        }).join('');

        container.innerHTML = `
            <h3 class="text-lg font-semibold mb-3">Аналитика чатов</h3>
            <div class="space-y-2">${sessionsHtml}</div>
        `;
    };

    const attachEventListeners = () => {
        modalOverlay.addEventListener('click', handleAction);
        modalOverlay.addEventListener('change', (e) => {
            const target = e.target.closest('[data-action="change-role"]');
            if(target) {
                const userId = target.dataset.userId;
                const newRole = target.value;
                onUpdateUserRole(userId, newRole);
            }
        });
    };
    
    const handleAction = async (e) => {
        const target = e.target.closest('[data-action], [data-client-action]');
        if (!target) {
             if (!e.target.closest('#profile-modal-content')) {
                onClose();
             }
             return;
        }

        const action = target.dataset.action;
        const clientAction = target.dataset.clientAction;

        if(clientAction === 'open_settings') {
            // This is a special case to call an action from index.js
            // The global click handler will pick this up.
            return;
        }

        // Tab switching
        if (target.matches('.profile-tab-button')) {
            e.preventDefault();
            activeTab = target.dataset.tab;
            render();
            return;
        }

        switch(action) {
            case 'close': onClose(); break;
            case 'logout': onLogout(); break;
            case 'delete': onDelete(); break;
            case 'launch-db-wizard': 
                onLaunchDbWizard(); 
                break;
            case 'toggle-danger-zone':
                e.preventDefault();
                modalOverlay.querySelector('#danger-zone')?.classList.toggle('hidden');
                break;
            case 'save': {
                const newSettings = {
                    ...settings, 
                    enableEmailPolling: modalOverlay.querySelector('#profile-email-polling-toggle').checked,
                    enableAutoSync: modalOverlay.querySelector('#profile-auto-sync-toggle').checked,
                };
                await onSave(newSettings);
                break;
            }
            case 'force-sync': {
                const wrapper = modalOverlay.querySelector('#force-sync-button-wrapper');
                const button = wrapper.querySelector('button');
                button.disabled = true;
                button.innerHTML = `<div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div> <span>Синхронизация...</span>`;
                await onForceSync();
                // After sync, re-render just the sync section
                const syncContainer = modalOverlay.querySelector('#tab-sync');
                if (syncContainer) renderSyncSection(syncContainer);
                break;
            }
            case 'analyze-error': {
                const taskName = target.dataset.taskName;
                const errorMessage = decodeURIComponent(target.dataset.errorMessage);
                target.textContent = 'Анализ...';
                target.disabled = true;
                try {
                    const analysis = await onAnalyzeError({ context: `Syncing ${taskName}`, error: errorMessage });
                    const viewerContainer = modalOverlay.querySelector('#data-viewer-container');
                    const modal = createDataViewerModal(
                        `Анализ ошибки: ${taskName}`,
                        [], null, `<div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHTML(analysis)}</div>`,
                        () => viewerContainer.innerHTML = ''
                    );
                    viewerContainer.appendChild(modal);
                } catch (e) {
                    alert(`Не удалось проанализировать ошибку: ${e.message}`);
                } finally {
                    target.textContent = 'Ошибка: ' + errorMessage;
                    target.disabled = false;
                }
                break;
            }
            case 'view-data': {
                const tableName = target.dataset.tableName;
                const label = target.dataset.label;
                const viewerContainer = modalOverlay.querySelector('#data-viewer-container');
                viewerContainer.innerHTML = `<div class="fixed inset-0 bg-black/10 flex items-center justify-center z-[53]"><div class="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full"></div></div>`;
                const { data, warning, error } = await onViewData({ tableName });
                const modal = createDataViewerModal(label, data, warning, error, () => viewerContainer.innerHTML = '');
                viewerContainer.innerHTML = '';
                viewerContainer.appendChild(modal);
                break;
            }
        }
    };
    
    // Initial render
    render();

    return modalOverlay;
}