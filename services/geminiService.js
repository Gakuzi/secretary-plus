import { GoogleGenAI, Type } from "@google/genai";
import { MessageSender } from "../types.js";
import { GEMINI_MODEL } from "../constants.js";
import { createNoteCard, createCalendarViewCard, createTasksViewCard, createEmailsViewCard } from "../components/ResultCard.js";

const baseTools = [
    {
      name: "get_calendar_events",
      description: "Получает список предстоящих событий из календаря пользователя. Позволяет узнать расписание на сегодня, завтра или любой другой период.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          time_min: {
            type: Type.STRING,
            description: "Начальное время для выборки событий в формате ISO 8601. По умолчанию - текущее время.",
          },
          time_max: {
            type: Type.STRING,
            description: "Конечное время для выборки событий в формате ISO 8601. Необязательно.",
          },
          max_results: {
            type: Type.INTEGER,
            description: "Максимальное количество событий для возврата. По умолчанию 10.",
          },
        },
      },
    },
    {
      name: "create_calendar_event",
      description: "Создает новое событие в календаре пользователя. Используйте это для встреч, звонков, напоминаний с конкретным временем.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "Название или тема события. Например: 'Встреча с командой'.",
          },
          startTime: {
            type: Type.STRING,
            description: "Время начала события в формате ISO 8601. Например: '2024-08-15T15:00:00'.",
          },
          endTime: {
            type: Type.STRING,
            description: "Время окончания события в формате ISO 8601. Например: '2024-08-15T16:00:00'.",
          },
          description: {
              type: Type.STRING,
              description: "Подробное описание события, может включать ссылки на документы."
          },
          attendees: {
            type: Type.ARRAY,
            description: "Список email-адресов участников.",
            items: { type: Type.STRING },
          },
        },
        required: ["title", "startTime", "endTime"],
      },
    },
    {
      name: "get_tasks",
      description: "Получает список активных (незавершенных) задач пользователя из Google Tasks.",
       parameters: {
        type: Type.OBJECT,
        properties: {
          max_results: {
            type: Type.INTEGER,
            description: "Максимальное количество задач для возврата. По умолчанию 20.",
          },
        },
      },
    },
     {
      name: "get_recent_emails",
      description: "Получает список последних входящих писем из Gmail. Возвращает отправителя, тему и краткое содержание.",
       parameters: {
        type: Type.OBJECT,
        properties: {
          max_results: {
            type: Type.INTEGER,
            description: "Максимальное количество писем для возврата. По умолчанию 5.",
          },
        },
      },
    },
    {
      name: "find_documents",
      description: "Ищет файлы и документы по названию. Использует сервис, выбранный пользователем в настройках.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Название документа или его часть для поиска. Например: 'План проекта Альфа'.",
          },
        },
        required: ["query"],
      },
    },
     {
      name: "find_contacts",
      description: "Ищет контакты по имени, фамилии или email. Использует сервис, выбранный пользователем в настройках.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Имя, фамилия или email для поиска. Например: 'Иван Петров'.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "perform_contact_action",
      description: "Выполняет немедленное действие с контактом (звонок, email). Поиск контакта происходит через сервис, выбранный пользователем.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Имя, фамилия или email контакта для действия. Например: 'Иван Петров'.",
          },
          action: {
            type: Type.STRING,
            description: "Тип действия, которое нужно совершить. 'call' для звонка, 'email' для письма.",
            enum: ['call', 'email']
          },
        },
        required: ["query", "action"],
      },
    },
    {
        name: "create_note",
        description: "Создает новую заметку. Использует сервис для заметок, выбранный пользователем (Google Docs или Supabase).",
        parameters: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING, description: "Заголовок заметки." },
                content: { type: Type.STRING, description: "Содержимое заметки." },
            },
            required: ["content"],
        },
    },
    {
        name: "find_notes",
        description: "Ищет заметки по ключевым словам в заголовке или содержании. Использует сервис, выбранный пользователем.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: "Ключевое слово для поиска." },
            },
            required: ["query"],
        },
    },
    {
      name: "propose_document_with_content",
      description: "Предлагает пользователю создать документ с предварительно сгенерированным содержанием на основе истории чата.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "Предлагаемое название для нового документа.",
          },
          summary: {
            type: Type.STRING,
            description: "Краткое содержание из истории чата для вставки в документ.",
          },
        },
        required: ["title", "summary"],
      },
    },
    {
      name: "create_google_doc",
      description: "Создает новый пустой документ Google Docs с указанным названием.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "Название нового документа. Например: 'План проекта Квант'.",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "create_google_doc_with_content",
      description: "Создает новый документ Google Docs с указанным названием и начальным содержанием.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "Название нового документа.",
          },
          content: {
            type: Type.STRING,
            description: "Текстовое содержимое для добавления в документ.",
          },
        },
        required: ["title", "content"],
      },
    },
    {
      name: "create_google_sheet",
      description: "Создает новую таблицу Google Sheets с указанным названием.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "Название новой таблицы. Например: 'Бюджет проекта'.",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "create_task",
      description: "Создает задачу в списке дел пользователя (Google Tasks).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "Название задачи. Например: 'Подготовить отчет'.",
          },
          notes: {
            type: Type.STRING,
            description: "Дополнительные детали или описание задачи.",
          },
          dueDate: {
              type: Type.STRING,
              description: "Срок выполнения задачи в формате ISO 8601. Например: '2024-08-15T23:59:59Z'. Необязательно."
          }
        },
        required: ["title"],
      },
    },
    {
      name: "send_email",
      description: "Отправляет электронное письмо от имени пользователя.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          to: {
            type: Type.ARRAY,
            description: "Список email-адресов получателей.",
            items: { type: Type.STRING },
          },
          subject: {
            type: Type.STRING,
            description: "Тема письма.",
          },
          body: {
            type: Type.STRING,
            description: "Содержимое письма. Может содержать HTML.",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
];


