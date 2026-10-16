# Daisy preparation workflow — first release

Daisy is the default task owner and worker. The administrator retains security ownership and intervention controls. Existing clients, Scripts, call/email actions, notes, recordings, contact preferences and follow-up jobs remain the sources of truth.

## Delivered

- One `preparation_next_action` job per active client in the existing follow-up table; intake creates it transactionally. Existing active clients receive internal review tasks only.
- Goal context stays self-reported. Home-price and assistance amounts are goals/estimates, never promised eligibility or awards.
- The queue displays client, preparation area, current stage, next action, internal due date, latest evidence, task owner and status. Callbacks and overdue agreed commitments receive priority.
- Journey details distinguish client quotes and milestones, target dates, agreed check-ins, AI recommendations and uncertainty. Existing call history exposes available recordings and transcripts.
- Script-based calls and preparation emails create existing reviewable action drafts. No queue button immediately contacts a client. Saved script versions and caller settings remain authoritative.
- Provider callbacks save normal communications/notes and then extract structured preparation outcomes with strict JSON and literal client-quote validation. Missing identity/evidence or conflicts route to review. Missing dates remain unknown.
- Actual inbound communications, changed contact preferences, saved workbook readiness and provider failures create evidence events and supersede stale work. These mechanisms do not alter lender qualification or inflate readiness.
- Administrator controls: pause/resume, reschedule internal task, take over/assign to Daisy, global pause and review mode. Daisy can list/read and perform explicitly instructed supported task commands through her existing CRM tool interface.

## Modes and dispatch

`draft_only` is the default and blocks workflow-linked dispatch even if a draft exists. `owner_approved` allows individually reviewed actions through the existing approval mechanism; global/per-task pauses, current preferences, script version and newer replies are checked again before dispatch. Automatic outreach is not released. The legacy worker cannot dispatch this queue or revive its older script path. Existing `enabled=false` and `release_ready=false` remain unchanged.

## Schema

Extend `prephub_followup_jobs` with task ownership, title, preparation area/stage, milestone and evidence JSON, version, linked reviewed action and pause state. Internal preparation tasks can have no legacy outreach script; actual call preparation selects an active version from `daisy_call_scripts`.

Extend follow-up settings with `workflow_mode` and `workflow_paused`. Add service-only `prephub_workflow_events` for deduplication and audit history. `preparation_task_event` locks the existing per-client task, checks expected versions, ignores stale events and cancels superseded drafts transactionally. New objects do not grant public/authenticated client access.

## Outcome rules

| Evidence | Internal next action | Preparation stage |
| --- | --- | --- |
| New intake | Review gap and establish one next step | New Lead |
| No answer / busy | Review one permitted retry; bounded attempts | Unchanged |
| Voicemail | Review permitted follow-up | Unchanged |
| Identity/evidence unclear or conflicting | Review transcript and clarify | Unchanged |
| Quoted callback request | Requested callback time, or clarify time | Connected |
| Quoted preparation commitment | Milestone with only supported target/check-in dates | Preparation Step Agreed |
| Client says completed | Review supporting evidence | Preparation in Progress; client-reported only |
| Specialist requested | Review handoff request | Specialist Review Requested |
| Stop preference | Pause applicable contact; cancel pending drafts | Unchanged |
| Saved workbook progress | Review actual saved section flags | Preparation in Progress |
| Provider accepted email/call | Await real response/outcome | Unchanged |
| Provider request failed/unconfirmed | Verify provider before retrying | Unchanged |

## Validation

- Ten outcome/control unit tests: unanswered limits, milestone and check-in dates, callbacks, unsupported evidence/dates/identity, voicemail/failure, self-reported completion, handoff requests, stop, queue priority, administrator controls and paused/stale dispatch.
- Twenty-one existing action/script/CRM query regression tests pass.
- Database transaction test creates a test-only client, checks one-task enrollment, deduplication, Daisy/credit priority, callback/milestone dates, version/stale-event guards, stop cancellation and pause preservation, then rolls back every test change.
- Mock UI verifies Daisy assignment, evidence detail, review-only drafting, takeover and return controls. No provider call or email is sent by these tests.
- Edge modules type-check with runtime declarations/SDK replaced only in a temporary offline checking copy; deployment uses original imports.

## Next release

Test complete real journeys under individual administrator approval, refine scripts from recordings, then implement an explicitly approved automatic dispatch policy with per-channel permissions, fresh recipient checks, contact timezone/hours, shared spacing/frequency caps, bounded unanswered attempts, per-client mutual exclusion and reconciliation of unconfirmed provider requests. Add webinar resources once published and texting once connected. Revenue reporting needs a defined recorded revenue event. No automatic rollout is implied by this release.
