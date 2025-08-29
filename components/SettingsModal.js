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
                        const proxies = await findProxiesWithGemini({ apiKey