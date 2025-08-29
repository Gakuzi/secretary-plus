# Настройка Supabase для "Секретарь+"

Это руководство поможет вам настроить проект Supabase, который будет использоваться как безопасная база данных и сервис аутентификации для приложения "Секретарь+".

## Шаг 1: Создание проекта

1.  [Откройте панель управления Supabase](https://supabase.com/dashboard/projects) и нажмите **"New project"**.
2.  Придумайте имя проекта, сгенерируйте и сохраните надежный пароль от базы данных.
3.  Выберите регион и нажмите **"Create new project"**.

## Шаг 2: Выполнение SQL-скрипта

1.  В меню вашего нового проекта выберите **SQL Editor** (редактор SQL).
2.  Нажмите **"+ New query"**.
3.  Скопируйте и вставьте весь SQL-скрипт ниже в редактор.
4.  Нажмите **"RUN"**.

Этот скрипт создаст все необходимые таблицы, настроит политики безопасности и добавит функции для корректной работы приложения. Скрипт является идемпотентным, что означает, что его можно безопасно выполнять повторно для обновления схемы базы данных до последней версии без потери данных.

```sql
-- =================================================================
--  Скрипт настройки базы данных "Секретарь+"
--  Версия: 2.0.0
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
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS addresses JSONB;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS organizations JSONB;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS birthdays JSONB;
DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'contacts_user_id_source_id_key' AND conrelid = 'public.contacts'::regclass
  ) THEN
      ALTER TABLE public.contacts ADD UNIQUE(user_id, source_id);
  END IF;
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS permissions JSONB;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS last_modifying_user TEXT;
DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'files_user_id_source_id_key' AND conrelid = 'public.files'::regclass
  ) THEN
      ALTER TABLE public.files ADD UNIQUE(user_id, source_id);
  END IF;
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
    synced_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS attendees JSONB;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS creator_email TEXT;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS is_all_day BOOLEAN DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'calendar_events_user_id_source_id_key' AND conrelid = 'public.calendar_events'::regclass
  ) THEN
      ALTER TABLE public.calendar_events ADD UNIQUE(user_id, source_id);
  END IF;
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
    synced_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS parent_task_id TEXT;
DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'tasks_user_id_source_id_key' AND conrelid = 'public.tasks'::regclass
  ) THEN
      ALTER TABLE public.tasks ADD UNIQUE(user_id, source_id);
  END IF;
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
    synced_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS full_body TEXT;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS attachments_metadata JSONB;
DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'emails_user_id_source_id_key' AND conrelid = 'public.emails'::regclass
  ) THEN
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
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'action_stats_user_id_function_name_key' AND conrelid = 'public.action_stats'::regclass
  ) THEN
      ALTER TABLE public.action_stats ADD UNIQUE(user_id, function_name);
  END IF;
END $$;

-- 9. Таблица настроек пользователя (user_settings)
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Add the new management worker URL to the settings table if it doesn't exist
-- This is a placeholder, user will add it via UI
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS management_worker_url TEXT;


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
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'proxies_user_id_url_key' AND conrelid = 'public.proxies'::regclass
  ) THEN
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
$$;
```

## Шаг 3: Получение ключей Supabase

1.  В меню вашего проекта выберите **Project Settings** (значок шестеренки) > **API**.
2.  На этой странице найдите и скопируйте:
    *   **Project URL**
    *   **anon public key**
3.  Эти два значения нужно будет вставить в соответствующие поля на вкладке "Подключения" в настройках приложения "Секретарь+".--- START OF FILE services/supabase/SupabaseService.js ---

import { GOOGLE_SCOPES } from '../../constants.js';

// Helper function to safely parse date strings from Gmail API
function parseGmailDate(dateString) {
    if (!dateString) return null;
    try {
        const date = new Date(dateString);
        // Check if the parsed date is valid
        if (isNaN(date.getTime())) {
            // Attempt to parse more complex date formats if needed,
            // but for now, returning null is the safest option.
            console.warn(`Could not parse invalid date string: ${dateString}`);
            return null;
        }
        return date.toISOString();
    } catch (e) {
        console.error(`Error parsing date string: ${dateString}`, e);
        return null;
    }
}

export class SupabaseService {
    constructor(supabaseUrl, supabaseAnonKey) {
        if (!window.supabase) {
            throw new Error('Клиент Supabase JS не загружен. Проверьте URL скрипта в index.html и подключение к интернету.');
        }
        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Supabase URL and Anon Key are required.');
        }
        this.client = supabase.createClient(supabaseUrl, supabaseAnonKey);
        this.url = supabaseUrl;
    }

    // --- Auth ---
    async signInWithGoogle() {
        const { error } = await this.client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: GOOGLE_SCOPES,
                redirectTo: window.location.origin + window.location.pathname,
            },
        });
        if (error) throw error;
    }

    async signOut() {
        const { error } = await this.client.auth.signOut();
        if (error) throw error;
    }

    onAuthStateChange(callback) {
        return this.client.auth.onAuthStateChange(callback);
    }
    
    // --- Data Sync ---
    
    async syncContacts(googleContacts) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const formattedContacts = googleContacts.map(c => ({
            user_id: user.id,
            source_id: c.resourceName.split('/')[1],
            display_name: c.names?.[0]?.displayName || null,
            email: c.emailAddresses?.[0]?.value || null,
            phone: c.phoneNumbers?.[0]?.value || null,
            avatar_url: c.photos?.[0]?.url || null,
            addresses: c.addresses,
            organizations: c.organizations,
            birthdays: c.birthdays,
        })).filter(c => c.display_name);

        const chunkSize = 500;
        for (let i = 0; i < formattedContacts.length; i += chunkSize) {
            const chunk = formattedContacts.slice(i, i + chunkSize);
            const { error } = await this.client
                .from('contacts')
                .upsert(chunk, { onConflict: 'user_id,source_id', ignoreDuplicates: false });

            if (error) {
                console.error("Error syncing contacts chunk:", error);
                throw error;
            }
        }
    }
    
    async syncFiles(googleFiles) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const formattedFiles = googleFiles.map(f => ({
            user_id: user.id,
            source_id: f.id,
            name: f.name,
            mime_type: f.mimeType,
            url: f.webViewLink,
            icon_link: f.iconLink,
            created_time: f.createdTime,
            modified_time: f.modifiedTime,
            viewed_by_me_time: f.viewedByMeTime,
            size: f.size ? parseInt(f.size, 10) : null,
            owner: f.owners?.[0]?.displayName || null,
            permissions: f.permissions,
            last_modifying_user: f.lastModifyingUser?.displayName
        }));
        
        const chunkSize = 500;
        for (let i = 0; i < formattedFiles.length; i += chunkSize) {
            const chunk = formattedFiles.slice(i, i + chunkSize);
            const { error } = await this.client
                .from('files')
                .upsert(chunk, { onConflict: 'user_id,source_id', ignoreDuplicates: false });

            if (error) {
                console.error("Error syncing files chunk:", error);
                throw error;
            }
        }
    }

    async syncCalendarEvents(googleEvents) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const formattedEvents = googleEvents.map(e => ({
            user_id: user.id,
            source_id: e.id,
            title: e.summary,
            description: e.description,
            start_time: e.start?.dateTime || e.start?.date,
            end_time: e.end?.dateTime || e.end?.date,
            event_link: e.htmlLink,
            meet_link: e.hangoutLink,
            attendees: e.attendees,
            status: e.status,
            creator_email: e.creator?.email,
            is_all_day: !!e.start?.date && !e.start?.dateTime,
        }));

        const chunkSize = 500;
        for (let i = 0; i < formattedEvents.length; i += chunkSize) {
            const chunk = formattedEvents.slice(i, i + chunkSize);
            const { error } = await this.client
                .from('calendar_events')
                .upsert(chunk, { onConflict: 'user_id,source_id', ignoreDuplicates: false });

            if (error) {
                 console.error("Error syncing calendar events chunk:", error);
                throw error;
            }
        }
    }

    async syncTasks(googleTasks) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const formattedTasks = googleTasks.map(t => ({
            user_id: user.id,
            source_id: t.id,
            title: t.title,
            notes: t.notes,
            due_date: t.due,
            status: t.status,
            completed_at: t.completed,
            parent_task_id: t.parent,
        }));

        const chunkSize = 500;
        for (let i = 0; i < formattedTasks.length; i += chunkSize) {
            const chunk = formattedTasks.slice(i, i + chunkSize);
            const { error } = await this.client
                .from('tasks')
                .upsert(chunk, { onConflict: 'user_id,source_id', ignoreDuplicates: false });

            if (error) {
                 console.error("Error syncing tasks chunk:", error);
                throw error;
            }
        }
    }

    async syncEmails(googleEmails) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const formattedEmails = googleEmails.map(e => ({
            user_id: user.id,
            source_id: e.id,
            subject: e.subject,
            sender: e.from,
            snippet: e.snippet,
            received_at: parseGmailDate(e.date),
            full_body: e.body,
            attachments_metadata: e.attachments,
        }));

        const chunkSize = 500;
        for (let i = 0; i < formattedEmails.length; i += chunkSize) {
            const chunk = formattedEmails.slice(i, i + chunkSize);
            const { error } = await this.client
                .from('emails')
                .upsert(chunk, { onConflict: 'user_id,source_id', ignoreDuplicates: false });

            if (error) {
                console.error("Error syncing emails chunk:", error);
                throw error;
            }
        }
    }


    // --- Data Retrieval (from local cache) ---
    
    async getCalendarEvents({ time_min, time_max, max_results = 10 }) {
        let query = this.client
            .from('calendar_events')
            .select('*')
            .order('start_time', { ascending: true })
            .gte('start_time', time_min || new Date().toISOString())
            .limit(max_results);
            
        if (time_max) {
            query = query.lte('start_time', time_max);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        // Remap to match Google API structure for compatibility with ResultCard
        return data.map(e => ({
            id: e.source_id,
            summary: e.title,
            description: e.description,
            htmlLink: e.event_link,
            hangoutLink: e.meet_link,
            start: { dateTime: e.start_time },
            end: { dateTime: e.end_time }
        }));
    }

     async getTasks({ max_results = 20 }) {
        const { data, error } = await this.client
            .from('tasks')
            .select('*')
            .neq('status', 'completed')
            .order('due_date', { ascending: true, nullsFirst: true })
            .limit(max_results);

        if (error) throw error;
        // Remap for compatibility
        return data.map(t => ({
            id: t.source_id,
            title: t.title,
            notes: t.notes,
            due: t.due_date,
            status: t.status
        }));
    }

    async findContacts(query) {
        const { data, error } = await this.client
            .from('contacts')
            .select('*')
            .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`) // Case-insensitive search
            .limit(10);
            
        if (error) throw error;
        return data;
    }
    
    async findDocuments(query) {
         const { data, error } = await this.client
            .from('files')
            .select('*')
            .ilike('name', `%${query}%`) // Case-insensitive search
            .order('modified_time', { ascending: false, nullsFirst: false })
            .limit(10);
            
        if (error) throw error;
        return data;
    }

    // --- Notes ---
    async createNote(details) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        
        const { data, error } = await this.client
            .from('notes')
            .insert({
                user_id: user.id,
                title: details.title,
                content: details.content,
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async findNotes(query) {
        const { data, error } = await this.client
            .from('notes')
            .select('*')
            .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
            .limit(10);
        
        if (error) throw error;
        return data;
    }

    // --- Long-term Memory ---
    async saveMemory(memoryData) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const { error } = await this.client
            .from('chat_memory')
            .insert({
                user_id: user.id,
                summary: memoryData.summary,
                keywords: memoryData.keywords,
            });

        if (error) throw error;
        return { success: true };
    }

    async recallMemory(query) {
        const { data, error } = await this.client
            .from('chat_memory')
            .select('*')
            // A simple text search. For more advanced search, pg_vector would be used.
            .or(`summary.ilike.%${query}%,keywords.cs.{${query}}`)
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) throw error;
        return data;
    }

    // --- Action Statistics ---
    async getActionStats() {
        const { data, error } = await this.client
            .from('action_stats')
            .select('function_name, call_count');
        if (error) {
            console.error("Error fetching action stats:", error);
            return {}; // Return empty object on error
        }
        // Convert array of objects to a single object like { name: count }
        return data.reduce((acc, stat) => {
            acc[stat.function_name] = stat.call_count;
            return acc;
        }, {});
    }

    async incrementActionStat(functionName) {
        const { error } = await this.client.rpc('increment_stat', { fn_name: functionName });
        if (error) {
            console.error(`Failed to increment action stat for "${functionName}":`, error);
            // Do not throw, this is a non-critical background task.
        }
    }
    
    // --- User Settings ---
    async getUserSettings() {
        const { data, error } = await this.client
            .from('user_settings')
            .select('settings')
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching user settings:', error);
            throw error;
        }

        return data ? data.settings : null;
    }

    async saveUserSettings(settingsObject) {
        const { error } = await this.client.rpc('upsert_user_settings', { new_settings: settingsObject });
        if (error) {
            console.error('Error saving user settings:', error);
            throw error;
        }
    }

    async deleteUserSettings() {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const { error } = await this.client
            .from('user_settings')
            .delete()
            .eq('user_id', user.id);

        if (error) {
            console.error('Error deleting user settings:', error);
            throw error;
        }
        return { success: true };
    }
    
    // --- Data Viewer ---
    async getSampleData(tableName, limit = 10) {
        if (!tableName) throw new Error("Table name is required.");
        
        const orderColumn = ['notes', 'files', 'contacts'].includes(tableName) ? 'updated_at' : 'created_at';

        const { data, error } = await this.client
            .from(tableName)
            .select('*')
            .order(orderColumn, { ascending: false, nullsFirst: true })
            .limit(limit);
            
        if (error) {
            console.error(`Error fetching sample data from ${tableName}:`, error);
            return { error: error.message };
        }
        
        return { data: data || [] };
    }


    // --- Proxy Management ---
    async getProxies() {
        const { data, error } = await this.client
            .from('proxies')
            .select('*')
            .order('priority', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    async addProxy(proxyData) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        
        const { data, error } = await this.client
            .from('proxies')
            .insert({ 
                ...proxyData, 
                user_id: user.id,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                 const { data: updateData, error: updateError } = await this.client
                    .from('proxies')
                    .update({ ...proxyData, last_checked_at: new Date().toISOString() })
                    .eq('user_id', user.id)
                    .eq('url', proxyData.url)
                    .select()
                    .single();
                 if (updateError) throw updateError;
                 return updateData;
            }
            throw error;
        }
        return data;
    }
    
    async updateProxy(id, updateData) {
        const { data, error } = await this.client
            .from('proxies')
            .update({ ...updateData, last_checked_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteProxy(id) {
        const { error } = await this.client
            .from('proxies')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    }

    // --- Schema Management ---
    async executeSql(managementWorkerUrl, sqlScript) {
        if (!managementWorkerUrl) {
            throw new Error("Management Worker URL is not configured.");
        }
        
        const { data: { session } } = await this.client.auth.getSession();
        if (!session || !session.provider_token) {
            throw new Error("User is not authenticated or provider token is missing.");
        }

        const response = await fetch(managementWorkerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Pass the Google token to the worker for potential validation if needed
                'Authorization': `Bearer ${session.provider_token}`
            },
            body: JSON.stringify({ sql: sqlScript }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Schema update failed with status ${response.status}: ${errorText}`);
        }

        return await response.json();
    }
}