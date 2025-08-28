import { GoogleGenAI, Type } from "@google/genai";
import { MessageSender } from "../types.js";
import { GEMINI_MODEL } from "../constants.js";

const baseTools = [
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
      name: "find_documents",
      description: "Ищет файлы и документы по названию. Если Supabase включен, поиск идет по синхронизированной базе. Если выключен - напрямую в Google Drive.",
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

const supabaseOnlyTools = [
    {
      name: "find_contacts",
      description: "Ищет контакты в синхронизированной базе данных по имени, фамилии или email.",
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
      description: "Выполняет немедленное действие с контактом, такое как звонок или отправка email, когда не указано конкретное время в будущем. Для этого используется поиск по синхронизированной базе.",
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
];


const systemInstruction = `Ты — «Секретарь+», проактивный личный ИИ-ассистент, работающий с данными пользователя.

Принципы работы:
1.  **Поиск данных:** Для поиска контактов (\`find_contacts\`) ты **всегда** обращаешься к синхронизированной базе данных Supabase. Для поиска документов (\`find_documents\`) ты используешь доступный источник: либо базу данных, либо прямой поиск в Google Drive, если база отключена.
2.  **Немедленные действия:** Если пользователь просит совершить простое действие с контактом (например, 'позвони Ивану', 'напиши письмо Марии') и НЕ указывает время/дату в будущем, используй \`perform_contact_action\`. Для поиска контакта будет использоваться база данных.
3.  **Диалог — ключ ко всему:** Если информации недостаточно, задавай уточняющие вопросы.
4.  **Сначала уточнение, потом действие:** Никогда не создавай событие или задачу, если в запросе есть неоднозначные данные (имена людей, названия документов).
    -   Упомянуто имя ('Иван')? Используй \`find_contacts\`, покажи пользователю варианты из базы в виде карточки выбора. Дождись его выбора.
    -   Упомянут документ ('отчет')? Используй \`find_documents\`, покажи пользователю варианты из доступного источника в виде карточки выбора. Дождись его выбора.
5.  **Работа с контактами без Email:** Если пользователь выбирает контакт без email-адреса для создания события, ты должен явно спросить у пользователя этот email. **КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО** придумывать или подставлять несуществующие email-адреса. Если пользователь отвечает, что не знает email, создай событие без участников (с пустым полем \`attendees\`) и в своем ответе сообщи, что пользователь может поделиться ссылкой на встречу вручную.
6.  **Сбор информации:** Только после того, как все участники, документы и другие детали подтверждены пользователем, вызывай финальную функцию, например, \`create_calendar_event\`.
7.  **Контекст:** **Критически важно:** Ты должен анализировать ВЕСЬ предыдущий диалог, чтобы понимать текущий контекст. Не отвечай на последний запрос в изоляции. Связывай имена, документы и намерения, упомянутые ранее в разговоре.
8.  **Дата и время:** Всегда учитывай текущую дату и время при планировании. Сегодняшняя дата: ${new Date().toLocaleDateString('ru-RU')}.
9.  **Интерактивные ответы:** Если ты задаешь пользователю вопрос, по возможности предлагай 2-4 наиболее вероятных варианта быстрого ответа. Каждый вариант ответа должен быть на новой строке и начинаться с префикса \`[QUICK_REPLY]\`. Например: \n\`На какое время запланировать?\`\n\`[QUICK_REPLY]На 15:00\`\n\`[QUICK_REPLY]На завтра утром\`
10. **Мультимодальность:** Если пользователь прислал изображение, проанализируй его и используй в ответе. Если к изображению есть текстовый запрос, отвечай на него с учетом картинки.
11. **Проактивные предложения:** После успешного выполнения основного действия (например, создания встречи), всегда предлагай релевантные последующие шаги. Например, после создания встречи предложи отправить приглашения участникам или создать задачу для подготовки.
12. **Проактивное создание документов:** Если пользователь просит создать документ (например, 'создай документ по проекту альфа') и в истории чата есть релевантная информация, не вызывай \`create_google_doc\` сразу. Вместо этого, используй \`propose_document_with_content\`, передав краткое содержание обсуждения. Дождись подтверждения от пользователя.`;


export const callGemini = async ({
    prompt,
    history,
    serviceProvider,
    supabaseService,
    isGoogleConnected,
    isSupabaseEnabled,
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
    
    let availableTools = [...baseTools];
    if (isSupabaseEnabled) {
        availableTools.push(...supabaseOnlyTools);
    }
    
    const toolsConfig = (isGoogleConnected) ? { functionDeclarations: availableTools } : undefined;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents,
            config: {
                systemInstruction: systemInstruction,
                tools: toolsConfig ? [toolsConfig] : undefined,
            },
        });
        
        const firstCandidate = response.candidates?.[0];
        const functionCall = firstCandidate?.content?.parts?.[0]?.functionCall;

        if (functionCall && serviceProvider) {
            const { name, args } = functionCall;
            let resultMessage = {
                id: Date.now().toString(),
                sender: MessageSender.ASSISTANT,
                text: '',
                card: null,
                functionCallName: name, // Add function name for stats tracking
            };

            switch (name) {
                case 'create_calendar_event': {
                    const result = await serviceProvider.createEvent(args);
                    const attendeesEmails = result.attendees?.map(a => a.email) || [];
                    
                    const eventActions = [
                        { label: 'Открыть в Календаре', url: result.htmlLink }
                    ];

                    if (attendeesEmails.length > 0 && result.hangoutLink) {
                        eventActions.push({
                            label: 'Отправить ссылку участникам',
                            action: 'send_meeting_link',
                            payload: { 
                                to: attendeesEmails,
                                subject: `Приглашение на встречу: ${result.summary}`,
                                body: `Присоединяйтесь к встрече "${result.summary}": <a href="${result.hangoutLink}">${result.hangoutLink}</a>`
                            }
                        });
                    }

                    eventActions.push({
                        label: 'Создать задачу "Подготовиться"',
                        action: 'create_prep_task',
                        payload: {
                            title: `Подготовиться к встрече: "${result.summary}"`,
                            notes: `Встреча запланирована на ${new Date(result.start.dateTime).toLocaleString('ru-RU')}. Ссылка: ${result.hangoutLink || 'Нет'}`
                        }
                    });

                    resultMessage.text = `Событие "${result.summary}" успешно создано! Что дальше?`;
                    resultMessage.card = {
                        type: 'event',
                        icon: 'CalendarIcon',
                        title: result.summary,
                        details: {
                            'Время': new Date(result.start.dateTime).toLocaleString('ru-RU'),
                            'Участники': attendeesEmails.join(', ') || 'Нет',
                            'Видеовстреча': result.hangoutLink ? `<a href="${result.hangoutLink}" target="_blank" class="text-blue-400 hover:underline">Присоединиться</a>` : 'Нет',
                        },
                        actions: eventActions,
                        shareableLink: result.hangoutLink,
                        shareText: `Присоединяйтесь к встрече "${result.summary}": ${result.hangoutLink}`,
                    };
                    break;
                }
                case 'find_contacts': {
                    if (!supabaseService) {
                         resultMessage.text = "Функция поиска контактов отключена, так как Supabase неактивен.";
                         break;
                    }
                    const results = await supabaseService.searchContacts(args.query);
                    if (results.length === 1) {
                        const person = results[0];
                        resultMessage.text = `Найден контакт: ${person.display_name}. Что вы хотите сделать?`;
                        resultMessage.card = {
                            type: 'contact',
                            icon: 'UsersIcon',
                            title: 'Карточка контакта',
                            person: person,
                        };
                    } else if (results.length > 1) {
                        resultMessage.text = `Я нашел несколько контактов по вашему запросу. Пожалуйста, выберите нужный:`;
                        resultMessage.card = {
                            type: 'contact_choice',
                            icon: 'UsersIcon',
                            title: 'Выберите контакт',
                            options: results
                        };
                    } else {
                        resultMessage.text = `К сожалению, я не нашел контактов по запросу "${args.query}".`;
                    }
                    break;
                }
                case 'perform_contact_action': {
                     if (!supabaseService) {
                         resultMessage.text = "Функция действий с контактами отключена, так как Supabase неактивен.";
                         break;
                    }
                    const results = await supabaseService.searchContacts(args.query);
                     if (results.length === 1) {
                        const person = results[0];
                        const actionText = args.action === 'call' ? 'позвонить' : 'написать';
                        resultMessage.text = `Готовы ${actionText} контакту ${person.display_name}.`;
                        resultMessage.card = {
                            type: 'direct_action_card',
                            icon: args.action === 'call' ? 'PhoneIcon' : 'EmailIcon',
                            title: `Выполнить действие: ${actionText}`,
                            person: person,
                            action: args.action,
                        };
                    } else if (results.length > 1) {
                        const actionText = args.action === 'call' ? 'позвонить' : 'написать';
                        resultMessage.text = `Я нашел несколько контактов. Кому вы хотите ${actionText}?`;
                        resultMessage.card = {
                            type: 'contact_choice',
                            icon: 'UsersIcon',
                            title: `Кому ${actionText}?`,
                            options: results
                        };
                    } else {
                        resultMessage.text = `К сожалению, я не нашел контактов по запросу "${args.query}".`;
                    }
                    break;
                }
                case 'find_documents': {
                    const results = isSupabaseEnabled && supabaseService
                        ? await supabaseService.searchFiles(args.query)
                        : await serviceProvider.findDocuments(args.query);
                    
                    // Normalize data structure for the card
                    const normalizedResults = results.map(doc => ({
                        name: doc.name,
                        url: doc.url || doc.webViewLink,
                        icon_link: doc.icon_link || doc.iconLink,
                        source_id: doc.source_id || doc.id
                    }));

                    if (normalizedResults.length > 0) {
                        resultMessage.text = `Вот документы, которые я нашел. Какой из них использовать?`;
                        resultMessage.card = {
                            type: 'document_choice',
                            icon: 'FileIcon',
                            title: 'Выберите документ',
                            options: normalizedResults,
                        };
                    } else {
                        resultMessage.text = `Не удалось найти документы по запросу "${args.query}".`;
                        resultMessage.card = {
                            type: 'document_prompt',
                            icon: 'FileIcon',
                            title: 'Документ не найден',
                            text: 'Хотите создать новый документ в Google Drive?',
                            actions: [
                                { label: 'Создать Google Doc', action: 'create_document_prompt', payload: { type: 'doc', query: args.query } },
                            ]
                        };
                    }
                    break;
                }
                case 'propose_document_with_content': {
                    resultMessage.text = `Я подготовил краткое содержание нашего обсуждения. Хотите добавить его в новый документ "${args.title}"?`;
                    resultMessage.card = {
                        type: 'document_creation_proposal',
                        icon: 'FileIcon',
                        title: `Создать документ: ${args.title}`,
                        summary: args.summary,
                        actions: [
                            { label: 'Создать с содержанием', action: 'create_doc_with_content', payload: { title: args.title, content: args.summary } },
                            { label: 'Создать пустой', action: 'create_empty_doc', payload: { title: args.title } },
                        ]
                    };
                    break;
                }
                 case 'create_google_doc':
                 case 'create_google_sheet': {
                    const isSheet = name === 'create_google_sheet';
                    const result = isSheet 
                        ? await serviceProvider.createGoogleSheet(args.title)
                        : await serviceProvider.createGoogleDoc(args.title);
                    
                    resultMessage.text = `${isSheet ? 'Таблица' : 'Документ'} "${result.name}" успешно создан.`;
                    resultMessage.card = {
                        type: 'document',
                        icon: 'FileIcon',
                        title: result.name,
                        details: {
                            'Тип': result.mimeType.includes('spreadsheet') ? 'Google Таблица' : 'Google Документ',
                        },
                        actions: [{ label: 'Открыть документ', url: result.webViewLink }],
                    };
                    break;
                 }
                 case 'create_google_doc_with_content': {
                    const result = await serviceProvider.createGoogleDocWithContent(args.title, args.content);
                    resultMessage.text = `Документ "${result.name}" с вашими заметками успешно создан.`;
                    resultMessage.card = {
                        type: 'document',
                        icon: 'FileIcon',
                        title: result.name,
                        details: {
                            'Тип': 'Google Документ',
                        },
                        actions: [{ label: 'Открыть документ', url: result.webViewLink }],
                    };
                    break;
                 }
                 case 'create_task': {
                    const result = await serviceProvider.createTask(args);
                    resultMessage.text = `Задача "${result.title}" успешно создана.`;
                    resultMessage.card = {
                        type: 'task',
                        icon: 'CheckSquareIcon',
                        title: 'Задача создана',
                        details: {
                            'Название': result.title,
                            'Статус': 'Нужно выполнить',
                        },
                        actions: [{ label: 'Открыть в Google Tasks', url: 'https://tasks.google.com/embed/list/~default', target: '_blank' }]
                    };
                    break;
                }
                case 'send_email': {
                    await serviceProvider.sendEmail(args);
                    resultMessage.text = `Письмо на тему "${args.subject}" успешно отправлено получателям: ${args.to.join(', ')}.`;
                    break;
                }
                default:
                    resultMessage.text = `Неизвестный вызов функции: ${name}`;
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
