alter table public.lead_operations add column if not exists purging_at timestamptz;
create or replace function public.finalize_trashed_lead(p_lead uuid,p_deleted timestamptz) returns boolean language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from lead_operations where lead_id=p_lead and deleted_at=p_deleted and purging_at is not null for update;
 if not found then raise exception 'Trash record changed; deletion stopped'; end if;
 if exists(select 1 from daisy_crm_actions where lead_id=p_lead and status in ('executing','submitted')) then raise exception 'A call or action is still pending; reconcile it before deleting'; end if;
 update daisy_call_scripts set source_action_id=null where source_action_id in(select id from daisy_crm_actions where lead_id=p_lead);
 delete from daisy_crm_actions where lead_id=p_lead;
 delete from prephub_followup_jobs where lead_id=p_lead;
 delete from prephub_contact_preferences where lead_id=p_lead;
 delete from prephub_document_packets where lead_id=p_lead;
 delete from prephub_documents where lead_id=p_lead;
 delete from prephub_document_workspaces where lead_id=p_lead;
 delete from integration_events where lead_id=p_lead;
 delete from webinar_registrations where lead_id=p_lead;
 delete from prephub_leads where id=p_lead;
 return found;
end $$;
revoke all on function public.finalize_trashed_lead(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.finalize_trashed_lead(uuid,timestamptz) to service_role;
create or replace function public.protect_trash_purge() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if old.purging_at is not null and new.deleted_at is distinct from old.deleted_at then raise exception 'This record is being permanently removed; refresh shortly'; end if;
 return new;
end $$;
drop trigger if exists protect_trash_purge on public.lead_operations;
create trigger protect_trash_purge before update on public.lead_operations for each row execute function public.protect_trash_purge();
select cron.schedule('manager-trash-retention','15 7 * * *', $job$select net.http_post(url:='https://fklchtsxahepzfzgcqdp.supabase.co/functions/v1/manager-trash',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','purge_expired','runner_token',runner_token),timeout_milliseconds:=120000) from public.prephub_followup_settings where id=true;$job$);
