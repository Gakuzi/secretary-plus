
// Этот SQL-скрипт включает защиту на уровне строк (RLS) для всех таблиц
// и создает политики, гарантирующие, что пользователи могут получить доступ только к своим собственным данным.
export const FULL_MIGRATION_SQL = `
BEGIN;

-- Удаляем старые таблицы данных, чтобы начать с чистого листа.
-- Настройки и прокси не трогаем.
DROP TABLE IF EXISTS public.calendar_events CASCADE;
DROP TABLE IF EXISTS public.contacts CASCADE;
DROP TABLE IF EXISTS public.files CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.emails CASCADE;
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.chat_memory CASCADE;

-- Создаем заново таблицы с улучшенной и расширенной схемой

-- Таблица для событий календаря
CREATE TABLE public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
    is_all_day BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, source_id)
);
COMMENT ON TABLE public.calendar_events IS 'Кэшированные события из Google Calendar.';

-- Таблица для контактов
CREATE TABLE public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    display_name TEXT,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    addresses JSONB,
    organizations JSONB,
    birthdays JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, source_id)
);
COMMENT ON TABLE public.contacts IS 'Кэшированные контакты из Google Contacts.';

-- Таблица для файлов
CREATE TABLE public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    name TEXT,
    mime_type TEXT,
    url TEXT,
    icon_link TEXT,
    created_time TIMESTAMPTZ,
    modified_time TIMESTAMPTZ,
    viewed_by_me_time TIMESTAMPTZ,
    size BIGINT,
    owner TEXT,
    last_modifying_user TEXT,
    permissions JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, source_id)
);
COMMENT ON TABLE public.files IS 'Кэшированная мета-информация о файлах из Google Drive.';

-- Таблица для задач
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    title TEXT,
    notes TEXT,
    due_date TIMESTAMPTZ,
    status TEXT,
    completed_at TIMESTAMPTZ,
    parent_task_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, source_id)
);
COMMENT ON TABLE public.tasks IS 'Кэшированные задачи из Google Tasks.';

-- Таблица для электронной почты
CREATE TABLE public.emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    subject TEXT,
    sender TEXT,
    snippet TEXT,
    received_at TIMESTAMPTZ,
    full_body TEXT,
    attachments_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, source_id)
);
COMMENT ON TABLE public.emails IS 'Кэшированные письма из Gmail для быстрого поиска.';

-- Таблица для заметок
CREATE TABLE public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.notes IS 'Заметки, созданные пользователем внутри приложения.';

-- Таблица для долговременной памяти чата
CREATE TABLE public.chat_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    summary TEXT,
    keywords TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.chat_memory IS 'Долговременная память ассистента.';

-- Включаем Row Level Security на всех таблицах
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxies ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики, чтобы избежать конфликтов
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.calendar_events;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.contacts;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.files;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.tasks;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.emails;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.notes;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.chat_memory;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.user_settings;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.action_stats;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.proxies;

-- Создаем политики, разрешающие пользователям доступ только к своим данным
CREATE POLICY "Enable all access for authenticated users" ON public.calendar_events FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.contacts FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.files FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.tasks FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.emails FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.notes FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.chat_memory FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.user_settings FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.action_stats FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.proxies FOR ALL TO authenticated USING (auth.uid() = user_id);

COMMIT;
`.trim();
