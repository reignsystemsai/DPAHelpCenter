-- One preparation task per existing lead, inside the existing follow-up queue.
alter table public.prephub_followup_jobs alter column script_id drop not null;
alter table public.prephub_followup_jobs add column task_kind text check(task_kind is null or task_kind='preparation'), add column task_owner text not null default 'Daisy', add column task_title text, add column preparation_area text, add column preparation_stage text not null default 'New Lead', add column milestone jsonb not null default '{}', add column evidence jsonb not null default '{}', add column review_action_id uuid references public.daisy_crm_actions(id) on delete set null, add column task_version integer not null default 1, add column source_event_at timestamptz, add column admin_paused boolean not null default false;
alter table public.prephub_followup_jobs add constraint followup_script_required check(task_kind='preparation' or script_id is not null);
create index preparation_queue_due_idx on public.prephub_followup_jobs(status,due_at) where task_kind='preparation';
alter table public.prephub_followup_settings add column workflow_mode text not null default 'draft_only' check(workflow_mode in ('draft_only','owner_approved')), add column workflow_paused boolean not null default false;
create table public.prephub_workflow_events(id uuid primary key default gen_random_uuid(),lead_id uuid references public.prephub_leads(id) on delete cascade,event_key text not null unique,event_type text not null,data jsonb not null,created_at timestamptz not null default now());
create index workflow_events_lead_idx on public.prephub_workflow_events(lead_id,created_at desc);
alter table public.prephub_workflow_events enable row level security;
revoke all on public.prephub_workflow_events from public,anon,authenticated;
grant all on public.prephub_workflow_events to service_role;

