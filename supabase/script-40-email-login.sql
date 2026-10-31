with original as (
 select *, case when strpos(content->>'script_text',chr(10))>0 then chr(10) else chr(92)||'n' end as separator
 from daisy_call_scripts where id='7e015d94-4509-407a-9cea-616bc07fed63' and version=20
 and length(content->>'script_text')-length(replace(content->>'script_text','[PrepHub:needs]',''))=length('[PrepHub:needs]')
 and strpos(content->>'script_text','[PrepHub:email_login]')=0
), changed as (
 update daisy_call_scripts s set
 content=jsonb_set(o.content,'{script_text}',to_jsonb(replace(o.content->>'script_text','[PrepHub:needs]','[PrepHub:email_login]'||o.separator||'Go ahead and scroll down in that email, click the login button, and sign in to PrepHub.'||o.separator||o.separator||'[PrepHub:needs]'))),
 version=o.version+1,history=o.history||jsonb_build_array(jsonb_build_object('version',o.version,'title',o.title,'category',o.category,'direction',o.direction,'content',o.content,'saved_at',now())),finalized_at=now(),updated_at=now()
 from original o where s.id=o.id and s.version=o.version returning s.id,s.version,s.content
)
select c.id,c.version,
 replace(c.content->>'script_text','[PrepHub:email_login]'||o.separator||'Go ahead and scroll down in that email, click the login button, and sign in to PrepHub.'||o.separator||o.separator,'')=o.content->>'script_text' as all_other_script_words_unchanged,
 c.content-'script_text'=o.content-'script_text' as all_other_fields_unchanged
 from changed c join original o on o.id=c.id;
