// This file centralizes the SQL schema definitions for each service.
// This allows for dynamic generation of migration scripts based on user settings.

export const SHARED_SQL = `
-- Создаем или обновляем типы ENUM для ролей и отправителей
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'manager', 'user');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_sender') THEN
        CREATE TYPE public.chat_sender AS ENUM ('user', 'assistant', 'system');
    END IF;
END$$;


-- Создаем таблицу для профилей пользователей
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'user'::public.user_role NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.profiles IS 'Профили пользователей с дополнительными данными и ролями.';

-- Таблица для сессий чата
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.sessions IS 'Отслеживает отдельные сессии чата для группировки сообщений.';

-- Таблица для истории чата
CREATE TABLE IF NOT EXISTS public.chat_history (
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
CREATE TABLE IF NOT EXISTS public.chat_memory (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    summary TEXT,
    keywords TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.chat_memory IS 'Долговременная память ассистента.';

-- Таблица для хранения настроек пользователя
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    settings JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.user_settings IS 'Облачное хранилище настроек пользователя.';

-- Таблица для статистики использования инструментов
CREATE TABLE IF NOT EXISTS public.action_stats (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    function_name TEXT,
    call_count INTEGER DEFAULT 1,
    last_called_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, function_name)
);
COMMENT ON TABLE public.action_stats IS 'Статистика вызова функций Gemini.';

-- NEW: Таблица для ОБЩИХ прокси-серверов
CREATE TABLE IF NOT EXISTS public.shared_proxies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    geolocation TEXT,
    last_checked_at TIMESTAMPTZ,
    last_test_status TEXT,
    last_test_speed INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.shared_proxies IS 'Общий пул прокси-серверов, управляемый администраторами.';

-- NEW: Таблица для ОБЩИХ ключей Gemini API
CREATE TABLE IF NOT EXISTS public.shared_gemini_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    description TEXT,
    last_used_at TIMESTAMPTZ,
    limit_reached_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.shared_gemini_keys IS 'Общий пул ключей Gemini API, управляемый администраторами.';


-- Функция-триггер для автоматического обновления поля 'updated_at'
CREATE OR REPLACE FUNCTION public.handle_updated_at() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW; 
END;
$$ LANGUAGE plpgsql;

-- Применяем триггер к таблицам, где он нужен
DROP TRIGGER IF EXISTS on_profiles_update ON public.profiles;
CREATE TRIGGER on_profiles_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_user_settings_update ON public.user_settings;
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Функция для проверки, является ли пользователь владельцем
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'::public.user_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Включаем RLS и создаем политики
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_gemini_keys ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики, чтобы избежать конфликтов
DROP POLICY IF EXISTS "Enable all access for users" ON public.profiles;
DROP POLICY IF EXISTS "Enable all access for users" ON public.sessions;
DROP POLICY IF EXISTS "Enable all access for users" ON public.chat_history;
DROP POLICY IF EXISTS "Enable read access for admins" ON public.sessions;
DROP POLICY IF EXISTS "Enable read access for admins" ON public.chat_history;
DROP POLICY IF EXISTS "Enable all access for users" ON public.chat_memory;
DROP POLICY IF EXISTS "Enable all access for users" ON public.user_settings;
DROP POLICY IF EXISTS "Enable all access for users" ON public.action_stats;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.shared_proxies;
DROP POLICY IF EXISTS "Enable management for admins" ON public.shared_proxies;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.shared_gemini_keys;
DROP POLICY IF EXISTS "Enable management for admins" ON public.shared_gemini_keys;

-- Политики для профилей
CREATE POLICY "Enable all access for users" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Политики для сессий и истории чата
CREATE POLICY "Enable all access for users" ON public.sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for users" ON public.chat_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Enable read access for admins" ON public.sessions FOR SELECT USING (public.is_admin());
CREATE POLICY "Enable read access for admins" ON public.chat_history FOR SELECT USING (public.is_admin());

-- Общие политики для пользовательских данных
CREATE POLICY "Enable all access for users" ON public.chat_memory FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for users" ON public.user_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Enable all access for users" ON public.action_stats FOR ALL USING (auth.uid() = user_id);

-- Политики для ОБЩИХ таблиц
CREATE POLICY "Enable read for authenticated users" ON public.shared_proxies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable management for admins" ON public.shared_proxies FOR ALL USING (public.is_admin());
CREATE POLICY "Enable read for authenticated users" ON public.shared_gemini_keys FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable management for admins" ON public.shared_gemini_keys FOR ALL USING (public.is_admin());

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

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
  INSERT INTO public.action_stats (user_id, function_name, call_count, last_called_at) VALUES (auth.uid(), fn_name, 1, now())
  ON CONFLICT (user_id, function_name) DO UPDATE SET call_count = action_stats.call_count + 1, last_called_at = now();
END;
$$ LANGUAGE plpgsql;

-- Новая RPC функция для безопасного получения истории чата администратором
CREATE OR REPLACE FUNCTION public.get_chat_history_with_user_info()
RETURNS TABLE (
    id BIGINT, user_id UUID, session_id UUID, sender public.chat_sender, text_content TEXT, image_metadata JSONB, card_data JSONB,
    contextual_actions JSONB, created_at TIMESTAMPTZ, full_name TEXT, avatar_url TEXT, email TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'У вас нет прав для выполнения этой операции.'; END IF;
  RETURN QUERY SELECT h.id, h.user_id, h.session_id, h.sender, h.text_content, h.image_metadata, h.card_data, h.contextual_actions,
    h.created_at, p.full_name, p.avatar_url, u.email::text
  FROM public.chat_history h
  LEFT JOIN public.profiles p ON h.user_id = p.id
  LEFT JOIN auth.users u ON h.user_id = u.id
  ORDER BY h.created_at DESC LIMIT 500;
END;
$$;

-- Новая RPC функция для безопасного получения профилей всех пользователей администратором
CREATE OR REPLACE FUNCTION public.get_all_user_profiles_with_email()
RETURNS TABLE (
    id UUID, full_name TEXT, avatar_url TEXT, role public.user_role, email TEXT, last_sign_in_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'У вас нет прав для выполнения этой операции.';
    END IF;
    RETURN QUERY
    SELECT p.id, p.full_name, p.avatar_url, p.role, u.email::text, u.last_sign_in_at
    FROM public.profiles p
    JOIN auth.users u ON p.id = u.id
    ORDER BY p.role, p.full_name;
END;
$$;

-- Новая RPC-функция для сбора полной статистики
CREATE OR REPLACE FUNCTION public.get_full_stats()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'У вас нет прав для выполнения этой операции.';
    END IF;

    SELECT jsonb_build_object(
        'actions_by_day', (
            SELECT jsonb_agg(t) FROM (
                SELECT (last_called_at::date) AS date, SUM(call_count) AS count
                FROM public.action_stats
                GROUP BY date
                ORDER BY date
            ) t
        ),
        'actions_by_function', (
            SELECT jsonb_agg(t) FROM (
                SELECT function_name, SUM(call_count) AS count
                FROM public.action_stats
                GROUP BY function_name
                ORDER BY count DESC
            ) t
        ),
        'actions_by_user', (
            SELECT jsonb_agg(t) FROM (
                SELECT p.full_name, SUM(a.call_count) AS count
                FROM public.action_stats a
                JOIN public.profiles p ON a.user_id = p.id
                GROUP BY p.full_name
                ORDER BY count DESC
            ) t
        ),
        'responses_by_type', (
             SELECT jsonb_agg(t) FROM (
                SELECT 
                    CASE WHEN card_data IS NOT NULL THEN 'card' ELSE 'text' END as type,
                    count(*) as count
                FROM public.chat_history
                WHERE sender = 'assistant'
                GROUP BY type
            ) t
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- RPC для админов: получить все общие ключи
CREATE OR REPLACE FUNCTION public.get_all_shared_gemini_keys_for_admin()
RETURNS TABLE (
    id UUID,
    api_key TEXT,
    is_active BOOLEAN,
    priority INTEGER,
    description TEXT,
    created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'У вас нет прав для выполнения этой операции.'; END IF;
  RETURN QUERY SELECT k.id, k.api_key, k.is_active, k.priority, k.description, k.created_at FROM public.shared_gemini_keys k ORDER BY k.priority, k.created_at;
END;
$$;

-- RPC для админов: добавить новый ключ
CREATE OR REPLACE FUNCTION public.add_shared_gemini_key(p_api_key TEXT, p_description TEXT, p_priority INTEGER)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'У вас нет прав для выполнения этой операции.'; END IF;
  INSERT INTO public.shared_gemini_keys (api_key, description, priority, is_active) VALUES (p_api_key, p_description, p_priority, true);
END;
$$;

-- RPC для админов: обновить ключ
CREATE OR REPLACE FUNCTION public.update_shared_gemini_key(p_id UUID, p_updates JSONB)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'У вас нет прав для выполнения этой операции.'; END IF;
  UPDATE public.shared_gemini_keys SET
    api_key = COALESCE((p_updates->>'api_key')::TEXT, api_key),
    description = COALESCE((p_updates->>'description')::TEXT, description),
    priority = COALESCE((p_updates->>'priority')::INTEGER, priority),
    is_active = COALESCE((p_updates->>'is_active')::BOOLEAN, is_active)
  WHERE id = p_id;
END;
$$;

-- RPC для админов: удалить ключ
CREATE OR REPLACE FUNCTION public.delete_shared_gemini_key(p_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'У вас нет прав для выполнения этой операции.'; END IF;
  DELETE FROM public.shared_gemini_keys WHERE id = p_id;
END;
$$;
`;

