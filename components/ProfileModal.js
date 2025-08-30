import * as Icons from './icons/Icons.js';
import { getSettings, saveSettings } from '../utils/storage.js';
import { DB_SCHEMAS } from '../services/supabase/schema.js';


// --- HELPERS ---
const ROLE_DISPLAY_MAP = {
    owner: { text: 'Владелец', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
    admin: { text: 'Администратор', class: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
    manager: { text: 'Менеджер', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    user: { text: 'Пользователь', class: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200' }
};

// --- TAB CONTENT RENDERERS ---

function renderProfileTab(profile) {
    const roleInfo = ROLE_DISPLAY_MAP[profile.role] || ROLE_DISPLAY_MAP.user;
    return `
        <div class="text-center p-6">
            <img src="${profile.avatar_url}" alt="${profile.full_name}" class="w-24 h-24 rounded-full mx-auto shadow-md mb-4">
            <h3 class="text-2xl font-bold text-slate-900 dark:text-slate-100">${profile.full_name}</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">${profile.email}</p>
            <span class="inline-block mt-3 px-3 py-1 text-xs font-semibold rounded-full ${roleInfo.class}">${roleInfo.text}</span>
        </div>
    `;
}

// A simple markdown-like formatter for the changelog
function formatChangelog(changelog) {
    return changelog.map(entry => `
        <div class="mt-4">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100">Версия ${entry.version} <span class="text-sm font-normal text-slate-500 dark:text-slate-400">- ${entry.date}</span></h4>
            <ul class="list-disc list-inside mt-1 text-sm space-y-1">
                ${entry.changes.map(change => `<li>${change}</li>`).join('')}
            </ul>
        </div>
    `).join('');
}

function renderAboutTab() {
    const container = document.createElement('div');
    container.className = 'p-6 prose dark:prose-invert max-w-none';
    container.innerHTML = `<div class="flex justify-center items-center p-8"><div class="animate-spin h-8 w-8 border-4 border-slate-300 border-t-transparent rounded-full"></div></div>`;
    
    fetch('./app-info.json')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(info => {
            container.innerHTML = `
                <p><strong>Версия:</strong> ${info.version}</p>
                <p><strong>Автор:</strong> ${info.author}</p>
                <p><strong>Связаться:</strong> <a href="${info.contact}" target="_blank" rel="noopener noreferrer">Telegram</a></p>
                <h3 class="mt-6">История изменений</h3>
                ${formatChangelog(info.changelog)}
            `;
        })
        .catch(error => {
            console.error("Failed to load app info:", error);
            container.innerHTML = `<p class="text-red-500">Не удалось загрузить информацию о приложении.</p>`;
        });
    return container;
}


function renderServicesTab(settings) {
    const syncableServices = ['calendar', 'tasks', 'contacts', 'files', 'emails', 'notes'];
    const servicesHtml = syncableServices.map(key => {
        const schema = DB_SCHEMAS[key];
        if (!schema) return '';
        return `
            <div class="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                <label for="service-toggle-${key}" class="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-3">
                    <span class="w-5 h-5">${Icons[schema.icon] || ''}</span>
                    <span>${schema.label}</span>
                </label>
                <label class="toggle-switch">
                    <input type="checkbox" id="service-toggle-${key}" data-service-key="${key}" ${settings.enabledServices[key] ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `;
    }).join('');

    return `
        <div class="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Активные службы</h3>
            <p class="text-sm text-slate-600 dark:text-slate-400 my-2">Выберите, какие данные ассистент будет использовать и синхронизировать с облаком для быстрого поиска и анализа.</p>
            <div class="divide-y divide-slate-200 dark:divide-slate-700">${servicesHtml}</div>
        </div>
        <div class="p-4 mt-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
             <button data-action="save-services" class="w-full flex items-center justify-center gap-2 text-center px-4 py-2 text-sm font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                Сохранить настройки служб
            </button>
        </div>
    `;
}

// --- MAIN COMPONENT ---
export function createProfileModal({ currentUserProfile, supabaseService, onClose, onLogout }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn';
    
    let state = {
        currentTab: 'profile',
        settings: getSettings(),
    };
    
    const TABS = [
        { id: 'profile', label: 'Профиль', icon: Icons.UserIcon },
        { id: 'services', label: 'Службы', icon: Icons.SettingsIcon },
        { id: 'about', label: 'О приложении', icon: Icons.QuestionMarkCircleIcon }
    ];

    const render = () => {
        const contentContainer = document.createElement('div');
        contentContainer.className = 'h-full';

        switch (state.currentTab) {
            case 'profile': contentContainer.innerHTML = renderProfileTab(currentUserProfile); break;
            case 'services': contentContainer.innerHTML = renderServicesTab(state.settings); break;
            case 'about': contentContainer.appendChild(renderAboutTab()); break;
            default: contentContainer.innerHTML = `<p>Выберите вкладку</p>`;
        }

        const tabButtonsHtml = TABS.map(tab => `
            <button class="profile-tab-button ${state.currentTab === tab.id ? 'active' : ''}" data-tab-id="${tab.id}">
                <span class="w-5 h-5">${tab.icon}</span>
                <span>${tab.label}</span>
            </button>
        `).join('');

        modalElement.innerHTML = `
            <div id="profile-content" class="bg-white dark:bg-slate-800 w-full h-full flex flex-col sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-lg shadow-xl text-slate-800 dark:text-slate-100">
                <header class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <h2 class="text-xl sm:text-2xl font-bold">Профиль и настройки</h2>
                    <button data-action="close" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Закрыть профиль">&times;</button>
                </header>
                <main class="flex-1 flex flex-col sm:flex-row overflow-hidden bg-slate-50 dark:bg-slate-900/70">
                    <aside class="w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 p-2 sm:p-4 flex-shrink-0 bg-white dark:bg-slate-800 flex flex-col justify-between">
                         <nav class="flex flex-row sm:flex-col sm:space-y-1 w-full justify-around">${tabButtonsHtml}</nav>
                         <div class="p-2 sm:pt-4 mt-2 border-t border-slate-200 dark:border-slate-700">
                            <button data-action="logout" class="w-full flex items-center justify-center gap-2 text-center px-4 py-2 text-sm font-semibold rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors">
                                Выйти из аккаунта
                            </button>
                         </div>
                    </aside>
                    <div class="flex-1 p-4 sm:p-6 overflow-y-auto" id="profile-tab-content"></div>
                </main>
            </div>
        `;
        
        modalElement.querySelector('#profile-tab-content').appendChild(contentContainer);
    };
    
    const switchTab = (tabId) => {
        state.currentTab = tabId;
        render();
    };

    modalElement.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-tab-id], [data-action]');
        if (!target) {
             if (e.target === modalElement || !e.target.closest('#profile-content')) {
                onClose();
            }
            return;
        }

        if (target.dataset.tabId) {
            switchTab(target.dataset.tabId);
        }

        if (target.dataset.action) {
            const action = target.dataset.action;
            
            switch(action) {
                case 'close': onClose(); break;
                case 'logout': if(confirm('Вы уверены, что хотите выйти?')) onLogout(); break;
                case 'save-services': {
                    const newSettings = { ...state.settings };
                    modalElement.querySelectorAll('[data-service-key]').forEach(toggle => {
                        newSettings.enabledServices[toggle.dataset.serviceKey] = toggle.checked;
                    });
                    state.settings = newSettings;
                    saveSettings(newSettings);
                    if (supabaseService) {
                        try { 
                            await supabaseService.saveUserSettings(newSettings); 
                            alert("Настройки служб сохранены.");
                        } catch (err) { 
                            console.error("Failed to save service settings", err);
                            alert(`Ошибка сохранения настроек: ${err.message}`);
                        }
                    } else {
                         alert("Настройки служб сохранены локально.");
                    }
                    break;
                }
            }
        }
    });

    render();
    return modalElement;
}