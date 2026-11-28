"use strict";
const button=document.getElementById('print-report');
let opened=[];
function preparePrint(){opened=[...document.querySelectorAll('footer details:not([open])')];opened.forEach(d=>d.open=true);}
function restorePrint(){opened.forEach(d=>d.open=false);opened=[];}
window.addEventListener('beforeprint',preparePrint);
window.addEventListener('afterprint',restorePrint);
if(button)button.addEventListener('click',()=>window.print());
