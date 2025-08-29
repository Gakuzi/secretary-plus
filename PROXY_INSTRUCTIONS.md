# Инструкция по настройке Прокси-воркера

Для обхода региональных ограничений Gemini API вы можете использовать прокси-сервер. Мы рекомендуем бесплатный и простой способ с использованием **Cloudflare Workers**.

Этот воркер будет выполнять две задачи:
1.  **Проксирование запросов к Gemini**: Все обычные запросы от приложения будут безопасно перенаправляться к API Gemini.
2.  **Тестирование соединения**: Приложение сможет отправлять тестовый запрос через ваш воркер к независимому сервису, чтобы убедиться, что прокси работает, не затрагивая Gemini.

## Шаг 1: Создание Cloudflare Worker

1.  Войдите в свою [панель управления Cloudflare](https://dash.cloudflare.com/).
2.  В меню слева выберите **Workers & Pages**.
3.  Нажмите **Create application** > **Create Worker**.
4.  Дайте вашему воркеру уникальное имя (например, `my-gemini-proxy-123`) и нажмите **Deploy**.

## Шаг 2: Редактирование кода воркера

1.  После развертывания нажмите **Configure Worker** (или **Edit code**).
2.  Удалите весь существующий код в редакторе слева.
3.  **Скопируйте и вставьте** следующий код в редактор:

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
        // Это тестовый запрос, направляем на сервис проверки IP
        targetHost = TEST_API_HOST;
        // Убираем /test-proxy из пути, чтобы передать правильный запрос ipify
        url.pathname = "/";
        // ipify требует параметр format=json
        url.search = "?format=json";
      } else {
        // Это обычный запрос к Gemini
        targetHost = GEMINI_API_HOST;
      }
      
      url.host = targetHost;

      // Создаем новый запрос с измененным хостом
      const newRequest = new Request(url, request);

      // Выполняем запрос к целевому API
      const response = await fetch(newRequest);

      // Создаем новый ответ, добавляя CORS-заголовки
      const newResponse = new Response(response.body, response);
      newResponse.headers.set("Access-Control-Allow-Origin", "*");
      newResponse.headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      newResponse.headers.set("Access-Control-Allow-Headers", "*");

      return newResponse;
    }
    ```

4.  Нажмите **Save and Deploy**.

## Шаг 3: Использование в приложении

1.  После сохранения и развертывания вы увидите URL вашего воркера в формате `https://<ваше-имя>.workers.dev`.
2.  **Скопируйте этот URL**.
3.  Вставьте его в поле "URL Прокси" в настройках приложения "Секретарь+".

Готово! Теперь ваше приложение будет использовать этот воркер для всех запросов к Gemini, а также для надежного тестирования соединения.