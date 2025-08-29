import { getSettings, saveSettings } from '../utils/storage.js';
import { testProxyConnection, findProxiesWithGemini } from '../services/geminiService.js';
import * as Icons from './icons/Icons.js';

export function createSettingsModal({ settings, supabaseService, onClose, onSave }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4';

    let state = {
        isLoading: false,
        isUpdatingSchema: false,
        savedProxies: [],
        foundProxies: [],
    };
    
    // This function creates and manages the new interactive proxy test modal.
    const showProxyTestModal = ({ url, id, isFoundProxy }) => {
        const testModalContainer = modalElement.querySelector('#proxy-test-modal-container');
        if (!testModalContainer) return;

        let testState = {
            status: 'idle', // 'idle', 'testing', 'result'
            result: null,
        };
        
        const renderTestModalContent = () => {
            let content = '';
            switch (testState.status) {
                case 'testing':
                    content = `
                        <div class="text-center p-8">
                            <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                            <p class="mt-4 text-gray-300">Выполняется тест...</p>
                        </div>
                    `;
                    break;
                case 'result':
                    const isSuccess = testState.result.status === 'ok';
                    content = `
                        <div class="p-6 text-center">
                             <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isSuccess ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
                                ${isSuccess ? Icons.CheckSquareIcon.replace(/width="24" height="24"/, 'width="40" height="40"') : Icons.AlertTriangleIcon.replace(/width="24" height="24"/, 'width="40" height="40"')}
                            </div>
                            <h4 class="text-xl font-bold">${isSuccess ? 'Тест пройден успешно' : 'Тест не пройден'}</h4>
                            <div class="mt-4 space-y-2 text-sm text-left bg-gray-900 p-4 rounded-lg">
                                <div class="test-result-item"><span class="test-result-label">Статус:</span> <span class="test-result-value ${isSuccess ? 'text-green-400' : 'text-red-400'}">${testState.result.status}</span></div>
                                <div class="test-result-item"><span class="test-result-label">Скорость:</span> <span class="test-result-value">${testState.result.speed !== null ? `${testState.result.speed}ms` : 'N/A'}</span></div>
                                <div class="test-result-item"><span class="test-result-label">Геолокация:</span> <span class="test-result-value">${testState.result.geolocation || 'N/A'}</span></div>
                                ${!isSuccess ? `<div class="pt-2 border-t border-gray-700 mt-2"><p class="test-result-label">Сообщение:</p><p class="text-red-300 text-xs mt-1">${testState.result.message}</p></div>` : ''}
                            </div>
                        </div>
                        <footer class="p-4 bg-gray-700/50 flex justify-end gap-3">
                            ${isSuccess && isFoundProxy ? `<button data-action="add-tested-proxy" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold text-sm">Добавить в мой список</button>` : ''}
                            <button data-action="close-test-modal" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md font-semibold text-sm">Закрыть</button>
                        </footer>
                    `;
                    break;
                case 'idle':
                default:
                    content = `
                        <div class="p-6 text-center">
                            <h4 class="text-xl font-bold">Готовы к тесту?</h4>
                            <p class="font-mono text-sm bg-gray-900 p-2 rounded-md my-4 break-all">${url}</p>
                        </div>
                        <footer class="p-4 bg-gray-700/50 flex justify-end gap-3">
                            <button data-action="cancel-test-modal" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md font-semibold text-sm">Отмена</button>
                            <button data-action="start-test" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold text-sm">Начать тест</button>
                        </footer>
                    `;
                    break;
            }
            return content;
        };

        const runTest = async () => {
            testState.status = 'testing';
            renderTestModal();
            const result = await testProxyConnection({ proxyUrl: url });
            testState.result = result;
            testState.status = 'result';
            
            // If the test was successful for an existing proxy, update it in the DB immediately.
            if (result.status === 'ok' && id) {
                await supabaseService.updateProxy(id, {
                    last_status: result.status,
                    last_speed_ms: result.speed,
                    geolocation: result.geolocation
                });
                await loadSavedProxies(); // Refresh list in the background
            }
            
            renderTestModal();
        };

        const renderTestModal = () => {
            testModalContainer.innerHTML = `
                <div class="absolute inset-0 bg-black/70 flex items-center justify-center p-4 z-20">
                    <div class="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden animate-fadeIn">
                         <header class="p-4 border-b border-gray-700">
                            <h3 class="text-lg font-bold">Тестирование прокси</h3>
                         </header>
                         <main id="test-modal-main-content">
                            ${renderTestModalContent()}
                         </main>
                    </div>
                </div>`;
        };
        
        const closeTestModal = () => {
            testModalContainer.innerHTML = '';
        };

        testModalContainer.onclick = async (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;

            switch(action) {
                case 'start-test': await runTest(); break;
                case 'close-test-modal':
                case 'cancel-test-modal': closeTestModal(); break;
                case 'add-tested-proxy':
                     try {
                        await supabaseService.addProxy({ 
                            url: url, 
                            last_status: 'ok',
                            last_speed_ms: testState.result.speed,
                            geolocation: testState.result.geolocation,
                            is_active: true,
                        });
                        state.foundProxies = state.foundProxies.filter(p => p.url !== url);
                        await loadSavedProxies();
                        closeTestModal();
                    } catch (err) {
                        alert(`Не удалось сохранить прокси: ${err.message}`);
                    }
                    break;
            }
        };

        renderTestModal();
    };

    const render = () => {
        const savedProxiesHtml = renderSavedProxies();
        const foundProxiesHtml = renderFoundProxies();
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
                                        <p class="text-xs text-gray-500 mt-1">URL для безопасного управления схемой БД. <a href="#" id="open-help-from-settings" class="text-blue-400 hover:underline">Инструкцию по его созданию можно найти здесь.</a></p>
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
                                        <h3 class="font-semibold text-lg">Менеджер Прокси</h3>
                                        <p class="text-xs text-gray-400">Используйте ИИ для поиска и тестирования прокси-серверов.</p>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <label for="use-proxy-toggle" class="font-medium text-sm">Использовать прокси</label>
                                        <label class="toggle-switch">
                                            <input type="checkbox" id="use-proxy-toggle" ${settings.useProxy ? 'checked' : ''}>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <div class="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <h4 class="font-semibold mb-2">Ваши прокси-серверы</h4>
                                        <div id="saved-proxy-list" class="space-y-2 max-h-48 overflow-y-auto pr-2">
                                            ${savedProxiesHtml}
                                        </div>
                                        <button data-action="add-proxy" class="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold">
                                            Добавить вручную
                                        </button>
                                    </div>
                                    <div>
                                         <button data-action="find-proxies" class="w-full mb-3 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-semibold" ${state.isLoading ? 'disabled' : ''}>
                                            ${state.isLoading ? 'Поиск...' : 'Найти прокси с помощью ИИ'}
                                         </button>
                                         <h4 class="font-semibold mb-2">Найденные прокси</h4>
                                         <div id="found-proxy-list" class="space-y-2 max-h-40 overflow-y-auto pr-2">
                                            ${foundProxiesHtml}
                                         </div>
                                    </div>
                                </div>
                            </div>` : ''}
                        </div>
                        
                         <!-- Database Tab -->
                        <div id="tab-database" class="settings-tab-content hidden space-y-6">
                           ${settings.isSupabaseEnabled && supabaseService ? `
                            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                <h3 class="text-lg font-semibold">Управление схемой базы данных</h3>
                                <p class="text-sm text-gray-400 mt-1 mb-4">
                                    Эта функция безопасно обновит структуру таблиц в вашей базе Supabase до последней версии, не удаляя данные.
                                </p>
                                <div class="text-sm p-3 rounded-md bg-yellow-900/30 border border-yellow-700 text-yellow-300">
                                    <p class="font-bold">Требование:</p>
                                    <p>Для работы этой функции необходимо указать "URL Управляющего Воркера" на вкладке "Ключи API".</p>
                                </div>
                                <button data-action="update-schema" class="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-md font-semibold transition-colors disabled:bg-gray-700/50 disabled:cursor-not-allowed" ${state.isUpdatingSchema ? 'disabled' : ''}>
                                    ${state.isUpdatingSchema ? '<div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div> Обновление...' : 'Проверить и обновить схему'}
                                </button>
                                <div id="schema-update-status" class="text-center text-sm mt-3 h-5"></div>
                            </div>` : ''}
                        </div>
                    </div>
                </main>
                <footer class="p-4 border-t border-gray-700 flex justify-end flex-shrink-0">
                    <button data-action="save" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">Сохранить и закрыть</button>
                </footer>
                <div id="proxy-test-modal-container"></div>
            </div>`;
    };
    
    const renderSavedProxies = () => {
        if (state.savedProxies.length === 0) return `<p class="text-sm text-gray-500 text-center py-4">Нет сохраненных прокси.</p>`;
        return state.savedProxies.map(p => {
            let statusIndicatorClass = 'status-untested';
            if (p.last_status === 'ok') statusIndicatorClass = 'status-ok';
            if (p.last_status === 'error') statusIndicatorClass = 'status-error';

            return `
            <div class="proxy-list-item">
                <label class="toggle-switch" style="transform: scale(0.7); margin-left: -8px; margin-right: -4px;">
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
    };
    
    const renderFoundProxies = () => {
        if (state.isLoading) return `<p class="text-sm text-gray-500 text-center py-4">Поиск...</p>`;
        if (state.foundProxies.length === 0) return `<p class="text-sm text-gray-500 text-center py-4">Нажмите "Найти", чтобы начать.</p>`;
        return state.foundProxies.map(p => {
            return `
             <div class="proxy-list-item">
                <div class="status-indicator status-untested"></div>
                <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.location ? `${p.location}: ` : ''}${p.url}</div>
                <button data-action="test-proxy" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded">Тест</button>
            </div>`;
        }).join('');
    };
    
    const loadSavedProxies = async () => {
        if (!supabaseService) return;
        state.isLoading = true;
        render();
        try {
            state.savedProxies = await supabaseService.getProxies();
        } catch (e) {
            alert(`Ошибка загрузки прокси: ${e.message}`);
        } finally {
            state.isLoading = false;
            render();
        }
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

        if (e.target.dataset.action === 'toggle-proxy') {
            const id = e.target.dataset.id;
            const is_active = e.target.checked;
            const proxy = state.savedProxies.find(p => p.id == id);
            if(proxy) {
                 proxy.is_active = is_active;
                 try {
                    await supabaseService.updateProxy(id, { is_active });
                 } catch(err) {
                    alert('Не удалось обновить статус прокси');
                    proxy.is_active = !is_active; 
                    render();
                 }
            }
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
            case 'add-proxy': {
                const url = prompt('Введите URL прокси-сервера (например, https://proxy.example.com:8443):');
                if (url) {
                    try {
                        new URL(url);
                        await supabaseService.addProxy({ url: url.trim(), is_active: false });
                        await loadSavedProxies();
                    } catch (err) {
                        alert(`Ошибка: неверный URL или не удалось сохранить прокси.\n\n${err.message}`);
                    }
                }
                break;
            }
            case 'find-proxies': {
                state.isLoading = true;
                state.foundProxies = [];
                render();
                try {
                    const proxies = await findProxiesWithGemini({ apiKey: settings.geminiApiKey, proxyUrl: null });
                    state.foundProxies = proxies;
                } catch (err) {
                    alert(`Ошибка поиска прокси: ${err.message}`);
                } finally {
                    state.isLoading = false;
                    render();
                }
                break;
            }
            case 'test-proxy':
            case 'retest-proxy': {
                const url = target.dataset.url;
                const id = target.dataset.id || null;
                const isFoundProxy = !id;
                showProxyTestModal({ url, id, isFoundProxy });
                break;
            }
            case 'delete-proxy': {
                if (confirm('Удалить этот прокси?')) {
                    await supabaseService.deleteProxy(target.dataset.id);
                    await loadSavedProxies();
                }
                break;
            }
            case 'update-schema': {
                const statusEl = modalElement.querySelector('#schema-update-status');
                const workerUrl = modalElement.querySelector('#settings-management-worker-url')?.value.trim();

                if (!workerUrl) {
                    statusEl.textContent = 'Ошибка: URL Управляющего Воркера не указан.';
                    statusEl.className = 'text-center text-sm mt-3 h-5 text-red-400';
                    return;
                }

                state.isUpdatingSchema = true;
                render(); 
                statusEl.textContent = 'Загрузка актуального скрипта...';
                statusEl.className = 'text-center text-sm mt-3 h-5 text-gray-400';

                try {
                    const response = await fetch('./SUPABASE_SETUP.md');
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const markdown = await response.text();
                    const sqlMatch = markdown.match(/```sql\n([\s\S]*?)\n```/);
                    const sqlScript = sqlMatch ? sqlMatch[1].trim() : null;

                    if (!sqlScript) {
                        throw new Error('Не удалось извлечь SQL-скрипт из SUPABASE_SETUP.md');
                    }
                    
                    statusEl.textContent = 'Отправка запроса на обновление...';
                    await supabaseService.executeSql(workerUrl, sqlScript);

                    statusEl.textContent = 'Схема базы данных успешно обновлена!';
                    statusEl.className = 'text-center text-sm mt-3 h-5 text-green-400';
                } catch (error) {
                    console.error("Schema update failed:", error);
                    statusEl.textContent = `Ошибка: ${error.message}`;
                    statusEl.className = 'text-center text-sm mt-3 h-5 text-red-400';
                } finally {
                    state.isUpdatingSchema = false;
                    setTimeout(() => render(), 500);
                }
                break;
            }
        }
    };
    
    modalElement.addEventListener('click', handleAction);
    modalElement.addEventListener('change', handleAction);
    
    render();
    if (settings.isSupabaseEnabled && supabaseService) {
        loadSavedProxies();
    }
    return modalElement;
}