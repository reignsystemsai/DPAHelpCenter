create or replace function private.initialize_lead_operations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_operations (lead_id, app_started, next_action, department_status)
  values (
    new.id,
    lower(coalesce(new.assessment->>'app_started_confirm','no')) = 'yes',
    case when new.initial_readiness_score = 100 then 'Start loan application and complete lender file' else 'Continue PrepHub readiness plan' end,
    jsonb_build_object(
      'credit', case when new.route like '%credit%' then 'Department' else 'Complete' end,
      'tax', case when new.route like '%tax%' then 'Department' else 'Complete' end,
      'review', case when new.route like '%dti%' or new.route like '%job%' then 'Department' else 'Complete' end
    )
  )
  on conflict (lead_id) do nothing;
  return new;
end;
$$;

revoke all on function private.initialize_lead_operations() from public, anon, authenticated;

create trigger prephub_leads_initialize_operations
after insert on public.prephub_leads
for each row execute function private.initialize_lead_operations();
