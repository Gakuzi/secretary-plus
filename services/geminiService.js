import { GoogleGenAI, Type } from "@google/genai";
import { MessageSender } from "../types.js";
import { GEMINI_MODEL } from "../constants.js";

const tools = {
  functionDeclarations: [
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
      name: "find_contacts",
      description: "Ищет контакты в адресной книге пользователя по имени, фамилии или email.",
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
      name: "find_documents",
      description: "Ищет файлы и документы на Google Диске пользователя по названию.",
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
      name: "create_google_doc",
      description: "Создает новый документ Google Docs с указанным названием.",
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
  ],
};

const systemInstruction = `Ты — «Секретарь+», проактивный личный ИИ-ассистент. Твоя главная цель — не просто выполнить команду, а помочь пользователю создать максимально полную и полезную сущность (событие, задачу и т.д.), предугадывая его потребности.

Принципы работы:
1.  **Диалог — ключ ко всему:** Всегда веди диалог. Если информации недостаточно, задавай уточняющие вопросы.
2.  **Проактивность с документами:** Если пользователь упоминает проект, встречу для обсуждения чего-либо или любую другую активность, которая может потребовать документов, **всегда** используй \`find_documents\`. Если документы не найдены, предложи создать новый.
3.  **Сначала уточнение, потом действие:** Никогда не создавай событие или задачу, если в запросе есть неоднозначные данные (имена людей, названия документов).
    -   Упомянуто имя ('Иван')? Используй \`find_contacts\`, покажи пользователю варианты в виде карточки выбора. Дождись его выбора, прежде чем продолжать.
    -   Упомянут документ ('отчет')? Используй \`find_documents\`, покажи пользователю варианты в виде карточки выбора. Дождись его выбора.
4.  **Сбор информации:** Только после того, как все участники, документы и другие детали подтверждены пользователем через интерактивные карточки, вызывай финальную функцию, например, \`create_calendar_event\`.
5.  **Контекст:** Всегда учитывай предыдущие сообщения в диалоге для сохранения контекста.
6.  **Дата и время:** Всегда учитывай текущую дату и время при планировании. Сегодняшняя дата: ${new Date().toLocaleDateString('ru-RU')}.
7.  **Дружелюбный тон:** Общайся вежливо и профессионально.
8.  **Мультимодальность:** Если пользователь прислал изображение, проанализируй его и используй в ответе. Если к изображению есть текстовый запрос, отвечай на него с учетом картинки.`;


export const callGemini = async (
    prompt,
    history,
    serviceProvider,
    isUnsupportedDomain,
    image,
    apiKey
) => {
    if (!apiKey) {
        return {
            id: Date.now().toString(),
            sender: MessageSender.SYSTEM,
            text: "Ошибка: Ключ Gemini API не предоставлен. Пожалуйста, добавьте его в настройках.",
        };
    }
    // Инициализация Gemini клиента с ключом из настроек.
    // Это исправляет ошибку 'process is not defined'.
    const ai = new GoogleGenAI({ apiKey });

    // Convert message history to Gemini's format
    const contents = history.map(msg => {
        const role = msg.sender === MessageSender.USER ? 'user' : 'model';
        const parts = [];
        if (msg.text) parts.push({ text: msg.text });
        // Include image from history if it exists
        if (msg.image) {
            parts.push({ inlineData: { mimeType: msg.image.mimeType, data: msg.image.base64 } });
        }
        return { role, parts };
    }).filter(msg => msg.parts.length > 0);

    // Add current user message
    const userParts = [];
    if (prompt) userParts.push({ text: prompt });
    if (image) userParts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
    if (userParts.length > 0) {
        contents.push({ role: 'user', parts: userParts });
    }

    const toolsConfig = (serviceProvider && !isUnsupportedDomain) ? { functionDeclarations: tools.functionDeclarations } : undefined;

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
            };

            switch (name) {
                case 'create_calendar_event': {
                    const result = await serviceProvider.createEvent(args);
                    resultMessage.text = `Событие "${result.summary}" успешно создано!`;
                    resultMessage.card = {
                        type: 'event',
                        icon: 'CalendarIcon',
                        title: result.summary,
                        details: {
                            'Время': new Date(result.start.dateTime).toLocaleString('ru-RU'),
                            'Участники': result.attendees?.map(a => a.email).join(', ') || 'Нет',
                            'Видеовстреча': result.hangoutLink ? `<a href="${result.hangoutLink}" target="_blank" class="text-blue-400 hover:underline">Присоединиться</a>` : 'Нет',
                        },
                        actions: [{ label: 'Открыть в Календаре', url: result.htmlLink }],
                    };
                    break;
                }
                case 'find_contacts': {
                    const results = await serviceProvider.findContacts(args.query);
                    if (results.length > 0) {
                        resultMessage.text = `Я нашел несколько контактов по вашему запросу. Пожалуйста, выберите нужный:`;
                        resultMessage.card = {
                            type: 'contact_choice',
                            icon: 'UsersIcon',
                            title: 'Выберите контакт',
                            options: results.map(r => r.person)
                        };
                    } else {
                        resultMessage.text = `К сожалению, я не нашел контактов по запросу "${args.query}".`;
                    }
                    break;
                }
                case 'find_documents': {
                    const results = await serviceProvider.findDocuments(args.query);
                    if (results.length > 0) {
                        resultMessage.text = `Вот документы, которые я нашел. Какой из них использовать?`;
                        resultMessage.card = {
                            type: 'document_choice',
                            icon: 'FileIcon',
                            title: 'Выберите документ',
                            options: results,
                        };
                    } else {
                        resultMessage.text = `Не удалось найти документы по запросу "${args.query}".`;
                        resultMessage.card = {
                            type: 'document_prompt',
                            icon: 'FileIcon',
                            title: 'Документ не найден',
                            text: 'Хотите создать новый документ?',
                            actions: [
                                { label: 'Создать Google Doc', action: 'create_document_prompt', payload: { type: 'doc', query: args.query } },
                            ]
                        };
                    }
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
                default:
                    resultMessage.text = `Неизвестный вызов функции: ${name}`;
            }
            return resultMessage;
        }

        // Standard text response
        return {
            id: Date.now().toString(),
            sender: MessageSender.ASSISTANT,
            text: response.text,
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