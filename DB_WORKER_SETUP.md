# Инструкция по настройке Управляющего Воркера (DB Worker)

Этот воркер (Supabase Edge Function) **необходим** для безопасного автоматического обновления схемы вашей базы данных прямо из приложения. Он действует как защищенный посредник, который принимает SQL-запросы от администратора, проверяет его права и выполняет их от имени `postgres`, обходя ограничения RLS.

---

### Шаг 1: Создание новой Edge Function

1.  **Войдите в панель управления Supabase:**
    *   Перейдите на [supabase.com](https://supabase.com/) и откройте ваш проект.

2.  **Перейдите в раздел Edge Functions:**
    *   В меню слева выберите иконку молнии (**Edge Functions**).

3.  **Создайте новую функцию:**
    *   Нажмите **Create a new function**.
    *   Дайте функции имя `db-admin` и нажмите **Create function**.

### Шаг 2: Добавление кода функции

1.  После создания функции вы увидите редактор кода.
2.  **Удалите весь существующий код** и вставьте следующий код:

    ```javascript
    import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

    // Вспомогательная функция для отправки стандартизированных ответов
    const sendResponse = (body, status) => {
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Разрешаем CORS
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret-token',
      });
      return new Response(JSON.stringify(body), { headers, status });
    };

    Deno.serve(async (req) => {
      // Обработка CORS preflight-запроса
      if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 
            'Access-Control-Allow-Origin': '*', 
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret-token' 
        }});
      }

      // 1. Проверка метода запроса (только POST)
      if (req.method !== 'POST') {
        return sendResponse({ error: 'Method Not Allowed' }, 405);
      }
      
      // 2. Проверка токена администратора
      const adminSecretToken = req.headers.get('x-admin-secret-token');
      if (!adminSecretToken || adminSecretToken !== Deno.env.get('ADMIN_SECRET_TOKEN')) {
        return sendResponse({ error: 'Forbidden: Invalid or missing admin secret token' }, 403);
      }

      // 3. Создание клиента Supabase с правами администратора (service_role)
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL'),
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      );

      try {
        // 4. Проверка прав пользователя, отправившего запрос
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
          return sendResponse({ error: 'Missing Authorization header' }, 401);
        }
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
        
        if (userError || !user) {
          return sendResponse({ error: `Authentication failed: ${userError?.message}` }, 401);
        }

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || !userProfile || !['admin', 'owner'].includes(userProfile.role)) {
           return sendResponse({ error: 'Forbidden: User is not an admin or owner' }, 403);
        }
      
        // 5. Получение и выполнение SQL-запроса
        const { sql_query } = await req.json();
        if (!sql_query || typeof sql_query !== 'string') {
          return sendResponse({ error: 'sql_query is required and must be a string' }, 400);
        }

        // Используем прямой запрос к БД, так как RPC с execute небезопасен для function calls
        const { error: queryError } = await supabaseAdmin.from('profiles').select().sql(sql_query);
        
        // ВАЖНО: Прямое выполнение SQL через .sql() может не работать для DDL (CREATE, ALTER).
        // Вместо этого создадим специальную RPC-функцию, которая будет выполнять SQL.
        // Это более надежный подход.
        const { error: rpcExecError } = await supabaseAdmin.rpc('execute_sql_as_postgres', { query: sql_query });

        if (rpcExecError) {
          console.error('SQL Execution Error:', rpcExecError);
          return sendResponse({ error: `SQL execution failed: ${rpcExecError.message}` }, 500);
        }

        return sendResponse({ message: 'SQL executed successfully' }, 200);

      } catch (e) {
        console.error('Unexpected error:', e);
        return sendResponse({ error: `Internal Server Error: ${e.message}` }, 500);
      }
    });
    ```

3.  Нажмите **Save and deploy**.

### Шаг 3: Настройка переменных окружения (Secrets)

1.  После развертывания вернитесь на страницу вашей функции `db-admin`.
2.  Перейдите на вкладку **Settings** -> **Secrets**.
3.  Вам нужно добавить **три** секрета:
    *   `SUPABASE_URL`: URL вашего проекта Supabase (из `Settings` -> `API`).
    *   `SUPABASE_SERVICE_ROLE_KEY`: Ключ `service_role` (из `Settings` -> `API`). **Внимание:** Этот ключ дает полный доступ к вашей базе данных, обращайтесь с ним осторожно.
    *   `ADMIN_SECRET_TOKEN`: Придумайте и вставьте сюда **длинный, случайный и надежный пароль**. Этот пароль будет служить дополнительным уровнем защиты.

### Шаг 4: Выполнение дополнительного SQL-запроса

1.  Перейдите в **SQL Editor**.
2.  Скопируйте и выполните следующий SQL-код. Он создает хранимую процедуру, которую будет использовать ваша Edge Function для безопасного выполнения запросов с нужными правами.

    ```sql
    CREATE OR REPLACE FUNCTION public.execute_sql_as_postgres(query text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER -- Очень важно! Выполняет функцию с правами создателя (postgres)
    SET search_path = public
    AS $$
    BEGIN
        EXECUTE query;
    END;
    $$;
    
    -- Даем права на выполнение этой функции роли service_role, которую использует воркер
    GRANT EXECUTE ON FUNCTION public.execute_sql_as_postgres(text) TO service_role;
    ```

### Шаг 5: Получение URL функции

1.  Вернитесь на страницу вашей функции `db-admin`.
2.  На главной вкладке **Function** скопируйте **URL** вашей функции. Он будет выглядеть примерно так: `https://<project-ref>.supabase.co/functions/v1/db-admin`.

### Шаг 6: Настройка в приложении "Секретарь+"

1.  Откройте приложение "Секретарь+".
2.  Войдите под своей учетной записью администратора/владельца.
3.  Нажмите на свой аватар -> **Центр Управления**.
4.  Перейдите на вкладку **Схема БД**.
5.  Вставьте скопированный **URL функции** в поле "URL Управляющего Воркера".
6.  Вставьте **секретный токен**, который вы придумали на Шаге 3, в поле "Секретный токен".
7.  Нажмите **"Сохранить конфигурацию"**.

**Готово!** Теперь ваше приложение может безопасно обновлять схему базы данных.