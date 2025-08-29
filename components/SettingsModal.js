import { getSettings, saveSettings } from '../utils/storage.js';
import { testProxyConnection, findProxiesWithGemini } from '../services/geminiService.js';
import * as Icons from './icons/Icons.js';

export function createSettingsModal({ settings, supabaseService, onClose, onSave, onLaunchDbWizard }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4';
    
    const showProxyManagerModal = () => {
        const managerContainer = document.createElement('div');
        managerContainer.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50';
        
        let proxyState = {
            saved: [],
            found: [],
            isLoading: false,
            draggedItemId: null,
            editingId: null, // To track which proxy is being edited
        };

        const renderManager = () => {
            const savedProxiesHtml = proxyState.saved.map((p, index) => {
                 let statusIndicatorClass = 'status-untested';
                 if (p.last_status === 'ok') statusIndicatorClass = 'status-ok';
                 if (p.last_status === 'error') statusIndicatorClass = 'status-error';
                 if (p.isTesting) statusIndicatorClass = 'status-testing';

                 const isEditing = proxyState.editingId === p.id;
                 const isSomeoneElseEditing = proxyState.editingId !== null && !isEditing;

                 const urlContent = isEditing
                    ? `<input type="text" class="proxy-edit-input w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5 font-mono text-xs" value="${p.url}">`
                    : `<div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.url}</div>`;

                 const actionButtons = isEditing
                    ? `
                        <button data-action="save-edit-proxy" data-id="${p.id}" class="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded">Сохр.</button>
                        <button data-action="cancel-edit-proxy" class="px-2 py-0.5 text-xs bg-slate-500 hover:bg-slate-400 text-white rounded">Отм.</button>
                    `
                    : `
                        <button data-action="edit-proxy" data-id="${p.id}" class="px-2 py-0.5 text-xs bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 text-white rounded" ${isSomeoneElseEditing || p.isTesting ? 'disabled' : ''}>Ред.</button>
                        <button data-action="retest-proxy" data-id="${p.id}" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 text-white rounded" ${isSomeoneElseEditing || p.isTesting ? 'disabled' : ''}>${p.isTesting ? '...' : 'Тест'}</button>
                        <button data-action="delete-proxy" data-id="${p.id}" class="p-1 text-xs bg-red-700 hover:bg-red-600 dark:bg-red-800 dark:hover:bg-red-700 text-white rounded-full leading-none" ${isSomeoneElseEditing || p.isTesting ? 'disabled' : ''}>${Icons.TrashIcon.replace('width="24" height="24"', 'width="12" height="12"')}</button>
                    `;

                return `
                <div class="proxy-list-item bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 ${isSomeoneElseEditing ? 'opacity-50' : ''}" draggable="${!isEditing}" data-id="${p.id}" data-index="${index}">
                    <div class="flex-shrink-0 cursor-grab text-slate-400 dark:text-slate-500" title="Перетащить для изменения приоритета">${Icons.MenuIcon}</div>
                     <label class="toggle-switch" style="transform: scale(0.7); margin: 0 -4px;">
                        <input type="checkbox" data-action="toggle-proxy" data-id="${p.id}" ${p.is_active ? 'checked' : ''} ${isEditing || p.isTesting ? 'disabled' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <div class="status-indicator ${statusIndicatorClass}" title="Статус: ${p.last_status || 'untested'}"></div>
                    ${urlContent}
                    ${p.last_status === 'ok' && p.last_speed_ms ? `<span class="text-xs text-slate-500 dark:text-slate-400">${p.last_speed_ms}ms</span>` : ''}
                    <div class="flex items-center gap-1">
                        ${actionButtons}
                    </div>
                </div>`;
            }).join('');

            const foundProxiesHtml = proxyState.found.map(p => {
                let statusIndicatorClass = 'status-untested';
                if (p.testStatus === 'ok') statusIndicatorClass = 'status-ok';
                if (p.testStatus === 'error') statusIndicatorClass = 'status-error';
                if (p.testStatus === 'testing') statusIndicatorClass = 'status-testing';

                const testButtonText = p.testStatus === 'testing' ? '...' : 'Тест';
                const isTesting = p.testStatus === 'testing';

                return `
                 <div class="proxy-list-item bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700">
                    <div class="status-indicator ${statusIndicatorClass}" title="${p.testMessage || ''}"></div>
                    <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.location ? `${p.location}: ` : ''}${p.url}</div>
                    ${p.testStatus === 'ok' && p.testSpeed ? `<span class="text-xs text-slate-500 dark:text-slate-400">${p.testSpeed}ms</span>` : ''}
                    <div class="flex items-center gap-1">
                        <button data-action="test-found-proxy" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded" ${isTesting ? 'disabled' : ''}>${testButtonText}</button>
                        <button data-action="add-proxy-from-found" data-url="${p.url}" data-location="${p.location || ''}" class="px-2 py-0.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded" ${isTesting ? 'disabled' : ''}>Добавить</button>
                    </div>
                </div>`;
            }).join('');
            
            managerContainer.innerHTML = `
                <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl w-full max-w-3xl flex flex-col h-full sm:h-auto sm:max-h-[80vh] animate-fadeIn">
                    <header class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                        <h3 class="text-lg font-bold">Менеджер прокси-серверов</h3>
                        <button data-action="close-manager" class="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">&times;</button>
                    </header>
                    <main class="p-4 space-y-4 overflow-y-auto bg-slate-50 dark:bg-slate-900/70">
                        <div>
                            <h4 class="font-semibold mb-2">Мои прокси (приоритет сверху вниз)</h4>
                            <div id="saved-proxy-list-dnd" class="space-y-2 p-2 bg-slate-100 dark:bg-slate-900/50 rounded-md min-h-[80px]">
                                ${proxyState.isLoading && proxyState.saved.length === 0 ? '<p class="text-center text-sm text-slate-500">Загрузка...</p>' : proxyState.saved.length === 0 ? '<p class="text-center text-sm text-slate-500">Список пуст.</p>' : savedProxiesHtml}
                            </div>
                        </div>
                        <div>
                            <h4 class="font-semibold mb-2">Поиск прокси</h4>
                            <div id="found-proxy-list" class="space-y-2">
                                ${proxyState.isLoading && proxyState.found.length > 0 ? '<p class="text-center text-sm text-slate-500">Поиск...</p>' : proxyState.found.length > 0 ? foundProxiesHtml : ''}
                            </div>
                        </div>
                    </main>
                    <footer class="p-4 bg-slate-100 dark:bg-slate-700/50 flex justify-between items-center">
                        <button data-action="add-proxy-manual" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md font-semibold text-sm">Добавить вручную</button>
                        <button data-action="find-proxies-ai" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold text-sm" ${proxyState.isLoading ? 'disabled' : ''}>${proxyState.isLoading ? 'Поиск...' : 'Найти с помощью ИИ'}</button>
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
                case 'edit-proxy':
                    proxyState.editingId = id;
                    renderManager();
                    break;
                case 'cancel-edit-proxy':
                    proxyState.editingId = null;
                    renderManager();
                    break;
                case 'save-edit-proxy':
                    const listItemToSave = target.closest('.proxy-list-item');
                    const input = listItemToSave.querySelector('.proxy-edit-input');
                    const newUrl = input.value.trim();
                    if (newUrl) {
                        try {
                            new URL(newUrl);
                            await supabaseService.updateProxy(id, { url: newUrl });
                        } catch (err) {
                            alert(`Неверный URL: ${err.message}`);
                        }
                    }
                    proxyState.editingId = null;
                    await loadSavedProxies();
                    break;

                case 'find-proxies-ai':
                    proxyState.isLoading = true;
                    proxyState.found = [];
                    renderManager();
                    try {
                        const currentSettings = getSettings();
                        const proxies = await findProxiesWithGemini({ apiKey: currentSettings.geminiApiKey, proxyUrl: null });
                        proxyState.found = proxies.map(p => ({ ...p, testStatus: 'untested' }));
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
                case 'retest-proxy': {
                    const proxyToTest = proxyState.saved.find(p => p.id === id);
                    if(proxyToTest) {
                        proxyToTest.isTesting = true;
                        renderManager();
                        const currentSettings = getSettings();
                        const result = await testProxyConnection({ proxyUrl: url, apiKey: currentSettings.geminiApiKey });
                        await supabaseService.updateProxy(id, { last_status: result.status, last_speed_ms: result.speed });
                        await loadSavedProxies(); // Will clear the isTesting flag
                    }
                    break;
                }
                case 'test-found-proxy': {
                     const proxyToTest = proxyState.found.find(p => p.url === url);
                     if(proxyToTest) {
                        proxyToTest.testStatus = 'testing';
                        renderManager();
                        const currentSettings = getSettings();
                        const result = await testProxyConnection({ proxyUrl: url, apiKey: currentSettings.geminiApiKey });
                        proxyToTest.testStatus = result.status;
                        proxyToTest.testSpeed = result.speed;
                        proxyToTest.testMessage = result.message;
                        renderManager();
                     }
                    break;
                }
            }
        };
        
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
            <div id="settings-content" class="bg-white dark:bg-slate-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-lg shadow-xl">
                <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <h2 class="text-xl sm:text-2xl font-bold flex items-center gap-2">${Icons.SettingsIcon} Настройки</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Закрыть настройки">&times;</button>
                </header>

                <main class="flex-1 flex flex-col sm:flex-row overflow-hidden bg-slate-50 dark:bg-slate-900/70">
                    <aside class="w-full sm:w-52 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 p-2 sm:p-4 flex-shrink-0 bg-white dark:bg-slate-800">
                         <nav class="flex flex-row sm:flex-col sm:space-y-2 w-full justify-around">
                            <a href="#connections" class="settings-tab-button text-center sm:text-left active" data-tab="connections">Подключения</a>
                            <a href="#database" class="settings-tab-button text-center sm:text-left" data-tab="database">База данных</a>
                            <a href="#about" class="settings-tab-button text-center sm:text-left" data-tab="about">О приложении</a>
                        </nav>
                    </aside>

                    <div class="flex-1 p-4 sm:p-6 overflow-y-auto" id="settings-tabs-content">
                        <!-- Connections Tab -->
                        <div id="tab-connections" class="settings-tab-content space-y-6">
                            <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">API Ключи</h3>
                                <div class="space-y-4">
                                    <div>
                                        <label for="geminiApiKey" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Gemini API Key</label>
                                        <input type="password" id="geminiApiKey" class="mt-1 block w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" value="${settings.geminiApiKey || ''}">
                                        <p class="mt-1 text-xs text-slate-500">Ключ для доступа к моделям Gemini. <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">Получить ключ</a>.</p>
                                    </div>
                                </div>
                            </div>
                            <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Прокси</h3>
                                <div class="flex items-center justify-between py-2">
                                    <label for="use-proxy-toggle" class="font-medium text-slate-700 dark:text-slate-300">Использовать прокси-серверы</label>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="use-proxy-toggle" ${settings.useProxy ? 'checked' : ''} ${!settings.isSupabaseEnabled ? 'disabled' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <p class="text-xs text-slate-500 mt-1">Необходимо для обхода региональных ограничений. Требует включенного режима Supabase.</p>
                                <button data-action="manage-proxies" class="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md font-semibold text-sm transition-colors ${!settings.isSupabaseEnabled ? 'opacity-50 cursor-not-allowed' : ''}" ${!settings.isSupabaseEnabled ? 'disabled' : ''}>
                                    ${Icons.SettingsIcon} <span>Управление прокси</span>
                                </button>
                                <p class="text-xs text-slate-500 mt-2 text-center">Нет прокси? <a href="#" id="open-help-from-settings" class="text-blue-500 dark:text-blue-400 hover:underline">Следуйте инструкции по настройке</a>.</p>
                            </div>
                        </div>

                        <!-- Database Tab -->
                        <div id="tab-database" class="settings-tab-content hidden space-y-6">
                             <div class="p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Управление Базой Данных</h3>
                                <p class="text-sm text-slate-600 dark:text-slate-400 my-4">Для автоматического обновления схемы базы данных и добавления новых функций используется Управляющий воркер. Если вы столкнулись с ошибками синхронизации, запустите мастер для его настройки или проверки.</p>
                                <div class="text-sm p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 text-blue-800 dark:text-blue-200">
                                    <p class="font-bold mb-2">Зачем это нужно?</p>
                                     <p>Воркер — это безопасный способ для приложения вносить изменения в структуру базы данных, не требуя от вас ручного выполнения SQL-скриптов.</p>
                                </div>
                                <div class="mt-4">
                                    <button data-action="launch-db-wizard" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold text-sm flex items-center justify-center gap-2">
                                        ${Icons.DatabaseIcon}
                                        <span>Запустить мастер настройки БД</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- About Tab -->
                        <div id="tab-about" class="settings-tab-content hidden prose prose-invert max-w-none text-slate-700 dark:text-slate-300">
                            <!-- App info will be injected here -->
                        </div>
                    </div>
                </main>

                <footer class="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center flex-shrink-0">
                    <button data-action="save" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold">Сохранить и закрыть</button>
                </footer>
            </div>
        `;
    };

    const loadAppInfo = async () => {
        try {
            const response = await fetch('./app-info.json');
            const info = await response.json();
            const aboutTab = modalElement.querySelector('#tab-about');
            if (aboutTab) {
                const changelogHtml = info.changelog.map(entry => `
                    <div class="mt-4">
                        <h4 class="font-semibold text-slate-900 dark:text-slate-100">Версия ${entry.version} <span class="text-sm font-normal text-slate-500 dark:text-slate-400">- ${entry.date}</span></h4>
                        <ul class="list-disc list-inside mt-1 text-sm">
                            ${entry.changes.map(change => `<li>${change}</li>`).join('')}
                        </ul>
                    </div>
                `).join('');

                aboutTab.innerHTML = `
                    <h3 class="text-2xl font-bold text-slate-900 dark:text-white">Секретарь+</h3>
                    <p><strong>Версия:</strong> ${info.version}</p>
                    <p><strong>Автор:</strong> ${info.author}</p>
                    <p><strong>Контакт:</strong> <a href="${info.contact}" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline">Telegram</a></p>
                    <h3 class="text-xl font-bold mt-6 text-slate-900 dark:text-white">История изменений</h3>
                    ${changelogHtml}
                `;
            }
        } catch (error) {
            console.error('Failed to load app info:', error);
             const aboutTab = modalElement.querySelector('#tab-about');
             if(aboutTab) aboutTab.innerHTML = '<p>Не удалось загрузить информацию о приложении.</p>';
        }
    };
    
    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        
        switch (action) {
            case 'close':
                onClose();
                break;
            case 'save': {
                const newSettings = { ...settings };
                newSettings.geminiApiKey = modalElement.querySelector('#geminiApiKey').value.trim();
                newSettings.useProxy = modalElement.querySelector('#use-proxy-toggle').checked;
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

    modalElement.addEventListener('click', (e) => {
        if (e.target.closest('#settings-content')) {
             handleAction(e);
             const tabButton = e.target.closest('.settings-tab-button');
             if (tabButton) {
                 e.preventDefault();
                 const tabId = tabButton.dataset.tab;

                 modalElement.querySelectorAll('.settings-tab-button').forEach(btn => btn.classList.remove('active'));
                 modalElement.querySelectorAll(`.settings-tab-button[data-tab="${tabId}"]`).forEach(btn => btn.classList.add('active'));

                 modalElement.querySelectorAll('.settings-tab-content').forEach(content => {
                     content.classList.toggle('hidden', content.id !== `tab-${tabId}`);
                 });
             }
        } else {
            onClose();
        }
    });

    render();
    loadAppInfo();
    
    // Activate initial tab if provided, otherwise default to connections
    const initialTab = 'connections';
    modalElement.querySelectorAll('.settings-tab-button').forEach(btn => btn.classList.remove('active'));
    modalElement.querySelectorAll('.settings-tab-content').forEach(content => content.classList.add('hidden'));

    modalElement.querySelectorAll(`.settings-tab-button[data-tab="${initialTab}"]`).forEach(btn => btn.classList.add('active'));
    const initialTabContent = modalElement.querySelector(`#tab-${initialTab}`);
    if (initialTabContent) {
        initialTabContent.classList.remove('hidden');
    }

    return modalElement;
}
