-- Additive phone/email workflow. No customer outreach occurs until the owner starts it.
create table public.prephub_outreach_scripts (
 id uuid primary key default gen_random_uuid(), script_key text not null,
 version integer not null, title text not null, channel text not null check(channel in ('call','email')),
 content jsonb not null, approved_at timestamptz, approved_by uuid references auth.users(id),
 created_at timestamptz not null default now(), unique(script_key,version)
);
create table public.prephub_contact_preferences (
 lead_id uuid primary key references public.prephub_leads(id),
 call_paused boolean not null default false, email_paused boolean not null default false,
 voice_permission_verified_at timestamptz, verified_by uuid references auth.users(id),
 interested_at timestamptz, callback_requested_at timestamptz, last_reply_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.prephub_followup_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 runner_token text not null default gen_random_uuid()::text,
 started_at timestamptz, started_by uuid references auth.users(id),
 last_sweep_at timestamptz, last_error text, updated_at timestamptz not null default now()
);
insert into public.prephub_followup_settings(id) values(true);
create table public.prephub_followup_jobs (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.prephub_leads(id),
 step_key text not null, channel text not null check(channel in ('call','email')),
 script_id uuid not null references public.prephub_outreach_scripts(id),
 due_at timestamptz not null, status text not null default 'pending'
 check(status in ('pending','working','submitted','completed','failed','needs_review','paused','canceled','skipped')),
 reason text, attempts integer not null default 0, provider_id text, result jsonb not null default '{}',
 interest_token text not null default gen_random_uuid()::text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(lead_id,step_key)
);
create index prephub_followup_due on public.prephub_followup_jobs(due_at) where status='pending';
create index prephub_followup_lead on public.prephub_followup_jobs(lead_id,created_at desc);
alter table public.prephub_outreach_scripts enable row level security;
alter table public.prephub_contact_preferences enable row level security;
alter table public.prephub_followup_settings enable row level security;
alter table public.prephub_followup_jobs enable row level security;
-- Access is through authenticated, membership-checked Edge Functions only.
revoke all on public.prephub_outreach_scripts,public.prephub_contact_preferences,public.prephub_followup_settings,public.prephub_followup_jobs from public,anon,authenticated;
grant all on public.prephub_outreach_scripts,public.prephub_contact_preferences,public.prephub_followup_settings,public.prephub_followup_jobs to service_role;

alter table public.prephub_followup_settings add column release_ready boolean not null default false;
insert into public.prephub_outreach_scripts(script_key,version,title,channel,content) values ('welcome_call',1,'PrepHub Welcome & Walkthrough','call','{"opening":"Hi {first_name}, this is Daisy, the AI homebuyer preparation assistant with DPA Help Center. You previously asked us about preparing to buy a home. Is now a good time for a quick introduction?","overview":"PrepHub helps you organize your credit, income and monthly debts, work history, and documents. Sign in at dpahelpcenter.com and open My Prep Hub. Choose one preparation area to work on first. These are preparation tools; your lender confirms qualification and exact numbers.","question":"Would you like help choosing your next step? Say yes or press 1. To request a callback, say callback or press 2. To stop calls, say stop or press 9.","interested":"I''ve recorded that you would like help. Our team will review your request and follow up with you. Thank you.","callback":"I''ve recorded your callback request for our team. We will review it before arranging another call. Thank you.","decline":"Thank you for your time. You can return to PrepHub whenever you are ready.","stop":"I''ve recorded your request to stop calls. Thank you.","unknown":"I can record a request for our team to help you. Say yes for help, callback to request a callback, or stop to stop calls.","voicemail":"Hi, this is Daisy, the AI homebuyer preparation assistant with DPA Help Center. You can sign in at dpahelpcenter.com to review your next steps in PrepHub. Call us at 1-833-302-8953 if you would like help. Thank you."}'::jsonb),('credit_followup',1,'Credit Preparation Follow-up','email','{"subject":"{first_name}, would you like help preparing your credit?","body":"Hi {first_name},\n\nYour intake indicated that credit preparation may be one of your next steps toward homeownership. In PrepHub, you can organize your credit information and review the areas that need attention.\n\nWould you like our team to explain the available credit preparation options? Select I''m interested below, or call 1-833-302-8953. We will discuss the scope and any cost with you before you decide.\n\nNo score improvement, deletion or loan approval is promised.\n\nDPA Help Center","cta":"I’m interested"}'::jsonb),('prep_reminder',1,'One Next Preparation Step','email','{"subject":"{first_name}, take your next step in PrepHub","body":"Hi {first_name},\n\nYou do not have to complete everything at once. Sign in to PrepHub and choose one area: credit, income and debts, work history, or documents. Save your progress so you can continue later.\n\nIf you would like our team to help you choose a next step, select I''m interested below, or call 1-833-302-8953.\n\nDPA Help Center","cta":"I’d like help"}'::jsonb) on conflict(script_key,version) do nothing;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('prephub-phone-email-sweep','*/5 * * * *',$job$
 select net.http_post(
  url:='https://fklchtsxahepzfzgcqdp.supabase.co/functions/v1/prephub-followup-worker',
  headers:='{"Content-Type":"application/json"}'::jsonb,
  body:=jsonb_build_object('runner_token',runner_token),
  timeout_milliseconds:=120000
 ) from public.prephub_followup_settings where id=true and enabled=true;
$job$);