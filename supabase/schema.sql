-- Run once in your project's Supabase SQL Editor.
-- Only public market observations are stored; no portfolio information.
create table if not exists public.qnt_public_snapshots (
  day date not null,
  model_version text not null,
  recorded_at timestamptz not null,
  price_usd double precision not null check (price_usd > 0),
  source text not null,
  source_at timestamptz not null,
  candle_at timestamptz,
  forecast jsonb not null,
  primary key (day, model_version)
);
alter table public.qnt_public_snapshots enable row level security;
revoke all on public.qnt_public_snapshots from anon, authenticated;
grant select, insert on public.qnt_public_snapshots to service_role;
