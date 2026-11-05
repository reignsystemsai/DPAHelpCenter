-- Fresh submissions have separate jobs; provider calls remain serialized.
alter table public.daisy_intake_call_jobs drop constraint if exists daisy_intake_call_jobs_phone_contact_day_attempt_key;
drop index if exists public.daisy_intake_active_phone;
create unique index daisy_intake_active_phone on public.daisy_intake_call_jobs(phone) where status in ('working','submitted');
