-- Owner-requested wording update. No outreach or client-record changes.
-- Existing script numbers and prior text remain in each record's version history.
do $update$
declare r record; words text; c jsonb; changed integer:=0;
begin
 for r in select * from public.daisy_call_scripts where id in (
 '7e015d94-4509-407a-9cea-616bc07fed63','e46c0a6f-1a38-4168-b688-89d3cecfb259',
 'ec28bc59-4759-467b-a918-8c5accb15fd4','2cdf22fc-98fe-4efc-a862-9bc410deb025',
 '9c86bcc1-d15d-4e22-a7c3-53fa5ee99a44','2ac341b2-18c7-4eb4-9874-dffd33285597')
 and archived_at is null and deleted_at is null for update
 loop
  if r.version<>1 then raise exception 'Script % changed; review latest wording first',r.script_number; end if;
  words:=replace(r.content->>'script_text',chr(92)||'n',chr(10));
  words:=replace(words,'Your submitted information flagged credit as a preparation area.','Let’s start with your credit preparation.');
  words:=replace(words,'Your submitted information flagged income for review.','Let’s review your income preparation.');
  words:=replace(words,'Your submitted information flagged work history for review.','Let’s review your work history preparation.');
  words:=replace(words,'Your submitted information flagged tax filing history for review.','Let’s start with your tax-filing preparation.');
  words:=replace(words,'Your submitted information flagged two areas for review: tax-filing history and income and monthly debts. Let’s start with your tax-filing history.','Let’s start with your tax-filing preparation.');
  if position('flagged' in lower(words))>0 then raise exception 'Unreviewed wording in script %',r.script_number; end if;
  if left(words,length(r.content->>'opening'))<>r.content->>'opening' then raise exception 'Opening changed in script %',r.script_number; end if;
  words:=(r.content->>'opening')||chr(10)||chr(10)||'{preparation_overview}'||substring(words from length(r.content->>'opening')+1);
  c:=jsonb_set(r.content,'{script_text}',to_jsonb(words));
  if r.script_number=45 then c:=jsonb_set(c,'{key_points}', '["Both taxes and income/monthly debts are recorded preparation areas; no calculated DTI or eligibility finding is established.","Ask one question at a time."]'::jsonb); end if;
  update public.daisy_call_scripts set content=c,version=r.version+1,finalized_at=null,
   history=coalesce(r.history,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('version',r.version,'title',r.title,'category',r.category,'direction',r.direction,'content',r.content,'saved_at',now(),'reason','Owner requested preparation wording and all-area saved-script coverage')),
   updated_at=now() where id=r.id and version=r.version;
  changed:=changed+1;
 end loop;
 if changed<>6 then raise exception 'Expected six active scripts; found %',changed; end if;
end $update$;
