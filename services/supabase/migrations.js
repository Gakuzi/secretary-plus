
// Этот SQL-скрипт включает защиту на уровне строк (RLS) для всех таблиц
// и создает политики, гарантирующие, что пользователи могут получить доступ только к своим собственным данным.
export const FULL_MIGRATION_SQL = `
-- Enable Row Level Security
alter table public.calendar_events enable row level security;
alter table public.contacts enable row level security;
alter table public.files enable row level security;
alter table public.tasks enable row level security;
alter table public.emails enable row level security;
alter table public.notes enable row level security;
alter table public.chat_memory enable row level security;
alter table public.user_settings enable row level security;
alter table public.action_stats enable row level security;
alter table public.proxies enable row level security;

-- Drop existing policies to prevent conflicts
drop policy if exists "Enable all access for authenticated users" on public.calendar_events;
drop policy if exists "Enable all access for authenticated users" on public.contacts;
drop policy if exists "Enable all access for authenticated users" on public.files;
drop policy if exists "Enable all access for authenticated users" on public.tasks;
drop policy if exists "Enable all access for authenticated users" on public.emails;
drop policy if exists "Enable all access for authenticated users" on public.notes;
drop policy if exists "Enable all access for authenticated users" on public.chat_memory;
drop policy if exists "Enable all access for authenticated users" on public.user_settings;
drop policy if exists "Enable all access for authenticated users" on public.action_stats;
drop policy if exists "Enable all access for authenticated users" on public.proxies;

-- Create policies for each table
create policy "Enable all access for authenticated users" on public.calendar_events for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.contacts for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.files for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.tasks for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.emails for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.notes for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.chat_memory for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.user_settings for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.action_stats for all to authenticated using (auth.uid() = user_id);
create policy "Enable all access for authenticated users" on public.proxies for all to authenticated using (auth.uid() = user_id);
`.trim();
