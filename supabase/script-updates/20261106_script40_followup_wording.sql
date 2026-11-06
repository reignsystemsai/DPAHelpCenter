-- Applied Script 40 v35: use the owner-approved first-time homebuyer request wording.
update daisy_call_scripts
set history=coalesce(history,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
'version',version,'title',title,'category',category,'direction',direction,'content',content,'saved_at',now())),
content=jsonb_set(content,'{script_text}',to_jsonb(replace(replace(
content->>'script_text','following up on your down payment assistance request',
'following up on your first-time homebuyer down payment assistance request'),
'following up on your first-time homebuyer request for assistance',
'following up on your first-time homebuyer down payment assistance request'))),
version=version+1,updated_at=now()
where script_number=40 and version=34 and deleted_at is null;
