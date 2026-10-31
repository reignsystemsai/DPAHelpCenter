-- Saved-script phone calls use the same audited recipient constraints as custom calls.
begin;
alter table public.daisy_crm_actions drop constraint daisy_unlinked_call_only;
alter table public.daisy_crm_actions add constraint daisy_unlinked_call_only check (
 lead_id is not null or (
  kind = 'call'
  and payload->>'call_mode' in ('direct_number', 'saved_script_phone')
  and payload->'recipient'->>'kind' = 'direct_phone'
  and payload->'recipient'->>'phone' ~ '^[+][1-9][0-9]{7,14}$'
 ) is true
);
commit;
