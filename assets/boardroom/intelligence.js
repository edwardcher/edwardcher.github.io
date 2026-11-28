'use strict';
/* Portable, deterministic research engine. No DOM, network or AI dependencies. */
(function(root){
 const modes=['combined','analyst','technical','private'];
 function assess(project,vendor,index,mode='combined'){
  const records=(project.findings||[]).filter(f=>f.vendor===vendor.id&&f.initiative===index&&(mode==='combined'||f.kind===mode));
  const model=project.positioning_model.initiatives[index];
  const claims=model.roles.map(role=>{
   const evidence=records.filter(f=>f.role===role), yes=evidence.filter(f=>f.polarity==='supports'), no=evidence.filter(f=>f.polarity==='contradicts');
   const independent=new Set(yes.map(f=>f.origin));
   const editorial=mode==='combined'&&(vendor.architecture_roles||[]).includes(role);
   const status=yes.length&&no.length?'Conflicting':no.length?'Contradicted':independent.size>=2?'Corroborated':yes.length?(yes.some(f=>f.kind==='analyst')?'Analyst assessed':'Documented'):editorial?'Inferred':'Insufficient evidence';
   return {role,status,evidence,mapped:!no.length&&(yes.length>0||editorial)};
  });
  const breadth=claims.filter(c=>c.mapped).map(c=>c.role),core=model.core.filter(r=>breadth.includes(r));
  return {m:model,claims,breadth,core,x:breadth.length/model.roles.length,y:core.length/model.core.length,plottable:breadth.length>0};
 }
 function validate(project,roles){
  if(project.findings===undefined)return;
  if(!Array.isArray(project.findings)||project.findings.length>2000)throw Error('Invalid findings');
  const ids=new Set(project.vendors.map(v=>v.id));
  for(const f of project.findings){if(!f||!ids.has(f.vendor)||!Number.isInteger(f.initiative)||f.initiative<0||f.initiative>3||!roles.includes(f.role)||!['analyst','technical','private'].includes(f.kind)||!['supports','contradicts'].includes(f.polarity)||!['origin','statement','source','date'].every(k=>typeof f[k]==='string'&&f[k].length>0&&f[k].length<=1000)||!/^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(f.source))throw Error('Invalid finding');}
 }
 const api={assess,validate,modes}; if(typeof module!=='undefined')module.exports=api;else root.BoardroomIntelligence=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this);
