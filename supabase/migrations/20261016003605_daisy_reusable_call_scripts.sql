begin;
create table public.daisy_call_scripts (
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references auth.users(id),
 source_action_id uuid unique references public.daisy_crm_actions(id),
 parent_id uuid references public.daisy_call_scripts(id),
 title text not null check(length(title) between 1 and 200),
 category text not null default 'General' check(length(category) between 1 and 80),
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=20000),
 version integer not null default 1,
 history jsonb not null default '[]'::jsonb,
 finalized_at timestamptz,
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.daisy_call_scripts enable row level security;
revoke all on public.daisy_call_scripts from public,anon,authenticated;
grant all on public.daisy_call_scripts to service_role;
create index daisy_call_scripts_category_idx on public.daisy_call_scripts(category,updated_at desc);
commit;
