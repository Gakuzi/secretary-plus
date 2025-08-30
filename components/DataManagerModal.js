import * as Icons from './icons/Icons.js';
import { getSyncStatus } from '../utils/storage.js';
import { SERVICE_SCHEMAS } from '../services/supabase/schema.js';

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

function renderSyncTab(syncTasks, state) {
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

    return `
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
        <section class="mt-6">
             <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                ${syncTasks.length > 0 ? syncItemsHtml : `<div class="col-span-full text-center p-8 text-slate-500 dark:text-slate-400">Нет включенных служб для синхронизации. Включите их в Настройках.</div>`}
            </div>
        </section>
    `;
}

function renderSchemaTab(state) {
    if (state.isCheckingSchema) {
        return `<div class="flex justify-center items-center h-full"><div class="animate-spin h-8 w-8 border-4 border-slate-300 border-t-transparent rounded-full"></div></div>`;
    }

    if (state.schemaError) {
        return `<div class="p-4 bg-red-100 text-red-800 rounded-md"><strong>Ошибка проверки схемы:</strong> ${state.schemaError}</div>`;
    }
    
    if (!state.generatedSql) {
        return `
            <div class="p-6 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-center">
                <div class="w-12 h-12 flex items-center justify-center mx-auto bg-green-100 dark:bg-green-800 rounded-full text-green-600 dark:text-green-300">${Icons.CheckSquareIcon}</div>
                <h4 class="mt-4 text-lg font-bold text-green-800 dark:text-green-200">Схема базы данных в порядке</h4>
                <p class="mt-1 text-sm text-green-700 dark:text-green-300">Все таблицы, необходимые для включенных служб, уже существуют.</p>
            </div>
        `;
    }

    let footerHtml = '';
    if (state.executionSuccess) {
        footerHtml = `<button data-action="close-and-refresh" class="w-full px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold">Готово</button>`;
    } else {
        footerHtml = `
            <button data-action="execute-sql" class="w-full px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold disabled:bg-slate-500" ${state.isExecutingSql ? 'disabled' : ''}>
                ${state.isExecutingSql ? 'Выполнение...' : 'Создать недостающие таблицы'}
            </button>
        `;
    }

    return `
        <div class="p-4 bg-yellow-100/50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300 rounded-md text-sm">
            <h4 class="font-bold">Требуется обновление схемы</h4>
            <p>Для некоторых включенных служб отсутствуют таблицы в базе данных. Сгенерирован SQL-скрипт для их создания.</p>
        </div>
        <div class="mt-4">
            <label for="sql-script-area" class="font-semibold text-sm">Сгенерированный SQL-скрипт:</label>
            <textarea id="sql-script-area" class="w-full h-48 mt-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-xs" readonly>${state.generatedSql}</textarea>
        </div>
        <div>
            <label class="font-semibold text-sm">Лог выполнения:</label>
            <div class="w-full h-24 mt-1 bg-slate-900 text-slate-200 border border-slate-700 rounded-md p-2 font-mono text-xs overflow-y-auto whitespace-pre-wrap">${state.logOutput}</div>
        </div>
        <div class="mt-4">${footerHtml}</div>
    `;
}

export function createDataManagerModal({ supabaseService, syncTasks, settings, onClose, onRunSingleSync, onRunAllSyncs }) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fadeIn';

    let state = {
        currentTab: 'sync',
        isTestingConnection: false,
        testStatus: 'idle', // idle, ok, error
        syncStatus: getSyncStatus(),
        isSyncingAll: false,
        syncingSingle: null, // Holds the name of the task being synced
        isCheckingSchema: true,
        schemaError: null,
        existingTables: [],
        generatedSql: '',
        isExecutingSql: false,
        executionSuccess: false,
        logOutput: 'Ожидание выполнения...',
    };
    
    const render = () => {
        const TABS = [
            { id: 'sync', label: 'Синхронизация' },
            { id: 'schema', label: 'Схема БД' },
        ];
        
        modalOverlay.innerHTML = `
            <div id="data-manager-content" class="bg-slate-100 dark:bg-slate-900 w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] rounded-lg shadow-xl flex flex-col">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800 rounded-t-lg">
                    <h2 class="text-xl font-bold flex items-center gap-2">${Icons.DatabaseIcon} Центр управления данными</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">&times;</button>
                </header>
                
                <nav class="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 p-2 flex items-center gap-2 bg-white dark:bg-slate-800">
                     ${TABS.map(tab => `
                        <button class="flex-1 px-4 py-2 text-sm font-semibold rounded-md transition-colors ${state.currentTab === tab.id ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}" data-tab-id="${tab.id}">${tab.label}</button>
                     `).join('')}
                </nav>

                <main class="flex-1 p-6 overflow-y-auto">
                    <div id="tab-content-sync" class="${state.currentTab === 'sync' ? '' : 'hidden'}">${renderSyncTab(syncTasks, state)}</div>
                    <div id="tab-content-schema" class="${state.currentTab === 'schema' ? '' : 'hidden'}">${renderSchemaTab(state)}</div>
                </main>
                 <div id="data-viewer-container"></div>
            </div>
        `;
    };

    const checkSchema = async () => {
        state.isCheckingSchema = true;
        state.schemaError = null;
        state.generatedSql = '';
        render();

        try {
            const tables = await supabaseService.getExistingTables(settings.managementWorkerUrl, settings.adminSecretToken);
            state.existingTables = tables;
            
            let missingSql = '';
            for (const [key, schema] of Object.entries(SERVICE_SCHEMAS)) {
                if (settings.enabledServices[key] && !tables.includes(schema.tableName)) {
                    missingSql += `-- Схема для: ${schema.label}\n${schema.sql}\n\n`;
                }
            }
            state.generatedSql = missingSql.trim();
        } catch (error) {
            state.schemaError = error.message;
        } finally {
            state.isCheckingSchema = false;
            render();
        }
    };

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) {
            if (e.target.closest('[data-tab-id]')) {
                state.currentTab = e.target.closest('[data-tab-id]').dataset.tabId;
                if(state.currentTab === 'schema') checkSchema();
                render();
            } else if (e.target === modalOverlay || !e.target.closest('#data-manager-content')) {
                onClose();
            }
            return;
        }

        const action = target.dataset.action;

        switch(action) {
            case 'close': onClose(); break;
            case 'close-and-refresh': window.location.reload(); break;
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
                const modal = createDataViewerModal(label, data, error ? error.message : null, () => viewerContainer.innerHTML = '');
                viewerContainer.innerHTML = '';
                viewerContainer.appendChild(modal);
                break;
            }
            case 'execute-sql': {
                 const sqlToExecute = modalOverlay.querySelector('#sql-script-area').value.trim();
                 if (!sqlToExecute) return;
                 state.isExecutingSql = true;
                 state.executionSuccess = false;
                 state.logOutput = 'Выполнение скрипта...';
                 render();
                 try {
                    const result = await supabaseService.executeSqlViaFunction(settings.managementWorkerUrl, settings.adminSecretToken, sqlToExecute);
                    state.logOutput = `УСПЕШНО! Таблицы созданы.\n\nОтвет сервера:\n${JSON.stringify(result, null, 2)}`;
                    state.executionSuccess = true;
                 } catch (error) {
                    state.logOutput = `ОШИБКА!\n\n${error.message}\n\nПроверьте настройки Управляющего воркера.`;
                 } finally {
                    state.isExecutingSql = false;
                    render();
                 }
                break;
            }
        }
    };

    modalOverlay.addEventListener('click', handleAction);
    render();
    return modalOverlay;
}
