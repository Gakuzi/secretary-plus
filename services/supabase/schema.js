// This file centralizes the SQL schema definitions for each service.
// This allows for dynamic generation of migration scripts based on user settings.

export const SHARED_SQL = `
-- Создаем или обновляем типы ENUM для ролей и отправителей
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'manager', 'user');
    ELSE
        -- Добавляем значения, если их нет. Это безопасно для повторного запуска.
        ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'owner';
        ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admin';
        ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'manager';
        ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'user';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_sender') THEN
        CREATE TYPE public.chat_sender AS ENUM ('user', 'assistant', 'system');
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

-- Таблица для сессий чата
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.sessions IS 'Отслеживает отдельные сессии чата для группировки сообщений.';

-- Таблица для истории чата
CREATE TABLE public.chat_history (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    sender public.chat_sender NOT NULL,
    text_content TEXT,
    image_metadata JSONB,
    card_data JSONB,
    contextual_actions JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.chat_history IS 'Полный лог всех взаимодействий в чате для аналитики.';

-- Таблица для долговременной памяти чата
CREATE TABLE public.chat_memory (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    summary TEXT,
    keywords TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.chat_memory IS 'Долговременная память ассистента.';

-- Таблица для хранения настроек пользователя
CREATE TABLE public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    settings JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.user_settings IS 'Облачное хранилище настроек пользователя.';

-- Таблица для статистики использования инструментов
CREATE TABLE public.action_stats (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    function_name TEXT,
    call_count INTEGER DEFAULT 1,
    PRIMARY KEY (user_id, function_name)
);
COMMENT ON TABLE public.action_stats IS 'Статистика вызова функций Gemini.';

-- Таблица для хранения прокси-серверов
CREATE TABLE public.proxies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 0,
    geolocation TEXT,
    last_checked_at TIMESTAMPTZ,
    last_test_status TEXT,
    last_test_speed INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, url)
);
COMMENT ON TABLE public.proxies IS 'Список прокси-серверов пользователя для доступа к Gemini.';

-- Включаем Row Level Security на всех общих таблицах
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxies ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики, чтобы избежать конфликтов
DROP POLICY IF EXISTS "Пользователи могут видеть все профили." ON public.profiles;
DROP POLICY IF EXISTS "Пользователи могут обновлять свой профиль." ON public.profiles;
DROP POLICY IF EXISTS "Администраторы могут делать все." ON public.profiles;
DROP POLICY IF EXISTS "Пользователи могут управлять своими сессиями и историей." ON public.sessions;
DROP POLICY IF EXISTS "Пользователи могут управлять своей историей чата." ON public.chat_history;
DROP POLICY IF EXISTS "Администраторы могут просматривать все сессии и историю." ON public.sessions;
DROP POLICY IF EXISTS "Администраторы могут просматривать всю историю чата." ON public.chat_history;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.chat_memory;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.user_settings;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.action_stats;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.proxies;

-- Функция-триггер для автоматического обновления поля 'updated_at'
CREATE OR REPLACE FUNCTION public.handle_updated_at() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW; 
END;
$$ LANGUAGE plpgsql;

-- Применяем триггер к таблицам, где он нужен
CREATE TRIGGER on_profiles_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_user_settings_update BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Функция для проверки, является ли пользователь администратором (или владельцем)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin'::public.user_role OR role = 'owner'::public.user_role)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для проверки, является ли пользователь владельцем
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'::public.user_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Политики для профилей
CREATE POLICY "Пользователи могут видеть все профили." ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Пользователи могут обновлять свой профиль." ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Политики для сессий и истории чата
CREATE POLICY "Пользователи могут управлять своими сессиями и историей." ON public.sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Пользователи могут управлять своей историей чата." ON public.chat_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Администраторы могут просматривать все сессии и историю." ON public.sessions FOR SELECT USING (public.is_admin());
CREATE POLICY "Администраторы могут просматривать всю историю чата." ON public.chat_history FOR SELECT USING (public.is_admin());

-- Общие политики
CREATE POLICY "Enable all access for authenticated users" ON public.chat_memory FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.user_settings FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.action_stats FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for authenticated users" ON public.proxies FOR ALL TO authenticated USING (auth.uid() = user_id);

-- RPC функция для получения или создания профиля пользователя.
CREATE OR REPLACE FUNCTION public.get_or_create_profile()
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    avatar_url TEXT,
    role public.user_role
) AS $$
DECLARE
    profile_exists boolean;
    user_count integer;
    new_user_role public.user_role;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()) INTO profile_exists;
    IF NOT profile_exists THEN
        SELECT count(*) INTO user_count FROM public.profiles;
        IF user_count = 0 THEN
            new_user_role := 'owner';
        ELSE
            new_user_role := 'user';
        END IF;
        INSERT INTO public.profiles (id, full_name, avatar_url, role)
        SELECT u.id, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'avatar_url', new_user_role
        FROM auth.users u WHERE u.id = auth.uid();
    END IF;
    RETURN QUERY SELECT p.id, p.full_name, p.avatar_url, p.role FROM public.profiles p WHERE p.id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC функция для обновления роли пользователя (только для владельцев)
CREATE OR REPLACE FUNCTION public.update_user_role(target_user_id UUID, new_role public.user_role)
RETURNS void AS $$
DECLARE
  target_user_role public.user_role;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'Only owners can change user roles.'; END IF;
  IF auth.uid() = target_user_id THEN RAISE EXCEPTION 'Owners cannot change their own role.'; END IF;
  SELECT role INTO target_user_role FROM public.profiles WHERE id = target_user_id;
  IF target_user_role = 'owner' THEN RAISE EXCEPTION 'Owners cannot change the role of other owners.'; END IF;
  UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql;

-- RPC для сохранения/обновления настроек
CREATE OR REPLACE FUNCTION public.upsert_user_settings(new_settings JSONB)
RETURNS void AS $$
BEGIN
  INSERT INTO public.user_settings (user_id, settings) VALUES (auth.uid(), new_settings)
  ON CONFLICT (user_id) DO UPDATE SET settings = new_settings, updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- RPC для инкремента статистики
CREATE OR REPLACE FUNCTION public.increment_stat(fn_name TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO public.action_stats (user_id, function_name, call_count) VALUES (auth.uid(), fn_name, 1)
  ON CONFLICT (user_id, function_name) DO UPDATE SET call_count = action_stats.call_count + 1;
END;
$$ LANGUAGE plpgsql;

-- Новая RPC функция для безопасного получения истории чата администратором
CREATE OR REPLACE FUNCTION public.get_chat_history_with_user_info()
RETURNS TABLE (
    id BIGINT, user_id UUID, session_id UUID, sender public.chat_sender, text_content TEXT, image_metadata JSONB, card_data JSONB,
    contextual_actions JSONB, created_at TIMESTAMPTZ, full_name TEXT, avatar_url TEXT, email TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'У вас нет прав для выполнения этой операции.'; END IF;
  RETURN QUERY SELECT h.id, h.user_id, h.session_id, h.sender, h.text_content, h.image_metadata, h.card_data, h.contextual_actions,
    h.created_at, p.full_name, p.avatar_url, u.email
  FROM public.chat_history h
  LEFT JOIN public.profiles p ON h.user_id = p.id
  LEFT JOIN auth.users u ON h.user_id = u.id
  ORDER BY h.created_at DESC LIMIT 500;
END;
$$;
`;

