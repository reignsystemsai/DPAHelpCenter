begin;
do $test$
declare owner_key uuid; scope_key text:=gen_random_uuid()::text; request_key uuid:=gen_random_uuid(); turn_key uuid:=gen_random_uuid(); affected integer;
begin
 select user_id into strict owner_key from public.manager_members where role='owner' and active=true limit 1;
 insert into public.daisy_owner_call_requests(owner_id,conversation_id,request_id,request,status,version,expires_at)
 values(owner_key,scope_key,request_key,'{"kind":"saved_script","script_number":40}'::jsonb,'awaiting_details',1,now()+interval '30 minutes');
 update public.daisy_owner_call_requests set version=2,status='dispatching' where owner_id=owner_key and conversation_id=scope_key and version=1;
 get diagnostics affected=row_count;if affected<>1 then raise exception 'First claim failed';end if;
 update public.daisy_owner_call_requests set version=2,status='dispatching' where owner_id=owner_key and conversation_id=scope_key and version=1;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Stale version claimed twice';end if;
 insert into public.daisy_owner_call_turns(owner_id,turn_id,conversation_id,request_id) values(owner_key,turn_key,scope_key,request_key);
 insert into public.daisy_owner_call_turns(owner_id,turn_id,conversation_id,request_id) values(owner_key,turn_key,scope_key,request_key) on conflict do nothing;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Duplicate message was accepted';end if;
 update public.daisy_owner_call_requests set status='cancelled' where owner_id=owner_key and conversation_id=gen_random_uuid()::text;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Another conversation was changed';end if;
 if has_table_privilege('authenticated','public.daisy_owner_call_requests','INSERT') or has_table_privilege('anon','public.daisy_owner_call_turns','SELECT') then raise exception 'Client access must be denied';end if;
end $test$;
select 'Verified single-writer claim, replay uniqueness, conversation isolation and server-only access; rolled back; no call dispatched' as verification;
rollback;
