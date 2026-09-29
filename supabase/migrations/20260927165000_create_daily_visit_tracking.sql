create table public.site_daily_visitors (
  scope text not null check (scope in ('website','prephub')),
  visitor_id text not null,
  visit_date date not null default (timezone('America/New_York', now()))::date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  path text not null default '',
  primary key (scope, visitor_id, visit_date)
);

alter table public.site_daily_visitors enable row level security;
revoke all on public.site_daily_visitors from anon;
grant select on public.site_daily_visitors to authenticated;

create policy "Managers can read visit totals"
on public.site_daily_visitors
for select
to authenticated
using (private.is_manager());

alter publication supabase_realtime add table public.site_daily_visitors;
