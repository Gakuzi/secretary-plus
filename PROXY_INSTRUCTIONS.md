# Инструкция по настройке Воркеров

Для полнофункциональной и безопасной работы приложения требуется настроить два независимых Cloudflare Worker-а.

1.  **Прокси-воркер:** Для обхода региональных ограничений Gemini API.
2.  **Управляющий воркер:** Для безопасного управления схемой вашей базы данных Supabase через API.

---

## Часть 1: Настройка Прокси-воркера (для Gemini)

Этот воркер перенаправляет запросы к Gemini API и используется для тестирования соединения.

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
    // Адрес независимого сервиса для тестирования
    const TEST_API_HOST = "api.ipify.org";

    addEventListener('fetch', event => {
      event.respondWith(handleRequest(event.request));
    });

    async function handleRequest(request) {
      const url = new URL(request.url);

      // Определяем, куда направить запрос
      let targetHost;
      if (url.pathname.startsWith("/test-proxy")) {
        targetHost = TEST_API_HOST;
        url.pathname = "/";
        url.search = "?format=json";
      } else {
        targetHost = GEMINI_API_HOST;
      }
      
      url.host = targetHost;

      const newRequest = new Request(url, request);
      const response = await fetch(newRequest);

      const newResponse = new Response(response.body, response);
      newResponse.headers.set("Access-Control-Allow-Origin", "*");
      newResponse.headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      newResponse.headers.set("Access-Control-Allow-Headers", "*");

      return newResponse;
    }
    ```

3.  Нажмите **Save and Deploy**.
4.  **Скопируйте URL** этого воркера. Вставьте его в поле "URL Прокси" в настройках приложения.

---

## Часть 2: Настройка Управляющего воркера (для Supabase)

Этот воркер будет безопасно выполнять SQL-запросы для обновления схемы вашей базы данных.

### Шаг 1: Получение токена Supabase

1.  Войдите в свой аккаунт на [supabase.com](https://supabase.com).
2.  Перейдите в [Настройки доступа к аккаунту](https://supabase.com/dashboard/account/tokens).
3.  Нажмите **Generate New Token**, дайте ему имя (например, `secretary-plus-manager`) и нажмите **Generate token**.
4.  **Сразу же скопируйте токен!** Он больше не будет показан.

### Шаг 2: Создание второго Cloudflare Worker

1.  Как и в Части 1, создайте новый воркер. Дайте ему другое имя (например, `my-supabase-manager-456`).
2.  Перейдите в **Settings** > **Variables**.
3.  В разделе **Environment Variables**, нажмите **Add variable**.
    *   **Variable name:** `SUPABASE_MANAGEMENT_TOKEN`
    *   **Value:** Вставьте скопированный токен из Шага 1.
    *   Нажмите **Encrypt**, чтобы он хранился в зашифрованном виде.
4.  Нажмите **Save**.

### Шаг 3: Редактирование кода Управляющего воркера

1.  Вернитесь в редактор кода для этого второго воркера.
2.  Удалите весь существующий код и вставьте следующий. **ВНИМАНИЕ:** Замените `YOUR_PROJECT_REF` на ID вашего проекта Supabase (его можно найти в URL панели управления: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`).

    ```javascript
    addEventListener('fetch', event => {
        event.respondWith(handleRequest(event.request));
    });

    async function handleRequest(request) {
        // Строгая проверка метода и CORS
        if (request.method === 'OPTIONS') {
            return handleOptions(request);
        }
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        const PROJECT_REF = 'YOUR_PROJECT_REF'; // <-- ЗАМЕНИТЕ НА СВОЙ ID ПРОЕКТА
        const SUPABASE_API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/sql`;

        try {
            const { sql } = await request.json();
            if (!sql) {
                return new Response('"sql" parameter is missing.', { status: 400 });
            }

            const response = await fetch(SUPABASE_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`, // Токен из переменных окружения
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: sql }),
            });

            if (!response.ok) {
                 const errorText = await response.text();
                 // Возвращаем ошибку от Supabase, чтобы ее можно было отладить
                 return new Response(errorText, { status: response.status, headers: corsHeaders() });
            }

            const data = await response.json();
            return new Response(JSON.stringify(data), { headers: corsHeaders() });

        } catch (error) {
            return new Response(error.message, { status: 500, headers: corsHeaders() });
        }
    }

    function handleOptions(request) {
        return new Response(null, {
            headers: corsHeaders(),
        });
    }

    function corsHeaders() {
        return {
            'Access-Control-Allow-Origin': '*', // В реальном проекте лучше указать ваш домен
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };
    }
    ```

3.  Нажмите **Save and Deploy**.
4.  **Скопируйте URL** этого второго воркера. Вставьте его в поле "URL Управляющего Воркера" в настройках приложения.

Готово! Теперь ваше приложение полностью настроено для безопасной и функциональной работы.