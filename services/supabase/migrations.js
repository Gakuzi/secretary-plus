// Этот SQL-скрипт включает защиту на уровне строк (RLS) для всех таблиц
// и создает политики, гарантирующие, что пользователи могут получить доступ только к своим собственным данным.
export const FULL_MIGRATION_SQL = `
-- Удаляем старые таблицы данных, чтобы начать с чистого листа.
-- Настройки и прокси не трогаем.
DROP TABLE IF EXISTS public.calendar_events CASCADE;
DROP TABLE IF EXISTS public.contacts CASCADE;
DROP TABLE IF EXISTS public.files CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.emails CASCADE;
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.chat_memory CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Создаем тип для ролей пользователей
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('user', 'admin');
    END IF;
END$$;


-- Создаем таблицу для профилей пользователей
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'user'::public.user_role NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.profiles IS 'Профили пользователей с дополнительными данными и ролями.';

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
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
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
DROP POLICY IF EXISTS "Пользователи могут видеть все профили." ON public.profiles;
DROP POLICY IF EXISTS "Пользователи могут обновлять свой профиль." ON public.profiles;
DROP POLICY IF EXISTS "Администраторы могут делать все." ON public.profiles;


-- Политики для профилей
CREATE POLICY "Пользователи могут видеть все профили." ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Пользователи могут обновлять свой профиль." ON public.profiles FOR UPDATE USING (auth.uid() = id);
-- Политика для администраторов будет управляться через RPC функцию.

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


-- Функция для автоматического создания профиля нового пользователя
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер, вызывающий функцию при создании нового пользователя в auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Функция для проверки, является ли пользователь администратором
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'::public.user_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC функция для обновления роли пользователя (только для администраторов)
CREATE OR REPLACE FUNCTION public.update_user_role(target_user_id UUID, new_role public.user_role)
RETURNS void AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;
  
  UPDATE public.profiles
  SET role = new_role
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql;
`.trim();
