-- Integration checks run entirely in a transaction; no provider calls or persisted test clients.
begin;
do $$
declare l uuid; j public.prephub_followup_jobs; n integer; v integer; a uuid; administrator uuid;
begin
 insert into public.prephub_leads(lead_id,email,first_name,last_name,credit_score,household_income,home_price,estimated_dpa,employment_history,tax_return_history) values('WORKFLOW-TEST-'||gen_random_uuid(),'workflow-test@example.invalid','Workflow','Test',600,60000,250000,20000,'employed_2_years','not_filed') returning id into l;
 select count(*) into n from public.prephub_followup_jobs where lead_id=l and task_kind='preparation';if n<>1 then raise exception 'New lead did not create exactly one task';end if;
 perform public.preparation_task_event(l,'intake:'||l,'enrolled','{}');select count(*) into n from public.prephub_followup_jobs where lead_id=l;if n<>1 then raise exception 'Duplicate enrollment';end if;
 select * into j from public.prephub_followup_jobs where lead_id=l;if j.task_owner<>'Daisy' or j.preparation_area<>'Credit' then raise exception 'Owner or credit priority failed';end if;
 perform public.preparation_task_event(l,'test-callback:'||l,'call_outcome',jsonb_build_object('stage','Connected','task_title','Honor requested callback','due_at','2026-11-01T15:00:00Z','evidence',jsonb_build_object('outcome','callback','client_quote','Call me November first at ten Eastern')));
 select * into j from public.prephub_followup_jobs where lead_id=l;v=j.task_version;
 perform public.preparation_task_event(l,'test-callback:'||l,'call_outcome','{}');select task_version into n from public.prephub_followup_jobs where lead_id=l;if n<>v then raise exception 'Duplicate event changed task';end if;
 perform public.preparation_task_event(l,'test-milestone:'||l,'call_outcome',jsonb_build_object('stage','Preparation Step Agreed','milestone',jsonb_build_object('title','File taxes','status','agreed','target_at','2026-11-02T17:00:00Z'),'task_title','Review agreed filing target','due_at','2026-11-02T17:00:00Z'));
 select * into j from public.prephub_followup_jobs where lead_id=l;if j.milestone->>'status'<>'agreed' or j.due_at<>'2026-11-02T17:00:00Z'::timestamptz then raise exception 'Agreed milestone date lost';end if;
 begin perform public.preparation_task_event(l,'test-stale-version:'||l,'reschedule',jsonb_build_object('due_at','2026-11-03T17:00:00Z'),1);raise exception 'Version conflict was accepted';exception when others then if sqlerrm='Version conflict was accepted' then raise;end if;end;
 perform public.preparation_task_event(l,'test-old-event:'||l,'call_outcome',jsonb_build_object('source_at','2020-01-01T00:00:00Z','task_title','WRONG'));select * into j from public.prephub_followup_jobs where lead_id=l;if j.task_title='WRONG' then raise exception 'Stale event overwrote task';end if;
 select user_id into administrator from public.manager_members where role='owner' and active limit 1;
 insert into public.daisy_crm_actions(created_by,lead_id,kind,reason,payload) values(administrator,l,'call','Workflow integration test','{"content":{},"recipient":{}}') returning id into a;
 perform public.preparation_task_event(l,'test-draft:'||l,'attach_draft',jsonb_build_object('action_id',a));
 insert into public.prephub_contact_preferences(lead_id,call_paused) values(l,true) on conflict(lead_id) do update set call_paused=true,updated_at=now();
 select * into j from public.prephub_followup_jobs where lead_id=l;if j.status<>'paused' then raise exception 'Stop did not pause preparation';end if;if (select status from public.daisy_crm_actions where id=a)<>'cancelled' then raise exception 'Stop did not cancel draft';end if;
 perform public.preparation_task_event(l,'test-pause:'||l,'pause','{}');perform public.preparation_task_event(l,'test-reply:'||l,'reply','{"task_title":"Review reply","status":"needs_review"}');select * into j from public.prephub_followup_jobs where lead_id=l;if not j.admin_paused or j.status<>'paused' then raise exception 'Reply bypassed administrator pause';end if;
end;$$;
rollback;
select 'PASS: one task per lead, Daisy assignment, credit priority, deduplication, callback date, milestone, version conflict, stale-event protection, stop cancellation and pause preservation' as result;
