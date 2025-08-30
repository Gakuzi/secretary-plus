import * as Icons from './icons/Icons.js';
import { testProxyConnection, findProxiesWithGemini, DEFAULT_PROXY_PROMPT } from '../services/geminiService.js';
import { getSettings, saveSettings } from '../utils/storage.js';

// --- SUB-COMPONENTS (MODALS) ---

function createAddManualProxyModal(onAdd, onClose) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[52]';
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 m-4 animate-fadeIn">
            <h3 class="text-lg font-bold mb-4">Добавить прокси вручную</h3>
            <div>
                <label for="proxy-url-input" class="text-sm font-medium">URL прокси-сервера:</label>
                <input type="url" id="proxy-url-input" class="w-full mt-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-sm" placeholder="https://proxy.example.com:8080">
                <p id="proxy-url-error" class="text-xs text-red-500 h-4 mt-1"></p>
            </div>
            <div class="mt-4 flex justify-end gap-2">
                <button data-action="cancel" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Отмена</button>
                <button data-action="add" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold">Добавить</button>
            </div>
        </div>
    `;
    modal.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'cancel' || e.target === modal) {
            onClose();
        } else if (action === 'add') {
            const input = modal.querySelector('#proxy-url-input');
            const errorP = modal.querySelector('#proxy-url-error');
            const url = input.value.trim();
            try {
                new URL(url);
                errorP.textContent = '';
                onAdd(url);
            } catch {
                errorP.textContent = 'Неверный формат URL.';
            }
        }
    });
    return modal;
}

function createAiSettingsModal(currentPrompt, onSave, onClose) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[52] p-4';
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh] animate-fadeIn">
            <header class="p-4 border-b border-slate-200 dark:border-slate-700">
                 <h3 class="text-lg font-bold">Настройки ИИ для поиска прокси</h3>
                 <p class="text-sm text-slate-600 dark:text-slate-400">Измените системный промпт для тонкой настройки поиска.</p>
            </header>
            <main class="p-4 flex-1 overflow-y-auto space-y-4">
                 <div>
                    <label class="font-semibold text-sm">Стандартный системный промпт (для справки):</label>
                    <div class="mt-1 p-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-mono max-h-32 overflow-y-auto">${DEFAULT_PROXY_PROMPT.replace(/\n/g, '<br>')}</div>
                </div>
                <div>
                    <div class="flex justify-between items-center">
                        <label for="ai-prompt-textarea" class="font-semibold text-sm">Ваш кастомный промпт (переопределяет стандартный):</label>
                        <button data-action="reset" class="text-xs font-semibold text-blue-500 hover:underline">Сбросить до стандартного</button>
                    </div>
                    <textarea id="ai-prompt-textarea" class="w-full flex-1 mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono text-xs" rows="8" placeholder="Оставьте пустым, чтобы использовать стандартный промпт...">${currentPrompt}</textarea>
                </div>
            </main>
            <footer class="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                <button data-action="cancel" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md text-sm font-semibold">Отмена</button>
                <button data-action="save" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold">Сохранить</button>
            </footer>
        </div>
    `;
    modal.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        const textarea = modal.querySelector('#ai-prompt-textarea');
        if (action === 'cancel' || e.target === modal) {
            onClose();
        } else if (action === 'save') {
            onSave(textarea.value);
        } else if (action === 'reset') {
            textarea.value = '';
        }
    });
    return modal;
}


function createAiThinkingModal(onClose) {
     const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[52] p-4';
    modal.innerHTML = `
         <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl p-6 m-4 flex flex-col max-h-[80vh] animate-fadeIn">
            <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                <div class="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"></div>
                <span>ИИ в процессе...</span>
            </h3>
            <div id="ai-thinking-log" class="flex-1 space-y-4 overflow-y-auto bg-slate-100 dark:bg-slate-900 p-3 rounded-md text-sm">
                <p class="text-slate-500">Ожидание ответа от Gemini...</p>
            </div>
            <div class="mt-4 flex justify-end">
                 <button data-action="close" class="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-md text-sm font-semibold">Закрыть</button>
            </div>
        </div>
    `;
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-action="close"]')) {
            onClose();
        }
    });
    return modal;
}


// --- MAIN COMPONENT ---

