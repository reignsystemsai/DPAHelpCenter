import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeSmsConsent,SMS_DISCLOSURE_TEXT,SMS_DISCLOSURE_VERSION} from '../supabase/functions/_shared/sms-consent.ts';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('Missing, unchecked, string and obsolete consent never enroll a client',()=>{
 for(const input of [undefined,{}, {opted_in:true}, {opted_in:'true',disclosure_version:SMS_DISCLOSURE_VERSION},{opted_in:false,disclosure_version:SMS_DISCLOSURE_VERSION},{opted_in:true,disclosure_version:'old'}])assert.equal(normalizeSmsConsent(input,'15555550101').opted_in,false);
});
test('Explicit checkbox saves authoritative disclosure and receipt, not caller-supplied text',()=>{
 const x=normalizeSmsConsent({opted_in:true,disclosure_version:SMS_DISCLOSURE_VERSION,disclosure_text:'fabricated',source_url:'https://example.com',client_submitted_at:'2026-10-22T00:00:00Z'},'15555550101','2026-10-22T00:00:01Z');
 assert.equal(x.opted_in,true);assert.equal(x.disclosure_text,SMS_DISCLOSURE_TEXT);assert.equal(x.source_url,'https://www.dpahelpcenter.com/');assert.equal(x.received_at,'2026-10-22T00:00:01Z');assert.equal(x.phone,'15555550101');
});
test('Form disclosure matches backend and is separate, optional and unchecked',()=>{
 const input=html.match(/<input id="smsOptIn"[^>]*>/)[0];assert.ok(!/\b(?:checked|required)\b/.test(input));assert.ok(html.includes(SMS_DISCLOSURE_TEXT));assert.ok(html.includes('href="/privacy/"'));assert.ok(html.includes('href="/sms-terms/"'));
 const validation=html.slice(html.indexOf('window.dpaValidateLead='),html.indexOf('window.dpaSaveLeadAndContinue='));assert.ok(!validation.includes('smsOptIn'));assert.ok(html.includes('sms_consent:{opted_in:document.getElementById("smsOptIn")?.checked===true'));
});
test('Homepage JavaScript remains valid',()=>{for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);});
