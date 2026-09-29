create table public.manager_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  role text not null default 'manager' check (role in ('owner','manager','agent','partner')),
  active boolean not null default true,
  round_robin_enabled boolean not null default false,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.manager_members (user_id, email, display_name, role, active)
select id, lower(email), 'Douglas Thompson', 'owner', true
from auth.users
where lower(email) = 'drtglobal@gmail.com'
on conflict (user_id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    role = 'owner',
    active = true;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.manager_members
    where user_id = auth.uid() and active
  );
$$;

revoke all on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;

create table public.lead_operations (
  lead_id uuid primary key references public.prephub_leads(id) on delete cascade,
  pipeline_stage text not null default 'New Leads'
    check (pipeline_stage in ('New Leads','Under Contract','Clear to Close','Closed Date')),
  owner_user_id uuid references public.manager_members(user_id) on delete set null,
  forecast_month date,
  app_started boolean not null default false,
  lender_name text not null default '',
  lender_phone text not null default '',
  preapproval_received boolean not null default false,
  preapproval_amount integer check (preapproval_amount is null or preapproval_amount >= 0),
  drip_campaign text not null default '',
  next_action text not null default '',
  transaction_workflow jsonb not null default '{}'::jsonb,
  department_status jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.lead_operations (lead_id, app_started, next_action, department_status)
select id,
       lower(coalesce(assessment->>'appStartedConfirm','no')) = 'yes',
       case when current_readiness_score = 100 then 'Start loan application and complete lender file' else 'Continue PrepHub readiness plan' end,
       jsonb_build_object(
         'credit', case when route like '%credit%' then 'Department' else 'Complete' end,
         'tax', case when route like '%tax%' then 'Department' else 'Complete' end,
         'review', case when route like '%dti%' or route like '%job%' then 'Department' else 'Complete' end
       )
from public.prephub_leads
on conflict (lead_id) do nothing;

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.prephub_leads(id) on delete cascade,
  author_user_id uuid references public.manager_members(user_id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lead_notes_lead_created_idx on public.lead_notes(lead_id, created_at desc);

create table public.lead_communications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.prephub_leads(id) on delete cascade,
  channel text not null check (channel in ('email','sms','call','system')),
  direction text not null default 'outbound' check (direction in ('inbound','outbound','internal')),
  provider text not null default '',
  template_key text not null default '',
  subject text not null default '',
  summary text not null default '',
  status text not null default 'queued' check (status in ('queued','sent','delivered','opened','clicked','answered','completed','failed','canceled')),
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index lead_communications_lead_time_idx on public.lead_communications(lead_id, occurred_at desc);
create unique index lead_communications_provider_id_idx on public.lead_communications(provider, provider_message_id) where provider_message_id is not null;

create table public.helux_cases (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.prephub_leads(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  qualification text not null check (qualification in ('qualified','unqualified')),
  ai_agent text not null default 'Daisy',
  sequence_status text not null default 'Ready',
  priority text not null default 'Normal',
  attempts_used integer not null default 0 check (attempts_used >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  next_call_at timestamptz,
  callback_at timestamptz,
  last_call_at timestamptz,
  last_call_result text not null default '',
  business_outcome text not null default '',
  call_summary text not null default '',
  consent text not null default 'Pending Review',
  do_not_call boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, direction, qualification)
);

create index helux_cases_queue_idx on public.helux_cases(direction, qualification, sequence_status, next_call_at);

create table public.webinars (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  mode text not null default 'Automated replay',
  frequency text not null default 'Every hour — 24/7/365',
  always_on boolean not null default true,
  start_minute smallint not null default 0 check (start_minute in (0,15,30,45)),
  timezone text not null default 'Viewer local time',
  duration_minutes smallint not null default 30 check (duration_minutes > 0),
  capacity integer check (capacity is null or capacity > 0),
  host_name text not null default 'Down Payment Doug',
  host_title text not null default 'First-Time Homebuyer Specialist',
  avatar_path text,
  video_path text,
  video_url text,
  registration_path text not null default '/webinar',
  replay_hours integer not null default 24 check (replay_hours >= 0),
  description text not null default '',
  cta_minute smallint not null default 15 check (cta_minute >= 0),
  cta_text text not null default 'LOG IN TO PREPHUB',
  cta_url text not null default 'https://www.dpahelpcenter.com/prephub',
  redirect_url text not null default '',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.manager_members(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index webinars_registration_path_idx on public.webinars(registration_path) where status <> 'archived';

create table public.webinar_registrations (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  lead_id uuid references public.prephub_leads(id) on delete set null,
  email text not null,
  first_name text not null default '',
  phone text not null default '',
  session_at timestamptz not null,
  attended_at timestamptz,
  watched_seconds integer not null default 0 check (watched_seconds >= 0),
  cta_clicked_at timestamptz,
  source text not null default '',
  created_at timestamptz not null default now()
);

create index webinar_registrations_session_idx on public.webinar_registrations(webinar_id, session_at);
create index webinar_registrations_lead_idx on public.webinar_registrations(lead_id);

create table public.integration_events (
  id bigint generated always as identity primary key,
  lead_id uuid references public.prephub_leads(id) on delete set null,
  integration text not null,
  event_type text not null,
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed','skipped')),
  external_id text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text not null default '',
  attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index integration_events_status_idx on public.integration_events(integration, status, created_at);
create index integration_events_lead_idx on public.integration_events(lead_id, created_at desc);

create trigger manager_members_touch_updated_at before update on public.manager_members for each row execute function private.touch_updated_at();
create trigger lead_operations_touch_updated_at before update on public.lead_operations for each row execute function private.touch_updated_at();
create trigger lead_notes_touch_updated_at before update on public.lead_notes for each row execute function private.touch_updated_at();
create trigger helux_cases_touch_updated_at before update on public.helux_cases for each row execute function private.touch_updated_at();
create trigger webinars_touch_updated_at before update on public.webinars for each row execute function private.touch_updated_at();
create trigger integration_events_touch_updated_at before update on public.integration_events for each row execute function private.touch_updated_at();

alter table public.manager_members enable row level security;
alter table public.lead_operations enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_communications enable row level security;
alter table public.helux_cases enable row level security;
alter table public.webinars enable row level security;
alter table public.webinar_registrations enable row level security;
alter table public.integration_events enable row level security;

revoke all on public.manager_members, public.lead_operations, public.lead_notes, public.lead_communications, public.helux_cases, public.webinars, public.webinar_registrations, public.integration_events from anon;
grant select, insert, update, delete on public.manager_members, public.lead_operations, public.lead_notes, public.lead_communications, public.helux_cases, public.webinars, public.webinar_registrations, public.integration_events to authenticated;
grant usage, select on sequence public.integration_events_id_seq to authenticated;

create policy "Managers can read team members" on public.manager_members for select to authenticated using (public.is_manager());
create policy "Owners can manage team members" on public.manager_members for all to authenticated
using (public.is_manager() and exists (select 1 from public.manager_members m where m.user_id = auth.uid() and m.active and m.role = 'owner'))
with check (public.is_manager() and exists (select 1 from public.manager_members m where m.user_id = auth.uid() and m.active and m.role = 'owner'));

create policy "Managers can manage lead operations" on public.lead_operations for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "Managers can manage lead notes" on public.lead_notes for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "Managers can manage communications" on public.lead_communications for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "Managers can manage Helux cases" on public.helux_cases for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "Managers can manage webinars" on public.webinars for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "Managers can manage webinar registrations" on public.webinar_registrations for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "Managers can read integration events" on public.integration_events for select to authenticated using (public.is_manager());
create policy "Managers can retry integration events" on public.integration_events for update to authenticated using (public.is_manager()) with check (public.is_manager());

create policy "Managers can read all PrepHub leads" on public.prephub_leads for select to authenticated using (public.is_manager());
create policy "Managers can update PrepHub leads" on public.prephub_leads for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "Managers can read all preparation tasks" on public.preparation_tasks for select to authenticated using (public.is_manager());
create policy "Managers can update all preparation tasks" on public.preparation_tasks for update to authenticated using (public.is_manager()) with check (public.is_manager());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('webinar-videos', 'webinar-videos', false, 1073741824, array['video/mp4','video/webm','video/quicktime']),
  ('manager-avatars', 'manager-avatars', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Managers can read manager files" on storage.objects for select to authenticated
using (bucket_id in ('webinar-videos','manager-avatars') and public.is_manager());
create policy "Managers can upload manager files" on storage.objects for insert to authenticated
with check (bucket_id in ('webinar-videos','manager-avatars') and public.is_manager());
create policy "Managers can update manager files" on storage.objects for update to authenticated
using (bucket_id in ('webinar-videos','manager-avatars') and public.is_manager())
with check (bucket_id in ('webinar-videos','manager-avatars') and public.is_manager());
create policy "Managers can delete manager files" on storage.objects for delete to authenticated
using (bucket_id in ('webinar-videos','manager-avatars') and public.is_manager());

do $$
begin
  alter publication supabase_realtime add table public.prephub_leads;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.lead_operations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.lead_communications;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.webinars;
exception when duplicate_object then null;
end $$;