export function createProxyManagerModal({ supabaseService, onClose }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[51] animate-fadeIn';

    let state = {
        activeProxies: [],
        storageProxies: [],
        isLoading: false,
        isTesting: false,
        draggedItemId: null,
        editingId: null,
        testLog: [], // Array of log messages for detailed testing
    };
    let testAbortController = null;

    const render = () => {
        const activeProxiesHtml = state.activeProxies.map(p => `
            <div 
                class="proxy-list-item-active bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700" 
                draggable="true" 
                data-id="${p.id}"
            >
                <span class="drag-handle cursor-grab text-slate-400 dark:text-slate-500">${Icons.MenuIcon}</span>
                <div class="flex-1 min-w-0">
                    <p class="font-mono text-sm truncate" title="${p.url}">${p.url}</p>
                    <p class="text-xs text-slate-500 dark:text-slate-400">${p.geolocation || 'Неизвестно'}</p>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" data-action="deactivate" data-id="${p.id}" checked>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `).join('');

        const storageProxiesHtml = state.storageProxies.map(p => {
            let statusText = 'Не тестировался';
            if (p.last_test_status === 'ok') statusText = 'Успешно';
            if (p.last_test_status === 'error') statusText = 'Ошибка';

            return `
                 <div class="proxy-storage-card bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div class="flex items-center justify-between">
                        <label class="toggle-switch">
                            <input type="checkbox" data-action="toggle-activation" data-id="${p.id}" ${p.is_active ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <div class="flex items-center gap-1">
                            <button data-action="test" data-id="${p.id}" class="px-3 py-1 text-xs bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded font-semibold">Тест</button>
                            <button data-action="delete" data-id="${p.id}" class="p-2 text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full" title="Удалить">${Icons.TrashIcon.replace('width="24" height="24"', 'width="16" height="16"')}</button>
                        </div>
                    </div>
                    <div class="flex-1 flex flex-col min-w-0">
                        <div class="flex-1 font-mono text-sm truncate font-semibold" title="${p.url}">${p.url}</div>
                    </div>
                    <div class="mt-1 pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                         <div class="flex items-center gap-1.5">
                            <span class="font-medium">Статус:</span>
                            <span class="font-bold status-text-${p.last_test_status || 'untested'}">${statusText}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <span class="font-medium">Скорость:</span>
                            <span class="font-semibold text-slate-700 dark:text-slate-200">${p.last_test_speed ? `${p.last_test_speed} мс` : 'N/A'}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <span class="font-medium">Локация:</span>
                            <span class="font-semibold text-slate-700 dark:text-slate-200">${p.geolocation || 'N/A'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        const testLogHtml = state.testLog.map(log => {
            const color = log.status === 'ok' ? 'text-green-400' : (log.status === 'error' ? 'text-red-400' : 'text-slate-400');
            return `<div class="${color} flex justify-between"><span>${log.message}</span><span>${log.speed ? log.speed+' мс' : ''}</span></div>`;
        }).join('');

        modalElement.innerHTML = `
            <div class="bg-slate-50 dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col text-slate-800 dark:text-slate-100">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center flex-shrink-0">
                    <h3 class="text-xl font-bold flex items-center gap-3">${Icons.GlobeIcon} Центр управления прокси</h3>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">&times;</button>
                </header>
                <main class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <!-- Left Column -->
                    <div class="flex flex-col bg-slate-100 dark:bg-slate-800/50">
                        <h4 class="p-3 font-semibold border-b border-slate-200 dark:border-slate-700 flex-shrink-0">Активные прокси (Приоритет)</h4>
                        <div id="active-proxy-list" class="flex-1 p-3 space-y-2 overflow-y-auto">
                            ${state.activeProxies.length > 0 ? activeProxiesHtml : `<p class="text-center text-sm text-slate-500 mt-4">Перетащите прокси из хранилища или активируйте их.</p>`}
                        </div>
                    </div>

                    <!-- Right Column -->
                    <div class="flex flex-col bg-slate-100 dark:bg-slate-800/50">
                        <div class="p-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <h4 class="font-semibold">Хранилище прокси</h4>
                             <button data-action="ai-settings" class="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full" title="Настройки ИИ">${Icons.SettingsIcon}</button>
                        </div>
                        <div class="p-3 bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 flex gap-2 flex-shrink-0">
                            <button data-action="add-manual" class="flex-1 px-3 py-2 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded-md font-semibold text-sm">Добавить вручную</button>
                            <button data-action="find-ai" class="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold text-sm flex items-center justify-center gap-2" ${state.isLoading ? 'disabled' : ''}>
                                ${state.isLoading ? `<div class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>` : Icons.WandIcon.replace('width="24" height="24"', 'width="16" height="16"')}
                                <span>Найти с ИИ</span>
                            </button>
                        </div>
                        <div id="storage-proxy-list" class="flex-1 p-3 space-y-2 overflow-y-auto">
                             ${state.storageProxies.length > 0 ? storageProxiesHtml : `<p class="text-center text-sm text-slate-500 mt-4">Добавьте свой первый прокси-сервер.</p>`}
                        </div>
                    </div>
                </main>
                <footer class="p-3 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <details>
                        <summary class="cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-300">Детальное тестирование</summary>
                        <div class="mt-2 p-3 bg-slate-900 text-slate-200 rounded-md font-mono text-xs space-y-1 max-h-32 overflow-y-auto">
                            <div id="test-log-container">${testLogHtml || '<div class="text-slate-500">Нажмите "Проверить все активные прокси", чтобы начать...</div>'}</div>
                        </div>
                        <div class="mt-2 flex justify-end">
                            <button data-action="test-all" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:bg-slate-500" ${state.isTesting ? 'disabled' : ''}>${state.isTesting ? 'Тестирование...' : 'Проверить все активные прокси'}</button>
                        </div>
                    </details>
                </footer>
                 <div id="sub-modal-container"></div>
            </div>
        `;
    };

    const loadProxies = async () => {
        state.isLoading = true;
        render();
        try {
            const allProxies = await supabaseService.getProxies();
            state.storageProxies = allProxies;
            state.activeProxies = allProxies.filter(p => p.is_active).sort((a, b) => a.priority - b.priority);
        } catch (e) {
            alert(`Ошибка загрузки прокси: ${e.message}`);
        } finally {
            state.isLoading = false;
            render();
            attachDragAndDrop();
        }
    };

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const id = target.dataset.id;
        
        const subModalContainer = modalElement.querySelector('#sub-modal-container');

        switch (action) {
            case 'close': onClose(); break;
            case 'add-manual': {
                const addModal = createAddManualProxyModal(async (url) => {
                    try {
                        await supabaseService.addProxy({ url, is_active: false });
                        await loadProxies();
                        addModal.remove();
                    } catch (err) { alert(`Ошибка: ${err.message}`); }
                }, () => addModal.remove());
                subModalContainer.appendChild(addModal);
                break;
            }
            case 'ai-settings': {
                const currentSettings = getSettings();
                const settingsModal = createAiSettingsModal(currentSettings.customProxyPrompt, async (newPrompt) => {
                     const updatedSettings = { ...currentSettings, customProxyPrompt: newPrompt };
                     await supabaseService.saveUserSettings(updatedSettings); // Save to cloud
                     saveSettings(updatedSettings); // Save locally
                     settingsModal.remove();
                }, () => settingsModal.remove());
                 subModalContainer.appendChild(settingsModal);
                break;
            }
            case 'find-ai': {
                const thinkingModal = createAiThinkingModal(() => thinkingModal.remove());
                subModalContainer.appendChild(thinkingModal);
                const logContainer = thinkingModal.querySelector('#ai-thinking-log');

                state.isLoading = true;
                render();
                try {
                    const existingUrls = state.storageProxies.map(p => p.url);
                    const currentSettings = getSettings();
                    const result = await findProxiesWithGemini({ 
                        apiKey: currentSettings.geminiApiKey, 
                        existingProxies: existingUrls,
                        customPrompt: currentSettings.customProxyPrompt,
                    });
                    
                    logContainer.innerHTML = `
                        <div class="space-y-2">
                            <div><strong class="text-indigo-400">Системный промпт:</strong><pre class="mt-1 text-xs whitespace-pre-wrap font-mono">${result.systemPrompt}</pre></div>
                            <div><strong class="text-indigo-400">Ответ от Gemini (JSON):</strong><pre class="mt-1 text-xs whitespace-pre-wrap font-mono">${result.rawResponse}</pre></div>
                        </div>
                    `;

                    if (result.parsedData.length > 0) {
                        const newProxies = result.parsedData.map(p => ({ url: p.url, geolocation: p.location, is_active: false }));
                        await supabaseService.client.from('proxies').upsert(newProxies, { onConflict: 'user_id,url', ignoreDuplicates: true });
                        await loadProxies();
                    } else {
                         logContainer.innerHTML += `<p class="mt-4 font-bold text-yellow-400">ИИ не нашел новых прокси-серверов.</p>`;
                    }
                } catch(err) {
                    logContainer.innerHTML = `<p class="text-red-400"><strong>Ошибка:</strong> ${err.message}</p>`;
                } finally {
                    state.isLoading = false;
                    render();
                }
                break;
            }
            case 'toggle-activation':
            case 'activate':
            case 'deactivate': {
                const proxy = state.storageProxies.find(p => p.id === id);
                if (proxy) {
                    await supabaseService.updateProxy(id, { is_active: !proxy.is_active });
                    await loadProxies();
                }
                break;
            }
            case 'delete':
                if (confirm('Вы уверены, что хотите удалить этот прокси?')) {
                    await supabaseService.deleteProxy(id);
                    await loadProxies();
                }
                break;
            case 'test': {
                 const proxyToTest = state.storageProxies.find(p => p.id === id);
                 if (proxyToTest) {
                     await runSingleTestAndUpdate(proxyToTest);
                 }
                break;
            }
            case 'test-all': {
                await runAllActiveTests();
                break;
            }
        }
    };

    const runSingleTestAndUpdate = async (proxy) => {
        if(state.isTesting) return;
        state.isTesting = true;
        render();

        try {
            const currentSettings = getSettings();
            if (!currentSettings.geminiApiKey) throw new Error("Ключ Gemini API не найден.");
            
            const result = await testProxyConnection({ 
                proxyUrl: proxy.url, 
                apiKey: currentSettings.geminiApiKey
            });
            
            await supabaseService.updateProxy(proxy.id, { 
                last_test_status: result.status, 
                last_test_speed: result.speed 
            });
            
        } catch (e) {
             await supabaseService.updateProxy(proxy.id, { 
                last_test_status: 'error', 
                last_test_speed: null
            });
        } finally {
            state.isTesting = false;
            await loadProxies();
        }
    };
    
    const runAllActiveTests = async () => {
        if(state.isTesting) return;
        state.isTesting = true;
        state.testLog = [];
        render();

        const proxiesToTest = state.activeProxies;
        if (proxiesToTest.length === 0) {
            state.testLog.push({ message: "Нет активных прокси для тестирования." });
            state.isTesting = false;
            render();
            return;
        }

        const currentSettings = getSettings();
        if (!currentSettings.geminiApiKey) {
             state.testLog.push({ message: "Ошибка: Ключ Gemini API не найден.", status: 'error' });
             state.isTesting = false;
             render();
             return;
        }

        for (const proxy of proxiesToTest) {
            state.testLog.push({ message: `Тестирование ${proxy.url}...` });
            render();

            const result = await testProxyConnection({ proxyUrl: proxy.url, apiKey: currentSettings.geminiApiKey });
            await supabaseService.updateProxy(proxy.id, { last_test_status: result.status, last_test_speed: result.speed });
            
            state.testLog[state.testLog.length - 1] = { ...result, message: `${proxy.url}: ${result.message}` };
            render();
        }

        state.testLog.push({ message: "Тестирование завершено." });
        state.isTesting = false;
        await loadProxies(); // Reload all data with updated statuses
    };
    
    const attachDragAndDrop = () => {
        const container = modalElement.querySelector('#active-proxy-list');
        if (!container) return;

        container.addEventListener('dragstart', e => {
            if (e.target.classList.contains('proxy-list-item-active')) {
                state.draggedItemId = e.target.dataset.id;
                setTimeout(() => e.target.classList.add('dragging'), 0);
            }
        });

        container.addEventListener('dragend', e => {
            if (e.target.classList.contains('proxy-list-item-active')) {
                e.target.classList.remove('dragging');
                state.draggedItemId = null;
            }
        });

        container.addEventListener('dragover', e => {
            e.preventDefault();
            const afterElement = getDragAfterElement(container, e.clientY);
            const draggable = container.querySelector('.dragging');
            if (draggable) {
                if (afterElement == null) {
                    container.appendChild(draggable);
                } else {
                    container.insertBefore(draggable, afterElement);
                }
            }
        });

        container.addEventListener('drop', async e => {
            e.preventDefault();
            const orderedIds = [...container.querySelectorAll('.proxy-list-item-active')].map(el => el.dataset.id);
            const updates = orderedIds.map((id, index) => ({ id: id, priority: index }));
            
            try {
                await supabaseService.client.from('proxies').upsert(updates);
                await loadProxies();
            } catch (err) {
                alert('Не удалось сохранить новый порядок.');
                await loadProxies();
            }
        });
    };

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.proxy-list-item-active:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    modalElement.addEventListener('click', handleAction);
    modalElement.addEventListener('change', (e) => {
        if (e.target.closest('[data-action="toggle-activation"]') || e.target.closest('[data-action="deactivate"]')) {
            handleAction(e);
        }
    });

    render();
    loadProxies();

    return modalElement;
}
