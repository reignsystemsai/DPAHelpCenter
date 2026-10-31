begin;
do $test$
declare owner_id uuid; mode text; invalid jsonb; blocked boolean;
begin
 select user_id into strict owner_id from public.manager_members where role='owner' and active=true limit 1;
 foreach mode in array array['direct_number','saved_script_phone'] loop
  insert into public.daisy_crm_actions(created_by,lead_id,kind,status,reason,payload)
  values(owner_id,null,'call','cancelled','Transactional constraint regression test',
   jsonb_build_object('call_mode',mode,'recipient',jsonb_build_object('kind','direct_phone','phone','+13055550101')));
 end loop;
 for invalid in select value from jsonb_array_elements('[
 {"call_mode":"saved_script_phone","recipient":{"kind":"direct_phone","phone":"3055550101"}},
 {"call_mode":"email","recipient":{"kind":"direct_phone","phone":"+13055550101"}},
 {"call_mode":"saved_script_phone","recipient":{"kind":"direct_phone","phone":null}}
 ]'::jsonb) loop
  blocked := false;
  begin
   insert into public.daisy_crm_actions(created_by,lead_id,kind,status,reason,payload)
   values(owner_id,null,'call','cancelled','Transactional constraint regression test',invalid);
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'Invalid unlinked action was accepted'; end if;
 end loop;
end $test$;
select 'Both valid call modes accepted; all invalid recipients rejected; no calls dispatched; transaction rolled back' as verification;
rollback;