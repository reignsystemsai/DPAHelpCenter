create table if not exists public.prephub_page_presence (
 lead_id uuid not null references public.prephub_leads(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 tab text not null check(tab in ('overview','credit','income','employment','documents','savings')),
 panel text,
 visible boolean not null default false,
 seen_at timestamptz not null default now(),
 primary key (lead_id,session_id)
);
alter table public.prephub_page_presence enable row level security;
revoke all on public.prephub_page_presence from public,anon,authenticated;
grant select,insert,update,delete on public.prephub_page_presence to service_role;
