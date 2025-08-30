// Этот SQL-скрипт включает защиту на уровне строк (RLS) для всех таблиц
// и создает политики, гарантирующие, что пользователи могут получить доступ только к своим собственным данным.
import { DB_SCHEMAS, SHARED_SQL, generateCreateTableSql } from './schema.js';

// Dynamically generate CREATE TABLE statements for all services using only recommended fields.
const fullSchemaSql = Object.values(DB_SCHEMAS).map(schema => {
    // Filter for fields marked as recommended for the initial setup
    const recommendedFields = schema.fields.filter(field => field.recommended);
    // Only generate a script if there are fields to create
    if (recommendedFields.length > 0) {
        return generateCreateTableSql(schema, recommendedFields);
    }
    return '';
}).join('\n\n');

export const FULL_MIGRATION_SQL = `
-- This is a full migration script that DROPS existing tables.
-- It's intended for initial setup or a complete schema reset.

-- Disable RLS to allow dropping tables
ALTER ROLE postgres SET pgrst.db_anon_role = 'postgres';
NOTIFY pgrst, 'reload schema';

-- Drop existing tables to start fresh. USER DATA TABLES (profiles, settings, proxies) ARE PRESERVED.
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


-- Drop types if they exist to avoid conflicts on re-creation
DROP TYPE IF EXISTS public.user_role;
DROP TYPE IF EXISTS public.chat_sender;

-- Recreate shared schema components (types, shared tables, functions)
${SHARED_SQL}

-- Recreate service-specific tables with recommended fields
${fullSchemaSql}

-- Re-enable RLS for the anonymous role
ALTER ROLE postgres SET pgrst.db_anon_role = 'anon';
NOTIFY pgrst, 'reload schema';
`;