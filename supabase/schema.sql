create extension if not exists pgcrypto;

create table if not exists public.finance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type in ('income', 'expenses', 'investments', 'savings')),
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_finance_records_updated_at on public.finance_records;
create trigger trg_finance_records_updated_at
before update on public.finance_records
for each row
execute function public.set_updated_at();

alter table public.finance_records enable row level security;

drop policy if exists "Users can select own finance records" on public.finance_records;
create policy "Users can select own finance records"
on public.finance_records
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own finance records" on public.finance_records;
create policy "Users can insert own finance records"
on public.finance_records
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own finance records" on public.finance_records;
create policy "Users can update own finance records"
on public.finance_records
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own finance records" on public.finance_records;
create policy "Users can delete own finance records"
on public.finance_records
for delete
using (auth.uid() = user_id);

alter publication supabase_realtime add table public.finance_records;
alter table public.finance_records replica identity full;
