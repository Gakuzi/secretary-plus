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
--  Версия: 2.3.0
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
  addresses JSONB,
  organizations JSONB,
  birthdays JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
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
  permissions JSONB,
  last_modifying_user TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
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
    attendees JSONB,
    status TEXT,
    creator_email TEXT,
    is_all_day BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
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
    completed_at TIMESTAMPTZ,
    parent_task_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
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
    full_body TEXT,
    attachments_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
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
  management_worker_url TEXT,
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