-- Direct calls remain normal, auditable Daisy actions without manufacturing leads.
alter table public.daisy_crm_actions alter column lead_id drop not null;
alter table public.daisy_crm_actions add constraint daisy_unlinked_call_only check (lead_id is not null or (kind='call' and payload->>'call_mode'='direct_number' and payload->'recipient'->>'kind'='direct_phone' and payload->'recipient'->>'phone' ~ '^\+[1-9][0-9]{7,14}$') is true);
create unique index daisy_direct_phone_inflight on public.daisy_crm_actions ((payload->'recipient'->>'phone')) where lead_id is null and kind='call' and status in ('executing','submitted');
create or replace function public.daisy_phone_contact_state(p_phone text) returns jsonb
language sql stable security invoker set search_path='' as $$
 with matched as (
  select l.id from public.prephub_leads l where
  (case when length(regexp_replace(l.phone,'[^0-9]','','g'))=10 then '1'||regexp_replace(l.phone,'[^0-9]','','g') else regexp_replace(l.phone,'[^0-9]','','g') end)=regexp_replace(p_phone,'[^0-9]','','g')
 ), history as (
  select a.* from public.daisy_crm_actions a where a.kind='call' and
  (a.lead_id in (select id from matched) or a.payload->'recipient'->>'phone'=p_phone)
 )
 select jsonb_build_object(
 'blocked',exists(select 1 from matched m join public.prephub_contact_preferences p on p.lead_id=m.id where p.call_paused)
  or exists(select 1 from matched m join public.helux_cases c on c.lead_id=m.id where c.do_not_call)
  or exists(select 1 from history where result->>'stop_calls'='true' or result->>'outcome'='stop'),
 'inactive',exists(select 1 from matched m join public.lead_operations o on o.lead_id=m.id where o.deleted_at is not null or o.archived_at is not null),
 'active_call',exists(select 1 from history where status in ('executing','submitted')),
 'communications',coalesce((select jsonb_agg(x) from (
  select 'outbound' as direction,'call' as channel,'sent' as status,executed_at as occurred_at from history where executed_at>now()-interval '7 days' and status in ('executing','submitted','completed','needs_review')
  union all
  select direction,channel,status,occurred_at from public.lead_communications where lead_id in (select id from matched) and direction='outbound' and occurred_at>now()-interval '7 days' and provider<>'helux_manager'
 ) x),'[]'::jsonb));
$$;
revoke all on function public.daisy_phone_contact_state(text) from public,anon,authenticated;
grant execute on function public.daisy_phone_contact_state(text) to service_role;
