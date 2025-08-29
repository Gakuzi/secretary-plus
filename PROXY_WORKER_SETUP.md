# Инструкция по настройке Прокси-воркера

Этот воркер необходим для обхода региональных ограничений Gemini API. Он будет перенаправлять ваши запросы и добавлять необходимые CORS-заголовки.

---

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
5.  Вставьте этот URL в соответствующее поле в **Менеджере прокси** в приложении "Секретарь+".