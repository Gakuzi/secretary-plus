import * as Icons from './icons/Icons.js';
import { getSyncStatus } from '../utils/storage.js';

// Helper to render a sub-modal for data viewing or error analysis
function renderSubModal(title, content, isHtml = false) {
    const subModal = document.getElementById('profile-sub-modal');
    if (!subModal) return;

    subModal.querySelector('#sub-modal-title').textContent = title;
    const contentEl = subModal.querySelector('#sub-modal-content');
    
    if (isHtml) {
        contentEl.innerHTML = content;
    } else {
        contentEl.textContent = content;
    }
    
    subModal.classList.remove('hidden');
}

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


export function createProfileModal(userProfile, settings, handlers, initialSyncStatus, syncTasks, supabaseUrl) {
    const { onClose, onSave, onLogout, onDelete, onForceSync, onAnalyzeError, onViewData } = handlers;
    
    const SERVICE_DEFINITIONS = {
        calendar: { label: 'Календарь', providers: [{ id: 'google', name: 'Google' }, { id: 'supabase', name: 'Кэш (Supabase)' }, { id: 'apple', name: 'Apple (.ics)' }] },
        tasks: { label: 'Задачи', providers: [{ id: 'google', name: 'Google Tasks' }, { id: 'supabase', name: 'Кэш (Supabase)' }] },
        contacts: { label: 'Контакты', providers: [{ id: 'google', name: 'Google' }, { id: 'supabase', name: 'Кэш (Supabase)' }] },
        files: { label: 'Файлы', providers: [{ id: 'google', name: 'Google Drive' }, { id: 'supabase', name: 'Кэш (Supabase)' }] },
        notes: { label: 'Заметки', providers: [{ id: 'supabase', name: 'База данных' }, { id: 'google', name: 'Google Docs' }] },
    };

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4';

    modalOverlay.innerHTML = `
        <div id="profile-modal-content" class="bg-white dark:bg-slate-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-lg shadow-xl">
            <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <h2 class="text-xl font-bold">Профиль пользователя</h2>
                <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Закрыть профиль">&times;</button>
            </header>
            <main class="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50 dark:bg-slate-900/70">
                <!-- User Info -->
                <div class="flex items-center gap-4 p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <img src="${userProfile.imageUrl}" alt="${userProfile.name}" class="w-16 h-16 rounded-full">
                    <div>
                        <p class="text-xl font-bold">${userProfile.name}</p>
                        <p class="text-sm text-slate-500 dark:text-slate-400">${userProfile.email}</p>
                    </div>
                </div>

                <!-- Sync Status Section -->
                <div id="sync-section-container"></div>

                <!-- Cloud Settings -->
                <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <h3 class="text-lg font-semibold mb-3">Настройки в облаке</h3>
                     <div class="space-y-2">
                         <div class="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-700/50">
                            <label for="profile-email-polling-toggle" class="font-medium text-slate-700 dark:text-slate-300">Проактивные уведомления по почте</label>
                            <label class="toggle-switch"><input type="checkbox" id="profile-email-polling-toggle" ${settings.enableEmailPolling ? 'checked' : ''}><span class="toggle-slider"></span></label>
                        </div>
                        <div class="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-700/50">
                            <label for="profile-auto-sync-toggle" class="font-medium text-slate-700 dark:text-slate-300">Автоматическая фоновая синхронизация</label>
                            <label class="toggle-switch"><input type="checkbox" id="profile-auto-sync-toggle" ${settings.enableAutoSync ? 'checked' : ''}><span class="toggle-slider"></span></label>
                        </div>
                    </div>
                     <div class="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                        ${Object.entries(SERVICE_DEFINITIONS).map(([key, def]) => `
                             <div class="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-700/50 last:border-b-0">
                                <label for="profile-${key}-provider-select" class="font-medium text-slate-700 dark:text-slate-300">${def.label}</label>
                                <select id="profile-${key}-provider-select" class="bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm">
                                    ${def.providers.map(p => `<option value="${p.id}" ${settings.serviceMap[key] === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                                </select>
                            </div>`).join('')}
                     </div>
                </div>
            </main>
            <footer class="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex flex-col-reverse sm:flex-row sm:justify-between items-center gap-3 flex-shrink-0">
                 <div class="w-full sm:w-auto">
                     <button data-action="logout" class="w-full sm:w-auto px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Выйти</button>
                </div>
                <div class="flex flex-col-reverse sm:flex-row w-full sm:w-auto gap-3">
                     <button data-action="delete" class="w-full sm:w-auto px-4 py-2 bg-red-700 hover:bg-red-800 dark:bg-red-800 dark:hover:bg-red-700 text-white rounded-md text-sm font-semibold">Удалить из облака</button>
                     <button data-action="save" class="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold">Сохранить</button>
                </div>
            </footer>
            
            <!-- Sub-Modal for Data/Error -->
            <div id="profile-sub-modal" class="hidden absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-10">
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]">
                    <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
                        <h3 id="sub-modal-title" class="text-lg font-bold"></h3>
                        <button data-action="close-sub-modal" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">&times;</button>
                    </header>
                    <main id="sub-modal-content" class="p-4 overflow-y-auto"></main>
                </div>
            </div>
        </div>
    `;
    
    const syncContainer = modalOverlay.querySelector('#sync-section-container');
    
    const renderSyncSection = () => {
        const currentStatus = getSyncStatus();
        const hasErrors = Object.values(currentStatus).some(s => s.error);
        
        let buttonHtml;
        if (hasErrors) {
            buttonHtml = `
                <button data-action="force-sync" class="w-full sm:w-auto px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-sm font-semibold flex items-center justify-center gap-2">
                    ${Icons.AlertTriangleIcon}
                    <span>Повторить синхронизацию</span>
                </button>`;
        } else {
             buttonHtml = `
                <button data-action="force-sync" class="w-full sm:w-auto px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold flex items-center justify-center gap-2">
                    ${Icons.RefreshCwIcon}
                    <span>Синхронизировать сейчас</span>
                </button>`;
        }

        const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : null;

        const syncItemsHtml = syncTasks.map(task => {
            const iconSVG = Icons[task.icon] || '';
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
                        <span class="w-5 h-5 text-slate-500 dark:text-slate-400">${iconSVG}</span>
                        <div class="flex flex-col">
                            <span class="font-medium text-slate-800 dark:text-slate-200">${task.label}</span>
                            ${errorDetails ? 
                                `<button data-action="analyze-error" data-task-name="${task.label}" data-error-message="${encodeURIComponent(errorDetails)}" class="text-left text-xs ${statusColor} hover:underline truncate" title="${statusText}">${statusText}</button>` :
                                `<span class="text-xs ${statusColor}" title="${statusText}">${statusText}</span>`
                            }
                        </div>
                    </div>
                    <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                        <button data-action="view-data" data-table-name="${task.tableName}" data-label="${task.label}" title="Посмотреть данные" class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">${Icons.DatabaseIcon}</button>
                        <a href="${tableLink}" target="_blank" title="Открыть в Supabase" class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full ${!projectRef ? 'hidden' : ''}">${Icons.ExternalLinkIcon}</a>
                    </div>
                </div>
            `;
        }).join('');

        syncContainer.innerHTML = `
             <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                    <h3 class="text-lg font-semibold">Синхронизация данных</h3>
                    <div id="force-sync-button-wrapper">${buttonHtml}</div>
                </div>
                <div id="sync-status-list" class="space-y-1">${syncItemsHtml}</div>
            </div>`;
    };

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;

        switch(action) {
            case 'close': onClose(); break;
            case 'logout': onLogout(); break;
            case 'delete': onDelete(); break;
            case 'save': {
                const newSettings = {
                    ...settings, 
                    enableEmailPolling: modalOverlay.querySelector('#profile-email-polling-toggle').checked,
                    enableAutoSync: modalOverlay.querySelector('#profile-auto-sync-toggle').checked,
                    serviceMap: Object.keys(SERVICE_DEFINITIONS).reduce((acc, key) => {
                        acc[key] = modalOverlay.querySelector(`#profile-${key}-provider-select`).value;
                        return acc;
                    }, {}),
                };
                onSave(newSettings);
                break;
            }
            case 'force-sync': {
                const wrapper = modalOverlay.querySelector('#force-sync-button-wrapper');
                const button = wrapper.querySelector('button');
                button.disabled = true;
                button.innerHTML = `<div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div> <span>Синхронизация...</span>`;
                await onForceSync();
                renderSyncSection(); // Re-render the whole section with new status
                break;
            }
             case 'analyze-error': {
                const taskName = target.dataset.taskName;
                const errorMessage = decodeURIComponent(target.dataset.errorMessage);
                const loadingHtml = `<p class="mb-4 text-sm">Анализ ошибки для "${taskName}"...</p><div class="flex items-center justify-center h-48"><div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;
                renderSubModal(`Анализ ошибки: ${taskName}`, loadingHtml, true);
                
                try {
                    const analysis = await onAnalyzeError({ context: `Ошибка при синхронизации ${taskName}`, error: errorMessage });
                    const resultHtml = `
                        <p class="text-sm text-slate-500 dark:text-slate-400 mb-2">Исходная ошибка:</p>
                        <code class="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded-md mb-4 whitespace-pre-wrap">${errorMessage}</code>
                        <div class="prose prose-invert max-w-none text-slate-700 dark:text-slate-300">${markdownToHTML(analysis)}</div>`;
                    renderSubModal(`Анализ ошибки: ${taskName}`, resultHtml, true);
                } catch(e) {
                     renderSubModal(`Анализ ошибки: ${taskName}`, `Не удалось выполнить анализ: ${e.message}`, false);
                }
                break;
            }
            case 'view-data': {
                const tableName = target.dataset.tableName;
                const label = target.dataset.label;
                renderSubModal(`Просмотр данных: ${label}`, 'Загрузка данных...', false);
                const result = await onViewData({ tableName });

                if (result.error) {
                    renderSubModal(`Ошибка: ${label}`, `Не удалось загрузить данные: ${result.error}`, false);
                } else if (!result.data || result.data.length === 0) {
                     renderSubModal(`Просмотр данных: ${label}`, 'Нет синхронизированных данных для отображения.', false);
                } else {
                    const headers = Object.keys(result.data[0]);
                    const tableHtml = `
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-xs">
                                <thead class="border-b border-slate-200 dark:border-slate-600">
                                    <tr>${headers.map(h => `<th class="p-2">${h}</th>`).join('')}</tr>
                                </thead>
                                <tbody>
                                    ${result.data.map(row => `
                                        <tr class="border-b border-slate-100 dark:border-slate-700/50">
                                            ${headers.map(h => `<td class="p-2 align-top max-w-[200px] truncate" title="${row[h]}">${row[h] === null ? 'null' : String(row[h])}</td>`).join('')}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>`;
                     renderSubModal(`Последние ${result.data.length} записей: ${label}`, tableHtml, true);
                }
                break;
            }
            case 'close-sub-modal':
                document.getElementById('profile-sub-modal').classList.add('hidden');
                break;
        }
    };
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) onClose();
        handleAction(e);
    });
    
    // Initial render
    if (settings.isSupabaseEnabled) {
        renderSyncSection();
    }

    return modalOverlay;
}