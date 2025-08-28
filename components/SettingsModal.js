import { SettingsIcon } from './icons/Icons.js';

const sqlSchemaToCopy = `-- Таблица для хранения синхронизированных контактов
CREATE TABLE public.contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL, -- Источник (например, 'google', 'apple')
  source_id TEXT, -- ID контакта в исходной системе
  display_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, source, source_id) -- Уникальность контакта для пользователя и источника
);
COMMENT ON TABLE public.contacts IS 'Stores synchronized contacts from various services.';

-- Таблица для хранения метаданных синхронизированных файлов
CREATE TABLE public.files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL, -- Источник (например, 'google_drive')
  source_id TEXT, -- ID файла в исходной системе
  name TEXT NOT NULL,
  mime_type TEXT,
  url TEXT,
  icon_link TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, source, source_id) -- Уникальность файла для пользователя и источника
);
COMMENT ON TABLE public.files IS 'Stores synchronized file metadata from cloud storage services.';

-- ВАЖНО: Настройка политик безопасности (Row Level Security)
-- 1. Включаем RLS для таблиц
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- 2. Создаем политики, которые разрешают пользователям доступ ТОЛЬКО к их собственным данным
CREATE POLICY "Allow users to manage their own contacts" ON public.contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow users to manage their own files" ON public.files FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
`;

