import { GoogleGenAI, Type } from "@google/genai";
import { MessageSender } from "../types.js";
import { GEMINI_MODEL } from "../constants.js";
import { createNoteCard, createCalendarViewCard, createTasksViewCard, createEmailsViewCard } from "../components/ResultCard.js";
import { getSystemInstruction } from './prompts.js';

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
      description: "Создает новое событие в календаре. **Этот инструмент автоматически создает ссылку на видеовстречу Google Meet.** Используй его для запросов 'создай видеовстречу', 'организуй звонок в Meet', а также для обычных встреч, звонков и напоминаний с конкретным временем.",
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
      description: "Получает список последних входящих писем из Gmail. Возвращает отправителя, тему, дату и ПОЛНОЕ СОДЕРЖИМОЕ письма для анализа.",
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
      name: "get_recent_files",
      description: "Получает список недавно измененных файлов и документов из Google Drive, чтобы пользователь мог продолжить работу.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          max_results: {
            type: Type.INTEGER,
            description: "Максимальное количество файлов для возврата. По умолчанию 10.",
          },
        },
      },
    },
     {
      name: "find_contacts",
      description: "Ищет контакты по имени, фамилии или email. Использует сервис, выбранный пользователем в настройках. НЕ ИСПОЛЬЗУЙ этот инструмент, если пользователь просит совершить действие (позвонить, написать), для этого есть perform_contact_action.",
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
      description: "Выполняет немедленное действие с контактом (звонок, email). Это ПРИОРИТЕТНЫЙ инструмент для запросов типа 'позвони', 'напиши'.",
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
      name: "update_task",
      description: "Изменяет существующую задачу (название, заметки, срок).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          taskId: { type: Type.STRING, description: "ID задачи, которую нужно изменить." },
          title: { type: Type.STRING, description: "Новое название задачи." },
          notes: { type: Type.STRING, description: "Новое описание или заметки к задаче." },
          dueDate: { type: Type.STRING, description: "Новый срок выполнения в формате ISO 8601." }
        },
        required: ["taskId"],
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
    {
        name: "summarize_and_save_memory",
        description: "Создает краткую сводку текущего разговора и сохраняет ее в долговременную память для будущего использования.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                summary: { type: Type.STRING, description: "Краткая суть разговора. Включай ключевые имена, даты, решения." },
                keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Список ключевых слов для поиска этой записи в будущем." },
            },
            required: ["summary", "keywords"],
        },
    },
    {
        name: "recall_memory",
        description: "Ищет в долговременной памяти информацию, относящуюся к текущему запросу.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: "Ключевое слово или фраза для поиска в памяти." },
            },
            required: ["query"],
        },
    },
    {
      name: "delete_calendar_event",
      description: "Удаляет событие из календаря. Перед удалением необходимо найти событие и получить его ID, а затем ОБЯЗАТЕЛЬНО спросить у пользователя подтверждение.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          eventId: { type: Type.STRING, description: "ID события для удаления." },
        },
        required: ["eventId"],
      },
    },
    {
      name: "delete_task",
      description: "Удаляет задачу из Google Tasks. Перед удалением необходимо найти задачу и получить ее ID, а затем ОБЯЗАТЕЛЬНО спросить у пользователя подтверждение.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          taskId: { type: Type.STRING, description: "ID задачи для удаления." },
        },
        required: ["taskId"],
      },
    },
    {
      name: "delete_email",
      description: "Перемещает письмо в корзину в Gmail. Перед удалением необходимо найти письмо и получить его ID, а затем ОБЯЗАТЕЛЬНО спросить у пользователя подтверждение.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          messageId: { type: Type.STRING, description: "ID письма для перемещения в корзину." },
        },
        required: ["messageId"],
      },
    }
];

