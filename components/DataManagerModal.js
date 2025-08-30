import * as Icons from './icons/Icons.js';
import { getSyncStatus } from '../utils/storage.js';
import { DB_SCHEMAS, generateCreateTableSql } from '../services/supabase/schema.js';
import { createDbExecutionModal } from './DbExecutionModal.js';

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

function renderSyncTab(tasks, state) {
     const syncItemsHtml = tasks.map(task => {
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

        const syncButtonHtml = task.isSyncable ? `
            <button data-action="run-single-sync" data-task-name="${task.name}" class="flex-1 px-3 py-2 text-sm bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md font-semibold flex items-center justify-center gap-1" ${isSyncing ? 'disabled' : ''}>
               ${isSyncing ? `<div class="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>` : Icons.RefreshCwIcon.replace('width="24"', 'width="16"')}
               <span>Синхр.</span>
            </button>
        ` : `<div class="flex-1"></div>`;


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
                    ${syncButtonHtml}
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
                ${tasks.length > 0 ? syncItemsHtml : `<div class="col-span-full text-center p-8 text-slate-500 dark:text-slate-400">Нет включенных служб для синхронизации. Включите их в Настройках.</div>`}
            </div>
        </section>
    `;
}

function renderSchemaTab(state) {
    if (state.isCheckingSchema) {
        return `<div class="flex justify-center items-center h-full p-8"><div class="animate-spin h-8 w-8 border-4 border-slate-300 border-t-transparent rounded-full"></div></div>`;
    }
    
    if (state.schemaError) {
        return `<div class="p-4 bg-red-100 text-red-800 rounded-md"><strong>Ошибка проверки схемы:</strong> ${state.schemaError}</div>`;
    }
    
    const servicesHtml = Object.entries(DB_SCHEMAS).map(([key, schema]) => {
        const tableStatus = state.schemaStatus[schema.tableName];
        if (!tableStatus) return ''; // Should not happen if checkSchema ran

        const fieldsHtml = schema.fields.map(field => `
            <li class="flex items-center gap-2 text-sm py-1">
                 <input type="checkbox" id="field-${schema.tableName}-${field.name}" data-table="${schema.tableName}" data-field="${field.name}" ${tableStatus.columns[field.name] ? 'checked' : ''} class="w-4 h-4 rounded text-blue-600 bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500">
                 <label for="field-${schema.tableName}-${field.name}" class="flex-1 text-slate-700 dark:text-slate-300">${field.name}</label>
                 <span class="font-mono text-xs text-slate-500 dark:text-slate-400">${field.type}</span>
            </li>
        `).join('');

        let statusIndicator = '';
        if (tableStatus.status === 'ok') {
            statusIndicator = `<span class="text-xs font-semibold text-green-600 dark:text-green-400">✓ OK</span>`;
        } else if (tableStatus.status === 'missing_columns') {
            statusIndicator = `<span class="text-xs font-semibold text-yellow-600 dark:text-yellow-400">! Частично</span>`;
        } else {
            statusIndicator = `<span class="text-xs font-semibold text-red-600 dark:text-red-400">✗ Отсутствует</span>`;
        }
        
        return `
            <details class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden" ${tableStatus.status !== 'ok' ? 'open' : ''}>
                <summary class="p-3 cursor-pointer flex justify-between items-center font-semibold">
                    <div class="flex items-center gap-3">
                        <span class="w-5 h-5 text-slate-600 dark:text-slate-300">${Icons[schema.icon]}</span>
                        <span>${schema.label} (${schema.tableName})</span>
                    </div>
                    ${statusIndicator}
                </summary>
                <div class="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <div class="flex justify-end mb-2">
                        <button class="text-xs font-semibold text-blue-500 hover:underline" data-action="select-recommended" data-table="${schema.tableName}">Выбрать рекомендуемые</button>
                    </div>
                    <ul class="space-y-1">${fieldsHtml}</ul>
                </div>
            </details>
        `;
    }).join('');
    
    let overallStatusHtml = '';
    if (!state.generatedSql) {
        overallStatusHtml = `
            <div class="p-6 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-center">
                <div class="w-12 h-12 flex items-center justify-center mx-auto bg-green-100 dark:bg-green-800 rounded-full text-green-600 dark:text-green-300">${Icons.CheckSquareIcon}</div>
                <h4 class="mt-4 text-lg font-bold text-green-800 dark:text-green-200">Схема базы данных в порядке</h4>
                <p class="mt-1 text-sm text-green-700 dark:text-green-300">Все необходимые таблицы и столбцы существуют.</p>
            </div>
        `;
    } else {
        overallStatusHtml = `
             <div class="p-4 bg-yellow-100/50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300 rounded-md">
                <h4 class="font-bold text-lg">Требуются изменения в схеме</h4>
                <p class="text-sm mt-1">Система обнаружила отсутствующие таблицы или столбцы. Сгенерирован SQL-скрипт для их создания. Проверьте его и нажмите "Применить изменения".</p>
            </div>
            <div>
                <label for="sql-script-area" class="font-semibold text-sm mt-4 block mb-1">Сгенерированный SQL-скрипт:</label>
                <textarea id="sql-script-area" class="w-full h-40 mt-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-xs" readonly>${state.generatedSql}</textarea>
            </div>
            <button data-action="apply-schema-changes" class="mt-4 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center justify-center gap-2">
                ${Icons.WandIcon}
                <span>Применить изменения</span>
            </button>
        `;
    }
    
    return `
        <div class="space-y-4">
             ${overallStatusHtml}
            <div class="space-y-2">${servicesHtml}</div>
        </div>
    `;
}

export function createDataManagerModal({ supabaseService, tasks, settings, onClose, onRunSingleSync, onRunAllSyncs }) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fadeIn';

    let state = {
        currentTab: 'sync',
        isTestingConnection: false,
        testStatus: 'idle', // idle, ok, error
        syncStatus: getSyncStatus(),
        isSyncingAll: false,
        syncingSingle: null,
        // Schema tab state
        isCheckingSchema: true,
        schemaError: null,
        schemaStatus: {}, // { tableName: { status: 'ok' | 'missing_columns' | 'missing', columns: { colName: true, ... } } }
        generatedSql: '',
    };
    
    const render = () => {
        const TABS = [
            { id: 'sync', label: 'Статус синхронизации' },
            { id: 'schema', label: 'Менеджер Схемы' },
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
                    <div id="tab-content-sync" class="${state.currentTab === 'sync' ? '' : 'hidden'}">${renderSyncTab(tasks, state)}</div>
                    <div id="tab-content-schema" class="${state.currentTab === 'schema' ? '' : 'hidden'}">${renderSchemaTab(state)}</div>
                </main>
                 <div id="sub-modal-container"></div>
            </div>
        `;
    };

    const generateSqlFromState = () => {
        let sql = '';
        for (const schema of Object.values(DB_SCHEMAS)) {
            const status = state.schemaStatus[schema.tableName];
            if (!status) continue;
            
            const selectedFields = schema.fields.filter(field => {
                const checkbox = modalOverlay.querySelector(`#field-${schema.tableName}-${field.name}`);
                return checkbox && checkbox.checked;
            });

            if (status.status === 'missing') {
                if (selectedFields.length > 0) {
                     sql += generateCreateTableSql(schema, selectedFields) + '\n\n';
                }
            } else if (status.status === 'missing_columns') {
                const missingFields = selectedFields.filter(field => !status.columns[field.name]);
                if (missingFields.length > 0) {
                    sql += `-- Изменения для таблицы: ${schema.tableName}\n`;
                    sql += `ALTER TABLE public.${schema.tableName}\n`;
                    sql += missingFields.map(field => `    ADD COLUMN IF NOT EXISTS ${field.name} ${field.type}`).join(',\n') + ';\n\n';
                }
            }
        }
        state.generatedSql = sql.trim();
    };

    const checkSchema = async () => {
        state.isCheckingSchema = true;
        state.schemaError = null;
        render();

        if (!settings.managementWorkerUrl || !settings.adminSecretToken) {
            state.schemaError = "Управляющий воркер не настроен. Запустите мастер настройки в Настройках > База данных.";
            state.isCheckingSchema = false;
            render();
            return;
        }

        try {
            const existingTables = await supabaseService.getExistingTables(settings.managementWorkerUrl, settings.adminSecretToken);
            
            for (const schema of Object.values(DB_SCHEMAS)) {
                if (!existingTables.includes(schema.tableName)) {
                    state.schemaStatus[schema.tableName] = { status: 'missing', columns: {} };
                } else {
                    const columns = await supabaseService.getTableSchema(settings.managementWorkerUrl, settings.adminSecretToken, schema.tableName);
                    const existingColumns = columns.reduce((acc, col) => ({ ...acc, [col.column_name]: true }), {});
                    const hasMissing = schema.fields.some(f => !existingColumns[f.name]);
                    state.schemaStatus[schema.tableName] = {
                        status: hasMissing ? 'missing_columns' : 'ok',
                        columns: existingColumns
                    };
                }
            }
        } catch (error) {
            state.schemaError = error.message;
        } finally {
            state.isCheckingSchema = false;
            generateSqlFromState();
            render();
        }
    };

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (target) {
            const action = target.dataset.action;
            const subModalContainer = modalOverlay.querySelector('#sub-modal-container');
    
            switch(action) {
                case 'close': onClose(); break;
                case 'test-connection': {
                    state.isTestingConnection = true; state.testStatus = 'idle'; render();
                    try {
                        await supabaseService.testConnection(); state.testStatus = 'ok';
                    } catch (error) {
                        state.testStatus = 'error'; console.error('Connection test failed', error);
                    } finally {
                        state.isTestingConnection = false; render();
                    }
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
                case 'select-recommended': {
                    const tableName = target.dataset.table;
                    const schema = Object.values(DB_SCHEMAS).find(s => s.tableName === tableName);
                    if (schema) {
                        schema.fields.forEach(field => {
                            const checkbox = modalOverlay.querySelector(`#field-${tableName}-${field.name}`);
                            if (checkbox) checkbox.checked = field.recommended;
                        });
                        generateSqlFromState();
                        render();
                    }
                    break;
                }
                case 'apply-schema-changes': {
                    const execModal = createDbExecutionModal({
                        onExecute: async (sql) => {
                            return await supabaseService.executeSqlViaFunction(settings.managementWorkerUrl, settings.adminSecretToken, sql);
                        },
                        onClose: () => {
                            subModalContainer.innerHTML = '';
                            checkSchema(); // Re-check the schema after closing the execution modal
                        }
                    });
                    execModal.querySelector('#sql-script-area').value = state.generatedSql;
                    subModalContainer.innerHTML = '';
                    subModalContainer.appendChild(execModal);
                    break;
                }
            }
        } else if (e.target.closest('[data-tab-id]')) {
            state.currentTab = e.target.closest('[data-tab-id]').dataset.tabId;
            if(state.currentTab === 'schema') checkSchema();
            render();
        } else if (e.target === modalOverlay || !e.target.closest('#data-manager-content')) {
            onClose();
        }
    };
    
    modalOverlay.addEventListener('click', handleAction);
    modalOverlay.addEventListener('change', (e) => {
        if (e.target.closest('input[type="checkbox"]')) {
            generateSqlFromState();
            render();
        }
    });

    render();
    return modalOverlay;
}