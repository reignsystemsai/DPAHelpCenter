create table public.daisy_worklist_runs (
 id uuid primary key,
 created_by uuid not null references auth.users(id),
 state jsonb not null check(jsonb_typeof(state)='object' and octet_length(state::text)<=600000),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index daisy_worklist_runs_owner_recent on public.daisy_worklist_runs(created_by,updated_at desc);
alter table public.daisy_worklist_runs enable row level security;
revoke all on public.daisy_worklist_runs from anon,authenticated;
grant select,insert,update on public.daisy_worklist_runs to service_role;