export const callGemini = async ({
    userMessage,
    history,
    serviceProviders,
    serviceMap,
    timezone,
    isGoogleConnected,
    apiKey,
    proxyUrl
}) => {
    if (!apiKey) {
        return {
            id: Date.now().toString(),
            sender: MessageSender.SYSTEM,
            text: "Ошибка: Ключ Gemini API не предоставлен. Пожалуйста, добавьте его в настройках.",
        };
    }
    
    const clientOptions = { apiKey };
    if (proxyUrl) {
        // The SDK constructor expects the endpoint without the protocol.
        clientOptions.apiEndpoint = proxyUrl.replace(/^https?:\/\//, '');
    }
    const ai = new GoogleGenAI(clientOptions);
    
    // Limit short-term memory to the last 10 messages to keep context relevant and payload small
    const limitedHistory = history.slice(-10);

    const contents = limitedHistory.map(msg => {
        const role = msg.sender === MessageSender.USER ? 'user' : 'model';
        const parts = [];
        if (msg.text) parts.push({ text: msg.text });
        if (msg.image) {
            parts.push({ inlineData: { mimeType: msg.image.mimeType, data: msg.image.base64 } });
        }
        return { role, parts };
    }).filter(msg => msg.parts.length > 0);

    // Add the current user message to the context for the API call
    const userParts = [];
    if (userMessage.text) userParts.push({ text: userMessage.text });
    if (userMessage.image) userParts.push({ inlineData: { mimeType: userMessage.image.mimeType, data: userMessage.image.base64 } });
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
                contextualActions: [], // Initialize actions array
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
                        const provider = getProvider('calendar');
                        const results = await provider.getCalendarEvents(args);
                        if (results && results.length > 0) {
                            resultMessage.text = "Вот ваше ближайшее расписание. Нажмите на событие, чтобы увидеть детали и действия.";
                            resultMessage.card = createCalendarViewCard(results);
                        } else {
                            resultMessage.text = "На выбранный период событий в календаре не найдено.";
                        }
                        break;
                    }
                    case 'get_tasks': {
                        const provider = getProvider('tasks');
                        const results = await provider.getTasks(args);
                         if (results && results.length > 0) {
                            resultMessage.text = "Вот ваши активные задачи. Нажмите на задачу для просмотра деталей.";
                            resultMessage.card = createTasksViewCard(results);
                        } else {
                            resultMessage.text = "У вас нет активных задач. Отличная работа!";
                        }
                        break;
                    }
                    case 'get_recent_emails': {
                        const provider = serviceProviders.google; // Email is always Google
                        const results = await provider.getRecentEmails(args);
                         if (results && results.length > 0) {
                            resultMessage.text = `Вот последние ${results.length} писем. Нажмите на любое, чтобы получить подробный анализ и действия.`;
                            resultMessage.card = createEmailsViewCard(results);
                        } else {
                            resultMessage.text = "Ваш почтовый ящик пуст.";
                        }
                        break;
                    }
                    case 'create_calendar_event': {
                        // Creation always goes to the source of truth, not the cache provider
                        const creationProviderId = serviceMap.calendar === 'apple' ? 'apple' : 'google';
                        const provider = serviceProviders[creationProviderId];
                        const result = await provider.createEvent(args);

                        if (provider.getId() === 'apple') {
                            resultMessage.text = "Событие для календаря Apple готово. Нажмите, чтобы скачать .ics файл и добавить его в свой календарь.";
                             resultMessage.card = {
                                type: 'system_action',
                                icon: 'CalendarIcon',
                                title: 'Скачать событие (.ics)',
                                actions: [{
                                    label: 'Скачать файл',
                                    action: 'download_ics',
                                    payload: {
                                        data: result.icsData,
                                        filename: result.filename
                                    }
                                }]
                            };
                        } else {
                            resultMessage.text = `Встреча "${result.summary}" успешно создана.`;
                            resultMessage.card = {
                                type: 'event',
                                icon: 'CalendarIcon',
                                title: result.summary,
                                details: {
                                    'Время': `${new Date(result.start.dateTime).toLocaleString('ru-RU')} - ${new Date(result.end.dateTime).toLocaleString('ru-RU')}`,
                                    'Видеовстреча': 'Да',
                                },
                                actions: [
                                    { label: 'Открыть в календаре', url: result.htmlLink },
                                    { label: 'Присоединиться', url: result.hangoutLink }
                                ],
                                shareableLink: result.hangoutLink,
                                shareText: `Присоединяйтесь к видеовстрече: ${result.hangoutLink}`,
                            };
                        }
                        break;
                    }
                     case 'create_task': {
                        const provider = getProvider('tasks');
                        const result = await provider.createTask(args);
                        resultMessage.text = `Задача "${result.title}" успешно создана.`;
                        resultMessage.card = {
                            type: 'task',
                            icon: 'CheckSquareIcon',
                            title: 'Задача создана',
                            text: result.title,
                            details: result.notes ? { 'Детали': result.notes } : {},
                        };
                        break;
                    }
                    case 'find_documents':
                    case 'find_notes':
                    case 'get_recent_files': {
                         const provider = (name === 'find_notes') ? getProvider('notes') : getProvider('files');
                         const results = (name === 'find_documents') ? await provider.findDocuments(args.query) : 
                                         (name === 'find_notes') ? await provider.findNotes(args.query) :
                                         await provider.getRecentFiles(args);
                         
                         if (results && results.length > 0) {
                            if (results.length === 1) {
                                const doc = results[0];
                                const url = doc.webViewLink || doc.url; // Support both Google Drive and Supabase notes
                                resultMessage.text = `Найден документ: "${doc.name || doc.title}".`;
                                resultMessage.card = {
                                    type: 'document',
                                    icon: 'FileIcon',
                                    title: doc.name || doc.title,
                                    actions: [{ label: 'Открыть', url: url }]
                                };
                            } else {
                                 resultMessage.text = 'Я нашел несколько подходящих документов. Какой из них вам нужен?';
                                 resultMessage.card = {
                                     type: 'document_choice',
                                     icon: 'FileIcon',
                                     title: 'Выберите документ',
                                     options: results.map(doc => ({
                                         name: doc.name || doc.title,
                                         url: doc.webViewLink || doc.url,
                                         icon_link: doc.iconLink || 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_document_x16.png',
                                         source_id: doc.id,
                                         modified_time: doc.modifiedTime || doc.updated_at,
                                     }))
                                 };
                            }
                         } else {
                            resultMessage.text = "К сожалению, документы по вашему запросу не найдены.";
                         }
                         break;
                    }
                     case 'find_contacts':
                     case 'perform_contact_action': {
                        const provider = getProvider('contacts');
                        const results = await provider.findContacts(args.query);

                        if (results && results.length > 0) {
                            if (results.length === 1) {
                                const person = results[0];
                                if (name === 'perform_contact_action') {
                                    resultMessage.text = `Найден контакт ${person.display_name}. Выберите действие.`;
                                    resultMessage.card = {
                                        type: 'direct_action_card',
                                        icon: 'UsersIcon',
                                        action: args.action, // 'call' or 'email'
                                        person: person,
                                    };
                                } else {
                                    resultMessage.text = `Вот информация по контакту "${person.display_name}".`;
                                    resultMessage.card = {
                                        type: 'contact',
                                        icon: 'UsersIcon',
                                        title: 'Карточка контакта',
                                        person: person,
                                    };
                                }
                            } else {
                                 resultMessage.text = 'Я нашел несколько контактов. Кого вы имели в виду?';
                                 resultMessage.card = {
                                     type: 'contact_choice',
                                     icon: 'UsersIcon',
                                     title: 'Выберите контакт',
                                     options: results
                                 };
                            }
                        } else {
                            resultMessage.text = `Контакт "${args.query}" не найден.`;
                        }
                        break;
                    }
                    case 'create_note': {
                        const provider = getProvider('notes');
                        const providerName = provider.getName ? provider.getName() : 'Supabase';
                        const result = await provider.createNote(args);
                        resultMessage.text = `Заметка "${result.title || 'Без названия'}" успешно создана.`;
                        resultMessage.card = createNoteCard(result, providerName);
                        break;
                    }
                     case 'propose_document_with_content': {
                         resultMessage.text = `Я подготовил содержание для документа "${args.title}". Создать?`;
                         resultMessage.card = {
                            type: 'document_creation_proposal',
                            icon: 'FileIcon',
                            title: 'Создать документ?',
                            summary: args.summary,
                            actions: [
                                { label: 'Создать с содержанием', action: 'create_google_doc_with_content', payload: { title: args.title, content: args.summary } },
                                { label: 'Создать пустой', action: 'create_google_doc', payload: { title: args.title } }
                            ]
                         };
                         break;
                    }
                    case 'create_google_doc':
                    case 'create_google_sheet':
                    case 'create_google_doc_with_content': {
                        let result;
                        const creationProvider = serviceProviders.google;
                        if (name === 'create_google_sheet') {
                            result = await creationProvider.createGoogleSheet(args.title);
                        } else if (name === 'create_google_doc_with_content') {
                            result = await creationProvider.createGoogleDocWithContent(args.title, args.content);
                        } else {
                            result = await creationProvider.createGoogleDoc(args.title);
                        }
                        resultMessage.text = `Документ "${result.name}" успешно создан.`;
                        resultMessage.card = {
                            type: 'document',
                            icon: 'FileIcon',
                            title: result.name,
                            actions: [{ label: 'Открыть', url: result.webViewLink }]
                        };
                        break;
                    }
                     case 'send_email': {
                        await serviceProviders.google.sendEmail(args);
                        resultMessage.text = `Письмо успешно отправлено получателю: ${args.to.join(', ')}.`;
                        break;
                     }
                      case 'delete_calendar_event': {
                        await serviceProviders.google.deleteCalendarEvent(args);
                        resultMessage.text = 'Событие успешно удалено из вашего календаря.';
                        break;
                    }
                    case 'delete_task': {
                        await serviceProviders.google.deleteTask(args);
                        resultMessage.text = 'Задача успешно удалена.';
                        break;
                    }
                    case 'delete_email': {
                        await serviceProviders.google.deleteEmail(args);
                        resultMessage.text = 'Письмо перемещено в корзину.';
                        break;
                    }
                    case 'update_task': {
                        const result = await serviceProviders.google.updateTask(args);
                        resultMessage.text = `Задача "${result.title}" успешно обновлена.`;
                        break;
                    }
                    case 'summarize_and_save_memory':
                    case 'recall_memory': {
                         resultMessage.text = `(Действие с памятью выполнено: ${name})`;
                         break;
                    }
                    default:
                        resultMessage.text = `Неизвестный вызов функции: ${name}`;
                }
            } catch (error) {
                console.error(`Error executing tool ${name}:`, error);
                resultMessage.sender = MessageSender.SYSTEM;
                resultMessage.text = `Произошла ошибка при выполнении действия "${name}": ${error.message}`;
            }

            return resultMessage;
        }

        // --- Handle plain text responses ---
        const textResponse = response.text?.trim() || "Я не совсем понял. Можете переформулировать?";
        
        // Extract contextual actions from the text response
        const actionRegex = /\[CONTEXT_ACTIONS\]\s*(\[.*\])/;
        const match = textResponse.match(actionRegex);
        let contextualActions = [];
        let cleanText = textResponse;

        if (match && match[1]) {
            try {
                contextualActions = JSON.parse(match[1]);
                cleanText = textResponse.replace(actionRegex, '').trim();
            } catch (e) {
                console.warn("Could not parse contextual actions:", e);
                // Keep the original text if JSON is malformed
            }
        }
        
        return {
            id: Date.now().toString(),
            sender: MessageSender.ASSISTANT,
            text: cleanText,
            contextualActions: contextualActions
        };
        
    } catch (error) {
        console.error("Gemini API call failed:", error);
        return {
            id: Date.now().toString(),
            sender: MessageSender.SYSTEM,
            text: `Не удалось связаться с Gemini API: ${error.message}. Проверьте ключ API и настройки прокси.`,
        };
    }
};

