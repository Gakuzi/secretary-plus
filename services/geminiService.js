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
                            resultMessage.text = `Событие «${args.title}» готово для вашего Apple Календаря. Нажмите кнопку ниже, чтобы скачать файл (.ics) и добавить его.`;
                            resultMessage.card = {
                                type: 'event',
                                icon: 'CalendarIcon',
                                title: `Событие для Apple: ${args.title}`,
                                details: {
                                    'Время': new Date(args.startTime).toLocaleString('ru-RU'),
                                    'Метод': 'Экспорт в .ics файл',
                                },
                                actions: [{
                                    label: 'Скачать .ics файл',
                                    action: 'download_ics',
                                    payload: { data: result.icsData, filename: result.filename }
                                }]
                            };
                        } else {
                            const attendeesEmails = result.attendees?.map(a => a.email) || [];
                            let eventActions = [
                                { label: 'Открыть в Календаре', url: result.htmlLink },
                                { label: 'Удалить', action: 'request_delete', payload: { id: result.id, type: 'event' }, style: 'danger' }
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
                             resultMessage.contextualActions = [
                                { label: 'Создать еще событие', prompt: 'Создай еще одно событие в календаре', icon: 'CalendarIcon' },
                                { label: 'Показать мое расписание', prompt: 'Покажи мое расписание на сегодня', icon: 'CalendarIcon' }
                            ];
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
                    case 'find_documents':
                    case 'get_recent_files': {
                        const provider = getProvider('files');
                        let results = [];
                        
                        if (name === 'get_recent_files') {
                             results = await provider.getRecentFiles(args);
                             if (results.length === 0 && provider.getId() === 'supabase') {
                                const googleProvider = serviceProviders.google;
                                if (googleProvider && await googleProvider.isAuthenticated()) {
                                     results = await googleProvider.getRecentFiles(args);
                                }
                            }
                        } else { // find_documents
                            results = await provider.findDocuments(args.query);
                             if (results.length === 0 && provider.getId() === 'supabase') {
                                const googleProvider = serviceProviders.google;
                                if (googleProvider && await googleProvider.isAuthenticated()) {
                                     results = await googleProvider.findDocuments(args.query);
                                }
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
                            resultMessage.text = `Вот документы, которые я нашел. Нажмите на любой для анализа и действий.`;
                            resultMessage.card = { type: 'document_choice', icon: 'FileIcon', title: 'Выберите документ', options: normalizedResults };
                        } else {
                            resultMessage.text = `Не удалось найти документы по запросу "${args.query || 'недавние'}".`;
                        }
                        break;
                    }
                    case 'create_note': {
                        const provider = getProvider('notes');
                        const result = await provider.createNote(args);
                        resultMessage.text = `Заметка "${result.title || 'Без названия'}" успешно создана в ${provider.getName()}.`;
                        resultMessage.card = createNoteCard(result, provider.getName());
                        resultMessage.contextualActions = [
                            { label: 'Создать еще заметку', prompt: 'Создай новую заметку о планах на выходные', icon: 'FileIcon' },
                            { label: 'Найти последние заметки', prompt: 'Найди мои последние заметки', icon: 'FileIcon' }
                        ];
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
                        resultMessage.contextualActions = [
                             { label: 'Создать новую заметку', prompt: 'Создай новую заметку', icon: 'FileIcon' },
                             { label: `Искать в ${provider.getName()} еще`, prompt: `Найди в ${provider.getName()} заметки о проекте`, icon: 'FileIcon' }
                        ];
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
                        resultMessage.contextualActions = [
                             { label: `Создать еще ${docType.toLowerCase()}`, prompt: `Создай новую ${docType.toLowerCase()}`, icon: 'FileIcon' },
                             { label: 'Показать недавние файлы', prompt: 'Покажи мои недавние файлы', icon: 'FileIcon' }
                        ];
                        break;
                     }
                     case 'create_task': {
                        const provider = serviceProviders.google;
                        const result = await provider.createTask(args);
                        resultMessage.text = `Задача "${result.title}" успешно создана.`;
                        resultMessage.card = { type: 'task', icon: 'CheckSquareIcon', title: 'Задача создана', details: { 'Название': result.title, 'Статус': 'Нужно выполнить' }, actions: [{ label: 'Открыть в Google Tasks', url: 'https://tasks.google.com/embed/list/~default', target: '_blank' }, { label: 'Удалить', action: 'request_delete', payload: { id: result.id, type: 'task' }, style: 'danger' }]};
                        resultMessage.contextualActions = [
                             { label: 'Создать еще задачу', prompt: 'Создай еще одну задачу', icon: 'CheckSquareIcon' },
                             { label: 'Показать все задачи', prompt: 'Покажи все мои задачи', icon: 'CheckSquareIcon' }
                        ];
                        break;
                    }
                    case 'update_task': {
                        const provider = serviceProviders.google;
                        const result = await provider.updateTask(args);
                        resultMessage.text = `Задача "${result.title}" была успешно обновлена.`;
                        resultMessage.contextualActions = [
                             { label: 'Показать все задачи', prompt: 'Покажи все мои задачи', icon: 'CheckSquareIcon' },
                             { label: 'Создать еще задачу', prompt: 'Создай еще одну задачу', icon: 'CheckSquareIcon' }
                        ];
                        break;
                    }
                    case 'send_email': {
                        const provider = serviceProviders.google;
                        await provider.sendEmail(args);
                        resultMessage.text = `Письмо на тему "${args.subject}" успешно отправлено получателям: ${args.to.join(', ')}.`;
                        resultMessage.contextualActions = [
                            { label: 'Написать еще письмо', prompt: 'Напиши новое письмо', icon: 'EmailIcon' },
                            { label: 'Проверить почту', prompt: 'Покажи последние 5 писем', icon: 'EmailIcon' }
                        ];
                        break;
                    }
                    case 'delete_calendar_event': {
                        const provider = serviceProviders.google;
                        await provider.deleteCalendarEvent(args);
                        resultMessage.text = `Событие было успешно удалено.`;
                        resultMessage.contextualActions = [
                            { label: 'Показать расписание', prompt: 'Покажи мое расписание на сегодня', icon: 'CalendarIcon' }
                        ];
                        break;
                    }
                    case 'delete_task': {
                        const provider = serviceProviders.google;
                        await provider.deleteTask(args);
                        resultMessage.text = `Задача была успешно удалена.`;
                        resultMessage.contextualActions = [
                            { label: 'Показать все задачи', prompt: 'Покажи все мои задачи', icon: 'CheckSquareIcon' }
                        ];
                        break;
                    }
                    case 'delete_email': {
                        const provider = serviceProviders.google;
                        await provider.deleteEmail(args);
                        resultMessage.text = `Письмо было перемещено в корзину.`;
                         resultMessage.contextualActions = [
                            { label: 'Проверить почту', prompt: 'Покажи последние 5 писем', icon: 'EmailIcon' }
                        ];
                        break;
                    }
                    case 'summarize_and_save_memory': {
                        const provider = serviceProviders.supabase;
                        if (provider) {
                            await provider.saveMemory(args);
                            resultMessage.text = "Хорошо, я запомнил это.";
                        } else {
                            resultMessage.text = "Не могу сохранить в память, Supabase не настроен.";
                        }
                        break;
                    }
                    case 'recall_memory': {
                        const provider = serviceProviders.supabase;
                        if (provider) {
                            const memories = await provider.recallMemory(args.query);
                            if (memories.length > 0) {
                                const memoryText = memories.map(m => `- ${m.summary} (Ключевые слова: ${m.keywords.join(', ')})`).join('\n');
                                resultMessage.text = `Я кое-что вспомнил:\n${memoryText}`;
                            } else {
                                resultMessage.text = `По запросу "${args.query}" я ничего не вспомнил.`;
                            }
                        } else {
                            resultMessage.text = "Не могу ничего вспомнить, Supabase не настроен.";
                        }
                        break;
                    }
                    default:
                        resultMessage.text = `Неизвестный инструмент: ${name}`;
                        break;
                }
            } catch (error) {
                console.error(`Error executing tool ${name}:`, error);
                resultMessage.sender = MessageSender.SYSTEM;
                resultMessage.text = `Ошибка при выполнении действия: ${error.message}`;
            }
            return resultMessage;
        }

        // Use the recommended .text accessor to get the model's text response.
        const textResponse = (response.text || '').trim() || "Я не смог обработать ваш запрос.";

        const contextualActionsRegex = /\[CONTEXT_ACTIONS\]\s*(.*)/s;
        const quickRepliesRegex = /\[QUICK_REPLY\]\s*(.*)/g;

        let cleanText = textResponse;
        let contextualActions = null;
        let suggestedReplies = [];

        const actionsMatch = textResponse.match(contextualActionsRegex);
        if (actionsMatch && actionsMatch[1]) {
            try {
                contextualActions = JSON.parse(actionsMatch[1]);
                cleanText = cleanText.replace(contextualActionsRegex, '').trim();
            } catch (e) {
                console.error("Failed to parse contextual actions JSON:", e);
            }
        }

        let replyMatch;
        while ((replyMatch = quickRepliesRegex.exec(textResponse)) !== null) {
            suggestedReplies.push(replyMatch[1].trim());
        }
        if (suggestedReplies.length > 0) {
            cleanText = cleanText.replace(quickRepliesRegex, '').trim();
        }

        return {
            id: Date.now().toString(),
            sender: MessageSender.ASSISTANT,
            text: cleanText,
            contextualActions: contextualActions,
            suggestedReplies: suggestedReplies,
        };

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        
        let friendlyMessage = "Произошла внутренняя ошибка при обращении к Gemini.";
        try {
            // Check if the error message is a JSON string from the API
            const errorJson = JSON.parse(error.message);
            if (errorJson.error && errorJson.error.message) {
                friendlyMessage = `Произошла ошибка при обращении к Gemini: ${errorJson.error.message}`;
            }
        } catch (e) {
            // The error message was not JSON, use it directly
            friendlyMessage = `Произошла ошибка при обращении к Gemini: ${error.message}`;
        }
        
        return {
            id: Date.now().toString(),
            sender: MessageSender.SYSTEM,
            text: friendlyMessage,
        };
    }
};