// Renamed from SERVICE_SCHEMAS to DB_SCHEMAS to reflect that it now includes all tables.
export const DB_SCHEMAS = {
    profiles: {
        label: 'Профили', icon: 'UserIcon', tableName: 'profiles', isEditable: false,
        fields: [
            { name: 'id', type: 'UUID PRIMARY KEY', recommended: true, description: 'Уникальный идентификатор пользователя, совпадает с ID в системе аутентификации.' },
            { name: 'full_name', type: 'TEXT', recommended: true, description: 'Полное имя пользователя, полученное от провайдера аутентификации.' },
            { name: 'avatar_url', type: 'TEXT', recommended: true, description: 'URL аватара пользователя.' },
            { name: 'role', type: 'user_role', recommended: true, description: 'Роль пользователя в системе (owner, admin, user). Определяет уровень доступа.' },
            { name: 'updated_at', type: 'TIMESTAMPTZ', recommended: true, description: 'Время последнего обновления записи профиля.' },
        ]
    },
    user_settings: {
        label: 'Настройки пользователей', icon: 'SettingsIcon', tableName: 'user_settings', isEditable: false,
        fields: [
            { name: 'user_id', type: 'UUID PRIMARY KEY', recommended: true, description: 'Идентификатор пользователя, к которому относятся настройки.' },
            { name: 'settings', type: 'JSONB', recommended: true, description: 'Все настройки приложения в формате JSON (ключи, сервисы, прокси и т.д.).' },
            { name: 'updated_at', type: 'TIMESTAMPTZ', recommended: true, description: 'Время последнего сохранения настроек.' },
        ]
    },
     shared_proxies: {
        label: 'Общие прокси', icon: 'GlobeIcon', tableName: 'shared_proxies', isEditable: false,
        fields: [
            { name: 'id', type: 'UUID PRIMARY KEY', recommended: true, description: 'Уникальный идентификатор прокси-сервера.' },
            { name: 'url', type: 'TEXT', recommended: true, description: 'Полный URL прокси-сервера.' },
            { name: 'is_active', type: 'BOOLEAN', recommended: true, description: 'Включен ли данный прокси для использования.' },
            { name: 'priority', type: 'INTEGER', recommended: true, description: 'Приоритет использования (чем меньше, тем выше).' },
        ]
    },
    shared_gemini_keys: {
        label: 'Общие ключи Gemini', icon: 'CodeIcon', tableName: 'shared_gemini_keys', isEditable: false,
        fields: [
            { name: 'id', type: 'UUID PRIMARY KEY', recommended: true, description: 'Уникальный идентификатор ключа.' },
            { name: 'api_key', type: 'TEXT', recommended: true, description: 'Зашифрованный ключ Gemini API.' },
            { name: 'is_active', type: 'BOOLEAN', recommended: true, description: 'Активен ли ключ.' },
            { name: 'priority', type: 'INTEGER', recommended: true, description: 'Приоритет использования.' },
        ]
    },
     sessions: {
        label: 'Сеансы', icon: 'KeyboardIcon', tableName: 'sessions', isEditable: false,
        fields: [
            { name: 'id', type: 'UUID PRIMARY KEY', recommended: true, description: 'Уникальный идентификатор сессии чата.' },
            { name: 'user_id', type: 'UUID', recommended: true, description: 'Идентификатор пользователя, начавшего сессию.' },
            { name: 'created_at', type: 'TIMESTAMPTZ', recommended: true, description: 'Время начала сессии.' },
        ]
    },
    chat_history: {
        label: 'История чата', icon: 'FileIcon', tableName: 'chat_history', isEditable: false,
        fields: [
            { name: 'id', type: 'BIGINT PRIMARY KEY', recommended: true, description: 'Уникальный идентификатор сообщения.' },
            { name: 'user_id', type: 'UUID', recommended: true, description: 'Идентификатор пользователя.' },
            { name: 'session_id', type: 'UUID', recommended: true, description: 'Идентификатор сессии, к которой относится сообщение.' },
            { name: 'sender', type: 'chat_sender', recommended: true, description: 'Отправитель сообщения (user, assistant, system).' },
            { name: 'text_content', type: 'TEXT', recommended: true, description: 'Текстовое содержимое сообщения.' },
            { name: 'card_data', type: 'JSONB', recommended: true, description: 'Данные интерактивной карточки в формате JSON.' },
        ]
    },
    chat_memory: {
        label: 'Память чата', icon: 'FileIcon', tableName: 'chat_memory', isEditable: false,
        fields: [
            { name: 'id', type: 'BIGINT PRIMARY KEY', recommended: true, description: 'Уникальный идентификатор записи в памяти.' },
            { name: 'user_id', type: 'UUID', recommended: true, description: 'Идентификатор пользователя.' },
            { name: 'summary', type: 'TEXT', recommended: true, description: 'Краткая сводка из диалога.' },
            { name: 'keywords', type: 'TEXT[]', recommended: true, description: 'Ключевые слова для поиска.' },
        ]
    },
     action_stats: {
        label: 'Параметры действия', icon: 'ChartBarIcon', tableName: 'action_stats', isEditable: false,
        fields: [
            { name: 'user_id', type: 'UUID', recommended: true, description: 'Идентификатор пользователя.' },
            { name: 'function_name', type: 'TEXT', recommended: true, description: 'Название вызванной функции Gemini.' },
            { name: 'call_count', type: 'INTEGER', recommended: true, description: 'Количество вызовов функции.' },
            { name: 'last_called_at', type: 'TIMESTAMPTZ', recommended: true, description: 'Время последнего вызова.' },
        ]
    },
    calendar: {
        label: 'Календарь-мероприятий', icon: 'CalendarIcon', tableName: 'calendar_events', isEditable: true,
        fields: [
            { name: 'source_id', type: 'TEXT', recommended: true, description: 'Уникальный идентификатор события из Google Calendar.' },
            { name: 'title', type: 'TEXT', recommended: true, description: 'Название или заголовок события.' },
            { name: 'description', type: 'TEXT', recommended: true, description: 'Полное описание события.' },
            { name: 'start_time', type: 'TIMESTAMPTZ', recommended: true, description: 'Дата и время начала события.' },
            { name: 'end_time', type: 'TIMESTAMPTZ', recommended: true, description: 'Дата и время окончания события.' },
            { name: 'event_link', type: 'TEXT', recommended: true, description: 'Прямая ссылка на событие в интерфейсе Google Calendar.' },
            { name: 'meet_link', type: 'TEXT', recommended: true, description: 'Ссылка на видеовстречу Google Meet, если она привязана к событию.' },
            { name: 'attendees', type: 'JSONB', recommended: false, description: 'Список участников встречи в формате JSON.' },
            { name: 'status', type: 'TEXT', recommended: false, description: 'Статус события (например, "confirmed", "cancelled").' },
            { name: 'creator_email', type: 'TEXT', recommended: false, description: 'Email создателя события.' },
            { name: 'is_all_day', type: 'BOOLEAN', recommended: true, description: 'Флаг, указывающий, длится ли событие весь день.' },
        ]
    },
    contacts: {
        label: 'Контакты', icon: 'UsersIcon', tableName: 'contacts', isEditable: true,
        fields: [
            { name: 'source_id', type: 'TEXT', recommended: true, description: 'Уникальный идентификатор контакта из Google Contacts.' },
            { name: 'display_name', type: 'TEXT', recommended: true, description: 'Отображаемое имя контакта.' },
            { name: 'email', type: 'TEXT', recommended: true, description: 'Основной email-адрес контакта.' },
            { name: 'phone', type: 'TEXT', recommended: true, description: 'Основной номер телефона контакта.' },
            { name: 'avatar_url', type: 'TEXT', recommended: true, description: 'URL фотографии (аватара) контакта.' },
            { name: 'addresses', type: 'JSONB', recommended: false, description: 'Почтовые адреса в формате JSON.' },
            { name: 'organizations', type: 'JSONB', recommended: false, description: 'Информация об организации и должности в формате JSON.' },
            { name: 'birthdays', type: 'JSONB', recommended: false, description: 'Даты рождения в формате JSON.' },
        ]
    },
    files: {
        label: 'Файлы', icon: 'FileIcon', tableName: 'files', isEditable: true,
        fields: [
            { name: 'source_id', type: 'TEXT', recommended: true, description: 'Уникальный идентификатор файла из Google Drive.' },
            { name: 'name', type: 'TEXT', recommended: true, description: 'Название файла.' },
            { name: 'mime_type', type: 'TEXT', recommended: true, description: 'MIME-тип файла (например, "application/pdf").' },
            { name: 'url', type: 'TEXT', recommended: true, description: 'Прямая ссылка на просмотр файла в Google Drive.' },
            { name: 'icon_link', type: 'TEXT', recommended: true, description: 'Ссылка на иконку, представляющую тип файла.' },
            { name: 'created_time', type: 'TIMESTAMPTZ', recommended: true, description: 'Дата и время создания файла.' },
            { name: 'modified_time', type: 'TIMESTAMPTZ', recommended: true, description: 'Дата и время последнего изменения файла.' },
            { name: 'viewed_by_me_time', type: 'TIMESTAMPTZ', recommended: false, description: 'Когда пользователь последний раз просматривал файл.' },
            { name: 'size', type: 'BIGINT', recommended: false, description: 'Размер файла в байтах.' },
            { name: 'owner', type: 'TEXT', recommended: false, description: 'Имя владельца файла.' },
            { name: 'last_modifying_user', type: 'TEXT', recommended: false, description: 'Имя пользователя, который последним изменил файл.' },
        ]
    },
    tasks: {
        label: 'Задачи', icon: 'CheckSquareIcon', tableName: 'tasks', isEditable: true,
        fields: [
            { name: 'source_id', type: 'TEXT', recommended: true, description: 'Уникальный идентификатор задачи из Google Tasks.' },
            { name: 'title', type: 'TEXT', recommended: true, description: 'Текст или название задачи.' },
            { name: 'notes', type: 'TEXT', recommended: true, description: 'Подробное описание или заметки к задаче.' },
            { name: 'due_date', type: 'TIMESTAMPTZ', recommended: true, description: 'Срок выполнения задачи.' },
            { name: 'status', type: 'TEXT', recommended: true, description: 'Статус задачи (например, "needsAction", "completed").' },
            { name: 'completed_at', type: 'TIMESTAMPTZ', recommended: false, description: 'Дата и время завершения задачи.' },
            { name: 'parent_task_id', type: 'TEXT', recommended: false, description: 'Идентификатор родительской задачи для вложенных задач.' },
        ]
    },
    emails: {
        label: 'Электронные письма', icon: 'EmailIcon', tableName: 'emails', isEditable: true,
        fields: [
            { name: 'source_id', type: 'TEXT', recommended: true, description: 'Уникальный идентификатор письма из Gmail.' },
            { name: 'thread_id', type: 'TEXT', recommended: true, description: 'Идентификатор цепочки писем, к которой относится это письмо.' },
            { name: 'subject', type: 'TEXT', recommended: true, description: 'Тема письма.' },
            { name: 'snippet', type: 'TEXT', recommended: true, description: 'Короткий фрагмент (сниппет) содержания письма.' },
            { name: 'sender_info', type: 'JSONB', recommended: true, description: 'Информация об отправителе (имя, email) в формате JSON.' },
            { name: 'recipients_info', type: 'JSONB', recommended: false, description: 'Информация о получателях (To, Cc) в формате JSON.' },
            { name: 'received_at', type: 'TIMESTAMPTZ', recommended: true, description: 'Дата и время получения письма.' },
            { name: 'full_body', type: 'TEXT', recommended: true, description: 'Полное текстовое содержимое письма.' },
            { name: 'has_attachments', type: 'BOOLEAN', recommended: true, description: 'Флаг, указывающий на наличие вложений.' },
            { name: 'attachments_metadata', type: 'JSONB', recommended: false, description: 'Метаданные вложений (имя файла, тип, размер) в формате JSON.' },
            { name: 'label_ids', type: 'TEXT[]', recommended: false, description: 'Список ярлыков, присвоенных письму в Gmail.' },
            { name: 'gmail_link', type: 'TEXT', recommended: true, description: 'Прямая ссылка на открытие письма в интерфейсе Gmail.' },
        ]
    },
    notes: {
        label: 'Примечания', icon: 'FileIcon', tableName: 'notes', isEditable: true,
        fields: [
            { name: 'title', type: 'TEXT', recommended: true, description: 'Заголовок заметки.' },
            { name: 'content', type: 'TEXT', recommended: true, description: 'Основное содержимое заметки.' },
        ]
    }
};