const getSystemInstruction = (serviceMap, timezone) => {
    return `Ты — «Секретарь+», проактивный личный ИИ-ассистент. Ты строго следуешь настройкам пользователя по выбору сервисов.

Принципы работы:
1.  **Выбор сервиса:** Ты ВСЕГДА проверяешь, какой сервис пользователь выбрал для каждой задачи (календарь, контакты, заметки, файлы).
    -   Календарь: ${serviceMap.calendar}
    -   Контакты: ${serviceMap.contacts}
    -   Файлы: ${serviceMap.files}
    -   Заметки: ${serviceMap.notes}
2.  **Поиск данных:** Для поиска контактов (\`find_contacts\`), документов (\`find_documents\`) или заметок (\`find_notes\`) ты используешь только тот сервис, который указан в настройках выше.
3.  **Создание данных:** Для создания событий (\`create_calendar_event\`) или заметок (\`create_note\`) ты используешь только тот сервис, который указан в настройках.
4.  **Чтение данных:** Для просмотра календаря (\`get_calendar_events\`), задач (\`get_tasks\`) или почты (\`get_recent_emails\`) ты всегда используешь Google.
5.  **Диалог — ключ ко всему:** Если информации недостаточно, задавай уточняющие вопросы.
6.  **Сначала уточнение, потом действие:** Никогда не создавай событие или задачу, если в запросе есть неоднозначные данные (имена людей, названия документов). Сначала найди, покажи пользователю варианты, дождись его выбора.
7.  **Работа с контактами:** Если пользователь выбирает контакт без email для создания события, ты должен явно спросить у пользователя этот email.
8.  **Контекст:** Ты должен анализировать ВЕСЬ предыдущий диалог, чтобы понимать текущий контекст.
9.  **Дата и время:** Всегда учитывай текущую дату: ${new Date().toLocaleDateString('ru-RU')} и часовой пояс пользователя: ${timezone}. Используй этот часовой пояс для интерпретации всех запросов, связанных со временем, таких как "завтра в 9 утра" или "через 2 часа".
10. **Проактивные предложения:** После успешного выполнения основного действия (например, создания встречи), всегда предлагай релевантные последующие шаги.
11. **Интерактивные ответы:** Если ты задаешь пользователю вопрос, по возможности предлагай 2-4 наиболее вероятных варианта быстрого ответа в формате \`[QUICK_REPLY] Текст ответа\`.
`;
};


