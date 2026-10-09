
(()=>{
 const price=document.getElementById('sf-price'),cushion=document.getElementById('sf-cushion');
 const raw=v=>String(v).replace(/[$,\s]/g,''),amount=v=>{const n=Number(raw(v));return Number.isFinite(n)&&n>=0&&n<=100000000?n:null;},money=v=>v.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}),inputMoney=v=>v.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
 function restore(){const saved=window.PrepHubSectionSave?.readSavings();if(saved){price.value=inputMoney(saved.price);cushion.value=inputMoney(saved.cushion);}update(false);}
 window.addEventListener('prephub-credit-workbook-saved',restore);
 function update(persist=true){
  const p=amount(price.value),c=amount(cushion.value);
  if(p===null||c===null||raw(price.value)===''){document.getElementById('sf-total').textContent='Enter valid amounts';return;}
  const low=p*.01,high=p*.02;
  document.getElementById('sf-deposit').textContent=money(low)+'–'+money(high);
  document.getElementById('sf-cushion-total').textContent=money(c);
  document.getElementById('sf-total').textContent=money(low+600+400+c)+'–'+money(high+600+400+c);
  document.getElementById('sf-breakdown').textContent='Based on a '+money(p)+' purchase, 1–2% deposit, appraisal, inspection, and your extra cushion.';
  if(persist)window.PrepHubSectionSave?.writeSavings({price:p,cushion:c});
 }
 for(const el of [price,cushion]){el.addEventListener('focus',()=>el.select());el.addEventListener('input',update);el.addEventListener('blur',()=>{const n=amount(el.value);if(n!==null)el.value=inputMoney(n);});}
 restore();
})();