/**
 * Uses Gemini to analyze a sync error message and provide a user-friendly explanation.
 */
export async function analyzeSyncErrorWithGemini({ errorMessage, context, appStructure, apiKey, proxyUrl }) {
     if (!apiKey) throw new Error("Ключ Gemini API не предоставлен.");
     
    const clientOptions = { apiKey };
    if (proxyUrl) clientOptions.apiEndpoint = proxyUrl.replace(/^https?:\/\//, '');
    const ai = new GoogleGenAI(clientOptions);

    const systemInstruction = `
        Ты - ведущий frontend-разработчик, специализирующийся на Supabase и Google API. 
        Твоя задача - проанализировать техническую ошибку, которую получил пользователь в приложении "Секретарь+", и дать ему четкое, простое и пошаговое объяснение, как ее исправить.
        Говори с пользователем на "ты".

        Контекст приложения:
        ${appStructure}
    `;
    const userPrompt = `
        Я столкнулся с ошибкой в приложении. 
        Вот контекст: "${context}".
        Вот сообщение об ошибке: "${errorMessage}".

        Проанализируй ошибку и дай мне:
        1.  **Простое объяснение:** Что именно означает эта ошибка простыми словами?
        2.  **Основная причина:** Какова наиболее вероятная причина этой проблемы?
        3.  **Пошаговое решение:** Что конкретно мне нужно сделать в интерфейсе приложения, чтобы это исправить? Будь максимально конкретным.
    `;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: userPrompt,
            config: {
                 systemInstruction: systemInstruction,
            }
        });
        return response.text;
    } catch (error) {
        console.error("Gemini error analysis failed:", error);
        throw new Error(`Анализ ошибки не удался: ${error.message}`);
    }
}

