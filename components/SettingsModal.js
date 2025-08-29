import { getSettings, saveSettings } from '../utils/storage.js';
import { testProxyConnection, findProxiesWithGemini } from '../services/geminiService.js';
import * as Icons from './icons/Icons.js';

const SUPABASE_SCHEMA_SQL = `-- =================================================================
--  Скрипт настройки базы данных "Секретарь+"
--  Версия: 2.5.0
--  Этот скрипт является идемпотентным. Его можно безопасно 
--  запускать несколько раз для создания или обновления схемы.
-- =================================================================

-- 1. Таблица контактов (contacts)
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_id TEXT,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_user_id_source_id_key' AND conrelid = 'public.contacts'::regclass) THEN
    ALTER TABLE public.contacts ADD UNIQUE(user_id, source_id);
  END IF;
  IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='contacts' and column_name='addresses') THEN ALTER TABLE public.contacts ADD COLUMN "addresses" jsonb; END IF;
  IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='contacts' and column_name='organizations') THEN ALTER TABLE public.contacts ADD COLUMN "organizations" jsonb; END IF;
  IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='contacts' and column_name='birthdays') THEN ALTER TABLE public.contacts ADD COLUMN "birthdays" jsonb; END IF;
END $$;


-- 2. Таблица файлов (files)
CREATE TABLE IF NOT EXISTS public.files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_id TEXT,
  name TEXT NOT NULL,
  mime_type TEXT,
  url TEXT,
  icon_link TEXT,
  created_time TIMESTAMPTZ,
  modified_time TIMESTAMPTZ,
  viewed_by_me_time TIMESTAMPTZ,
  size BIGINT,
  owner TEXT,
  permissions JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_user_id_source_id_key' AND conrelid = 'public.files'::regclass) THEN
    ALTER TABLE public.files ADD UNIQUE(user_id, source_id);
  END IF;
  IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='files' and column_name='last_modifying_user') THEN ALTER TABLE public.files ADD COLUMN "last_modifying_user" text; END IF;
END $$;


-- 3. Таблица заметок (notes)
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- 4. Таблица событий календаря (calendar_events)
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT,
    description TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    event_link TEXT,
    meet_link TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_user_id_source_id_key' AND conrelid = 'public.calendar_events'::regclass) THEN
    ALTER TABLE public.calendar_events ADD UNIQUE(user_id, source_id);
  END IF;
  IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calendar_events' and column_name='attendees') THEN ALTER TABLE public.calendar_events ADD COLUMN "attendees" jsonb; END IF;
  IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calendar_events' and column_name='status') THEN ALTER TABLE public.calendar_events ADD COLUMN "status" text; END IF;
  IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calendar_events' and column_name='creator_email') THEN ALTER TABLE public.calendar_events ADD COLUMN "creator_email" text; END IF;
  IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='calendar_events' and column_name='is_all_day') THEN ALTER TABLE public.calendar_events ADD COLUMN "is_all_day" boolean DEFAULT false; END IF;
END $$;


-- 5. Таблица задач (tasks)
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT,
    notes TEXT,
    due_date TIMESTAMPTZ,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_user_id_source_id_key' AND conrelid = 'public.tasks'::regclass) THEN
    ALTER TABLE public.tasks ADD UNIQUE(user_id, source_id);
  END IF;
  IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='tasks' and column_name='completed_at') THEN ALTER TABLE public.tasks ADD COLUMN "completed_at" timestamptz; END IF;
  IF NOT EXISTS(SELECT * FROM information_schema.columns WHERE table_name='tasks' and column_name='parent_task_id') THEN ALTER TABLE public.tasks ADD COLUMN "parent_task_id" text; END IF;
END $$;


-- 6. Таблица долговременной памяти (chat_memory)
CREATE TABLE IF NOT EXISTS public.chat_memory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    summary TEXT NOT NULL,
    keywords TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);


-- 7. Таблица метаданных почты (emails)
CREATE TABLE IF NOT EXISTS public.emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    source_id TEXT NOT NULL,
    subject TEXT,
    sender TEXT,
    snippet TEXT,
    received_at TIMESTAMPTZ,
    full_body TEXT,
    attachments_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emails_user_id_source_id_key' AND conrelid = 'public.emails'::regclass) THEN
    ALTER TABLE public.emails ADD UNIQUE(user_id, source_id);
  END IF;
END $$;

-- 8. Таблица статистики действий (action_stats)
CREATE TABLE IF NOT EXISTS public.action_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    function_name TEXT NOT NULL,
    call_count INT DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'action_stats_user_id_function_name_key' AND conrelid = 'public.action_stats'::regclass) THEN
    ALTER TABLE public.action_stats ADD UNIQUE(user_id, function_name);
  END IF;
END $$;

-- 9. Таблица настроек пользователя (user_settings)
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- 10. Таблица прокси-серверов (proxies)
CREATE TABLE IF NOT EXISTS public.proxies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    url TEXT NOT NULL,
    priority INT DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    last_status TEXT DEFAULT 'untested' NOT NULL, -- 'untested', 'ok', 'error'
    last_checked_at TIMESTAMPTZ,
    last_speed_ms INT,
    geolocation TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proxies_user_id_url_key' AND conrelid = 'public.proxies'::regclass) THEN
    ALTER TABLE public.proxies ADD UNIQUE(user_id, url);
  END IF;
END $$;


-- 11. Включение Row Level Security (RLS) для всех таблиц
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxies ENABLE ROW LEVEL SECURITY;


-- 12. Создание политик безопасности (удаляем старые, если они есть, чтобы избежать ошибок)
DROP POLICY IF EXISTS "Allow users to manage their own contacts" ON public.contacts;
CREATE POLICY "Allow users to manage their own contacts" ON public.contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to manage their own files" ON public.files;
CREATE POLICY "Allow users to manage their own files" ON public.files FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to manage their own notes" ON public.notes;
CREATE POLICY "Allow users to manage their own notes" ON public.notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to manage their own calendar events" ON public.calendar_events;
CREATE POLICY "Allow users to manage their own calendar events" ON public.calendar_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to manage their own tasks" ON public.tasks;
CREATE POLICY "Allow users to manage their own tasks" ON public.tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to manage their own chat memory" ON public.chat_memory;
CREATE POLICY "Allow users to manage their own chat memory" ON public.chat_memory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to manage their own emails" ON public.emails;
CREATE POLICY "Allow users to manage their own emails" ON public.emails FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to manage their own stats" ON public.action_stats;
CREATE POLICY "Allow users to manage their own stats" ON public.action_stats FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own settings" ON public.user_settings;
CREATE POLICY "Users can manage their own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to manage their own proxies" ON public.proxies;
CREATE POLICY "Allow users to manage their own proxies" ON public.proxies FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- 13. RPC-функции
CREATE OR REPLACE FUNCTION increment_stat(fn_name TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.action_stats (user_id, function_name, call_count)
  VALUES (auth.uid(), fn_name, 1)
  ON CONFLICT (user_id, function_name)
  DO UPDATE SET call_count = action_stats.call_count + 1;
END;
$$;

CREATE OR REPLACE FUNCTION upsert_user_settings(new_settings JSONB)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id, settings)
  VALUES (auth.uid(), new_settings)
  ON CONFLICT (user_id)
  DO UPDATE SET settings = EXCLUDED.settings, updated_at = now();
END;
$$;`;