export const testProxyConnection = async ({ proxyUrl, signal }) => {
    if (!proxyUrl) {
        return { status: 'error', message: 'URL прокси не указан.' };
    }

    // Append a specific path for the test endpoint on the user's worker
    const testUrl = new URL(proxyUrl);
    testUrl.pathname = '/test-proxy';

    try {
        const startTime = performance.now();
        const response = await fetch(testUrl.toString(), {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal,
        });
        const endTime = performance.now();
        const speed = Math.round(endTime - startTime);

        if (!response.ok) {
            throw new Error(`Proxy returned status ${response.status}`);
        }

        const data = await response.json();
        
        // The test service (ipify) returns { "ip": "..." }
        if (!data.ip) {
             throw new Error("Invalid response from test service through proxy.");
        }

        // Return a successful result. 'geolocation' is now the proxy's IP.
        return { status: 'ok', message: 'Соединение успешно.', speed, geolocation: data.ip };

    } catch (error) {
        if (error.name === 'AbortError') {
            // This is a controlled cancellation, not a true error.
            return { status: 'cancelled', message: 'Тест отменен пользователем.', speed: null, geolocation: null };
        }

        console.error('Ошибка при тесте прокси:', error);
        // Provide a user-friendly error message.
        let message = `Ошибка сети. Убедитесь, что URL прокси правильный, и что на нем настроены CORS-заголовки. Проверьте инструкцию.`;
        if (error.message.includes('status')) {
            message = `Прокси вернул ошибку: ${error.message}. Проверьте код воркера.`;
        }
        return { status: 'error', message: message, speed: null, geolocation: null };
    }
};


