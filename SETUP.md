# Инструкция по настройке "Секретарь+"

Этот файл содержит все необходимые инструкции для первоначальной настройки вашего проекта в Supabase и Cloudflare.

---

## Часть 1: Настройка базы данных Supabase

### Шаг 1: Создание проекта в Supabase

1.  Перейдите на [supabase.com](https://supabase.com/) и создайте новый проект.
2.  Сохраните **URL проекта** и **ключ `anon`** из настроек API вашего проекта. Они понадобятся для файла `config.js`.

### Шаг 2: Настройка аутентификации Google

1.  В панели управления Supabase перейдите в раздел **Authentication** -> **Providers**.
2.  Включите провайдер **Google**.
3.  Вам нужно будет создать учетные данные OAuth 2.0 в [Google Cloud Console](https://console.cloud.google.com/).
4.  Скопируйте **Redirect URI** из настроек провайдера Google в Supabase и вставьте его в поле "Authorized redirect URIs" в Google Cloud Console.
5.  Скопируйте **Client ID** и **Client Secret** из Google Cloud Console и вставьте их в соответствующие поля в Supabase.
6.  Убедитесь, что вы добавили все необходимые области (scopes) в Google Cloud Console, которые указаны в файле `constants.js` вашего приложения.
7.  Сохраните настройки провайдера в Supabase.

### Шаг 3: Выполнение SQL-скрипта

1.  В панели управления Supabase перейдите в раздел **SQL Editor**.
2.  Нажмите **New query**.
3.  **Скопируйте ВЕСЬ код** из блока ниже и вставьте его в редактор SQL.
4.  Нажмите кнопку **RUN**.

После успешного выполнения скрипта ваша база данных будет полностью готова к работе с приложением.

---

#### SQL-скрипт для настройки базы данных

```sql
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
    SELECT p.id, p.full_name, p.avatar_url, p.role, u.email, u.last_sign_in_at
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
```
---

## Часть 2 (Опционально): Настройка Прокси-воркера

Этот воркер необходим для обхода региональных ограничений Gemini API. Он будет перенаправлять ваши запросы и добавлять необходимые CORS-заголовки.

### Шаг 1: Создание Cloudflare Worker

1.  Войдите в [панель управления Cloudflare](https://dash.cloudflare.com/).
2.  В меню слева выберите **Workers & Pages**.
3.  Нажмите **Create application** > **Create Worker**.
4.  Дайте воркеру уникальное имя (например, `my-gemini-proxy-123`) и нажмите **Deploy**.

### Шаг 2: Редактирование кода воркера

1.  После развертывания нажмите **Configure Worker** (или **Edit code**).
2.  Удалите весь существующий код и вставьте следующий:

    ```javascript
    // Адрес API Gemini
    const GEMINI_API_HOST = "generativelanguage.googleapis.com";

    addEventListener('fetch', event => {
      event.respondWith(handleRequest(event.request));
    });

    async function handleRequest(request) {
      const url = new URL(request.url);
      
      // Перенаправляем все запросы на API Gemini
      url.host = GEMINI_API_HOST;

      // Создаем новый запрос с измененным URL
      const newRequest = new Request(url, request);
      
      // Отправляем запрос к API
      const response = await fetch(newRequest);

      // Создаем новый ответ, чтобы можно было добавить CORS-заголовки
      const newResponse = new Response(response.body, response);
      newResponse.headers.set("Access-Control-Allow-Origin", "*");
      newResponse.headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      newResponse.headers.set("Access-Control-Allow-Headers", "*");

      return newResponse;
    }
    ```

3.  Нажмите **Save and Deploy**.
4.  **Скопируйте URL** этого воркера (например, `https://my-gemini-proxy-123.workers.dev`).
5.  Этот URL вы сможете добавить в **Панели Управления** приложения (Профиль -> Администратору -> Управление Прокси), когда будете в роли администратора.
```
