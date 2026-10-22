import {test} from 'node:test';import assert from 'node:assert/strict';import {dictatedPhones,numberWasDictated} from '../supabase/functions/_shared/direct-number.ts';import {resolveDirectCallCommand,directCallTarget} from '../supabase/functions/_shared/direct-dispatch.ts';
for(const q of [
 'Call +57 for the country code 300-123-4567 and tell her hello.',
 "Call my girlfriend, a Colombia phone number, it is a +57 and then it is a 300-123-4567, that is plus 57300-123-4567, and tell her hello.",
 'Call country code 57, number 300-123-4567 and tell her hello.',
 'Call plus five seven, three zero zero one two three four five six seven and tell her hello.',
 'Call +57-300-123-4567 and tell her hello.'
])test('Preserves explicitly dictated Colombia code: '+q,()=>{assert.deepEqual(dictatedPhones(q),['+573001234567']);assert.equal(directCallTarget(q),'+573001234567');assert.equal(numberWasDictated('+13001234567',q),false);assert.equal(numberWasDictated('+573001234567',q),true);});
test('Other explicit international codes remain intact',()=>{for(const [q,p] of [['Call +44 and then 2079460958 and say hello','+442079460958'],['Call country code 52, number 5512345678 and say hello','+525512345678'],['Call +91 for the country code 9876543210 and say hello','+919876543210']])assert.equal(directCallTarget(q),p);});
test('Conflicting explicit numbers are ambiguous; incomplete country code never defaults to US',()=>{assert.equal(directCallTarget('Call +57 and say hello'),null);assert.equal(directCallTarget('Call +573001234567 or +13055550101 and say hello'),null);});
test('Bare US and explicit US numbers retain existing behavior',()=>{assert.equal(directCallTarget('Call 3055550101 and tell him hello'),'+13055550101');assert.equal(directCallTarget('Call plus one and then 3055550101 and tell him hello'),'+13055550101');});

test('A country-code correction reuses owner-provided local digits and message',()=>{const h=[{role:'user',content:'Call my girlfriend at 300-123-4567 and tell her thank you for dinner.'},{role:'assistant',content:'Using +1.'}];const q=resolveDirectCallCommand('Use country code +57.',h);assert.equal(directCallTarget(q),'+573001234567');assert.ok(q.includes('thank you for dinner'));assert.equal(numberWasDictated('+13001234567',q),false);});
test('Country correction after an already explicit Colombia request retains +57',()=>{const q=resolveDirectCallCommand("The country code is +57.",[{role:'user',content:'Call +57 for the country code 300-123-4567 and tell her hello.'}]);assert.equal(directCallTarget(q),'+573001234567');});
