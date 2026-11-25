import {BehaviourCollector,quality,compare,validSample,digest} from './engine.mjs';
const el=id=>document.getElementById(id), area=el('exercise'), collector=new BehaviourCollector(area);
const sentences=Object.freeze([
  "The quick brown fox jumps over the lazy dog.",
  "Trust is built one small step at a time.",
  "A good password never goes on a sticky note.",
  "The keyboard knows more than it lets on.",
  "Every great journey begins with a single step.",
  "A quiet mind makes room for clever ideas.",
  "Fresh coffee makes the morning feel brighter.",
  "The curious cat found a box full of secrets.",
  "A little patience goes a surprisingly long way.",
  "Even a clever robot needs a coffee break.",
  "The best shortcut is the one you remember.",
  "Small habits can make a very big difference.",
  "The moon shines softly above the sleeping city.",
  "A brave little penguin explored the icy shore.",
  "Never trust a duck with your secret recipe.",
  "The friendly wizard fixed a broken keyboard.",
  "Good questions often lead to better answers.",
  "A tiny squirrel hid its lunch under a tree.",
  "The clock keeps ticking while we make plans.",
  "Keep your keys safe and your coffee warm.",
  "A gentle breeze carried leaves across the garden.",
  "The detective found a clue beside the window.",
  "A clever fox prefers puzzles to paperwork.",
  "The best kind of magic is a working backup."
]);
let sentenceId=0, phrase=sentences[sentenceId];
function selectSentence(id){sentenceId=id;phrase=sentences[id];el("sentencechoice").textContent=phrase;el("phrasepreview").setAttribute("aria-label",phrase);el("phrasepreview").textContent=phrase;el("phrasepreview").dataset.pattern="";}

