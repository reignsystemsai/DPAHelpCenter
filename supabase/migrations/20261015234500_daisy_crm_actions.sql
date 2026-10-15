create table if not exists public.daisy_crm_actions (
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references auth.users(id),
 lead_id uuid not null references public.prephub_leads(id),
 kind text not null check (kind in ('call','email','note','next_action','assign_owner')),
 status text not null default 'draft' check (status in ('draft','executing','submitted','completed','needs_review','cancelled','failed')),
 reason text not null,
 payload jsonb not null,
 before_value jsonb,
 result jsonb not null default '{}'::jsonb,
 provider_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 executed_at timestamptz
);
create index if not exists daisy_crm_actions_lead_created on public.daisy_crm_actions(lead_id,created_at desc);
alter table public.daisy_crm_actions enable row level security;
revoke all on public.daisy_crm_actions from public,anon,authenticated;
grant all on public.daisy_crm_actions to service_role;
comment on table public.daisy_crm_actions is 'Owner-authenticated immutable Daisy action proposals and provider-confirmed execution results; no browser-direct access.';
