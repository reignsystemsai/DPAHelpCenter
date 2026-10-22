-- Owner requested: keep audio capture enabled, without a script-injected announcement.
-- Caller and Edge Functions must support owner_managed before applying this.
do $$
declare current_settings public.daisy_caller_settings;
begin
 select * into current_settings from public.daisy_caller_settings where id=true for update;
 if current_settings.settings->>'recording_mode'='owner_managed' then return; end if;
 if current_settings.version<>10 then raise exception 'Caller settings changed; inspect the current version before applying this owner request'; end if;
 update public.daisy_caller_settings set
 history=history||jsonb_build_array(jsonb_build_object('version',version,'settings',settings,'changed_at',now(),'changed_by',updated_by,'reason','Owner explicitly requested recording remain enabled with no automatic recording announcement; separate audio controls from call scripts.')),
 settings=jsonb_set(settings,'{recording_mode}','"owner_managed"'::jsonb),version=version+1,updated_at=now()
 where id=true and version=current_settings.version;
end $$;
