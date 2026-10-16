alter table public.prephub_followup_settings add column daily_work_date date, add column daily_instruction text, add column daily_authorized_by uuid references auth.users(id) on delete set null, add column daily_authorized_at timestamptz;
create or replace function public.daisy_daily_command(p_actor uuid,p_instruction text,p_operation text default 'start_day') returns jsonb language plpgsql security invoker set search_path='' as $$
declare today date:=(now() at time zone 'America/New_York')::date;s public.prephub_followup_settings;
begin
 if not exists(select 1 from public.manager_members where user_id=p_actor and active and role='owner') then raise exception 'Owner access required';end if;
 if p_operation not in ('start_day','command','end_day') then raise exception 'Unsupported daily command';end if;
 if p_operation<>'end_day' and length(trim(coalesce(p_instruction,'')))<3 then raise exception 'Provide today’s work instructions';end if;
 select * into s from public.prephub_followup_settings where id=true for update;
 if p_operation<>'end_day' and (s.workflow_mode<>'owner_approved' or s.workflow_paused) then raise exception 'Activate or resume command-controlled mode before starting work';end if;
 update public.prephub_followup_settings set daily_work_date=case when p_operation='end_day' then null else today end,daily_instruction=case when p_operation='command' and daily_work_date=today then daily_instruction else left(trim(p_instruction),3000) end,daily_authorized_by=p_actor,daily_authorized_at=now(),updated_at=now() where id=true;
 insert into public.prephub_workflow_events(lead_id,event_key,event_type,data) values(null,'daily:'||gen_random_uuid(),p_operation,jsonb_build_object('actor',p_actor,'work_date',today,'instruction',left(trim(p_instruction),3000),'timezone','America/New_York','outreach_dispatched',false));
 select * into s from public.prephub_followup_settings where id=true;
 return jsonb_build_object('ok',true,'verified',true,'executed',false,'settings',jsonb_build_object('workflow_mode',s.workflow_mode,'workflow_paused',s.workflow_paused,'daily_work_date',s.daily_work_date,'daily_instruction',s.daily_instruction,'daily_authorized_at',s.daily_authorized_at));
end;$$;
revoke all on function public.daisy_daily_command(uuid,text,text) from public,anon,authenticated;
grant execute on function public.daisy_daily_command(uuid,text,text) to service_role;