/**
 * Pings a proxy to see if it can reach the Gemini API.
 */
export async function testProxyConnection({ proxyUrl, apiKey }) {
    if (!proxyUrl) return { status: 'error', message: 'URL не указан' };
    if (!apiKey) return { status: 'error', message: 'Ключ Gemini API отсутствует' };
    
    const startTime = Date.now();
    try {
        const clientOptions = { apiKey, apiEndpoint: proxyUrl.replace(/^https?:\/\//, '') };
        const ai = new GoogleGenAI(clientOptions);
        
        // Use a lightweight, fast model info request to test connectivity
        await ai.models.generateContent({ model: GEMINI_MODEL, contents: 'test' });

        const speed = Date.now() - startTime;
        return { status: 'ok', message: 'Соединение успешно', speed };
    } catch (error) {
        console.warn(`Proxy test failed for ${proxyUrl}:`, error);
        let message = 'Неизвестная ошибка';
        if (error.message.includes('API key not valid')) {
            message = 'Неверный ключ Gemini API';
        } else if (error.message.includes('fetch failed') || error.message.includes('network error')) {
            message = 'Сетевая ошибка или недоступен';
        } else if (error.message.includes('429')) {
             message = 'Превышен лимит запросов';
        } else {
            message = error.message;
        }
        return { status: 'error', message, speed: null };
    }
}


export const DEFAULT_PROXY_PROMPT = `
Ты — эксперт по поиску информации в сети. Твоя задача — найти 10-15 общедоступных, бесплатных прокси-серверов, которые можно использовать для доступа к Google Gemini API.
Критерии поиска:
- Прокси должны быть HTTPS.
- Они должны быть максимально быстрыми и анонимными.
- Ищи списки прокси на известных сайтах, форумах (например, Reddit), GitHub.
- Исключи из результатов прокси, которые уже есть в списке: [EXISTING_PROXIES].

Твой ответ должен быть СТРОГО в формате JSON. Не добавляй никакого текста до или после JSON.
Формат ответа: JSON-массив объектов. Каждый объект должен содержать два поля:
1. "url": Полный URL прокси-сервера (например, "https://123.45.67.89:8080").
2. "location": Страна, где расположен сервер (например, "Germany").

Пример ответа:
[
  {"url": "https://1.2.3.4:8080", "location": "USA"},
  {"url": "https://5.6.7.8:443", "location": "Canada"}
]
`;

/**
 * Uses Gemini to find new public proxies.
 * @returns {Promise<{parsedData: Array, systemPrompt: string, rawResponse: string}>}
 */
export async function findProxiesWithGemini({ apiKey, existingProxies = [], customPrompt = '' }) {
    if (!apiKey) throw new Error("Ключ Gemini API не предоставлен.");

    const ai = new GoogleGenAI({ apiKey });
    
    const systemPrompt = (customPrompt || DEFAULT_PROXY_PROMPT)
        .replace('[EXISTING_PROXIES]', existingProxies.join(', ') || 'нет');

    const schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                url: { type: Type.STRING, description: 'Полный URL прокси-сервера.' },
                location: { type: Type.STRING, description: 'Страна расположения.' },
            },
            required: ['url', 'location'],
        },
    };

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: "Найди, пожалуйста, список прокси-серверов согласно инструкции.",
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });

        const rawResponse = response.text;
        const parsedData = JSON.parse(rawResponse);
        
        return { parsedData, systemPrompt, rawResponse };

    } catch (error) {
        console.error("Gemini proxy search failed:", error);
        throw new Error(`Поиск прокси с помощью ИИ не удался: ${error.message}`);
    }
}