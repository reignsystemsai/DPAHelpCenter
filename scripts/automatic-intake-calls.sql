create table public.daisy_intake_call_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 activated_at timestamptz,
 authorized_by uuid references auth.users(id),
 retry_minutes integer not null default 15 check(retry_minutes=15),
 updated_at timestamptz not null default now()
);
insert into public.daisy_intake_call_settings(id) values(true);
create table public.daisy_intake_call_jobs (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.prephub_leads(id) on delete cascade,
 attempt integer not null check(attempt in (0,1)),
 contact_day date not null,
 phone text not null check(phone ~ '^[+][1-9][0-9]{7,14}$'),
 script_number integer not null check(script_number in (40,60,61)),
 stage text not null check(stage in ('new','preparation','dpa')),
 consent jsonb not null,
 authorized_by uuid not null references auth.users(id),
 submitted_at timestamptz not null,
 due_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','working','submitted','completed','needs_review','canceled','paused')),
 action_id uuid unique,
 reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(lead_id,attempt),
 unique(phone,contact_day,attempt)
);
create index daisy_intake_due on public.daisy_intake_call_jobs(due_at) where status='pending';
create unique index daisy_intake_active_phone on public.daisy_intake_call_jobs(phone) where status in ('pending','working','submitted');
alter table public.daisy_intake_call_settings enable row level security;
alter table public.daisy_intake_call_jobs enable row level security;
revoke all on public.daisy_intake_call_settings,public.daisy_intake_call_jobs from public,anon,authenticated;
grant all on public.daisy_intake_call_settings,public.daisy_intake_call_jobs to service_role;
select cron.schedule('daisy-intake-call-sweep','* * * * *',$job$
 select net.http_post(
 url:='https://fklchtsxahepzfzgcqdp.supabase.co/functions/v1/prephub-auto-call',
 headers:='{"Content-Type":"application/json"}'::jsonb,
 body:=jsonb_build_object('runner_token',runner_token),
 timeout_milliseconds:=120000
 ) from public.prephub_followup_settings
 where id=true and exists(select 1 from public.daisy_intake_call_settings where id=true and enabled=true);
$job$);
