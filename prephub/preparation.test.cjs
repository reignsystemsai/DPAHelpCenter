const {test}=require('node:test'),assert=require('node:assert/strict'),{baseline,next}=require('./preparation.js');
test('Current 680 score overrides stale intake flag; next incomplete starts with income',()=>{
 const b=baseline({credit_score:680,household_income:60000,tax_return_history:'filed_2_years',assessment:{credit_640_plus:'No',job_history_2yrs:'Yes'}});
 assert.equal(b.credit,true);assert.equal(next(Object.fromEntries(Object.entries(b).map(([k,v])=>[k,v?25:0]))),'income');
});
test('Credit first if incomplete, then only remaining section, then overview',()=>{
 assert.equal(next({credit:0,income:0,employment:25,taxes:25}),'credit');
 assert.equal(next({credit:25,income:25,employment:25,taxes:0}),'taxes');
 assert.equal(next({credit:25,income:25,employment:25,taxes:25}),'overview');
 assert.equal(next({credit:25,income:25,employment:0,taxes:0}),'employment');
});

test('Document packet and savings never substitute for taxes',()=>{assert.equal(next({credit:25,income:25,employment:25,documents:25,savings:25}),'taxes');assert.equal(baseline({tax_return_history:'filed_2_years'}).taxes,false);});
