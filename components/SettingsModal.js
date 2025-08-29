import { getSettings, saveSettings } from '../utils/storage.js';
import { testProxyConnection, findProxiesWithGemini } from '../services/geminiService.js';
import * as Icons from './icons/Icons.js';

export function createSettingsModal({ settings, supabaseService, geminiApiKey, onClose, onSave }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';

    let state = {
        isLoading: false,
        statusMessage: '',
        savedProxies: [],
        foundProxies: [],
        testingProxyUrl: null,
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
                        <h3 class="font-semibold text-lg">Менеджер Прокси</h3>
                        <p class="text-xs text-gray-400 mb-4">Используйте ИИ для поиска и тестирования прокси-серверов, если API Gemini недоступен в вашем регионе.</p>
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
                <div id="proxy-test-modal" class="hidden fixed inset-0 bg-black/70 flex items-center justify-center z-50">
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
                <div class="status-indicator ${p.last_status === 'ok' ? 'status-ok' : p.last_status === 'error' ? 'status-error' : 'status-untested'}"></div>
                <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.url}</div>
                <button data-action="delete-proxy" data-id="${p.id}" class="px-2 py-0.5 text-xs bg-red-800 hover:bg-red-700 rounded-full">&times;</button>
            </div>
        `).join('');
    };
    
    const renderFoundProxies = () => {
        if (state.isLoading && !state.testingProxyUrl) return `<p class="text-sm text-gray-500 text-center py-4">Поиск...</p>`;
        if (state.foundProxies.length === 0) return `<p class="text-sm text-gray-500 text-center py-4">Нажмите "Найти", чтобы начать.</p>`;
        return state.foundProxies.map(url => `
             <div class="proxy-list-item">
                <div class="status-indicator status-untested"></div>
                <div class="flex-1 font-mono text-xs truncate" title="${url}">${url}</div>
                <button data-action="test-proxy" data-url="${url}" class="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded">Тест</button>
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

    const handleAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;

        switch(action) {
            case 'close': onClose(); break;
            case 'save': {
                const newSettings = {
                    geminiApiKey: modalElement.querySelector('#settings-gemini-api-key').value.trim(),
                };
                onSave(newSettings);
                break;
            }
            case 'find-proxies': {
                state.isLoading = true;
                state.foundProxies = [];
                render();
                try {
                    const proxies = await findProxiesWithGemini({ apiKey: geminiApiKey });
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
                const url = target.dataset.url;
                state.testingProxyUrl = url;
                const modal = modalElement.querySelector('#proxy-test-modal');
                const content = modalElement.querySelector('#proxy-test-modal-content');
                modal.classList.remove('hidden');
                content.innerHTML = `<p class="font-semibold mb-2">Тестирование...</p><p class="font-mono text-sm text-gray-400 break-all">${url}</p><div class="loading-dots mt-4"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;

                const result = await testProxyConnection({ proxyUrl: url, apiKey: geminiApiKey });
                
                content.innerHTML = `
                    <p class="font-semibold text-lg mb-2">Результат теста</p>
                    <p class="font-mono text-sm text-gray-400 break-all mb-4">${url}</p>
                    ${result.status === 'ok' 
                        ? `<p class="text-green-400 font-bold">✓ Успешно</p>`
                        : `<p class="text-red-400 font-bold">✗ Ошибка</p><p class="text-xs text-gray-500 mt-1">${result.message}</p>`
                    }
                    <div class="flex gap-3 mt-6">
                        <button data-action="retest-proxy" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Повторить</button>
                        <button data-action="reject-proxy" class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-md">Отклонить</button>
                        ${result.status === 'ok' ? `<button data-action="use-proxy" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md">Использовать</button>` : ''}
                    </div>
                `;
                break;
            }
            case 'retest-proxy': {
                const button = modalElement.querySelector('[data-action="test-proxy"][data-url="'+state.testingProxyUrl+'"]');
                if (button) button.click();
                break;
            }
            case 'reject-proxy': {
                state.foundProxies = state.foundProxies.filter(p => p !== state.testingProxyUrl);
                state.testingProxyUrl = null;
                modalElement.querySelector('#proxy-test-modal').classList.add('hidden');
                render();
                break;
            }
            case 'use-proxy': {
                try {
                    await supabaseService.addProxy({ url: state.testingProxyUrl, last_status: 'ok' });
                    state.foundProxies = state.foundProxies.filter(p => p !== state.testingProxyUrl);
                    state.testingProxyUrl = null;
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
    render();
    loadSavedProxies();
    return modalElement;
}
