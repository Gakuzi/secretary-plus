// This file is a new addition to the project.
// It was created to handle the user profile modal functionality.
import * as Icons from './icons/Icons.js';

// Helper to create a toggle switch element
function createToggle(id, label, isChecked) {
    return `
        <div class="flex items-center justify-between py-2 border-b border-gray-700/50">
            <label for="${id}" class="font-medium text-gray-300">${label}</label>
            <label class="toggle-switch">
                <input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
    `;
}

// Helper to create a service mapping dropdown
function createServiceSelect(key, label, providers, selectedValue) {
    return `
        <div class="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-b-0">
            <label for="profile-${key}-provider-select" class="font-medium text-gray-300">${label}</label>
            <select id="profile-${key}-provider-select" class="bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm">
                ${providers.map(p => `<option value="${p.id}" ${selectedValue === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
        </div>
    `;
}

// Helper to create a sync status item
function createSyncStatusItem(task, status) {
    const iconSVG = Icons[task.icon] || '';
    const lastSyncData = status[task.name];
    let statusText = 'Никогда не синхронизировалось';
    let statusColor = 'text-gray-500';

    if (lastSyncData) {
        if (lastSyncData.error) {
            statusText = `Ошибка: ${lastSyncData.error}`;
            statusColor = 'text-red-400';
        } else if (lastSyncData.lastSync) {
            statusText = `Синхронизировано: ${new Date(lastSyncData.lastSync).toLocaleString()}`;
            statusColor = 'text-green-400';
        }
    }

    return `
        <div class="flex items-center justify-between text-sm py-1.5">
            <div class="flex items-center gap-2 font-medium text-gray-300">
                <span class="w-5 h-5">${iconSVG}</span>
                <span>${task.label}</span>
            </div>
            <div class="truncate ${statusColor}" title="${statusText}">
                ${statusText}
            </div>
        </div>
    `;
}


export function createProfileModal(userProfile, settings, handlers, syncStatus, syncTasks) {
    const { onClose, onSave, onLogout, onDelete, onForceSync } = handlers;
    
    // Definitions for the settings form in the profile modal
    const SERVICE_DEFINITIONS = {
        calendar: { label: 'Календарь', providers: [{ id: 'google', name: 'Google' }, { id: 'supabase', name: 'Кэш (Supabase)' }, { id: 'apple', name: 'Apple (.ics)' }] },
        tasks: { label: 'Задачи', providers: [{ id: 'google', name: 'Google Tasks' }, { id: 'supabase', name: 'Кэш (Supabase)' }] },
        contacts: { label: 'Контакты', providers: [{ id: 'google', name: 'Google' }, { id: 'supabase', name: 'Кэш (Supabase)' }] },
        files: { label: 'Файлы', providers: [{ id: 'google', name: 'Google Drive' }, { id: 'supabase', name: 'Кэш (Supabase)' }] },
        notes: { label: 'Заметки', providers: [{ id: 'supabase', name: 'База данных' }, { id: 'google', name: 'Google Docs' }] },
    };

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';

    modalOverlay.innerHTML = `
        <div id="profile-modal-content" class="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4">
            <header class="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                <h2 class="text-xl font-bold">Профиль пользователя</h2>
                <button id="close-profile" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Закрыть профиль">&times;</button>
            </header>
            <main class="p-6 overflow-y-auto space-y-6 flex-1">
                <!-- User Info -->
                <div class="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg">
                    <img src="${userProfile.imageUrl}" alt="${userProfile.name}" class="w-16 h-16 rounded-full">
                    <div>
                        <p class="text-xl font-bold">${userProfile.name}</p>
                        <p class="text-sm text-gray-400">${userProfile.email}</p>
                    </div>
                </div>

                <!-- Sync Status -->
                ${settings.isSupabaseEnabled ? `
                <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">Синхронизация данных</h3>
                        <button id="force-sync-button" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold flex items-center gap-2">
                            ${Icons.RefreshCwIcon}
                            <span>Синхронизировать сейчас</span>
                        </button>
                    </div>
                    <div id="sync-status-list" class="space-y-1">
                        ${syncTasks.map(task => createSyncStatusItem(task, syncStatus)).join('')}
                    </div>
                </div>` : ''}

                <!-- Cloud Settings -->
                <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                    <h3 class="text-lg font-semibold mb-3">Настройки в облаке</h3>
                    <p class="text-sm text-gray-400 mb-4">Эти настройки сохранены в Supabase и синхронизируются между устройствами. Ключи API здесь не отображаются.</p>
                    
                    <div class="space-y-2">
                        ${createToggle('profile-email-polling-toggle', 'Проактивные уведомления по почте', settings.enableEmailPolling)}
                        ${createToggle('profile-auto-sync-toggle', 'Автоматическая фоновая синхронизация', settings.enableAutoSync)}
                    </div>
                     <div class="space-y-2 border-t border-gray-700 pt-4 mt-4">
                        ${Object.entries(SERVICE_DEFINITIONS).map(([key, def]) => 
                            createServiceSelect(key, def.label, def.providers, settings.serviceMap[key])
                        ).join('')}
                     </div>
                </div>
            </main>
            <footer class="p-4 bg-gray-800 border-t border-gray-700 flex justify-between items-center flex-shrink-0">
                <div>
                     <button id="profile-logout-button" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold">Выйти</button>
                </div>
                <div class="flex gap-3">
                     <button id="profile-delete-settings" class="px-4 py-2 bg-red-800 hover:bg-red-700 rounded-md text-sm font-semibold">Удалить из облака</button>
                     <button id="profile-save-settings" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-semibold">Сохранить</button>
                </div>
            </footer>
        </div>
    `;

    // --- Event Listeners ---
    modalOverlay.querySelector('#close-profile').addEventListener('click', onClose);
    modalOverlay.querySelector('#profile-logout-button').addEventListener('click', onLogout);
    modalOverlay.querySelector('#profile-delete-settings').addEventListener('click', onDelete);
    const forceSyncButton = modalOverlay.querySelector('#force-sync-button');
    if (forceSyncButton) {
        forceSyncButton.addEventListener('click', onForceSync);
    }

    modalOverlay.querySelector('#profile-save-settings').addEventListener('click', () => {
        // Gather all settings, starting with the existing ones to preserve keys not edited here
        const newSettings = {
            ...settings, 
            enableEmailPolling: modalOverlay.querySelector('#profile-email-polling-toggle').checked,
            enableAutoSync: modalOverlay.querySelector('#profile-auto-sync-toggle').checked,
            serviceMap: {
                calendar: modalOverlay.querySelector('#profile-calendar-provider-select').value,
                tasks: modalOverlay.querySelector('#profile-tasks-provider-select').value,
                contacts: modalOverlay.querySelector('#profile-contacts-provider-select').value,
                files: modalOverlay.querySelector('#profile-files-provider-select').value,
                notes: modalOverlay.querySelector('#profile-notes-provider-select').value,
            }
        };
        onSave(newSettings);
    });

    modalOverlay.addEventListener('click', e => {
        if (e.target === modalOverlay) onClose();
    });

    return modalOverlay;
}