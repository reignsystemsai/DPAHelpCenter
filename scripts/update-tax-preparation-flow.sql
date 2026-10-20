do $change$
declare r record; changed integer:=0;
begin
for r in select * from public.daisy_call_scripts where script_number in (44,45) and deleted_at is null and archived_at is null for update loop
if r.version<>2 then raise exception 'Script % changed; review latest version',r.script_number; end if;
update public.daisy_call_scripts set content=jsonb_set(jsonb_set(r.content,'{script_text}',to_jsonb($words$Hi {first_name}, this is Daisy with DPA Help Center. I’m following up on your homebuyer preparation. Do you have a quick minute?

{preparation_overview}

When a lender requests two years of tax returns, the recent completed tax years to check are {recent_tax_year} and {previous_tax_year}. Your lender will confirm what is required. Of those two years, which have you filed, and which are still pending?

[Use the client’s saved filing history and answers. If a year is already confirmed, acknowledge it and clarify only the other year. Do not assume a pending return is overdue or legally required; filing deadlines, extensions and lender requirements vary.]

Approximately when do you expect to file the pending return?

[If the client is unsure of timing or would benefit from professional help, offer the referral below. If they already have a professional or decline help, acknowledge that and skip the offer. Do not repeat answered questions.]

Would you like a referral to a tax professional in our network to help with that preparation?

[If yes, clarify their preferred contact method. Record a referral request; do not claim it was sent or completed.]

Would you prefer the referral details by email or a call from our team?

[If no filing timeframe is known, ask the following. If they gave a filing timeframe, instead agree a check-in around that timeframe without asking for the same information again.]

No problem if you don’t have a filing date yet. When would be a good time for us to check in on your progress?

[Wait for the answer. Confirm only the actual agreed next step and check-in. Tax preparation may be an outstanding preparation item, not a loan-eligibility decision. If another preparation area remains and the client has time, use the transition below and continue with its saved playbook. Otherwise record the remaining area as deferred.]

Now that we have a next step for your tax preparation, let’s take a look at the other preparation area.

[Use this transition only if a tax next step was actually agreed and another area remains. If no next step was agreed, acknowledge the uncertainty honestly before moving on. Do not end the call merely because a tax check-in was discussed.]$words$::text)),'{objective}',to_jsonb('Clarify which recent tax year is pending using recorded history; establish a client-stated filing timeframe or check-in, offer a professional referral when useful, then address the next preparation area.'::text)),version=r.version+1,finalized_at=null,history=coalesce(r.history,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('version',r.version,'title',r.title,'category',r.category,'direction',r.direction,'content',r.content,'saved_at',now(),'reason','Owner requested proactive year-specific tax preparation, conditional referral and next-area transition.')),updated_at=now() where id=r.id and version=r.version;
changed:=changed+1;
end loop;
if changed<>2 then raise exception 'Expected two active tax playbooks; found %',changed; end if;
end $change$;