export const callGemini = async ({
    prompt,
    history,
    serviceProviders,
    serviceMap,
    timezone,
    isGoogleConnected,
    image,
    apiKey
}) => {
    if (!apiKey) {
        return {
            id: Date.now().toString(),
            sender: MessageSender.SYSTEM,
            text: "Ошибка: Ключ Gemini API не предоставлен. Пожалуйста, добавьте его в настройках.",
        };
    }
    const ai = new GoogleGenAI({ apiKey });

    const contents = history.map(msg => {
        const role = msg.sender === MessageSender.USER ? 'user' : 'model';
        const parts = [];
        if (msg.text) parts.push({ text: msg.text });
        if (msg.image) {
            parts.push({ inlineData: { mimeType: msg.image.mimeType, data: msg.image.base64 } });
        }
        return { role, parts };
    }).filter(msg => msg.parts.length > 0);

    const userParts = [];
    if (prompt) userParts.push({ text: prompt });
    if (image) userParts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
    if (userParts.length > 0) {
        contents.push({ role: 'user', parts: userParts });
    }
    
    const toolsConfig = (isGoogleConnected) ? { functionDeclarations: baseTools } : undefined;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents,
            config: {
                systemInstruction: getSystemInstruction(serviceMap, timezone),
                tools: toolsConfig ? [toolsConfig] : undefined,
            },
        });
        
        const firstCandidate = response.candidates?.[0];
        const functionCall = firstCandidate?.content?.parts?.[0]?.functionCall;

        if (functionCall && isGoogleConnected) {
            const { name, args } = functionCall;
            let resultMessage = {
                id: Date.now().toString(),
                sender: MessageSender.ASSISTANT,
                text: '',
                card: null,
                functionCallName: name,
            };

            // Dynamic provider selection
            const getProvider = (type) => {
                const providerId = serviceMap[type];
                const provider = serviceProviders[providerId];
                if (!provider) throw new Error(`Provider "${providerId}" for type "${type}" not found.`);
                return provider;
            };

            try {
                switch (name) {
                    case 'get_calendar_events': {
                        const provider = serviceProviders.google;
                        const results = await provider.getCalendarEvents(args);
                        if (results && results.length > 0) {
                            resultMessage.text = "Вот ваше ближайшее расписание:";
                            resultMessage.card = createCalendarViewCard(results);
                        } else {
                            resultMessage.text = "На выбранный период событий в календаре не найдено.";
                        }
                        break;
                    }
                    case 'get_tasks': {
                        const provider = serviceProviders.google;
                        const results = await provider.getTasks(args);
                         if (results && results.length > 0) {
                            resultMessage.text = "Вот ваши активные задачи:";
                            resultMessage.card = createTasksViewCard(results);
                        } else {
                            resultMessage.text = "У вас нет активных задач. Отличная работа!";
                        }
                        break;
                    }
                    case 'get_recent_emails': {
                        const provider = serviceProviders.google;
                        const results = await provider.getRecentEmails(args);
                         if (results && results.length > 0) {
                            resultMessage.text = `Вот последние ${results.length} писем:`;
                            resultMessage.card = createEmailsViewCard(results);
                        } else {
                            resultMessage.text = "Ваш почтовый ящик пуст.";
                        }
                        break;
                    }
                    case 'create_calendar_event': {
                        const provider = getProvider('calendar');
                        const result = await provider.createEvent(args);

                        if (provider.getId() === 'apple') {
                            resultMessage.text = `Событие «${args.title}» готово для вашего Apple Календаря. Нажмите кнопку ниже, чтобы скачать файл (.ics) и добавить его.`;
                            resultMessage.card = {
                                type: 'event',
                                icon: 'CalendarIcon',
                                title: `Событие для Apple: ${args.title}`,
                                details: {
                                    'Время': new Date(args.startTime).toLocaleString('ru-RU'),
                                    'Метод': 'Экспорт в .ics файл',
                                    'Почему так?': 'Это самый безопасный способ для веб-приложений без серверной части. Он не требует доступа к вашему Apple ID.'
                                },
                                actions: [{
                                    label: 'Скачать .ics файл',
                                    action: 'download_ics',
                                    payload: { data: result.icsData, filename: result.filename }
                                }]
                            };
                        } else {
                            const attendeesEmails = result.attendees?.map(a => a.email) || [];
                            const eventActions = [
                                { label: 'Открыть в Календаре', url: result.htmlLink }
                            ];
                            if (attendeesEmails.length > 0 && result.hangoutLink) {
                                eventActions.push({
                                    label: 'Отправить ссылку участникам',
                                    action: 'send_meeting_link',
                                    payload: { to: attendeesEmails, subject: `Приглашение на встречу: ${result.summary}`, body: `Присоединяйтесь к встрече "${result.summary}": <a href="${result.hangoutLink}">${result.hangoutLink}</a>` }
                                });
                            }
                            eventActions.push({
                                label: 'Создать задачу "Подготовиться"',
                                action: 'create_prep_task',
                                payload: { title: `Подготовиться к встрече: "${result.summary}"`, notes: `Встреча запланирована на ${new Date(result.start.dateTime).toLocaleString('ru-RU')}.` }
                            });
                            resultMessage.text = `Событие "${result.summary}" успешно создано! Что дальше?`;
                            resultMessage.card = { type: 'event', icon: 'CalendarIcon', title: result.summary, details: { 'Время': new Date(result.start.dateTime).toLocaleString('ru-RU'), 'Участники': attendeesEmails.join(', ') || 'Нет', 'Видеовстреча': result.hangoutLink ? `<a href="${result.hangoutLink}" target="_blank" class="text-blue-400 hover:underline">Присоединиться</a>` : 'Нет', }, actions: eventActions, shareableLink: result.hangoutLink, shareText: `Присоединяйтесь к встрече "${result.summary}": ${result.hangoutLink}`};
                        }
                        break;
                    }
                    case 'find_contacts':
                    case 'perform_contact_action': {
                        const provider = getProvider('contacts');
                        const results = await provider.findContacts(args.query);

                        if (results.length === 1) {
                            const person = results[0];
                            if (name === 'perform_contact_action') {
                                const actionText = args.action === 'call' ? 'позвонить' : 'написать';
                                resultMessage.text = `Готовы ${actionText} контакту ${person.display_name}.`;
                                resultMessage.card = { type: 'direct_action_card', icon: args.action === 'call' ? 'PhoneIcon' : 'EmailIcon', title: `Выполнить действие: ${actionText}`, person: person, action: args.action };
                            } else {
                                resultMessage.text = `Найден контакт: ${person.display_name}. Что вы хотите сделать?`;
                                resultMessage.card = { type: 'contact', icon: 'UsersIcon', title: 'Карточка контакта', person: person };
                            }
                        } else if (results.length > 1) {
                            const actionText = name === 'perform_contact_action' ? (args.action === 'call' ? 'позвонить' : 'написать') : null;
                            resultMessage.text = `Я нашел несколько контактов. ${actionText ? `Кому вы хотите ${actionText}?` : 'Пожалуйста, выберите нужный:'}`;
                            resultMessage.card = { type: 'contact_choice', icon: 'UsersIcon', title: `${actionText ? `Кому ${actionText}?` : 'Выберите контакт'}`, options: results };
                        } else {
                            resultMessage.text = `К сожалению, я не нашел контактов по запросу "${args.query}".`;
                        }
                        break;
                    }
                    case 'find_documents': {
                        const provider = getProvider('files');
                        let results = await provider.findDocuments(args.query);

                        // HYBRID SEARCH: If the primary search (e.g., Supabase) finds nothing,
                        // perform a live search on Google Drive as a fallback.
                        if (results.length === 0 && provider.getId() === 'supabase') {
                            const googleProvider = serviceProviders.google;
                            if (googleProvider && await googleProvider.isAuthenticated()) {
                                 results = await googleProvider.findDocuments(args.query);
                            }
                        }

                        const normalizedResults = results.map(doc => ({
                            name: doc.name,
                            url: doc.url || doc.webViewLink,
                            icon_link: doc.icon_link || doc.iconLink,
                            source_id: doc.source_id || doc.id,
                            modified_time: doc.modified_time || doc.modifiedTime,
                        }));
                        
                        if (normalizedResults.length > 0) {
                            resultMessage.text = `Вот документы, которые я нашел. Какой из них использовать?`;
                            resultMessage.card = { type: 'document_choice', icon: 'FileIcon', title: 'Выберите документ', options: normalizedResults };
                        } else {
                            resultMessage.text = `Не удалось найти документы по запросу "${args.query}".`;
                        }
                        break;
                    }
                    case 'create_note': {
                        const provider = getProvider('notes');
                        const result = await provider.createNote(args);
                        resultMessage.text = `Заметка "${result.title || 'Без названия'}" успешно создана в ${provider.getName()}.`;
                        resultMessage.card = createNoteCard(result, provider.getName());
                        break;
                    }
                    case 'find_notes': {
                        const provider = getProvider('notes');
                        const results = await provider.findNotes(args.query);
                        if (results && results.length > 0) {
                            const noteSummaries = results.map(note => {
                                const title = note.title ? `**${note.title}**` : '*Заметка без названия*';
                                const snippet = note.content ? note.content.substring(0, 150) + '...' : '';
                                return `${title}\n${snippet}`;
                            }).join('\n\n---\n\n');
                            resultMessage.text = `Вот заметки, которые я нашел по запросу "${args.query}":\n\n${noteSummaries}`;
                        } else {
                            resultMessage.text = `Не удалось найти заметки по запросу "${args.query}".`;
                        }
                        break;
                    }
                     case 'create_google_doc':
                     case 'create_google_sheet':
                     case 'create_google_doc_with_content': {
                        const provider = serviceProviders.google; // These are Google specific
                        let result;
                        if (name === 'create_google_sheet') {
                            result = await provider.createGoogleSheet(args.title);
                        } else if (name === 'create_google_doc_with_content') {
                            result = await provider.createGoogleDocWithContent(args.title, args.content);
                        } else {
                            result = await provider.createGoogleDoc(args.title);
                        }
                        const docType = result.mimeType.includes('spreadsheet') ? 'Таблица' : 'Документ';
                        resultMessage.text = `${docType} "${result.name}" успешно создан.`;
                        resultMessage.card = { type: 'document', icon: 'FileIcon', title: result.name, details: { 'Тип': `Google ${docType}` }, actions: [{ label: 'Открыть документ', url: result.webViewLink }]};
                        break;
                     }
                     case 'create_task': {
                        const provider = serviceProviders.google;
                        const result = await provider.createTask(args);
                        resultMessage.text = `Задача "${result.title}" успешно создана.`;
                        resultMessage.card = { type: 'task', icon: 'CheckSquareIcon', title: 'Задача создана', details: { 'Название': result.title, 'Статус': 'Нужно выполнить' }, actions: [{ label: 'Открыть в Google Tasks', url: 'https://tasks.google.com/embed/list/~default', target: '_blank' }]};
                        break;
                    }
                    case 'send_email': {
                        const provider = serviceProviders.google;
                        await provider.sendEmail(args);
                        resultMessage.text = `Письмо на тему "${args.subject}" успешно отправлено получателям: ${args.to.join(', ')}.`;
                        break;
                    }
                    default:
                        resultMessage.text = `Неизвестный вызов функции: ${name}`;
                }
            } catch (error) {
                 console.error(`Error executing tool ${name}:`, error);
                 resultMessage = { sender: MessageSender.SYSTEM, text: `Произошла ошибка при выполнении действия: ${error.message}` };
            }
            return resultMessage;
        }

        const rawText = response.text;
        const lines = rawText.split('\n');
        const responseTextLines = [];
        const suggestedReplies = [];
        const QUICK_REPLY_PREFIX = '[QUICK_REPLY]';

        for (const line of lines) {
            if (line.startsWith(QUICK_REPLY_PREFIX)) {
                suggestedReplies.push(line.substring(QUICK_REPLY_PREFIX.length).trim());
            } else {
                responseTextLines.push(line);
            }
        }
        
        return {
            id: Date.now().toString(),
            sender: MessageSender.ASSISTANT,
            text: responseTextLines.join('\n').trim(),
            suggestedReplies: suggestedReplies.length > 0 ? suggestedReplies : null,
        };

    } catch (error) {
        console.error("Gemini API call failed:", error);
        return {
            id: Date.now().toString(),
            sender: MessageSender.SYSTEM,
            text: `Произошла ошибка при обращении к Gemini API: ${error.message}`,
        };
    }
};