export const analyzeSyncErrorWithGemini = async ({ errorMessage, context, appStructure, apiKey, proxyUrl }) => {
    if (!apiKey) {
        throw new Error("Ключ Gemini API не предоставлен.");
    }
    const clientOptions = { apiKey };
    if (proxyUrl) {
        clientOptions.apiEndpoint = proxyUrl.replace(/^https?:\/\//, '');
    }
    const ai = new GoogleGenAI(clientOptions);

    const systemInstruction = `Ты — элитный Full-Stack инженер, отлаживающий веб-приложение "Секретарь+". Пользователь столкнулся с ошибкой во время фоновой синхронизации данных.
Твоя задача:
1.  **Проанализируй** техническое сообщение об ошибке. Особое внимание удели ошибкам, связанным с базой данных (например, "column does not exist", "relation does not exist"). Это может указывать на устаревшую схему Supabase.
2.  **Учитывай структуру приложения**, чтобы дать максимально точный совет.
3.  **Объясни** на русском языке простыми, понятными словами, что означает эта ошибка.
4.  **Предложи** конкретное, пошаговое решение. Если проблема в схеме БД, четко скажи об этом и посоветуй пользователю выполнить SQL-скрипт из настроек на вкладке "База данных". Ссылайся на конкретные файлы, если это возможно.
5.  Ответ должен быть в формате **Markdown**.

**Структура приложения для контекста:**
${appStructure}`;

    const prompt = `Пользователь получил следующую ошибку. Проанализируй её и предложи решение.
Контекст: ${context}
Сообщение об ошибке:
\`\`\`
${errorMessage}
\`\`\``;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction: systemInstruction,
            },
        });
        return response.text;
    } catch (error) {
        console.error("Error calling Gemini for sync error analysis:", error);
        return `### Ошибка при анализе\nНе удалось связаться с Gemini для анализа ошибки. Пожалуйста, проверьте свой API ключ и подключение к интернету.\n\n**Исходная ошибка:**\n\`\`\`\n${errorMessage}\n\`\`\``;
    }
};

export const findProxiesWithGemini = async ({ apiKey, proxyUrl }) => {
    if (!apiKey) throw new Error("Ключ Gemini API не предоставлен.");

    const clientOptions = { apiKey };
    if (proxyUrl) {
        clientOptions.apiEndpoint = proxyUrl.replace(/^https?:\/\//, '');
    }
    const ai = new GoogleGenAI(clientOptions);

    const systemInstruction = `Ты — эксперт по сетевым протоколам. Твоя задача — сгенерировать список из 10 публичных, бесплатных прокси-серверов (HTTP или HTTPS). Для каждого прокси укажи его предполагаемую геолокацию (страна). Верни результат в виде JSON-массива объектов. Пример: [{"url": "http://1.2.3.4:8080", "location": "Germany"}, ...]. Если не можешь сгенерировать, верни пустой массив.`;
    const prompt = `Предоставь, пожалуйста, 10 URL-адресов публичных прокси-серверов с их предполагаемой геолокацией.`;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                           url: { type: Type.STRING, description: 'A valid proxy URL, e.g., http://host:port' },
                           location: { type: Type.STRING, description: 'The estimated country of the proxy' }
                        }
                    },
                },
            },
        });
        
        const jsonStr = response.text.trim();
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("Error calling Gemini for proxy generation:", error);
        throw new Error("Не удалось сгенерировать список прокси. Проверьте ваш API ключ.");
    }
};