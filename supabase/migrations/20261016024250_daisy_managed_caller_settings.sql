create table public.daisy_caller_settings (
 id boolean primary key default true check(id),
 version integer not null default 1 check(version>0),
 settings jsonb not null check(jsonb_typeof(settings)='object'),
 history jsonb not null default '[]'::jsonb check(jsonb_typeof(history)='array'),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
alter table public.daisy_caller_settings enable row level security;
revoke all on public.daisy_caller_settings from anon,authenticated;
grant all on public.daisy_caller_settings to service_role;
insert into public.daisy_caller_settings(id,settings) values(true,'{"assistant_name":"Daisy","company_name":"DPA Help Center","introduce_as_ai":false,"recording_mode":"notice_and_continue","recording_notice":"This call may be recorded for quality and training.","availability_question":"Is now a good time?","script_delivery":"verbatim","custom_guidance":""}'::jsonb);
