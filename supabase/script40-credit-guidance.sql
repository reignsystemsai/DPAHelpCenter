-- Script 40: approved credit guidance and current-page wording. Keep all other blocks intact.
update public.daisy_call_scripts set
 history=coalesce(history,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('version',version,'content',content,'saved_at',now())),
 content=jsonb_set(content,'{script_text}',to_jsonb(replace(replace(content->>'script_text','When you open PrepHub,','Now that you’re inside PrepHub,'),'[PrepHub:end]',$credit_blocks$[PrepHub:credit_reports]
Go ahead and open “Gather My Three Credit Reports.” Do you already have any of your credit reports available?

[PrepHub:credit_upload_offer]
Excellent. You can upload the reports you have here. Would you like to work through that together now?

[PrepHub:credit_upload]
Use the upload control in Gather My Three Credit Reports to choose the report you have. Let me know when the upload is complete.

[PrepHub:credit_gather]
No problem. Gathering your reports will be your first step. You can return here to upload them when you have them.

[PrepHub:credit_tools]
You can start with the rent-cost calculator to see what you pay in rent over twelve months. Gather your three credit reports, then use the free analysis to review possible discrepancies. You can review specific inaccuracies before starting disputes and use Track Your Progress to follow your preparation. Would you like to hear about the preparation plans if you want more help?

[PrepHub:credit_plans]
If you don’t have the time to work through this yourself, or you’ve used a credit repair service you weren’t happy with, take a look at the preparation plans below. Each lists its price and what’s included. While you’re looking at those plans, what questions can I answer for you?

[PrepHub:credit_support_offer]
Would you like me to make a note and ask our team to follow up about the credit preparation plans?

[PrepHub:credit_followup]
Your next step is {credit_next_step}. When would you like me to call you back—maybe in a few days, a few weeks, or a month?

[PrepHub:credit_plan_knowledge]
UNSPOKEN PLAN KNOWLEDGE: {"self":{"name":"Instant Prep Plan","price":"$49.97","includes":["Credit preparation priorities","DTI and student loan questions","Home affordability snapshot","Next-step checklist"]},"review":{"name":"Agent Review + Plan","price":"$97","includes":["Everything in the preparation plan","Report and profile review","Priorities explained in plain language","Questions for your lender"]},"full":{"name":"First-Time Homebuyer Credit Pathway","price":"$249","includes":["Personalized homebuyer roadmap","Credit, DTI and student loan priorities","Credit and affordability preparation","Follow-up and progress checkpoints"]},"sweep":{"name":"Credit Sweep + Tradeline Assessment","price":"$599","includes":["Review of inaccurate or unverifiable items","Specialist dispute assistance","Tradeline profile assessment","Homebuying impact and next steps"]}}. All prices are one-time. Answer the actual question briefly; no invented guarantees, discounts, timelines, enrollment, payments, or included tradeline purchases.

[PrepHub:end]$credit_blocks$))),
 version=version+1,updated_at=now()
 where id='7e015d94-4509-407a-9cea-616bc07fed63' and version=23 and deleted_at is null
 returning id,script_number,version;