export const SERVICE_SCHEMAS = {
    calendar: {
        label: 'Календарь',
        icon: 'CalendarIcon',
        tableName: 'calendar_events',
        sql: `
            CREATE TABLE public.calendar_events (
                id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                source_id TEXT NOT NULL, title TEXT, description TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ,
                event_link TEXT, meet_link TEXT, attendees JSONB, status TEXT, creator_email TEXT, is_all_day BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE (user_id, source_id)
            );
            COMMENT ON TABLE public.calendar_events IS 'Кэшированные события из Google Calendar.';
            ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.calendar_events;
            CREATE POLICY "Enable all access for authenticated users" ON public.calendar_events FOR ALL TO authenticated USING (auth.uid() = user_id);
            CREATE TRIGGER on_calendar_events_update BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
        `
    },
    contacts: {
        label: 'Контакты',
        icon: 'UsersIcon',
        tableName: 'contacts',
        sql: `
            CREATE TABLE public.contacts (
                id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                source_id TEXT NOT NULL, display_name TEXT, email TEXT, phone TEXT, avatar_url TEXT, addresses JSONB, organizations JSONB,
                birthdays JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE (user_id, source_id)
            );
            COMMENT ON TABLE public.contacts IS 'Кэшированные контакты из Google Contacts.';
            ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.contacts;
            CREATE POLICY "Enable all access for authenticated users" ON public.contacts FOR ALL TO authenticated USING (auth.uid() = user_id);
            CREATE TRIGGER on_contacts_update BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
        `
    },
    files: {
        label: 'Файлы',
        icon: 'FileIcon',
        tableName: 'files',
        sql: `
            CREATE TABLE public.files (
                id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                source_id TEXT NOT NULL, name TEXT, mime_type TEXT, url TEXT, icon_link TEXT, created_time TIMESTAMPTZ, modified_time TIMESTAMPTZ,
                viewed_by_me_time TIMESTAMPTZ, size BIGINT, owner TEXT, last_modifying_user TEXT, permissions JSONB,
                created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE (user_id, source_id)
            );
            COMMENT ON TABLE public.files IS 'Кэшированная мета-информация о файлах из Google Drive.';
            ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.files;
            CREATE POLICY "Enable all access for authenticated users" ON public.files FOR ALL TO authenticated USING (auth.uid() = user_id);
            CREATE TRIGGER on_files_update BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
        `
    },
    tasks: {
        label: 'Задачи',
        icon: 'CheckSquareIcon',
        tableName: 'tasks',
        sql: `
            CREATE TABLE public.tasks (
                id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                source_id TEXT NOT NULL, title TEXT, notes TEXT, due_date TIMESTAMPTZ, status TEXT, completed_at TIMESTAMPTZ,
                parent_task_id TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE (user_id, source_id)
            );
            COMMENT ON TABLE public.tasks IS 'Кэшированные задачи из Google Tasks.';
            ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.tasks;
            CREATE POLICY "Enable all access for authenticated users" ON public.tasks FOR ALL TO authenticated USING (auth.uid() = user_id);
            CREATE TRIGGER on_tasks_update BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
        `
    },
    emails: {
        label: 'Почта',
        icon: 'EmailIcon',
        tableName: 'emails',
        sql: `
            CREATE TABLE public.emails (
                id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                source_id TEXT NOT NULL,
                thread_id TEXT,
                subject TEXT,
                snippet TEXT,
                sender_info JSONB,
                recipients_info JSONB,
                received_at TIMESTAMPTZ,
                full_body TEXT,
                has_attachments BOOLEAN DEFAULT false,
                attachments_metadata JSONB,
                label_ids TEXT[],
                gmail_link TEXT,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                UNIQUE (user_id, source_id)
            );
            COMMENT ON TABLE public.emails IS 'Кэшированные письма из Gmail для быстрого поиска.';
            ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.emails;
            CREATE POLICY "Enable all access for authenticated users" ON public.emails FOR ALL TO authenticated USING (auth.uid() = user_id);
            CREATE TRIGGER on_emails_update BEFORE UPDATE ON public.emails FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
        `
    },
    notes: {
        label: 'Заметки',
        icon: 'FileIcon',
        tableName: 'notes',
        sql: `
            CREATE TABLE public.notes (
                id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                title TEXT, content TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
            );
            COMMENT ON TABLE public.notes IS 'Заметки, созданные пользователем внутри приложения.';
            ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.notes;
            CREATE POLICY "Enable all access for authenticated users" ON public.notes FOR ALL TO authenticated USING (auth.uid() = user_id);
            CREATE TRIGGER on_notes_update BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
        `
    }
};