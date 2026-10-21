-- Durable per-callback wake-ups, self-removing and guarded by an absolute date.
create or replace function private.daisy_arm_callback(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.prephub_followup_jobs; s public.prephub_followup_settings; target timestamptz; name text:='daisy-callback-'||p_id; old_job bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(name,0));
 select jobid into old_job from cron.job where jobname=name;
 if old_job is not null then perform cron.unschedule(old_job); end if;
 select * into j from public.prephub_followup_jobs where id=p_id;
 select * into s from public.prephub_followup_settings where id=true;
 if j.id is null or j.task_kind<>'callback' or j.status<>'pending' or j.admin_paused or not s.callbacks_enabled or s.workflow_paused or s.workflow_mode<>'owner_approved' then return; end if;
 if j.due_at<=now() and s.daily_work_date is distinct from (now() at time zone 'America/New_York')::date then return; end if;
 target:=date_trunc('minute',greatest(j.due_at,now()))+interval '1 minute';
 if j.due_at=date_trunc('minute',j.due_at) and j.due_at>now()+interval '2 seconds' then target:=j.due_at; end if;
 perform cron.schedule(name,to_char(target at time zone 'UTC','MI HH24 DD MM')||' *',format('select private.daisy_callback_wake(%L::uuid,%L::timestamptz);',p_id,target));
end; $$;
create or replace function private.daisy_callback_wake(p_id uuid,p_target timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare j public.prephub_followup_jobs; s public.prephub_followup_settings; old_job bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('daisy-callback-'||p_id,0));
 if now()<p_target or now()>p_target+interval '15 minutes' then return; end if;
 select jobid into old_job from cron.job where jobname='daisy-callback-'||p_id;
 if old_job is null or not exists(select 1 from cron.job where jobid=old_job and command=format('select private.daisy_callback_wake(%L::uuid,%L::timestamptz);',p_id,p_target)) then return; end if;
 perform cron.unschedule(old_job);
 select * into j from public.prephub_followup_jobs where id=p_id;
 select * into s from public.prephub_followup_settings where id=true;
 if j.id is null or j.task_kind<>'callback' or j.status<>'pending' or j.due_at>now() or j.admin_paused or not s.callbacks_enabled or s.workflow_paused or s.workflow_mode<>'owner_approved' or s.daily_work_date is distinct from (now() at time zone 'America/New_York')::date then return; end if;
 perform net.http_post(url:='https://fklchtsxahepzfzgcqdp.supabase.co/functions/v1/prephub-followup-worker',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('runner_token',s.runner_token,'callback_job_id',j.id),timeout_milliseconds:=120000);
end; $$;
create or replace function private.daisy_reconcile_callbacks() returns void language plpgsql security definer set search_path='' as $$
declare j record; c record;
begin
 -- No calls or AI during reconciliation. Stale work requires review.
 update public.prephub_followup_jobs set status='needs_review',reason='Requested callback time was missed; reschedule before dialing',updated_at=now() where task_kind='callback' and status='pending' and due_at<now()-interval '15 minutes';
 update public.prephub_followup_jobs set status='needs_review',reason='Callback dispatch uncertain; reconcile provider before any retry',updated_at=now() where task_kind='callback' and status='working' and updated_at<now()-interval '10 minutes';
 for c in select jobid from cron.job where jobname ~ '^daisy-callback-[0-9a-f]{8}-' and not exists(select 1 from public.prephub_followup_jobs x where 'daisy-callback-'||x.id=jobname and x.task_kind='callback' and x.status='pending') loop perform cron.unschedule(c.jobid); end loop;
 for j in select id from public.prephub_followup_jobs where task_kind='callback' and status='pending' loop perform private.daisy_arm_callback(j.id); end loop;
end; $$;
create or replace function private.daisy_callback_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='prephub_followup_settings' then perform private.daisy_reconcile_callbacks();
 elsif TG_OP='DELETE' then if old.task_kind='callback' then perform private.daisy_arm_callback(old.id); end if;
 elsif new.task_kind='callback' or (TG_OP='UPDATE' and old.task_kind='callback') then perform private.daisy_arm_callback(new.id);
 end if;
 return null;
end; $$;
revoke all on function private.daisy_arm_callback(uuid),private.daisy_callback_wake(uuid,timestamptz),private.daisy_reconcile_callbacks(),private.daisy_callback_changed() from public,anon,authenticated,service_role;
drop trigger if exists daisy_callback_wakeup on public.prephub_followup_jobs;
create trigger daisy_callback_wakeup after insert or update of due_at,status,task_kind,admin_paused or delete on public.prephub_followup_jobs for each row execute function private.daisy_callback_changed();
drop trigger if exists daisy_callback_settings on public.prephub_followup_settings;
create trigger daisy_callback_settings after update of callbacks_enabled,workflow_paused,workflow_mode,daily_work_date on public.prephub_followup_settings for each row execute function private.daisy_callback_changed();
select cron.unschedule(jobid) from cron.job where jobname='prephub-phone-email-sweep';
select cron.schedule('daisy-callback-daily-reconcile','5 12 * * *','select private.daisy_reconcile_callbacks();');
select private.daisy_reconcile_callbacks();