/**
 * Generates a complete CREATE TABLE SQL statement for a given service schema.
 * Includes table creation, comments, RLS policies, and triggers.
 * @param {object} schema The schema object from DB_SCHEMAS.
 * @param {Array<object>} fieldsToCreate An array of field objects to include in the table.
 * @returns {string} The complete SQL statement for creating the table.
 */
export function generateCreateTableSql(schema, fieldsToCreate) {
    const tableName = schema.tableName;
    
    // Use only the fields passed to the function
    const columns = fieldsToCreate.map(field => `    "${field.name}" ${field.type}`);

    // Add common columns that are not part of the dynamic fields list but are essential for every table.
    const commonColumns = [
        'id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY',
        'user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE',
        'created_at TIMESTAMPTZ DEFAULT now()',
        'updated_at TIMESTAMPTZ DEFAULT now()'
    ];
    
    const allColumns = [...commonColumns, ...columns];

    // Add UNIQUE constraint for tables that have a source_id to prevent duplicates per user.
    const hasSourceId = fieldsToCreate.some(f => f.name === 'source_id');
    if(hasSourceId) {
        // Find the source_id field to correctly handle its type (TEXT or others)
        const sourceIdField = fieldsToCreate.find(f => f.name === 'source_id');
        // Re-add it without PRIMARY KEY, as 'id' is now the primary key.
        const sourceIdIndex = allColumns.findIndex(c => c.includes('source_id'));
        if (sourceIdIndex > -1) {
            allColumns[sourceIdIndex] = `    "source_id" ${sourceIdField.type}`;
        }
        allColumns.push(`    UNIQUE(user_id, source_id)`);
    }
     // Special case for 'notes' which has no source_id and should use its own `id`
    if (tableName === 'notes') {
        allColumns.splice(0, 1, 'id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY');
    }
    
    const sql = `
-- Create table for: ${schema.label}
CREATE TABLE IF NOT EXISTS public.${tableName} (
${allColumns.join(',\n')}
);

-- Comment on table
COMMENT ON TABLE public.${tableName} IS 'Cached data for the ${schema.label} service.';

-- Enable RLS
ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;

-- Drop old policy to avoid errors on re-run
DROP POLICY IF EXISTS "Enable all access for users" ON public.${tableName};

-- Policy: Users can see and modify only their own data
CREATE POLICY "Enable all access for users" ON public.${tableName}
FOR ALL USING (auth.uid() = user_id);

-- Trigger to automatically update 'updated_at'
DROP TRIGGER IF EXISTS on_${tableName}_update ON public.${tableName};
CREATE TRIGGER on_${tableName}_update
BEFORE UPDATE ON public.${tableName}
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
`;

    return sql;
}