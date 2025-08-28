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
--  Версия: 1.6.0
--  Этот скрипт является идемпотентным. Его можно безопасно 
--  запускать несколько раз для создания или обновления схемы.
-- =================================================================

-- 1. Таблица контактов (contacts)
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;
DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'contacts_user_id_source_source_id_key' AND conrelid = 'public.contacts'::regclass
  ) THEN
      ALTER TABLE public.contacts ADD UNIQUE(user_id, source, source_id);
  END IF;
END $$;


-- 2. Таблица файлов (files)
CREATE TABLE IF NOT EXISTS public.files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS source TEXT NOT NULL;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS icon_link TEXT;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS created_time TIMESTAMPTZ;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS modified_time TIMESTAMPTZ;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS viewed_by_me_time TIMESTAMPTZ;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS size BIGINT;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS owner TEXT;
DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'files_user_id_source_source_id_key' AND conrelid = 'public.files'::regclass
  ) THEN
      ALTER TABLE public.files ADD UNIQUE(user_id, source, source_id);
  END IF;
END $$;


-- 3. Таблица заметок (notes)
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS content TEXT NOT NULL;


-- 4. Таблица событий календаря (calendar_events)
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    synced_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS source_id TEXT NOT NULL;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS event_link TEXT;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS meet_link TEXT;
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
    synced_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source_id TEXT NOT NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS status TEXT;
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
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.chat_memory ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;
ALTER TABLE public.chat_memory ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL;
ALTER TABLE public.chat_memory ADD COLUMN IF NOT EXISTS keywords TEXT[];


-- 7. Таблица метаданных почты (emails)
CREATE TABLE IF NOT EXISTS public.emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    synced_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS source_id TEXT NOT NULL;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS sender TEXT;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS snippet TEXT;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
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
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    function_name TEXT NOT NULL,
    call_count INT DEFAULT 1 NOT NULL
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
  updated_at TIMESTAMPTZ DEFAULT now(),
  settings JSONB NOT NULL
);


-- 10. Включение Row Level Security (RLS) для всех таблиц
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;


-- 11. Создание политик безопасности (удаляем старые, если они есть, чтобы избежать ошибок)
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


-- 12. RPC-функции
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
3.  Эти два значения нужно будет вставить в соответствующие поля на вкладке "Подключения" в настройках приложения "Секретарь+".
