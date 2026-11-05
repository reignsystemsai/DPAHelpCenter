create or replace function public.capture_daisy_intake_call() returns trigger language plpgsql security invoker set search_path=public as $$
declare cfg public.daisy_intake_call_settings%rowtype; a jsonb; digits text; qualified boolean; consent_at timestamptz;
begin
 a:=new.assessment;
 if a->>'submit_type' is distinct from 'qualification_final' or coalesce(a->>'final_submitted','') not in ('Yes','true') or a->'voice_consent'->>'requested' is distinct from 'true' or a->'voice_consent'->>'disclosure_version' is distinct from '2026-11-05' then return new; end if;
 if not (a ?& array['credit_640_plus','income_70k_plus','job_history_2yrs','tax_returns_2yrs']) then return new; end if;
 if exists(select 1 from jsonb_each_text(jsonb_build_object('c',a->'credit_640_plus','i',a->'income_70k_plus','j',a->'job_history_2yrs','t',a->'tax_returns_2yrs')) where value not in ('Yes','No','true','false') or value is null) then return new; end if;
 select * into cfg from public.daisy_intake_call_settings where id=true and enabled=true;
 if not found or cfg.authorized_by is null or cfg.activated_at is null then return new; end if;
 consent_at:=(a->'voice_consent'->>'received_at')::timestamptz;
 if consent_at is null or consent_at<cfg.activated_at then return new; end if;
 digits:=regexp_replace(new.phone,'[^0-9]','','g'); if length(digits)=10 then digits:='1'||digits; end if;
 if digits !~ '^1[0-9]{10}$' then return new; end if;
 qualified:=(a->>'credit_640_plus' in ('Yes','true') and a->>'income_70k_plus' in ('Yes','true') and a->>'job_history_2yrs' in ('Yes','true') and a->>'tax_returns_2yrs' in ('Yes','true'));
 insert into public.daisy_intake_call_jobs(lead_id,attempt,contact_day,phone,script_number,stage,consent,authorized_by,submitted_at,due_at,reason)
 values(new.id,0,(now() at time zone 'America/New_York')::date,'+'||digits,case when qualified then 61 else 40 end,case when qualified then 'dpa' else 'new' end,a->'voice_consent',cfg.authorized_by,consent_at,now(),'Buyer requested immediate Daisy results call')
 on conflict do nothing;
 return new;
end;
$$;
revoke all on function public.capture_daisy_intake_call() from public,anon,authenticated;
create trigger daisy_intake_call_capture after insert or update of assessment on public.prephub_leads for each row execute function public.capture_daisy_intake_call();
