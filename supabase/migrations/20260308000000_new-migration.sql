-- MoneyFlow Pro initial schema
create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12,2) not null check (amount >= 0),
  source text not null,
  date date not null,
  description text,
  tag text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12,2) not null check (amount >= 0),
  category text not null,
  date date not null,
  payment_method text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12,2) not null check (amount >= 0),
  business_name text not null,
  investment_type text not null,
  date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_amount numeric(12,2) not null check (target_amount >= 0),
  current_amount numeric(12,2) not null default 0 check (current_amount >= 0),
  deadline date,
  created_at timestamptz not null default now()
);

create index if not exists incomes_date_idx on public.incomes(date desc);
create index if not exists expenses_date_idx on public.expenses(date desc);
create index if not exists investments_date_idx on public.investments(date desc);
