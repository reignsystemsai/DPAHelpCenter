create table if not exists public.manager_login_codes (
  email text primary key,
  code_hash text not null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  used_at timestamptz
);

alter table public.manager_login_codes enable row level security;
revoke all on table public.manager_login_codes from anon, authenticated;

create index if not exists manager_login_codes_expires_at_idx
  on public.manager_login_codes (expires_at);
