# Preparation call wording and coverage

The existing Supabase `daisy_call_scripts.content.script_text` is the editable dialogue source. Script numbers, versions and history stay in that library. Nothing is copied into a second library. `scripts/update-preparation-wording.sql` records the owner-requested one-time wording changes with the former version preserved.

`{first_name}` personalizes the name. `{preparation_overview}` expands to the client's recorded preparation areas, once at the start of the approved call preview. The server combines the selected script with the active saved scripts for other recorded areas. It omits only repeated identical script openings and the repeated overview token; all section dialogue is preserved. Bracketed preparation headings are unspoken stage directions. The final combined wording appears in the existing review card before approval.

Recorded `focus_areas` and an explicitly reported credit score below 640 determine areas. Credit comes first if present. Otherwise the selected area comes first. Income and DTI remain separate script topics although their stored category is shared. Missing or ambiguous supporting scripts block preparation with an accurate error. General custom scripts are fallback candidates only when no categorized script exists.

Each call action snapshots `script_sources` (ID, number and version), `preparation_areas`, `preparation_sections`, and the exact combined `script_text`. Every source version is checked before finalization and dispatch. A later edit/archive/delete requires a fresh review; active calls retain their original snapshots. Stale action drafts are not silently rewritten.

GitHub DPAHelpCenter: `_shared/call-scripts.ts` composes and pins the sources; `_shared/crm-actions.ts` stores and dispatches them; `manager-daisy/index.ts` tells Daisy to use the library and client-facing preparation wording. GitHub helux-ai-workforce: `manager-calls.js` holds universal identity, recording, opt-out, truthful scope, script-delivery and section-coverage rules. Caller settings remain editable through the existing CRM settings.

The voice model is instructed to read dialogue verbatim, acknowledge factual answers briefly, and return to the next saved question. Backend mission guidance does not authorize extra questions. A normal finish is rejected if any section's opening question has not appeared verbatim in the assistant transcript; the server supplies that saved question to resume. An evidenced client request to stop/defer, opt-out, wrong number or voicemail permits closure with unaddressed areas recorded as deferred. This is a spoken-text coverage check, not proof that audio was heard, that the client answered, or that a milestone is complete. Realtime generation can still deviate, so a live owner test remains necessary; this is not a deterministic prerecorded audio player.

No schema changes, customer calls, emails, automatic campaigns or readiness updates are performed by the wording update. Tests use local mocked call providers and in-memory records.


## Objective conversation update

Owner-approved conversational mode uses the existing `guided` setting. The script is a playbook: the caller may ask relevant follow-ups, answer basic process questions, skip answered questions, and return to the next preparation area. Truthfulness, contact controls, recording handling and professional-service boundaries remain. Exact (`verbatim`) mode remains available.

New call previews snapshot a lead-specific context: reported intake and goals, current preparation task, up to three recent notes and three recent communication summaries. Context is untrusted data and is not proof of qualification. This is client-specific context, not unrestricted access to other client records or arbitrary CRM mutation.

In conversational mode the caller supplies per-area assessments and literal client quotes. The server validates quote presence in the transcript before accepting an area as discussed or explicitly deferred. These remain AI assessments, not independently verified facts or completed milestones. The existing post-call workflow extracts actual commitments and dates. The phone connection still cannot directly send emails or book appointments; those are recorded requests for the existing controlled workflow.

Turn detection now waits 600ms of silence (previously 900ms). The closing response no longer waits for CRM callback/report synchronization. Normal response audio remains streamed. Server timing samples from speech-stop events to first audio are saved under call_quality after disconnect; this is not an end-to-end measurement and does not justify a promised latency target.

Phone voice is selectable in Caller Settings: Marin, Coral, Shimmer or Sage. Marin is retained until the owner chooses a different voice. Voice choice is snapshotted per call and does not change a call already in progress. No subjective audio quality claim is made without listening to a real test.


## Proactive tax preparation playbook

Scripts #44 and #45 name the two recent completed calendar tax years through {recent_tax_year} and {previous_tax_year}, expanded using the current Eastern calendar year when preparing the call. In October 2026 these resolve to 2025 and 2024. These are preparation references, not a lender-specific requirement or a statement that a return is overdue. The playbook conditions referral and check-in questions on actual client answers, reuses known filing history, and moves to the next preparation area. Previous script versions are retained. Existing drafts require fresh review after an edit.


## Owner execution tool availability

The owner assistant always receives execute_approved_crm_action in its tool catalog. Dispatch still requires an eligible previously displayed or finalized draft and an exact current approval quote, plus the existing fresh server-side checks. Empty eligibility is a workflow state, not a provider failure. Completed actions cannot be replayed; a repeat call requires a fresh preview. Finalized owner call drafts remain eligible when the browser omits visible_action_ids, provided they were created before the request and are less than 24 hours old.
