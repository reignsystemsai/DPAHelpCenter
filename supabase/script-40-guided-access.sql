begin;
create or replace function pg_temp.clean_daisy_retired_access(value jsonb) returns jsonb language plpgsql as $fn$
declare result jsonb;
begin
 case jsonb_typeof(value)
 when 'string' then
  return to_jsonb(regexp_replace(value#>>'{}',
  'are you[[:space:]]+(?:(?:still|currently|already)[[:space:]]+)?(?:inside|in|signed[[:space:]]+in(?:to)?|signed[[:space:]]+in[[:space:]]+to|logged[[:space:]]+in(?:to)?|logged[[:space:]]+in[[:space:]]+to)[[:space:]]+(?:your[[:space:]]+)?prep[[:space:]]*hub(?:[[:space:]]+(?:now|yet|already))?[[:space:]]*[?]?', '', 'gi'));
 when 'array' then select coalesce(jsonb_agg(pg_temp.clean_daisy_retired_access(x) order by n),'[]'::jsonb) into result from jsonb_array_elements(value) with ordinality as a(x,n);return result;
 when 'object' then select coalesce(jsonb_object_agg(k,pg_temp.clean_daisy_retired_access(v)),'{}'::jsonb) into result from jsonb_each(value) as a(k,v);return result;
 else return value;
 end case;
end $fn$;
do $edit$
declare s record;t text;sep text;needle text;
begin
 select * into strict s from daisy_call_scripts where script_number=40 and version=21 and archived_at is null and deleted_at is null for update;
 t=s.content->>'script_text';sep=case when strpos(t,chr(10))>0 then chr(10) else chr(92)||'n' end;
 needle='[PrepHub:email_login]'||split_part(split_part(t,'[PrepHub:email_login]',2),'[PrepHub:needs]',1);
 t=replace(t,needle,'[PrepHub:email_login]'||sep||'Excellent. Go ahead and scroll down in the email, click the login button, and sign in to PrepHub. Let me know when you’re finished.'||sep||sep);
 t=replace(t,'Okay, I’ve sent it. Look for the PrepHub email and let me know when you see it.','Okay, I’ve sent it. Let me know when you find the welcome email from your PrepHub.');
 t=replace(t,'[PrepHub:email_missing]','[PrepHub:email_wait]'||sep||'Let me know when you find the welcome email from your PrepHub.'||sep||sep||'[PrepHub:email_missing]');
 needle='[PrepHub:login]'||split_part(split_part(t,'[PrepHub:login]',2),'[PrepHub:access_help]',1);
 t=replace(t,needle,'');
 update daisy_call_scripts set content=jsonb_set(s.content,'{script_text}',to_jsonb(t)),version=22,
 history=s.history||jsonb_build_array(jsonb_build_object('version',s.version,'title',s.title,'category',s.category,'direction',s.direction,'content',s.content,'saved_at',now())),
 finalized_at=now(),updated_at=now() where id=s.id and version=21;
end $edit$;
update daisy_call_scripts set content=pg_temp.clean_daisy_retired_access(content),history=pg_temp.clean_daisy_retired_access(history),updated_at=now()
where content::text~* 'are you.{0,60}prep.?hub' or history::text~* 'are you.{0,60}prep.?hub';
update daisy_crm_actions set payload=pg_temp.clean_daisy_retired_access(payload),updated_at=now()
where payload::text~* 'are you.{0,60}prep.?hub';
update daisy_crm_actions set result=jsonb_set(result,'{recovery_checkpoint}',pg_temp.clean_daisy_retired_access(result->'recovery_checkpoint')),updated_at=now()
where result->'recovery_checkpoint' is not null and (result->'recovery_checkpoint')::text~* 'are you.{0,60}prep.?hub';
select jsonb_build_object(
 'script_40_version',(select version from daisy_call_scripts where script_number=40),
 'remaining_script_sources',(select count(*) from daisy_call_scripts where (content::text||history::text)~* 'are you.{0,40}(inside|in |signed|logged).{0,30}prep.?hub'),
 'remaining_action_sources',(select count(*) from daisy_crm_actions where payload::text~* 'are you.{0,40}(inside|in |signed|logged).{0,30}prep.?hub'),
 'remaining_recovery_sources',(select count(*) from daisy_crm_actions where (result->'recovery_checkpoint')::text~* 'are you.{0,40}(inside|in |signed|logged).{0,30}prep.?hub')
) as verified;
commit;
