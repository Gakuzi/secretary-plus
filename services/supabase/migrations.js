// Этот SQL-скрипт включает защиту на уровне строк (RLS) для всех таблиц
// и создает политики, гарантирующие, что пользователи могут получить доступ только к своим собственным данным.
import { SERVICE_SCHEMAS, SHARED_SQL } from './schema.js';

// Собираем полный скрипт из всех частей для использования в мастере первоначальной настройки
const fullSchemaSql = Object.values(SERVICE_SCHEMAS).map(s => s.sql).join('\n\n');

export const FULL_MIGRATION_SQL = `
-- Удаляем старые таблицы данных, чтобы начать с чистого листа.
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
DROP TABLE IF EXISTS public.proxies CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

${SHARED_SQL}

${fullSchemaSql}
`;