export function createSettingsModal({ settings, supabaseService, onClose, onSave, onLaunchDbWizard }) {
    const modalElement = document.createElement('div');
    modalElement.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4';

    let state = {
        isLoading: false,
        isShowingSql: false,
    };
    
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
                    ? `<input type="text" class="proxy-edit-input w-full bg-gray-900 border border-gray-600 rounded px-1 py-0.5 font-mono text-xs" value="${p.url}">`
                    : `<div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.url}</div>`;

                 const actionButtons = isEditing
                    ? `
                        <button data-action="save-edit-proxy" data-id="${p.id}" class="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-500 rounded">Сохр.</button>
                        <button data-action="cancel-edit-proxy" class="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded">Отм.</button>
                    `
                    : `
                        <button data-action="edit-proxy" data-id="${p.id}" class="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded" ${isSomeoneElseEditing || p.isTesting ? 'disabled' : ''}>Ред.</button>
                        <button data-action="retest-proxy" data-id="${p.id}" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded" ${isSomeoneElseEditing || p.isTesting ? 'disabled' : ''}>${p.isTesting ? '...' : 'Тест'}</button>
                        <button data-action="delete-proxy" data-id="${p.id}" class="p-1 text-xs bg-red-800 hover:bg-red-700 rounded-full leading-none" ${isSomeoneElseEditing || p.isTesting ? 'disabled' : ''}>${Icons.TrashIcon.replace('width="24" height="24"', 'width="12" height="12"')}</button>
                    `;

                return `
                <div class="proxy-list-item bg-gray-700/50 ${isSomeoneElseEditing ? 'opacity-50' : ''}" draggable="${!isEditing}" data-id="${p.id}" data-index="${index}">
                    <div class="flex-shrink-0 cursor-grab text-gray-500" title="Перетащить для изменения приоритета">${Icons.MenuIcon}</div>
                     <label class="toggle-switch" style="transform: scale(0.7); margin: 0 -4px;">
                        <input type="checkbox" data-action="toggle-proxy" data-id="${p.id}" ${p.is_active ? 'checked' : ''} ${isEditing || p.isTesting ? 'disabled' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <div class="status-indicator ${statusIndicatorClass}" title="Статус: ${p.last_status || 'untested'}"></div>
                    ${urlContent}
                    ${p.last_status === 'ok' && p.last_speed_ms ? `<span class="text-xs text-gray-400">${p.last_speed_ms}ms</span>` : ''}
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
                 <div class="proxy-list-item">
                    <div class="status-indicator ${statusIndicatorClass}" title="${p.testMessage || ''}"></div>
                    <div class="flex-1 font-mono text-xs truncate" title="${p.url}">${p.location ? `${p.location}: ` : ''}${p.url}</div>
                    ${p.testStatus === 'ok' && p.testSpeed ? `<span class="text-xs text-gray-400">${p.testSpeed}ms</span>` : ''}
                    <div class="flex items-center gap-1">
                        <button data-action="test-found-proxy" data-url="${p.url}" class="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded" ${isTesting ? 'disabled' : ''}>${testButtonText}</button>
                        <button data-action="add-proxy-from-found" data-url="${p.url}" data-location="${p.location || ''}" class="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 rounded" ${isTesting ? 'disabled' : ''}>Добавить</button>
                    </div>
                </div>`;
            }).join('');
            
            managerContainer.innerHTML = `
                <div class="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-3xl flex flex-col h-full sm:h-auto sm:max-h-[80vh] animate-fadeIn">
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
                case 'retest-proxy': {
                    const proxyToTest = proxyState.saved.find(p => p.id === id);
                    if (proxyToTest) {
                        proxyToTest.isTesting = true;
                        renderManager();

                        const result = await testProxyConnection({ proxyUrl: url, apiKey: settings.geminiApiKey });
                        await supabaseService.updateProxy(id, { last_status: result.status, last_speed_ms: result.speed });
                        await loadSavedProxies();
                    }
                    break;
                }
                case 'test-found-proxy': {
                    const foundProxy = proxyState.found.find(p => p.url === url);
                    if (foundProxy) {
                        foundProxy.testStatus = 'testing';
                        renderManager();
                        
                        const result = await testProxyConnection({ proxyUrl: url, apiKey: settings.geminiApiKey });
                        
                        foundProxy.testStatus = result.status;
                        foundProxy.testSpeed = result.speed;
                        foundProxy.testMessage = result.message;
                        renderManager();
                    }
                    break;
                }
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
        let databaseTabContent;

        if (state.isShowingSql) {
            databaseTabContent = `
                <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700 h-full flex flex-col">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="text-lg font-semibold">Актуальный SQL-скрипт</h3>
                        <button data-action="copy-sql" class="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-md text-sm">Копировать</button>
                    </div>
                    <p class="text-xs text-gray-400 mb-2">Выполните этот скрипт в SQL Editor вашего проекта Supabase для обновления схемы.</p>
                    <pre class="flex-1 bg-gray-900 p-3 rounded-md overflow-auto text-xs whitespace-pre-wrap font-mono"><code id="sql-code-block">${SUPABASE_SCHEMA_SQL}</code></pre>
                    <button data-action="hide-sql" class="mt-4 w-full px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold">Назад к настройкам</button>
                </div>
            `;
        } else {
            databaseTabContent = `
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
                        Или вы можете обновить схему вручную.
                        <button data-action="show-sql" class="text-blue-400 hover:underline bg-transparent border-none p-0">Показать SQL-скрипт</button>
                    </p>
                </div>
            `;
        }
    
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
                           ${settings.isSupabaseEnabled && supabaseService ? databaseTabContent : ''}
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
            case 'show-sql':
                state.isShowingSql = true;
                render();
                break;
            case 'hide-sql':
                state.isShowingSql = false;
                render();
                break;
            case 'copy-sql':
                const codeElement = modalElement.querySelector('#sql-code-block');
                navigator.clipboard.writeText(codeElement.textContent).then(() => {
                    target.textContent = 'Скопировано!';
                    setTimeout(() => { target.textContent = 'Копировать'; }, 2000);
                });
                break;
        }
    };
    
    modalElement.addEventListener('click', handleAction);
    
    render();
    return modalElement;
}