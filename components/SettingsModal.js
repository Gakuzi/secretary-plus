import { getSettings, saveSettings } from '../utils/storage.js';
import { testProxyConnection, findProxiesWithGemini } from '../services/geminiService.js';
import * as Icons from './icons/Icons.js';

export function createSettingsModal({ settings, supabaseService, onClose, onSave }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';

    let state = {
        isLoading: false,
        statusMessage: '',
        savedProxies: [],
        foundProxies: [],
        testingProxyUrl: null,
        testingProxyId: null,
    };
    
    const render = () => {
        modalElement.innerHTML = `
            <div class="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <header class="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 class="text-xl font-bold flex items-center gap-2">${Icons.SettingsIcon} Настройки</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-gray-700">&times;</button>
                </header>
                <main class="flex-1 p-6 overflow-y-auto space-y-6">
                    <!-- API Keys Section -->
                    <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                        <h3 class="font-semibold text-lg">Ключи API</h3>
                        <p class="text-xs text-gray-400 mb-4"><a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-blue-400 hover:underline">Получить ключ Gemini API &rarr;</a></p>
                        <div>
                            <label class="text-sm font-medium">Gemini API Key</label>
                            <input type="password" id="settings-gemini-api-key" class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1" value="${settings.geminiApiKey || ''}">
                        </div>
                    </div>

                    <!-- Proxy Manager Section -->
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
                            <!-- Left Panel: Saved Proxies -->
                            <div>
                                <h4 class="font-semibold mb-2">Ваши прокси-серверы</h4>
                                <div id="saved-proxy-list" class="space-y-2 max-h-48 overflow-y-auto pr-2">
                                    ${renderSavedProxies()}
                                </div>
                            </div>
                            <!-- Right Panel: AI Finder -->
                            <div>
                                 <button data-action="find-proxies" class="w-full mb-3 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-semibold" ${state.isLoading ? 'disabled' : ''}>
                                    ${state.isLoading && !state.testingProxyUrl ? 'Поиск...' : 'Найти прокси с помощью ИИ'}
                                 </button>
                                 <h4 class="font-semibold mb-2">Найденные прокси</h4>
                                 <div id="found-proxy-list" class="space-y-2 max-h-40 overflow-y-auto pr-2">
                                    ${renderFoundProxies()}
                                 </div>
                            </div>
                        </div>
                    </div>` : ''}
                </main>
                <footer class="p-4 border-t border-gray-700 flex justify-end">
                    <button data-action="save" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">Сохранить и закрыть</button>
                </footer>
                
                <!-- Proxy Test Modal -->
                <div id="proxy-test-modal" class="hidden fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div id="proxy-test-modal-content" class="bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 flex flex-col items-center justify-center text-center">
                        <!-- Content is rendered dynamically -->
                    </div>
                </div>
            </div>`;
    };
    
    const renderSavedProxies = () => {
        if (state.savedProxies.length === 0) return `<p class="text-sm text-gray-500 text-center py-4">Нет сохраненных прокси.</p>`;
        return state.savedProxies.map(p => `
            <div class="proxy-list-item">
                <label class="toggle-switch" style="transform: scale(0.7); margin-left: -8px; margin-right: -4px;">
                    <input type="checkbox" data-action="toggle-proxy" data-id="${p.id}" ${p.is_active ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <div class="status-indicator ${p.last_status === 'ok' ? 'status-ok' : p.last_status === 'error' ? 'status-error' : 'status-untested'}" title="Статус: ${p.last_status}"></div>
                <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.url}</div>
                <div class="flex items-center gap-1">
                    <button data-action="retest-proxy" data-id="${p.id}" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded">Тест</button>
                    <button data-action="delete-proxy" data-id="${p.id}" class="p-1 text-xs bg-red-800 hover:bg-red-700 rounded-full leading-none">${Icons.TrashIcon.replace('width="24" height="24"', 'width="12" height="12"')}</button>
                </div>
            </div>
        `).join('');
    };
    
    const renderFoundProxies = () => {
        if (state.isLoading && !state.testingProxyUrl) return `<p class="text-sm text-gray-500 text-center py-4">Поиск...</p>`;
        if (state.foundProxies.length === 0) return `<p class="text-sm text-gray-500 text-center py-4">Нажмите "Найти", чтобы начать.</p>`;
        return state.foundProxies.map(p => `
             <div class="proxy-list-item">
                <div class="status-indicator status-untested"></div>
                <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.location ? `${p.location}: ` : ''}${p.url}</div>
                <button data-action="test-proxy" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded">Тест</button>
            </div>
        `).join('');
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
    
    const runProxyTest = async (url, id = null) => {
        state.testingProxyUrl = url;
        state.testingProxyId = id; // Store ID if we are re-testing
        const modal = modalElement.querySelector('#proxy-test-modal');
        const content = modalElement.querySelector('#proxy-test-modal-content');
        modal.classList.remove('hidden');
        content.innerHTML = `<p class="font-semibold mb-2">Тестирование...</p><p class="font-mono text-sm text-gray-400 break-all">${url}</p><div class="loading-dots mt-4"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
        
        const result = await testProxyConnection({ proxyUrl: url, apiKey: settings.geminiApiKey });

        const testResultHtml = `
            <div class="w-full text-left text-sm mt-4 space-y-2">
                <div class="test-result-item">
                    <span class="test-result-label">Статус</span>
                    <span class="test-result-value font-bold ${result.status === 'ok' ? 'text-green-400' : 'text-red-400'}">${result.status === 'ok' ? 'УСПЕШНО' : 'ОШИБКА'}</span>
                </div>
                 ${result.speed !== null ? `<div class="test-result-item">
                    <span class="test-result-label">Пинг</span>
                    <span class="test-result-value">${result.speed} мс</span>
                </div>` : ''}
                ${result.geolocation ? `<div class="test-result-item">
                    <span class="test-result-label">Геолокация</span>
                    <span class="test-result-value">${result.geolocation}</span>
                </div>` : ''}
            </div>
             ${result.status !== 'ok' ? `<p class="text-xs text-gray-500 mt-2 text-center w-full">${result.message}</p>` : ''}
        `;
        
        content.innerHTML = `
            <p class="font-semibold text-lg mb-2">Результат теста</p>
            <p class="font-mono text-sm text-gray-400 break-all mb-2">${url}</p>
            ${testResultHtml}
            <div class="flex gap-3 mt-6">
                <button data-action="retest-proxy-from-modal" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Повторить</button>
                <button data-action="reject-proxy" class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-md">Отклонить</button>
                ${result.status === 'ok' ? `<button data-action="use-proxy" data-speed="${result.speed}" data-geo="${result.geolocation || ''}" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md">Использовать</button>` : ''}
            </div>
        `;
    };

    const handleAction = async (e) => {
        // Special case for toggle input
        if (e.target.dataset.action === 'toggle-proxy') {
            const id = e.target.dataset.id;
            const is_active = e.target.checked;
            const proxy = state.savedProxies.find(p => p.id === id);
            if(proxy) {
                 proxy.is_active = is_active;
                 try {
                    await supabaseService.updateProxy(id, { is_active });
                 } catch(err) {
                    alert('Не удалось обновить статус прокси');
                    proxy.is_active = !is_active; // revert on fail
                    render(); // re-render to show reverted state
                 }
            }
            return; // stop further processing
        }

        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;

        switch(action) {
            case 'close': onClose(); break;
            case 'save': {
                const newSettings = {
                    geminiApiKey: modalElement.querySelector('#settings-gemini-api-key').value.trim(),
                    useProxy: modalElement.querySelector('#use-proxy-toggle')?.checked || false,
                };
                onSave(newSettings);
                break;
            }
            case 'find-proxies': {
                state.isLoading = true;
                state.foundProxies = [];
                render();
                try {
                    const proxies = await findProxiesWithGemini({ apiKey: settings.geminiApiKey });
                    state.foundProxies = proxies;
                } catch (err) {
                    alert(`Ошибка поиска прокси: ${err.message}`);
                } finally {
                    state.isLoading = false;
                    render();
                }
                break;
            }
            case 'test-proxy': {
                await runProxyTest(target.dataset.url);
                break;
            }
             case 'retest-proxy': {
                await runProxyTest(target.dataset.url, target.dataset.id);
                break;
            }
            case 'retest-proxy-from-modal': {
                await runProxyTest(state.testingProxyUrl, state.testingProxyId);
                break;
            }
            case 'reject-proxy': {
                state.foundProxies = state.foundProxies.filter(p => p.url !== state.testingProxyUrl);
                state.testingProxyUrl = null;
                state.testingProxyId = null;
                modalElement.querySelector('#proxy-test-modal').classList.add('hidden');
                render();
                break;
            }
            case 'use-proxy': {
                const proxyData = { 
                    url: state.testingProxyUrl, 
                    last_status: 'ok',
                    last_speed_ms: target.dataset.speed,
                    geolocation: target.dataset.geo,
                };

                try {
                    // If we were re-testing a saved proxy
                    if (state.testingProxyId) {
                        await supabaseService.updateProxy(state.testingProxyId, proxyData);
                    } else { // It's a new proxy from the 'found' list
                        await supabaseService.addProxy(proxyData);
                        state.foundProxies = state.foundProxies.filter(p => p.url !== state.testingProxyUrl);
                    }
                    
                    state.testingProxyUrl = null;
                    state.testingProxyId = null;
                    modalElement.querySelector('#proxy-test-modal').classList.add('hidden');
                    await loadSavedProxies();
                } catch (err) {
                    alert(`Не удалось сохранить прокси: ${err.message}`);
                }
                break;
            }
             case 'delete-proxy': {
                if (confirm('Удалить этот прокси?')) {
                    await supabaseService.deleteProxy(target.dataset.id);
                    await loadSavedProxies();
                }
                break;
            }
        }
    };
    
    modalElement.addEventListener('click', handleAction);
    modalElement.addEventListener('change', handleAction); // Add change listener for the toggle
    render();
    loadSavedProxies();
    return modalElement;
}