create schema if not exists private;

create table public.prephub_leads (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  city text not null default '',
  zip text not null default '',
  home_price integer not null default 0 check (home_price >= 0),
  estimated_dpa integer not null default 0 check (estimated_dpa >= 0),
  credit_score integer not null default 0 check (credit_score between 0 and 850),
  household_income integer not null default 0 check (household_income >= 0),
  employment_history text not null default '',
  tax_return_history text not null default '',
  initial_readiness_score integer not null default 0 check (initial_readiness_score between 0 and 100),
  current_readiness_score integer not null default 0 check (current_readiness_score between 0 and 100),
  focus_areas text[] not null default '{}',
  route text not null default '',
  results_url text not null default '',
  assessment jsonb not null default '{}'::jsonb,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prephub_leads_user_id_idx on public.prephub_leads(user_id);
create index prephub_leads_email_idx on public.prephub_leads(lower(email));

create table public.preparation_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.prephub_leads(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  task_key text not null check (task_key in ('credit','dti','job','taxes')),
  title text not null,
  description text not null default '',
  action_url text not null,
  position smallint not null check (position between 1 and 4),
  score_value smallint not null default 25 check (score_value between 0 and 100),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, task_key)
);

create index preparation_tasks_user_id_idx on public.preparation_tasks(user_id);
create index preparation_tasks_lead_id_idx on public.preparation_tasks(lead_id);

alter table public.prephub_leads enable row level security;
alter table public.preparation_tasks enable row level security;

revoke all on public.prephub_leads from anon, authenticated;
revoke all on public.preparation_tasks from anon, authenticated;
grant select on public.prephub_leads to authenticated;
grant select on public.preparation_tasks to authenticated;

create policy "Buyers can read their own PrepHub profile"
on public.prephub_leads for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Buyers can read their own preparation tasks"
on public.preparation_tasks for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger prephub_leads_touch_updated_at
before update on public.prephub_leads
for each row execute function private.touch_updated_at();

create trigger preparation_tasks_touch_updated_at
before update on public.preparation_tasks
for each row execute function private.touch_updated_at();

create or replace function public.claim_prephub_lead(p_lead_id text)
returns public.prephub_leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.prephub_leads;
  account_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  account_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if account_email = '' then
    raise exception 'Authenticated email required';
  end if;

  update public.prephub_leads
  set user_id = auth.uid(),
      claimed_at = coalesce(claimed_at, now())
  where lead_id = p_lead_id
    and lower(email) = account_email
    and (user_id is null or user_id = auth.uid())
  returning * into claimed;

  if claimed.id is null then
    raise exception 'PrepHub plan not found for this account';
  end if;

  update public.preparation_tasks
  set user_id = auth.uid()
  where lead_id = claimed.id
    and (user_id is null or user_id = auth.uid());

  return claimed;
end;
$$;

revoke all on function public.claim_prephub_lead(text) from public, anon;
grant execute on function public.claim_prephub_lead(text) to authenticated;

create or replace function public.set_preparation_task_status(p_task_id uuid, p_completed boolean)
returns public.preparation_tasks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed public.preparation_tasks;
begin
  update public.preparation_tasks
  set completed = p_completed,
      completed_at = case when p_completed then now() else null end
  where id = p_task_id
    and user_id = auth.uid()
  returning * into changed;

  if changed.id is null then
    raise exception 'Task not found';
  end if;

  return changed;
end;
$$;

revoke all on function public.set_preparation_task_status(uuid, boolean) from public, anon;
grant execute on function public.set_preparation_task_status(uuid, boolean) to authenticated;
grant update (completed, completed_at) on public.preparation_tasks to authenticated;

create policy "Buyers can update their own task status"
on public.preparation_tasks for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function private.recalculate_prephub_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_lead_id uuid;
begin
  affected_lead_id := coalesce(new.lead_id, old.lead_id);
  update public.prephub_leads l
  set current_readiness_score = least(
    100,
    l.initial_readiness_score + coalesce((
      select sum(t.score_value)
      from public.preparation_tasks t
      where t.lead_id = affected_lead_id and t.completed
    ), 0)
  )
  where l.id = affected_lead_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.recalculate_prephub_score() from public, anon, authenticated;

create trigger preparation_tasks_recalculate_score
after insert or update of completed or delete on public.preparation_tasks
for each row execute function private.recalculate_prephub_score();

grant usage on schema public to anon, authenticated;
