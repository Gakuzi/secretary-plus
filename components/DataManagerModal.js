import * as Icons from './icons/Icons.js';
import { getSyncStatus } from '../utils/storage.js';

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

export function createDataManagerModal({ supabaseService, syncTasks, onClose, onRunSingleSync, onRunAllSyncs }) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fadeIn';

    let state = {
        isTestingConnection: false,
        testStatus: 'idle', // idle, ok, error
        syncStatus: getSyncStatus(),
        isSyncingAll: false,
        syncingSingle: null, // Holds the name of the task being synced
    };
    
    const render = () => {
        const syncItemsHtml = syncTasks.map(task => {
            const lastSyncData = state.syncStatus[task.name];
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
            
            const isSyncing = state.syncingSingle === task.name;

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

        let testStatusHtml = '';
        if (state.isTestingConnection) {
            testStatusHtml = `<div class="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"></div>`;
        } else if (state.testStatus === 'ok') {
            testStatusHtml = `<span class="text-green-500 font-semibold">✓ Успешно</span>`;
        } else if (state.testStatus === 'error') {
            testStatusHtml = `<span class="text-red-500 font-semibold">✗ Ошибка</span>`;
        }

        modalOverlay.innerHTML = `
            <div id="data-manager-content" class="bg-slate-100 dark:bg-slate-900 w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] rounded-lg shadow-xl flex flex-col">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800 rounded-t-lg">
                    <h2 class="text-xl font-bold flex items-center gap-2">${Icons.DatabaseIcon} Центр управления данными</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">&times;</button>
                </header>

                <main class="flex-1 p-6 overflow-y-auto space-y-6">
                    <section class="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div class="text-center sm:text-left">
                            <h3 class="font-semibold text-slate-800 dark:text-slate-200">Общая информация и действия</h3>
                            <p class="text-xs text-slate-500 dark:text-slate-400">Проверьте соединение с базой данных или запустите полную синхронизацию всех сервисов.</p>
                        </div>
                        <div class="flex items-center gap-2">
                             <button data-action="test-connection" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold flex items-center gap-2">
                                <span>Проверить подключение</span>
                                <div class="w-20 text-left">${testStatusHtml}</div>
                            </button>
                            <button data-action="run-all-syncs" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold flex items-center gap-2" ${state.isSyncingAll ? 'disabled' : ''}>
                                ${state.isSyncingAll ? `<div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div> <span>Синхронизация...</span>` : 'Синхронизировать всё'}
                            </button>
                        </div>
                    </section>
                    <section>
                         <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${syncItemsHtml}
                        </div>
                    </section>
                </main>
                 <div id="data-viewer-container"></div>
            </div>
        `;
    };

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) {
            if (e.target === modalOverlay || !e.target.closest('#data-manager-content')) {
                onClose();
            }
            return;
        }

        const action = target.dataset.action;

        switch(action) {
            case 'close': onClose(); break;
            case 'test-connection': {
                state.isTestingConnection = true;
                state.testStatus = 'idle';
                render();
                try {
                    await supabaseService.testConnection();
                    state.testStatus = 'ok';
                } catch (error) {
                    state.testStatus = 'error';
                    console.error('Connection test failed', error);
                } finally {
                    state.isTestingConnection = false;
                    render();
                }
                break;
            }
            case 'run-all-syncs': {
                state.isSyncingAll = true;
                render();
                try {
                    await onRunAllSyncs();
                } catch (err) { /* no-op */ }
                finally {
                    state.isSyncingAll = false;
                    state.syncStatus = getSyncStatus();
                    render();
                }
                break;
            }
            case 'run-single-sync': {
                const taskName = target.dataset.taskName;
                state.syncingSingle = taskName;
                render();
                try {
                    await onRunSingleSync(taskName);
                } catch (err) { /* no-op */ }
                finally {
                    state.syncingSingle = null;
                    state.syncStatus = getSyncStatus();
                    render();
                }
                break;
            }
            case 'view-data': {
                 const tableName = target.dataset.tableName;
                const label = target.dataset.label;
                const viewerContainer = modalOverlay.querySelector('#data-viewer-container');
                viewerContainer.innerHTML = `<div class="fixed inset-0 bg-black/10 flex items-center justify-center z-[53]"><div class="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full"></div></div>`;
                const { data, error } = await supabaseService.getSampleData(tableName);
                const modal = createDataViewerModal(label, data, error.message, () => viewerContainer.innerHTML = '');
                viewerContainer.innerHTML = '';
                viewerContainer.appendChild(modal);
                break;
            }
        }
    };

    modalOverlay.addEventListener('click', handleAction);
    render();
    return modalOverlay;
}