export function createSettingsModal(currentSettings, authState, onSave, onClose, googleProvider, supabaseService) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';

    modalOverlay.innerHTML = `
        <div class="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col m-4" id="settings-content">
            <header class="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                <h2 class="text-2xl font-bold flex items-center gap-2">${SettingsIcon} Настройки</h2>
                <button id="close-settings" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Закрыть настройки">&times;</button>
            </header>
            
            <main class="flex-1 flex overflow-hidden">
                <aside class="w-48 border-r border-gray-700 p-4">
                    <nav class="flex flex-col space-y-2">
                        <a href="#connections" class="settings-tab-button active text-left" data-tab="connections">Подключения</a>
                        <a href="#api-keys" class="settings-tab-button" data-tab="api-keys">API Ключи</a>
                        <a href="#sync" class="settings-tab-button" data-tab="sync">Синхронизация</a>
                    </nav>
                </aside>
                <div class="flex-1 p-6 overflow-y-auto" id="settings-tabs-content">
                    
                    <!-- Connections Tab -->
                    <div id="tab-connections" class="settings-tab-content space-y-6">
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                            <h3 class="text-lg font-semibold text-gray-200">Подключение к Supabase</h3>
                            <div class="flex items-center gap-3">
                                <span class="w-3 h-3 rounded-full ${authState.isSupabaseConnected ? 'bg-green-500' : 'bg-red-500'}"></span>
                                <p class="text-sm">Статус: <span class="font-semibold">${authState.isSupabaseConnected ? `Подключено` : 'Не подключено'}</span></p>
                                ${authState.supabaseUser ? `<p class="text-xs text-gray-400">(${authState.supabaseUser.email})</p>` : ''}
                            </div>
                            <div class="space-y-2">
                                <label for="supabase-url" class="block text-sm font-medium text-gray-300">Supabase Project URL</label>
                                <input type="text" id="supabase-url" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" value="${currentSettings.supabaseUrl || ''}">
                            </div>
                            <div class="space-y-2">
                                <label for="supabase-anon-key" class="block text-sm font-medium text-gray-300">Supabase Anon Key</label>
                                <input type="password" id="supabase-anon-key" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" value="${currentSettings.supabaseAnonKey || ''}">
                            </div>
                            <details class="text-sm text-gray-400">
                                <summary class="cursor-pointer hover:text-white">Инструкция по настройке</summary>
                                <div class="mt-2 p-3 bg-gray-900 rounded-md border border-gray-600 space-y-3 text-xs">
                                    <p>1. Создайте проект в <a href="https://supabase.com/" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">Supabase</a>.</p>
                                    <p>2. Перейдите в <code class="text-amber-300">Project Settings > API</code> и скопируйте URL и Anon Key.</p>
                                    <p>3. Перейдите в <code class="text-amber-300">SQL Editor</code>, вставьте и выполните скрипт ниже для создания таблиц:</p>
                                    <div class="relative">
                                      <pre class="bg-gray-800 p-2 rounded text-gray-300 overflow-auto max-h-32"><code>${sqlSchemaToCopy}</code></pre>
                                      <button class="copy-sql-button absolute top-2 right-2 px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors">Копировать</button>
                                    </div>
                                    <p>4. Включите Google Provider в <code class="text-amber-300">Authentication > Providers</code> и настройте его, используя данные из Google Cloud. Подробнее в <a href="./README.md" target="_blank" class="text-blue-400 hover:underline">README</a>.</p>
                                </div>
                            </details>
                        </div>
                    </div>

                    <!-- API Keys Tab -->
                    <div id="tab-api-keys" class="settings-tab-content space-y-6 hidden">
                         <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                            <h3 class="text-lg font-semibold text-gray-200">Ключ Gemini API</h3>
                            <div class="space-y-2">
                                <label for="gemini-api-key" class="block text-sm font-medium text-gray-300">Gemini API Key</label>
                                <input type="password" id="gemini-api-key" class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" value="${currentSettings.geminiApiKey || ''}">
                            </div>
                            <p class="text-xs text-gray-400 mt-1">Ваш ключ хранится локально в браузере. Получить ключ можно в <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">Google AI Studio</a>.</p>
                        </div>
                    </div>

                    <!-- Sync Tab -->
                    <div id="tab-sync" class="settings-tab-content space-y-6 hidden">
                        <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-4">
                            <h3 class="text-lg font-semibold text-gray-200">Синхронизация данных</h3>
                            <p class="text-sm text-gray-400">Синхронизируйте данные из подключенных сервисов, чтобы ассистент мог быстро находить контакты и документы.</p>
                            <div id="sync-status" class="text-sm text-gray-300"></div>
                            <div class="space-y-3 pt-2">
                                <button id="sync-contacts-button" ${!authState.isGoogleConnected ? 'disabled' : ''} class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md font-semibold transition-colors">Синхронизировать контакты Google</button>
                                <button id="sync-files-button" ${!authState.isGoogleConnected ? 'disabled' : ''} class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md font-semibold transition-colors">Синхронизировать файлы Google Drive</button>
                            </div>
                            ${!authState.isGoogleConnected ? '<p class="text-xs text-yellow-400 text-center">Для синхронизации необходимо войти в аккаунт Google.</p>' : ''}
                        </div>
                    </div>

                </div>
            </main>

            <footer class="flex justify-end p-4 border-t border-gray-700 flex-shrink-0">
                <button id="save-settings" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold transition-colors">Сохранить и закрыть</button>
            </footer>
        </div>
    `;

    // --- Event Listeners ---
    
    modalOverlay.querySelector('#close-settings').addEventListener('click', onClose);
    modalOverlay.querySelector('#save-settings').addEventListener('click', () => {
        const newSettings = {
            supabaseUrl: modalOverlay.querySelector('#supabase-url').value.trim(),
            supabaseAnonKey: modalOverlay.querySelector('#supabase-anon-key').value.trim(),
            geminiApiKey: modalOverlay.querySelector('#gemini-api-key').value.trim(),
        };
        onSave(newSettings);
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) onClose();
    });

    // Tab switching logic
    const tabButtons = modalOverlay.querySelectorAll('.settings-tab-button');
    const tabContents = modalOverlay.querySelectorAll('.settings-tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = e.target.dataset.tab;

            tabButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');

            tabContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== `tab-${tabId}`);
            });
        });
    });
    
    // Copy SQL button
    modalOverlay.querySelector('.copy-sql-button').addEventListener('click', (e) => {
        const button = e.target;
        navigator.clipboard.writeText(sqlSchemaToCopy).then(() => {
            button.textContent = 'Скопировано!';
            setTimeout(() => { button.textContent = 'Копировать'; }, 2000);
        });
    });

    // Sync buttons logic
    const syncContactsBtn = modalOverlay.querySelector('#sync-contacts-button');
    const syncFilesBtn = modalOverlay.querySelector('#sync-files-button');
    const syncStatusDiv = modalOverlay.querySelector('#sync-status');

    const handleSync = async (button, syncFunction, providerFunction, entityName) => {
        button.disabled = true;
        button.textContent = 'Синхронизация...';
        syncStatusDiv.innerHTML = `<p>Получаем данные ${entityName} из Google...</p>`;
        try {
            const items = await providerFunction();
            syncStatusDiv.innerHTML = `<p>Найдено ${items.length} ${entityName}. Сохраняем в Supabase...</p>`;
            const result = await syncFunction(items);
            syncStatusDiv.innerHTML = `<p class="text-green-400">Успешно синхронизировано ${result.synced} ${entityName}!</p>`;
        } catch (error) {
            console.error(`Sync error for ${entityName}:`, error);
            syncStatusDiv.innerHTML = `<p class="text-red-400">Ошибка синхронизации: ${error.message}</p>`;
        } finally {
            button.disabled = false;
            button.textContent = `Синхронизировать ${entityName} Google`;
        }
    };

    if (authState.isGoogleConnected) {
        syncContactsBtn.addEventListener('click', () => handleSync(
            syncContactsBtn,
            (items) => supabaseService.syncContacts(items),
            () => googleProvider.getAllContacts(),
            'контактов'
        ));
        syncFilesBtn.addEventListener('click', () => handleSync(
            syncFilesBtn,
            (items) => supabaseService.syncFiles(items),
            () => googleProvider.getAllFiles(),
            'файлов'
        ));
    }

    return modalOverlay;
}