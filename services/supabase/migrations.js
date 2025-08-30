// Этот SQL-скрипт включает защиту на уровне строк (RLS) для всех таблиц
// и создает политики, гарантирующие, что пользователи могут получить доступ только к своим собственным данным.
import { DB_SCHEMAS, SHARED_SQL, generateCreateTableSql } from './schema.js';

// Dynamically generate CREATE TABLE statements for all services using all defined fields.
const fullSchemaSql = Object.values(DB_SCHEMAS)
    .filter(schema => schema.isEditable) // Only create tables for user-editable data
    .map(schema => generateCreateTableSql(schema, schema.fields))
    .join('\n\n');

export const FULL_MIGRATION_SQL = `
-- Это полный скрипт миграции, который УДАЛЯЕТ существующие таблицы.
-- Предназначен для первоначальной настройки или полного сброса схемы.

-- Удаляем существующие таблицы для чистого старта. Системные таблицы (profiles и т.д.) сохраняются логикой в SHARED_SQL.
DROP TABLE IF EXISTS public.calendar_events CASCADE;
DROP TABLE IF EXISTS public.contacts CASCADE;
DROP TABLE IF EXISTS public.files CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.emails CASCADE;
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.chat_memory CASCADE;
DROP TABLE IF EXISTS public.chat_history CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.action_stats CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.shared_proxies CASCADE;
DROP TABLE IF EXISTS public.shared_gemini_keys CASCADE;


-- Пересоздаем общие компоненты схемы (типы, системные таблицы, функции)
${SHARED_SQL}

-- Пересоздаем таблицы для сервисов со всеми полями
${fullSchemaSql}
`;
