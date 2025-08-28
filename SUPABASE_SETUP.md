# Инструкция по настройке Supabase для «Секретарь+»

Это руководство поможет вам шаг за шагом настроить проект Supabase, который будет служить бэкендом для вашего приложения.

## Шаг 1: Создание проекта в Supabase

1.  Перейдите на [supabase.com](https://supabase.com/) и войдите в свою учетную запись.
2.  Нажмите **"New project"**.
3.  Выберите организацию и придумайте **имя** для вашего проекта (например, `secretary-plus-app`).
4.  Сгенерируйте надежный **пароль** для базы данных и сохраните его в безопасном месте.
5.  Выберите **регион**, ближайший к вашим пользователям.
6.  Нажмите **"Create new project"** и подождите несколько минут, пока проект будет создан.

## Шаг 2: Создание таблиц в базе данных

После создания проекта вам нужно определить структуру данных, где будут храниться контакты и файлы.

1.  В боковом меню вашего проекта выберите **SQL Editor**.
2.  Нажмите **"New query"**.
3.  Скопируйте **весь** приведенный ниже SQL-код и вставьте его в редактор. Этот код создаст необходимые таблицы (`contacts`, `files`) и настроит политики безопасности.
4.  Нажмите кнопку **"RUN"**.

```sql
-- Таблица для хранения синхронизированных контактов
CREATE TABLE public.contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL, -- Источник (например, 'google', 'apple')
  source_id TEXT, -- ID контакта в исходной системе
  display_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, source, source_id) -- Уникальность контакта для пользователя и источника
);

-- Комментарии к таблице контактов
COMMENT ON TABLE public.contacts IS 'Stores synchronized contacts from various services.';
COMMENT ON COLUMN public.contacts.source IS 'The service the contact was imported from (e.g., "google").';
COMMENT ON COLUMN public.contacts.source_id IS 'The contact''s unique identifier in the source service.';

-- Таблица для хранения метаданных синхронизированных файлов
CREATE TABLE public.files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL, -- Источник (например, 'google_drive')
  source_id TEXT, -- ID файла в исходной системе
  name TEXT NOT NULL,
  mime_type TEXT,
  url TEXT,
  icon_link TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, source, source_id) -- Уникальность файла для пользователя и источника
);

-- Комментарии к таблице файлов
COMMENT ON TABLE public.files IS 'Stores synchronized file metadata from cloud storage services.';
COMMENT ON COLUMN public.files.source IS 'The service the file was imported from (e.g., "google_drive").';
COMMENT ON COLUMN public.files.source_id IS 'The file''s unique identifier in the source service.';


-- ВАЖНО: Настройка политик безопасности (Row Level Security)

-- 1. Включаем RLS для таблиц
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- 2. Создаем политики, которые разрешают пользователям доступ ТОЛЬКО к их собственным данным

-- Политики для таблицы 'contacts'
CREATE POLICY "Allow users to manage their own contacts"
ON public.contacts
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Политики для таблицы 'files'
CREATE POLICY "Allow users to manage their own files"
ON public.files
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

**Что делает этот скрипт?**
-   **Создает таблицы:** `contacts` для контактов и `files` для файлов.
-   **Включает Row Level Security (RLS):** Это важнейший шаг для безопасности. RLS гарантирует, что каждый пользователь сможет видеть и изменять **только свои собственные данные**.
-   **Создает политики:** Определяет правила, по которым работает RLS.

## Шаг 3: Настройка аутентификации Google

Приложение использует Supabase для входа пользователей через их Google-аккаунты.

1.  В боковом меню выберите **Authentication**, затем перейдите во вкладку **Providers**.
2.  Найдите **Google** в списке и разверните его.
3.  Вы увидите поле **"Redirect URI"**. Скопируйте этот URL. Он понадобится вам для настройки в Google Cloud Console.
4.  Перейдите в [Google Cloud Console](https://console.cloud.google.com/apis/credentials) и настройте ваш "OAuth 2.0 Client ID", вставив скопированный URI в поле "Authorized redirect URIs".
5.  После создания Client ID в Google Cloud, скопируйте оттуда **Client ID** и **Client Secret**.
6.  Вернитесь в Supabase, вставьте `Client ID` и `Client Secret` в соответствующие поля в настройках провайдера Google.
7.  Убедитесь, что переключатель **"Enabled"** для Google активен.
8.  Нажмите **"Save"**.

## Шаг 4: Получение ключей для приложения

Теперь вам нужны ключи, чтобы ваше веб-приложение могло подключиться к Supabase.

1.  В боковом меню выберите **Project Settings** (иконка шестеренки).
2.  Перейдите в раздел **API**.
3.  В разделе **Project API keys** вы найдете:
    *   **Project URL** — это ваш уникальный URL для Supabase.
    *   **anon public** key — это публичный ключ, безопасный для использования в клиентском приложении.
4.  Скопируйте оба этих значения. Они понадобятся вам для ввода в настройках приложения «Секретарь+».

**Поздравляем!** Ваш бэкенд на Supabase полностью настроен и готов к работе с приложением.