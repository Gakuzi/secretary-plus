import { getSettings, saveSettings } from '../utils/storage.js';
import { testProxyConnection, findProxiesWithGemini } from '../services/geminiService.js';
import * as Icons from './icons/Icons.js';

export function createSettingsModal({ settings, supabaseService, onClose, onSave, onLaunchDbWizard }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4';

    let state = {
        isLoading: false,
    };
    
    const showProxyManagerModal = () => {
        const managerContainer = document.createElement('div');
        managerContainer.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50';
        
        let proxyState = {
            saved: [],
            found: [],
            isLoading: false,
            draggedItemId: null
        };

        const renderManager = () => {
            const savedProxiesHtml = proxyState.saved.map((p, index) => {
                 let statusIndicatorClass = 'status-untested';
                 if (p.last_status === 'ok') statusIndicatorClass = 'status-ok';
                 if (p.last_status === 'error') statusIndicatorClass = 'status-error';

                return `
                <div class="proxy-list-item bg-gray-700/50" draggable="true" data-id="${p.id}" data-index="${index}">
                    <div class="flex-shrink-0 cursor-grab text-gray-500" title="Перетащить для изменения приоритета">${Icons.MenuIcon}</div>
                     <label class="toggle-switch" style="transform: scale(0.7); margin: 0 -4px;">
                        <input type="checkbox" data-action="toggle-proxy" data-id="${p.id}" ${p.is_active ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <div class="status-indicator ${statusIndicatorClass}" title="Статус: ${p.last_status || 'untested'}"></div>
                    <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.url}</div>
                    ${p.last_status === 'ok' && p.last_speed_ms ? `<span class="text-xs text-gray-400">${p.last_speed_ms}ms</span>` : ''}
                    <div class="flex items-center gap-1">
                        <button data-action="retest-proxy" data-id="${p.id}" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded">Тест</button>
                        <button data-action="delete-proxy" data-id="${p.id}" class="p-1 text-xs bg-red-800 hover:bg-red-700 rounded-full leading-none">${Icons.TrashIcon.replace('width="24" height="24"', 'width="12" height="12"')}</button>
                    </div>
                </div>`;
            }).join('');

            const foundProxiesHtml = proxyState.found.map(p => `
                 <div class="proxy-list-item">
                    <div class="status-indicator status-untested"></div>
                    <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.location ? `${p.location}: ` : ''}${p.url}</div>
                    <div class="flex items-center gap-1">
                        <button data-action="test-found-proxy" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded">Тест</button>
                        <button data-action="add-proxy-from-found" data-url="${p.url}" data-location="${p.location || ''}" class="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 rounded">Добавить</button>
                    </div>
                </div>`).join('');
            
            managerContainer.innerHTML = `
                <div class="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl flex flex-col h-full sm:h-auto sm:max-h-[80vh] animate-fadeIn">
                    <header class="p-4 border-b border-gray-700 flex justify-between items-center">
                        <h3 class="text-lg font-bold">Менеджер прокси-серверов</h3>
                        <button data-action="close-manager" class="p-2 rounded-full hover:bg-gray-700">&times;</button>
                    </header>
                    <main class="p-4 space-y-4 overflow-y-auto">
                        <div>
                            <h4 class="font-semibold mb-2">Мои прокси (приоритет сверху вниз)</h4>
                            <div id="saved-proxy-list-dnd" class="space-y-2 p-2 bg-gray-900/50 rounded-md min-h-[80px]">
                                ${proxyState.isLoading && proxyState.saved.length === 0 ? '<p class="text-center text-sm text-gray-500">Загрузка...</p>' : proxyState.saved.length === 0 ? '<p class="text-center text-sm text-gray-500">Список пуст.</p>' : savedProxiesHtml}
                            </div>
                        </div>
                        <div>
                            <h4 class="font-semibold mb-2">Поиск прокси</h4>
                            <div id="found-proxy-list" class="space-y-2">
                                ${proxyState.isLoading && proxyState.found.length > 0 ? '<p class="text-center text-sm text-gray-500">Поиск...</p>' : proxyState.found.length > 0 ? foundProxiesHtml : ''}
                            </div>
                        </div>
                    </main>
                    <footer class="p-4 bg-gray-700/50 flex justify-between items-center">
                        <button data-action="add-proxy-manual" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md font-semibold text-sm">Добавить вручную</button>
                        <button data-action="find-proxies-ai" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md font-semibold text-sm" ${proxyState.isLoading ? 'disabled' : ''}>${proxyState.isLoading ? 'Поиск...' : 'Найти с помощью ИИ'}</button>
                    </footer>
                </div>
            `;
        };

        const loadSavedProxies = async () => {
            proxyState.isLoading = true;
            renderManager();
            try {
                proxyState.saved = await supabaseService.getProxies();
            } catch(e) { alert(`Ошибка загрузки прокси: ${e.message}`); }
            finally { 
                proxyState.isLoading = false;
                renderManager();
            }
        };

        const handleManagerAction = async (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            const id = target.dataset.id;
            const url = target.dataset.url;

            switch(action) {
                case 'close-manager': managerContainer.remove(); break;
                case 'toggle-proxy':
                    const is_active = e.target.checked;
                    await supabaseService.updateProxy(id, { is_active });
                    await loadSavedProxies();
                    break;
                case 'delete-proxy':
                    if (confirm('Удалить этот прокси?')) {
                        await supabaseService.deleteProxy(id);
                        await loadSavedProxies();
                    }
                    break;
                case 'find-proxies-ai':
                    proxyState.isLoading = true;
                    proxyState.found = [];
                    renderManager();
                    try {
                        const proxies = await findProxiesWithGemini({ apiKey: settings.geminiApiKey });
                        proxyState.found = proxies;
                    } catch(err) { alert(`Ошибка: ${err.message}`); }
                    finally {
                        proxyState.isLoading = false;
                        renderManager();
                    }
                    break;
                case 'add-proxy-manual': {
                    const newUrl = prompt('Введите URL прокси:');
                    if (newUrl) {
                        try {
                            new URL(newUrl);
                            await supabaseService.addProxy({ url: newUrl.trim(), is_active: true, priority: proxyState.saved.length });
                            await loadSavedProxies();
                        } catch(err) { alert(`Ошибка: ${err.message}`); }
                    }
                    break;
                }
                 case 'add-proxy-from-found':
                    try {
                        await supabaseService.addProxy({ url: url, is_active: true, geolocation: target.dataset.location, priority: proxyState.saved.length });
                        proxyState.found = proxyState.found.filter(p => p.url !== url);
                        await loadSavedProxies();
                    } catch(err) { alert(`Ошибка: ${err.message}`); }
                    break;
                case 'retest-proxy':
                case 'test-found-proxy':
                    target.textContent = '...';
                    target.disabled = true;
                    const result = await testProxyConnection({ proxyUrl: url, apiKey: settings.geminiApiKey });
                     if (id) { // Retesting a saved proxy
                        await supabaseService.updateProxy(id, { last_status: result.status, last_speed_ms: result.speed });
                        await loadSavedProxies();
                     } else { // Testing a found proxy
                        alert(`Тест ${result.status === 'ok' ? 'пройден' : 'не пройден'}\nСкорость: ${result.speed || 'N/A'}\n${result.message}`);
                        target.textContent = 'Тест';
                        target.disabled = false;
                     }
                    break;
            }
        };
        
        // Drag and Drop Logic
        const handleDragAndDrop = (container) => {
            container.addEventListener('dragstart', e => {
                proxyState.draggedItemId = e.target.dataset.id;
                e.target.style.opacity = '0.5';
            });
            container.addEventListener('dragend', e => {
                 e.target.style.opacity = '1';
                 proxyState.draggedItemId = null;
            });
            container.addEventListener('dragover', e => {
                e.preventDefault();
                const afterElement = getDragAfterElement(container, e.clientY);
                const draggable = document.querySelector('[data-id="' + proxyState.draggedItemId + '"]');
                if (afterElement == null) {
                    container.appendChild(draggable);
                } else {
                    container.insertBefore(draggable, afterElement);
                }
            });
            container.addEventListener('drop', async e => {
                e.preventDefault();
                const orderedIds = [...container.querySelectorAll('[data-id]')].map(el => el.dataset.id);
                const updates = orderedIds.map((id, index) => ({ id: id, priority: index }));
                try {
                     await supabaseService.client.from('proxies').upsert(updates);
                     await loadSavedProxies();
                } catch(err) {
                    alert('Не удалось сохранить новый порядок.');
                    await loadSavedProxies();
                }
            });
        };

        function getDragAfterElement(container, y) {
            const draggableElements = [...container.querySelectorAll('[draggable="true"]:not([style*="opacity: 0.5"])')];
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

        managerContainer.addEventListener('click', handleManagerAction);
        managerContainer.addEventListener('change', (e) => {
            if(e.target.closest('[data-action="toggle-proxy"]')) handleManagerAction(e);
        });
        
        renderManager();
        modalElement.appendChild(managerContainer);
        handleDragAndDrop(managerContainer.querySelector('#saved-proxy-list-dnd'));
        loadSavedProxies();
    };

    const render = () => {
        modalElement.innerHTML = `
            <div class="bg-gray-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-lg shadow-xl relative">
                <header class="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                    <h2 class="text-xl font-bold flex items-center gap-2">${Icons.SettingsIcon} Настройки</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-gray-700">&times;</button>
                </header>
                <main class="flex-1 flex flex-col sm:flex-row overflow-hidden">
                    <!-- Tabs and Sidebar -->
                    <nav class="sm:hidden flex-shrink-0 border-b border-gray-700 p-2 flex items-center justify-around gap-2">
                         <a href="#api-keys" class="settings-tab-button active text-center flex-1" data-tab="api-keys">Ключи</a>
                         ${settings.isSupabaseEnabled && supabaseService ? `
                            <a href="#proxy" class="settings-tab-button text-center flex-1" data-tab="proxy">Прокси</a>
                            <a href="#database" class="settings-tab-button text-center flex-1" data-tab="database">База данных</a>
                         ` : ''}
                    </nav>
                    <aside class="hidden sm:flex w-52 border-r border-gray-700 p-4 flex-shrink-0">
                        <nav class="flex flex-col space-y-2 w-full">
                             <a href="#api-keys" class="settings-tab-button active text-left" data-tab="api-keys">Ключи API</a>
                             ${settings.isSupabaseEnabled && supabaseService ? `
                                <a href="#proxy" class="settings-tab-button text-left" data-tab="proxy">Прокси</a>
                                <a href="#database" class="settings-tab-button text-left" data-tab="database">База данных</a>
                             ` : ''}
                        </nav>
                    </aside>
                    <div class="flex-1 p-4 sm:p-6 overflow-y-auto" id="settings-tabs-content">
                        <!-- API Keys Tab -->
                        <div id="tab-api-keys" class="settings-tab-content space-y-6">
                            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                <h3 class="font-semibold text-lg">Ключи и Подключения</h3>
                                <p class="text-xs text-gray-400 mb-4"><a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-blue-400 hover:underline">Получить ключ Gemini API &rarr;</a></p>
                                <div class="space-y-4">
                                    <div>
                                        <label class="text-sm font-medium">Gemini API Key</label>
                                        <input type="password" id="settings-gemini-api-key" class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1" value="${settings.geminiApiKey || ''}">
                                    </div>
                                    ${settings.isSupabaseEnabled && supabaseService ? `
                                    <div>
                                        <label class="text-sm font-medium">URL Управляющего Воркера</label>
                                        <p class="text-xs text-gray-500 mt-1">URL для безопасного управления схемой БД. Можно настроить с помощью мастера на вкладке "База данных".</p>
                                        <input type="url" id="settings-management-worker-url" class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1 font-mono text-sm" placeholder="https://my-worker.example.workers.dev" value="${settings.managementWorkerUrl || ''}">
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>

                        <!-- Proxy Manager Tab -->
                        <div id="tab-proxy" class="settings-tab-content hidden space-y-6">
                           ${settings.isSupabaseEnabled && supabaseService ? `
                             <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                <div class="flex justify-between items-center mb-4">
                                    <div>
                                        <h3 class="font-semibold text-lg">Настройки Прокси</h3>
                                        <p class="text-xs text-gray-400">Используйте прокси-серверы для обхода региональных ограничений Gemini.</p>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <label for="use-proxy-toggle" class="font-medium text-sm">Использовать прокси</label>
                                        <label class="toggle-switch">
                                            <input type="checkbox" id="use-proxy-toggle" ${settings.useProxy ? 'checked' : ''}>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <button data-action="manage-proxies" class="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold">
                                    Управление списком прокси-серверов
                                </button>
                            </div>` : ''}
                        </div>
                        
                         <!-- Database Tab -->
                        <div id="tab-database" class="settings-tab-content hidden space-y-6">
                           ${settings.isSupabaseEnabled && supabaseService ? `
                            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                <h3 class="text-lg font-semibold">Управление базой данных</h3>
                                <p class="text-sm text-gray-400 mt-1 mb-4">
                                   Для безопасного автоматического обновления схемы базы данных требуется настроить "Управляющий воркер".
                                </p>
                                 <button data-action="launch-db-wizard" class="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-semibold">
                                    ${Icons.SettingsIcon}
                                    <span>Запустить мастер настройки</span>
                                </button>
                                <p class="text-xs text-gray-500 mt-4 text-center">
                                    Также вы всегда можете обновить схему вручную, выполнив <a href="https://github.com/user/repo/blob/main/SUPABASE_SETUP.md" target="_blank" class="text-blue-400 hover:underline">актуальный SQL-скрипт</a> в вашем редакторе Supabase.
                                </p>
                            </div>` : ''}
                        </div>
                    </div>
                </main>
                <footer class="p-4 border-t border-gray-700 flex justify-end flex-shrink-0">
                    <button data-action="save" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">Сохранить и закрыть</button>
                </footer>
            </div>`;
    };
    
    const handleAction = async (e) => {
        const tabButton = e.target.closest('.settings-tab-button');
        if (tabButton) {
            e.preventDefault();
            const tabId = tabButton.dataset.tab;

            modalElement.querySelectorAll('.settings-tab-button').forEach(btn => btn.classList.remove('active'));
            modalElement.querySelectorAll(`.settings-tab-button[data-tab="${tabId}"]`).forEach(btn => btn.classList.add('active'));

            modalElement.querySelectorAll('.settings-tab-content').forEach(content => {
                content.classList.toggle('hidden', content.id !== `tab-${tabId}`);
            });
            return;
        }

        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;

        switch(action) {
            case 'close': onClose(); break;
            case 'save': {
                const newSettings = {
                    ...settings,
                    geminiApiKey: modalElement.querySelector('#settings-gemini-api-key').value.trim(),
                    useProxy: modalElement.querySelector('#use-proxy-toggle')?.checked || false,
                    managementWorkerUrl: modalElement.querySelector('#settings-management-worker-url')?.value.trim() || '',
                };
                onSave(newSettings);
                break;
            }
            case 'manage-proxies':
                showProxyManagerModal();
                break;
            case 'launch-db-wizard':
                onLaunchDbWizard();
                break;
        }
    };
    
    modalElement.addEventListener('click', handleAction);
    
    render();
    return modalElement;
}