let samples=[],active=false,target=0,last=null,result=null,timer=null,revision=0,phase="idle",typing=null;
const targets=[...area.querySelectorAll('.targets button')];
function profile(){return {schemaVersion:5,sentenceId,inputMode:'desktop',exercise:'guided-phrase-and-targets',samples};}
async function render(){const rev=++revision;el("shufflephrase").disabled=active||samples.length>0;el("sentence-note").textContent=active||samples.length>0?"Sentence locked for consistent training. Reset to try another.":"Different sentence. Same keyboard. Still you?";el('maturity').textContent=`${samples.length} / 3`;el('trainingmeter').style.width=`${samples.length/3*100}%`;el('quality').textContent=last?`${quality(last)}%`:'—';el('consistency').textContent=result?`${result.score}%`:'—';el('exportprofile').disabled=samples.length!==3||active;el('train').hidden=active;el('train').textContent=samples.length===3?'Start comparison →':samples.length?'Continue training →':'Discover my interaction patterns →';el('profiledigest').textContent='Not established';if(samples.length===3){try{const h=await digest(profile());if(rev===revision){el('profiledigest').textContent=h.slice(0,16)+'…';el('profiledigest').title=h;}}catch{if(rev===revision)el('profiledigest').textContent='Secure context required';}}}
function start(){
  active=true; phase='typing'; target=0; typing=null; area.hidden=false;
  el('typingstep').hidden=false; el('pointerstep').hidden=true;
  el('practice').value=''; collector.start(); el('practice').focus();
  el('behaviorstatus').textContent=samples.length===3?'Comparison round':`Training round ${samples.length+1} of 3`;
  render(); check(); timer=setInterval(check,150);
}
function combined(){const p=collector.sample();return {...typing,speed:p.speed,moves:p.moves,clicks:target,synthetic:typing.synthetic+p.synthetic,seconds:typing.seconds+p.seconds};}
function check(){
  if(!active)return;
  if(phase==='typing'){
    const s=collector.sample(), text=el('practice').value, exact=text===phrase;
    const preview=el('phrasepreview');
    if(preview.childElementCount!==phrase.length||preview.dataset.progress!==String(text.length)||preview.dataset.pattern!==[...phrase].map((ch,i)=>i>=text.length?0:text[i]===ch?1:2).join("")){
      preview.dataset.progress=String(text.length);preview.dataset.pattern=[...phrase].map((ch,i)=>i>=text.length?0:text[i]===ch?1:2).join("");preview.replaceChildren();
      [...phrase].forEach((ch,i)=>{const span=document.createElement('span');span.textContent=ch;span.className=i<text.length?(text[i]===ch?'matched':'wrong'):i===text.length?'current':'';preview.append(span);});
    }
    const matched=[...phrase].filter((ch,i)=>text[i]===ch).length;
    el('typingmeter').style.width=`${matched/phrase.length*100}%`;
    const message=exact?'Sentence complete. Press Enter to finish.':`${matched} / ${phrase.length} matching characters · ${text.length>phrase.length?'Remove extra characters.':'Follow the sentence above.'}`;
    if(el('typingprogress').textContent!==message)el('typingprogress').textContent=message;
    el('quality').textContent=`${Math.round(50*Math.min(1,s.keys/10,matched/phrase.length))}%`;
  }else if(phase==='pointer'){
    const s=combined();el('quality').textContent=`${quality(s)}%`;
    el('exerciseprogress').textContent=target===4?(validSample(s)?'All targets complete. Finish this round.':'All targets clicked, but more pointer movement is needed. Try again.'):`${target} of 4 targets completed · click target ${target+1} next.`;
    el('finishround').disabled=target!==4||!validSample(s);el('retrypointer').hidden=target!==4||validSample(s);
  }
}
// One target per quadrant, with shuffled order and bounded jitter.
function randomizeTargets(){
  const cells=[[24,30],[76,30],[24,76],[76,76]];
  for(let i=cells.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}
  targets.forEach((button,i)=>{const [x,y]=cells[i];button.style.left=`${x+(Math.random()-.5)*8}%`;button.style.top=`${y+(Math.random()-.5)*8}%`;});
}
function startPointer(){phase='pointer';target=0;el('typingstep').hidden=true;el('pointerstep').hidden=false;randomizeTargets();targets.forEach((b,i)=>{b.disabled=i!==0;b.classList.remove('done');b.textContent=String(i+1);});collector.start();check();}
function finishTyping(){
  if(!active||phase!=='typing')return;
  const text=el('practice').value, sample=collector.sample();
  if(text!==phrase||sample.keys<10){
    el('typingwarningtitle').textContent=text!==phrase?'A few letters went on holiday.':'Your keyboard needs a little more exercise.';
    el('typingwarningtext').textContent=text!==phrase?'Match the sentence exactly, including spaces, capital letter and full stop. Correct the highlighted letters and press Enter again.':'Please retype the sentence naturally so we can collect enough timing observations.';
    el('typingwarning').showModal();return;
  }
  typing=collector.stop();el('practice').value='';startPointer();targets[0].focus();
}
el('nextpointer').onclick=finishTyping;
el('practice').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();e.stopPropagation();finishTyping();}});
el('typingretry').onclick=()=>el('typingwarning').close();
el('typingwarning').addEventListener('close',()=>el('practice').focus());
el('retrypointer').onclick=startPointer;
targets.forEach((b,i)=>b.onclick=e=>{if(active&&phase==='pointer'&&i===target&&e.isTrusted){target++;b.classList.add('done');b.textContent='✓';targets.forEach((x,j)=>x.disabled=j!==target);check();}});
el('finishround').onclick=()=>{
  if(!active||phase!=='pointer'||target!==4)return;const s=combined();if(!validSample(s))return;
  clearInterval(timer);collector.stop();last=s;active=false;phase='idle';area.hidden=true;
  if(samples.length<3){samples.push(last);el('behaviorstatus').textContent=samples.length===3?'Baseline established. Start a comparison to see how closely a new round matches.':`Round ${samples.length} complete. Continue when ready.`;}else{result=compare(samples,last);el('behaviorstatus').textContent='Comparison complete · descriptive consistency only';}
  render();document.dispatchEvent(new CustomEvent('bf-behavior',{detail:{samples:samples.length}}));if(samples.length===3)openAnalysis();
};
el('train').onclick=start;el('resetbehavior').onclick=()=>{clearInterval(timer);collector.stop();active=false;samples=[];last=result=null;area.hidden=true;el('practice').value='';el('behaviorstatus').textContent='Ready to learn your interaction patterns.';render();document.dispatchEvent(new CustomEvent('bf-behavior',{detail:{samples:0}}));};
function analysisView(view){for(const name of ['overview','method'])el('analysis-'+name).hidden=name!==view;document.querySelectorAll('[data-analysis]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.analysis===view)));if(view==='method')replayMethod();}
function replayMethod(){const flow=document.querySelector('.methodflow');flow.classList.remove('play');void flow.offsetWidth;flow.classList.add('play');}
document.querySelectorAll('[data-analysis]').forEach(b=>b.onclick=()=>analysisView(b.dataset.analysis));el('replaymethod').onclick=replayMethod;
el('exploreanalysis').onclick=()=>window.EdwardcherJSONInspector.open({profile:profile(),latestSample:last,comparison:result,webdriver:navigator.webdriver===true,method:'Median and MAD; heuristic distance, not calibrated biometric probability'},'Behaviour analysis');
function openAnalysis(){const ready=samples.length===3;el('analysisstate').textContent=active?'Exercise in progress.':result?'Comparison complete.':ready?'Training complete. Your baseline is ready.':`Training progress: ${samples.length}/3 rounds.`;const area=el('analysisfeatures');area.replaceChildren();for(const [label,value] of [['Training progress',`${samples.length} / 3`],['Sample quality',last?quality(last)+'%':'Not measured'],['Median key interval',last?Math.round(last.interval)+' ms':'Not measured'],['Median pointer speed',last?Math.round(last.speed)+' px/s':'Not measured'],...(result?[['Consistency',result.score+'%']]:[])]){const box=document.createElement('div'),name=document.createElement('small'),out=document.createElement('output');name.textContent=label;out.textContent=value;box.append(name,out);area.append(box);}el('analysisinterpretation').textContent=result?'Your new interaction sample has been compared with your baseline. In a real risk system, unusual behaviour could contribute to a decision to request additional verification. This experiment cannot establish identity or detect bots reliably.':ready?'Your baseline is ready for a fresh comparison. See how much your own typing and pointer patterns vary, even when you are the same person.':'Complete three rounds to establish a baseline for comparison.';el('analysis-next').hidden=!ready||active;el('analysis-next').textContent=result?'Try another comparison →':'Start comparison →';analysisView('overview');if(!el('analysisdialog').open)el('analysisdialog').showModal();}el('analysis-next').onclick=()=>{if(!active&&samples.length===3){el('analysisdialog').close();start();}};el('inspect').onclick=openAnalysis;el('exportprofile').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(profile(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='behaviour-profile.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
el('importprofile').onchange=async e=>{try{if(active)throw Error('Finish or reset the current exercise first');const f=e.target.files[0];if(!f||f.size>100000)throw Error('Invalid file size');const p=JSON.parse(await f.text());if(p.schemaVersion!==5||!Number.isInteger(p.sentenceId)||p.sentenceId<0||p.sentenceId>=sentences.length||p.inputMode!=='desktop'||p.exercise!=='guided-phrase-and-targets'||!Array.isArray(p.samples)||p.samples.length!==3||!p.samples.every(validSample))throw Error('Incompatible profile');selectSentence(p.sentenceId);samples=p.samples.map(s=>Object.fromEntries(['interval','speed','keys','moves','clicks','synthetic','seconds'].map(k=>[k,s[k]])));last=result=null;el('behaviorstatus').textContent='Imported baseline (unverified provenance)';render();document.dispatchEvent(new CustomEvent('bf-behavior',{detail:{samples:3}}));}catch(err){el('behaviorstatus').textContent=err.message;}finally{e.target.value='';}};
el('shufflephrase').onclick=()=>{if(!active&&!samples.length){selectSentence((sentenceId+1+Math.floor(Math.random()*(sentences.length-1)))%sentences.length);render();}};
selectSentence(Math.floor(Math.random()*sentences.length));render();

export async function contextualBaseline(){return samples.length===3&&!active?await digest(profile()):null;}
