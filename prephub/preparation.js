(function(root){
const areas=['credit','income','employment','documents'];
function baseline(profile){const a=profile.assessment||{},yes=v=>v===true||v==='Yes';return {
credit:Number(profile.credit_score)>=640,
income:a.income_70k_plus!==undefined?yes(a.income_70k_plus):Number(profile.household_income)>=70000,
employment:a.job_history_2yrs!==undefined?yes(a.job_history_2yrs):['employed_2_years','self_employed_2_years','school_work_2_years','military_2_years','retirement_disability'].includes(profile.employment_history),
documents:profile.tax_return_history==='filed_2_years'
};}
function next(scores){return areas.find(key=>Number(scores[key]||0)<25)||'overview';}
const api={baseline,next};if(typeof module!=='undefined')module.exports=api;else root.PrepHubPreparation=api;
})(typeof window!=='undefined'?window:globalThis);
