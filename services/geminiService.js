import { GoogleGenAI, Type } from "@google/genai";
import { MessageSender } from "../types.js";
import { GEMINI_MODEL } from "../constants.js";
import { CalendarIcon, UserIcon, FileIcon, DocIcon, SheetIcon } from "../components/icons/Icons.jsx";
import React from "react";

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
2.  **Проактивность с документами:** Если пользователь упоминает проект, встречу для обсуждения чего-либо или любую другую активность, которая может потребовать документов, **всегда** спрашивай, не нужно ли найти существующий документ или создать новый. Например: «Мы обсуждаем проект 'Альфа'. Хотите найти связанный с ним документ на Google Диске или создать новый?»
3.  **Сначала уточнение, потом действие:** Никогда не создавай событие или задачу, если в запросе есть неоднозначные данные (имена людей, названия документов).
    -   Упомянуто имя ('Иван')? Используй \`find_contacts\`, покажи пользователю варианты, дождись его выбора.
    -   Упомянут документ ('отчет')? Используй \`find_documents\`, покажи пользователю варианты, дождись его выбора.
4.  **Сбор информации:** Только после того, как все участники, документы и другие детали подтверждены пользователем, вызывай финальную функцию, например, \`create_calendar_event\`.
5.  **Контекст:** Всегда учитывай предыдущие сообщения в диалоге для сохранения контекста.
6.  **Дата и время:** Всегда учитывай текущую дату и время при планировании. Сегодняшняя дата: ${new Date().toLocaleDateString('ru-RU')}.
7.  **Дружелюбный тон:** Общайся вежливо и профессионально.
8.  **Мультимодальность:** Если пользователь прислал изображение, проанализируй его и используй в ответе. Если к изображению есть текстовый запрос, отвечай на него с учетом картинки.`;

let ai = null;
if (process.env.API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
} else {
  console.error("API_KEY environment variable not set.");
}


export const callGemini = async (
    prompt,
    history,
    serviceProvider,
    isUnsupportedDomain,
    image
) => {
    if (!ai) {
        return {
            id: Date.now().toString(),
            sender: MessageSender.SYSTEM,
            text: "Ошибка конфигурации: Ключ API для Gemini не найден.",
        };
    }
    
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

        const functionCall = response.candidates?.[0]?.content?.parts?.[0]?.functionCall;

        if (functionCall && serviceProvider) {
            const { name, args } = functionCall;

            switch (name) {
                case 'create_calendar_event': {
                    const result = await serviceProvider.createEvent(args);
                    const cardData = {
                        type: 'event',
                        icon: React.createElement(CalendarIcon),
                        title: result.summary,
                        details: {
                            'Время': new Date(result.start.dateTime).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }),
                            'Участники': result.attendees?.map((a) => a.email) || ['Нет'],
                            'Видеовстреча': result.hangoutLink ? 'Да' : 'Нет',
                        },
                        actions: [{ label: 'Открыть', url: result.htmlLink }],
                    };
                    return {
                        id: Date.now().toString(),
                        sender: MessageSender.ASSISTANT,
                        text: "Событие успешно создано в вашем календаре.",
                        card: cardData,
                    };
                }
                case 'find_contacts': {
                    const results = await serviceProvider.findContacts(args.query);
                    if (!results || results.length === 0) {
                        return { id: Date.now().toString(), sender: MessageSender.ASSISTANT, text: `Я не смог найти контакты по запросу "${args.query}".` };
                    }
                    const cardData = {
                        type: 'contact-selection',
                        icon: React.createElement(UserIcon),
                        title: `Найденные контакты для "${args.query}"`,
                        selectionOptions: results.map((r) => ({
                            id: r.person.resourceName,
                            label: r.person.names?.[0]?.displayName || 'Без имени',
                            description: r.person.emailAddresses?.[0]?.value || r.person.phoneNumbers?.[0]?.value || 'Нет данных',
                            data: r.person,
                        })),
                    };
                    return {
                        id: Date.now().toString(),
                        sender: MessageSender.ASSISTANT,
                        text: "Пожалуйста, выберите подходящий контакт из списка:",
                        card: cardData,
                        originalPrompt: prompt,
                    };
                }
                case 'find_documents': {
                    const results = await serviceProvider.findDocuments(args.query);
                     if (!results || results.length === 0) {
                        return { id: Date.now().toString(), sender: MessageSender.ASSISTANT, text: `Я не смог найти документы по запросу "${args.query}".` };
                    }
                    const cardData = {
                        type: 'document-selection',
                        icon: React.createElement(FileIcon),
                        title: `Найденные документы для "${args.query}"`,
                        selectionOptions: results.map(file => ({
                            id: file.id,
                            label: file.name,
                            description: file.mimeType,
                            data: file,
                        })),
                    };
                     return {
                        id: Date.now().toString(),
                        sender: MessageSender.ASSISTANT,
                        text: "Пожалуйста, выберите подходящий документ:",
                        card: cardData,
                        originalPrompt: prompt,
                    };
                }
                 case 'create_google_doc':
                 case 'create_google_sheet': {
                    const result = name === 'create_google_doc'
                        ? await serviceProvider.createGoogleDoc(args.title)
                        : await serviceProvider.createGoogleSheet(args.title);

                    const cardData = {
                        type: 'document',
                        icon: name === 'create_google_doc' ? React.createElement(DocIcon) : React.createElement(SheetIcon),
                        title: result.name,
                        actions: [{ label: 'Открыть', url: result.webViewLink }],
                    };

                    return {
                        id: Date.now().toString(),
                        sender: MessageSender.ASSISTANT,
                        text: `Я создал документ «${result.name}». Что-нибудь еще?`,
                        card: cardData,
                    };
                }
                default:
                    return {
                        id: Date.now().toString(),
                        sender: MessageSender.SYSTEM,
                        text: `Неизвестный инструмент: ${name}`,
                    };
            }
        } else {
            // Simple text response
            return {
                id: Date.now().toString(),
                sender: MessageSender.ASSISTANT,
                text: response.text,
            };
        }
    } catch (error) {
        console.error("Ошибка при вызове Gemini API:", error);
        return {
            id: Date.now().toString(),
            sender: MessageSender.SYSTEM,
            text: `Произошла ошибка при обращении к Gemini. ${error instanceof Error ? error.message : ''}`,
        };
    }
};