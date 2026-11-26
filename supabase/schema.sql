-- MarketStats: Supabase schema (matches the live marketstats-nsw project). Run in the SQL editor; safe to re-run.
-- Both tables are write-only for the public: anon/authenticated may INSERT; there is no SELECT/UPDATE/DELETE policy,
-- so nothing can be read back through the API with the publishable key. Read submissions in the dashboard Table editor.

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (length(email) between 5 and 254 and position('@' in email) > 1),
  plan        text not null default 'investor' check (length(plan) <= 50),   -- site sends 'investor', 'pro' or 'any'
  created_at  timestamptz not null default now()
);
alter table public.waitlist enable row level security;
drop policy if exists "Anyone can join waitlist" on public.waitlist;
create policy "Anyone can join waitlist" on public.waitlist for insert to anon, authenticated with check (true);

create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text check (name is null or length(name) <= 120),
  email       text not null check (length(email) between 5 and 254 and position('@' in email) > 1),
  message     text not null check (length(message) between 3 and 4000),
  created_at  timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
drop policy if exists "Anyone can submit contact message" on public.contact_messages;
create policy "Anyone can submit contact message" on public.contact_messages for insert to anon, authenticated with check (true);

-- Hardening (recommended): least-privilege grants. RLS already blocks reads/updates/deletes, but TRUNCATE is not
-- covered by RLS, so remove the broad default grants and allow only column-level INSERT.
revoke all on public.waitlist, public.contact_messages from anon, authenticated;
grant insert (email, plan) on public.waitlist to anon, authenticated;
grant insert (name, email, message) on public.contact_messages to anon, authenticated;

-- Accounts use Supabase Auth (auth.users); the display name is stored in user_metadata.name. No extra table needed yet.
