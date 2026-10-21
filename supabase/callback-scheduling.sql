-- Callback jobs reuse the existing follow-up queue and existing RLS.
-- Apply before deploying the caller/worker; enable only after mocked tests pass.
alter table public.prephub_followup_settings add column if not exists callbacks_enabled boolean not null default false;
alter table public.prephub_followup_jobs drop constraint if exists prephub_followup_jobs_task_kind_check;
alter table public.prephub_followup_jobs add constraint prephub_followup_jobs_task_kind_check check(task_kind is null or task_kind in ('preparation','callback'));
alter table public.prephub_followup_jobs drop constraint if exists followup_script_required;
alter table public.prephub_followup_jobs add constraint followup_script_required check(task_kind in ('preparation','callback') or script_id is not null);
create index if not exists prephub_callback_due_idx on public.prephub_followup_jobs(due_at) where task_kind='callback' and status='pending';
-- Owner-authorized callback release. General automatic outreach remains disabled.
update public.prephub_followup_settings set callbacks_enabled=true,updated_at=now() where id=true;
-- Apply callback-wakeups.sql for per-callback scheduling and daily reconciliation.