create or replace function public.preparation_task_event(p_lead uuid,p_key text,p_type text,p_data jsonb,p_expected integer default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.prephub_followup_jobs; l public.prephub_leads; event_id uuid; old_action uuid; frozen boolean; source_time timestamptz;
begin
 select * into l from public.prephub_leads where id=p_lead; if not found then raise exception 'Client not found'; end if;
 if exists(select 1 from public.lead_operations where lead_id=p_lead and (archived_at is not null or deleted_at is not null)) then return jsonb_build_object('ok',true,'ignored',true,'reason','Client inactive'); end if;
 insert into public.prephub_followup_jobs(lead_id,step_key,channel,script_id,task_kind,task_title,preparation_area,status,due_at,reason,evidence)
 values(p_lead,'preparation_next_action','call',null,'preparation','Review intake and agree one preparation step',case when coalesce(l.credit_score,0)<640 then 'Credit' when coalesce(l.focus_areas,'{}')::text like '%dti%' then 'Income / DTI' when l.employment_history is distinct from 'employed_2_years' then 'Work History' when l.tax_return_history is distinct from 'filed_2_years' then 'Taxes' else 'Preparation review' end,'needs_review',now(),'Draft only; review contact preferences and choose a saved script',jsonb_build_object('source','self_reported_intake','credit_score',l.credit_score,'household_income',l.household_income,'home_price_goal',l.home_price,'assistance_goal_estimate',l.estimated_dpa)) on conflict(lead_id,step_key) do nothing;
 select * into j from public.prephub_followup_jobs where lead_id=p_lead and step_key='preparation_next_action' for update;
 if exists(select 1 from public.prephub_workflow_events where event_key=p_key) then return jsonb_build_object('ok',true,'duplicate',true,'task',to_jsonb(j)); end if;
 if p_expected is not null and p_expected<>j.task_version then raise exception 'Task changed. Refresh before editing.'; end if;
 source_time=nullif(p_data->>'source_at','')::timestamptz;
 if source_time is not null and j.source_event_at is not null and source_time<j.source_event_at and p_type<>'stop' then
 insert into public.prephub_workflow_events(lead_id,event_key,event_type,data) values(p_lead,p_key,'stale_event',p_data);return jsonb_build_object('ok',true,'ignored',true,'reason','Newer task instructions preserved','task',to_jsonb(j));end if;
 old_action=j.review_action_id;frozen=j.admin_paused;
 if p_type='pause' then j.admin_paused=true;j.status='paused';
 elsif p_type='resume' then j.admin_paused=false;j.status='needs_review';
 elsif p_type='take_over' then j.task_owner=coalesce(p_data->>'owner','Administrator');j.status='needs_review';
 elsif p_type='assign_daisy' then j.task_owner='Daisy';
 elsif p_type='stop' then j.status='paused';j.task_title='Respect contact objection; review permitted next step';
 elsif p_type='attach_draft' then j.review_action_id=(p_data->>'action_id')::uuid;
 elsif p_type<>'enrolled' then
 j.status=case when frozen then 'paused' else coalesce(p_data->>'status','needs_review') end;
 j.task_title=coalesce(nullif(p_data->>'task_title',''),j.task_title);
 j.preparation_stage=coalesce(p_data->>'stage',j.preparation_stage);
 j.milestone=coalesce(p_data->'milestone',j.milestone);
 j.evidence=coalesce(p_data->'evidence',j.evidence);
 end if;
 if p_type<>'attach_draft' and p_type<>'enrolled' then j.review_action_id=null;end if;
 j.due_at=coalesce(nullif(p_data->>'due_at','')::timestamptz,j.due_at);
 j.reason=coalesce(nullif(p_data->>'reason',''),j.reason);
 if p_type<>'enrolled' and p_type<>'attach_draft' then j.source_event_at=coalesce(source_time,now());end if;
 if p_type<>'enrolled' then j.task_version=j.task_version+1;end if;
 j.updated_at=now();
 update public.prephub_followup_jobs set task_owner=j.task_owner,task_title=j.task_title,preparation_stage=j.preparation_stage,milestone=j.milestone,evidence=j.evidence,status=j.status,due_at=j.due_at,reason=j.reason,task_version=j.task_version,source_event_at=j.source_event_at,admin_paused=j.admin_paused,review_action_id=j.review_action_id,updated_at=j.updated_at where id=j.id;
 if old_action is not null and p_type not in ('enrolled','attach_draft') then update public.daisy_crm_actions set status='cancelled',updated_at=now() where id=old_action and status='draft';end if;
 if p_type='stop' then update public.prephub_followup_jobs set status='paused',reason='Client contact objection',updated_at=now() where lead_id=p_lead and task_kind is null and status in ('pending','needs_review');end if;
 insert into public.prephub_workflow_events(lead_id,event_key,event_type,data) values(p_lead,p_key,p_type,p_data||jsonb_build_object('task_version',j.task_version,'task_owner',j.task_owner)) returning id into event_id;
 return jsonb_build_object('ok',true,'task',to_jsonb(j),'event_id',event_id,'executed',false);
end;$$;
revoke all on function public.preparation_task_event(uuid,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.preparation_task_event(uuid,text,text,jsonb,integer) to service_role;

create or replace function private.enqueue_preparation_lead() returns trigger language plpgsql security invoker set search_path='' as $$ begin perform public.preparation_task_event(new.id,'intake:'||new.id,'enrolled','{}');return new;end;$$;
revoke all on function private.enqueue_preparation_lead() from public,anon,authenticated;
create trigger enqueue_preparation_lead after insert on public.prephub_leads for each row execute function private.enqueue_preparation_lead();

create or replace function private.preparation_contact_change() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if coalesce(new.call_paused,false) or coalesce(new.email_paused,false) then
 perform public.preparation_task_event(new.lead_id,'preference:'||new.lead_id||':'||new.updated_at::text,'stop',jsonb_build_object('reason','Contact preference changed; recheck permitted channels','evidence',jsonb_build_object('source','contact_preferences','call_paused',new.call_paused,'email_paused',new.email_paused)));
 end if;return new;end;$$;
revoke all on function private.preparation_contact_change() from public,anon,authenticated;
create trigger preparation_contact_change after insert or update on public.prephub_contact_preferences for each row execute function private.preparation_contact_change();

create or replace function private.preparation_inbound_event() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if new.direction='inbound' and new.status not in ('queued','failed','canceled') then perform public.preparation_task_event(new.lead_id,'inbound:'||new.id,'reply',jsonb_build_object('task_title','Review client reply and agree next step','status','needs_review','source_at',coalesce(new.occurred_at,new.created_at),'reason','Inbound reply supersedes older queued work','evidence',jsonb_build_object('source','lead_communications','id',new.id,'summary',new.summary)));end if;return new;end;$$;
revoke all on function private.preparation_inbound_event() from public,anon,authenticated;
create trigger preparation_inbound_event after insert or update on public.lead_communications for each row execute function private.preparation_inbound_event();
-- Existing clients receive internal draft tasks, never outreach.
select public.preparation_task_event(l.id,'intake:'||l.id,'enrolled','{}') from public.prephub_leads l where not exists(select 1 from public.lead_operations o where o.lead_id=l.id and (o.archived_at is not null or o.deleted_at is not null));
create or replace function private.preparation_saved_progress() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if tg_op='UPDATE' and new.content->'credit_inputs'->'prepHubReadiness' is not distinct from old.content->'credit_inputs'->'prepHubReadiness' then return new;end if;
 perform public.preparation_task_event(new.lead_id,'workbook:'||new.lead_id||':'||new.updated_at::text,'saved_progress',jsonb_build_object('task_title','Review saved PrepHub progress and choose the next missing step','status','needs_review','stage','Preparation in Progress','source_at',new.updated_at,'reason','Saved workbook activity; section completion comes from saved flags, not a lender approval','evidence',jsonb_build_object('source','saved_workbook','saved_at',new.updated_at,'readiness',new.content->'credit_inputs'->'prepHubReadiness')));return new;end;$$;
revoke all on function private.preparation_saved_progress() from public,anon,authenticated;
create trigger preparation_saved_progress after insert or update on public.prephub_credit_workbooks for each row execute function private.preparation_saved_progress();
create or replace function private.preparation_dispatch_failure() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if new.kind in ('call','email') and new.status='needs_review' and new.provider_id is null and (tg_op='INSERT' or old.status is distinct from new.status) then
 perform public.preparation_task_event(new.lead_id,'dispatch_failure:'||new.id,'provider_failure',jsonb_build_object('task_title','Review unconfirmed provider dispatch before retrying','status','needs_review','reason','Provider failure or acceptance unconfirmed; no delivery/conversation assumed','evidence',jsonb_build_object('source','daisy_action','action_id',new.id,'summary',new.result->>'summary')));end if;return new;end;$$;
revoke all on function private.preparation_dispatch_failure() from public,anon,authenticated;
create trigger preparation_dispatch_failure after insert or update on public.daisy_crm_actions for each row execute function private.preparation_dispatch_failure();
create or replace function private.preparation_dispatch_accepted() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if new.payload ? 'workflow_job_id' and old.status='executing' and new.status in ('submitted','completed') then
 perform public.preparation_task_event(new.lead_id,'accepted:'||new.id,'dispatch_accepted',jsonb_build_object('task_title',case when new.kind='call' then 'Await actual call outcome' else 'Review response after preparation email' end,'status',case when new.kind='call' then 'submitted' else 'needs_review' end,'due_at',now()+interval '48 hours','reason',case when new.kind='call' then 'Provider accepted call; conversation not yet confirmed' else 'Email accepted by provider; delivery and engagement not confirmed' end,'evidence',jsonb_build_object('source','provider_acceptance','action_id',new.id,'channel',new.kind,'summary',new.result->>'summary')));end if;return new;end;$$;
revoke all on function private.preparation_dispatch_accepted() from public,anon,authenticated;
create trigger preparation_dispatch_accepted after update on public.daisy_crm_actions for each row execute function private.preparation_dispatch_accepted();
