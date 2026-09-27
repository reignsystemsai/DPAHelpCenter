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
      'credit', case when new.credit_score < 640 then 'Department' else 'Complete' end,
      'tax', case when new.tax_return_history = 'filed_2_years' then 'Complete' else 'Department' end,
      'review', case
        when new.household_income < 70000
          or coalesce(new.employment_history, '') not in ('employed_2_years', 'switched_jobs_2_years', 'recent_college_graduate')
        then 'Department'
        else 'Complete'
      end
    )
  )
  on conflict (lead_id) do nothing;
  return new;
end;
$$;

revoke all on function private.initialize_lead_operations() from public, anon, authenticated;

update public.lead_operations operations
set department_status = operations.department_status || jsonb_build_object(
  'credit', case when leads.credit_score < 640 then 'Department' else 'Complete' end,
  'tax', case when leads.tax_return_history = 'filed_2_years' then 'Complete' else 'Department' end,
  'review', case
    when leads.household_income < 70000
      or coalesce(leads.employment_history, '') not in ('employed_2_years', 'switched_jobs_2_years', 'recent_college_graduate')
    then 'Department'
    else 'Complete'
  end
),
updated_at = now()
from public.prephub_leads leads
where operations.lead_id = leads.id;
