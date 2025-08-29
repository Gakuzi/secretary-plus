import * as Icons from './icons/Icons.js';
import { testProxyConnection, findProxiesWithGemini } from '../services/geminiService.js';
import { getSettings } from '../utils/storage.js';

export function createProxyManagerModal({ supabaseService, onClose }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[51] animate-fadeIn';

    let state = {
        activeProxies: [],
        storageProxies: [],
        testResult: null,
        isLoading: false,
        isTesting: false,
        draggedItemId: null,
        editingId: null,
    };
    let testAbortController = null;

    const render = () => {
        // --- Left Column: Active Proxies ---
        const activeProxiesHtml = state.activeProxies.map(p => {
            const isEditing = state.editingId === p.id;
            const isSomeoneElseEditing = state.editingId !== null && !isEditing;
            const isDraggable = !isEditing && !isSomeoneElseEditing;
            
            return `
                <div 
                    class="proxy-list-item-active bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${isSomeoneElseEditing ? 'opacity-50' : ''}" 
                    draggable="${isDraggable}" 
                    data-id="${p.id}"
                >
                    <span class="drag-handle cursor-grab text-slate-400 dark:text-slate-500">${Icons.MenuIcon}</span>
                    <div class="flex-1 min-w-0">
                        <p class="font-mono text-sm truncate" title="${p.url}">${p.url}</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${p.geolocation || 'Неизвестно'}</p>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" data-action="deactivate" data-id="${p.id}" checked ${isDraggable ? '' : 'disabled'}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            `;
        }).join('');

        // --- Middle Column: Proxy Storage ---
        const storageProxiesHtml = state.storageProxies.map(p => {
            const isEditing = state.editingId === p.id;
            const isSomeoneElseEditing = state.editingId !== null && !isEditing;
            const isDisabled = isEditing || isSomeoneElseEditing || state.isTesting;

            const actionButtons = isEditing
                ? `
                    <button data-action="save-edit" data-id="${p.id}" class="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded font-semibold">Сохранить</button>
                    <button data-action="cancel-edit" class="px-2 py-1 text-xs bg-slate-500 hover:bg-slate-600 text-white rounded">Отмена</button>
                `
                : `
                    <button data-action="test" data-url="${p.url}" class="px-3 py-1 text-xs bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded font-semibold disabled:opacity-50" ${isDisabled ? 'disabled' : ''}>Тест</button>
                    <button data-action="edit" data-id="${p.id}" class="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full disabled:opacity-50" title="Редактировать" ${isDisabled ? 'disabled' : ''}>${Icons.SettingsIcon.replace('width="24" height="24"', 'width="16" height="16"')}</button>
                    <button data-action="delete" data-id="${p.id}" class="p-2 text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full disabled:opacity-50" title="Удалить" ${isDisabled ? 'disabled' : ''}>${Icons.TrashIcon.replace('width="24" height="24"', 'width="16" height="16"')}</button>
                `;
            
            let statusText = 'Не тестировался';
            if (p.last_test_status === 'ok') statusText = 'Успешно';
            if (p.last_test_status === 'error') statusText = 'Ошибка';

            return `
                 <div class="proxy-storage-card bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${isSomeoneElseEditing ? 'opacity-50' : ''}">
                    <div class="flex items-center justify-between">
                        <label class="toggle-switch">
                            <input type="checkbox" data-action="toggle-activation" data-id="${p.id}" ${p.is_active ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <div class="flex items-center gap-1">${actionButtons}</div>
                    </div>
                    <div class="flex-1 flex flex-col min-w-0">
                         ${isEditing
                            ? `<input type="text" class="proxy-edit-input flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 font-mono text-sm" value="${p.url}">`
                            : `<div class="flex-1 font-mono text-sm truncate font-semibold" title="${p.url}">${p.url}</div>`
                          }
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

        // --- Right Column: Test Results ---
        let testResultHtml = `
            <div class="flex flex-col items-center justify-center h-full text-center text-slate-500 dark:text-slate-400 p-4">
                ${Icons.CodeIcon.replace('width="24" height="24"', 'width="48" height="48"')}
                <p class="mt-4 font-semibold">Результаты тестирования</p>
                <p class="text-sm mt-1">Выберите прокси из хранилища и нажмите "Тест", чтобы увидеть подробный отчет.</p>
            </div>
        `;
        if (state.isTesting) {
            testResultHtml = `
                 <div class="flex flex-col h-full p-4">
                    <h4 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Тестирование...</h4>
                    <p class="font-mono text-sm break-all mb-4 text-slate-500 dark:text-slate-400">${state.testResult?.url}</p>
                    <div id="test-log" class="flex-1 space-y-2 text-sm overflow-y-auto bg-slate-900 text-slate-300 font-mono p-3 rounded-md"></div>
                    <button data-action="cancel-test" class="mt-4 w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md">Отменить</button>
                 </div>
            `;
        } else if (state.testResult) {
            const r = state.testResult;
            const isSuccess = r.status === 'ok';
            testResultHtml = `
                 <div class="p-4">
                    <h4 class="text-lg font-bold mb-2">Отчет о тестировании</h4>
                    <p class="font-mono text-sm break-all mb-4 text-slate-500 dark:text-slate-400">${r.url}</p>
                    <div class="p-4 rounded-lg ${isSuccess ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'} border">
                        <div class="flex items-center gap-3">
                            <span class="w-8 h-8 ${isSuccess ? 'text-green-500' : 'text-red-500'}">${isSuccess ? Icons.CheckSquareIcon : Icons.AlertTriangleIcon}</span>
                            <span class="text-xl font-bold ${isSuccess ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}">${isSuccess ? 'УСПЕШНО' : 'ОШИБКА'}</span>
                        </div>
                        <div class="mt-4 space-y-2 text-sm">
                            <div class="flex justify-between"><span class="text-slate-500 dark:text-slate-400">Скорость (Gemini):</span> <span class="font-semibold">${r.speed !== null ? `${r.speed} мс` : 'N/A'}</span></div>
                            <div class="flex justify-between"><span class="text-slate-500 dark:text-slate-400">Геолокация:</span> <span class="font-semibold">${r.location || 'Неизвестно'}</span></div>
                        </div>
                    </div>
                    <div class="mt-4 p-3 bg-slate-100 dark:bg-slate-900/50 rounded-md">
                        <p class="font-semibold text-sm mb-1">Расшифровка:</p>
                        <p class="text-sm text-slate-600 dark:text-slate-300">${r.details}</p>
                    </div>
                 </div>
            `;
        }

        modalElement.innerHTML = `
            <div class="bg-slate-50 dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col text-slate-800 dark:text-slate-100">
                <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center flex-shrink-0">
                    <h3 class="text-xl font-bold flex items-center gap-3">${Icons.CodeIcon} Центр управления прокси</h3>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">&times;</button>
                </header>
                <main class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <!-- Left Column -->
                    <div class="flex flex-col bg-slate-100 dark:bg-slate-800/50">
                        <h4 class="p-3 font-semibold border-b border-slate-200 dark:border-slate-700 flex-shrink-0">Активные прокси (Приоритет)</h4>
                        <div id="active-proxy-list" class="flex-1 p-3 space-y-2 overflow-y-auto">
                            ${state.activeProxies.length > 0 ? activeProxiesHtml : `<p class="text-center text-sm text-slate-500 mt-4">Перетащите прокси из хранилища или активируйте их.</p>`}
                        </div>
                    </div>

                    <!-- Middle Column -->
                    <div class="flex flex-col bg-slate-100 dark:bg-slate-800/50">
                        <h4 class="p-3 font-semibold border-b border-slate-200 dark:border-slate-700 flex-shrink-0">Хранилище прокси</h4>
                        <div class="p-3 bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 flex gap-2 flex-shrink-0">
                            <button data-action="add-manual" class="flex-1 px-3 py-2 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded-md font-semibold text-sm">Добавить вручную</button>
                            <button data-action="find-ai" class="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold text-sm flex items-center justify-center gap-2" ${state.isLoading ? 'disabled' : ''}>
                                ${state.isLoading ? `<div class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>` : Icons.WandIcon.replace('width="24" height="24"', 'width="16" height="16"')}
                                <span>Найти с ИИ</span>
                            </button>
                        </div>
                        <div class="flex-1 p-3 space-y-2 overflow-y-auto">
                             ${state.storageProxies.length > 0 ? storageProxiesHtml : `<p class="text-center text-sm text-slate-500 mt-4">Добавьте свой первый прокси-сервер.</p>`}
                        </div>
                    </div>

                    <!-- Right Column -->
                    <div class="flex flex-col bg-white dark:bg-slate-800">
                        <div id="test-results-panel" class="flex-1 overflow-y-auto">
                            ${testResultHtml}
                        </div>
                    </div>
                </main>
            </div>
        `;
    };

    const loadProxies = async () => {
        state.isLoading = true;
        render();
        try {
            const allProxies = await supabaseService.getProxies();
            state.storageProxies = allProxies;
            state.activeProxies = allProxies.filter(p => p.is_active);
        } catch (e) {
            alert(`Ошибка загрузки прокси: ${e.message}`);
        } finally {
            state.isLoading = false;
            render();
        }
    };

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const id = target.dataset.id;
        const url = target.dataset.url;

        switch (action) {
            case 'close': onClose(); break;
            case 'add-manual': {
                const newUrl = prompt('Введите полный URL прокси-сервера (например, https://proxy.example.com:8080):');
                if (newUrl) {
                    try {
                        new URL(newUrl);
                        await supabaseService.addProxy({ url: newUrl.trim(), is_active: false });
                        await loadProxies();
                    } catch (err) { alert(`Ошибка: неверный формат URL.`); }
                }
                break;
            }
            case 'find-ai': {
                state.isLoading = true;
                render();
                try {
                    const existingUrls = state.storageProxies.map(p => p.url);
                    const currentSettings = getSettings();
                    const found = await findProxiesWithGemini({ apiKey: currentSettings.geminiApiKey, existingProxies: existingUrls });
                    if (found.length > 0) {
                        const newProxies = found.map(p => ({ url: p.url, geolocation: p.location, is_active: false }));
                        await supabaseService.client.from('proxies').insert(newProxies);
                        await loadProxies();
                    } else {
                         alert('ИИ не смог найти новые прокси. Попробуйте позже.');
                    }
                } catch(err) {
                    alert(`Ошибка при поиске с ИИ: ${err.message}`);
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
            case 'edit':
                state.editingId = id;
                render();
                break;
            case 'cancel-edit':
                state.editingId = null;
                render();
                break;
            case 'save-edit': {
                const input = modalElement.querySelector('.proxy-edit-input');
                const newUrl = input.value.trim();
                if (newUrl) {
                    try {
                        new URL(newUrl);
                        await supabaseService.updateProxy(id, { url: newUrl });
                    } catch (err) { alert('Неверный формат URL.'); }
                }
                state.editingId = null;
                await loadProxies();
                break;
            }
            case 'delete':
                if (confirm('Вы уверены, что хотите удалить этот прокси?')) {
                    await supabaseService.deleteProxy(id);
                    await loadProxies();
                }
                break;
            case 'test':
                await runTest(url);
                break;
            case 'cancel-test':
                if (testAbortController) {
                    testAbortController.abort();
                }
                break;
        }
    };

    const runTest = async (url) => {
        if(state.isTesting) return;
        const proxyToUpdate = state.storageProxies.find(p => p.url === url);

        testAbortController = new AbortController();
        state.isTesting = true;
        state.testResult = { url };
        render();

        const logEl = modalElement.querySelector('#test-log');
        const log = (msg) => {
            if (logEl) logEl.innerHTML += `<div>> ${msg}</div>`;
            logEl.scrollTop = logEl.scrollHeight;
        };

        try {
            log('Инициализация...');
            const currentSettings = getSettings();
            if (!currentSettings.geminiApiKey) {
                throw new Error("Ключ Gemini API не найден в настройках.");
            }
            
            log('Подключение к прокси...');
            const result = await testProxyConnection({ 
                proxyUrl: url, 
                apiKey: currentSettings.geminiApiKey,
                signal: testAbortController.signal
            });
            
            let details = '';
            if (result.status === 'ok') {
                details = `Прокси успешно соединился с Gemini API. Скорость ответа (${result.speed} мс) — это полное время, за которое был отправлен тестовый запрос и получен ответ. Отличный результат!`;
            } else if (result.status === 'cancelled') {
                 details = "Тест был отменен пользователем.";
            } else {
                 if (result.message.includes('Тайм-аут')) {
                    details = "Прокси-сервер не ответил в течение 15 секунд. Вероятно, он отключен, перегружен или блокирует запросы.";
                 } else if (result.message.includes('CORS')) {
                    details = "Прокси не настроен для работы с веб-приложениями. Требуется настройка CORS-заголовков (Access-Control-Allow-Origin).";
                 } else if (result.message.includes('API ключ')) {
                    details = "Прокси работает, но ваш Gemini API ключ недействителен. Проверьте ключ в основных настройках.";
                 } else {
                    details = `Произошла неизвестная ошибка: ${result.message}`;
                 }
            }
            
            state.testResult = { ...result, url, details, location: proxyToUpdate?.geolocation };
            
            if (proxyToUpdate) {
                await supabaseService.updateProxy(proxyToUpdate.id, { 
                    last_test_status: result.status, 
                    last_test_speed: result.speed 
                });
                proxyToUpdate.last_test_status = result.status;
                proxyToUpdate.last_test_speed = result.speed;
            }

        } catch (e) {
            state.testResult = { status: 'error', url, speed: null, message: e.message, details: `Критическая ошибка при попытке теста: ${e.message}` };
        } finally {
            state.isTesting = false;
            testAbortController = null;
            render();
        }
    };
    
    // --- Drag and Drop Logic ---
    const handleDragAndDrop = () => {
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
                // We only need to update the priority of the reordered items.
                await supabaseService.client.from('proxies').upsert(updates);
                await loadProxies(); // Reload to confirm order
            } catch (err) {
                alert('Не удалось сохранить новый порядок.');
                await loadProxies(); // Revert to original order on failure
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
    // Use setTimeout to ensure the element is in the DOM before attaching D&D listeners
    setTimeout(handleDragAndDrop, 0);

    return modalElement;
}