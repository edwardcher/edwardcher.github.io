// Dependency-free, scoped interaction collector. No typed content is retained.
export function median(values) {
  const sorted = [...values].sort((a,b)=>a-b);
  const middle = Math.floor(sorted.length/2);
  return sorted.length ? (sorted[middle]+sorted[Math.floor((sorted.length-1)/2)])/2 : null;
}
export class BehaviourCollector {
  constructor(target) { this.target=target; this.handler=e=>this.observe(e); }
  start() {
    this.stop(); this.intervals=[]; this.speeds=[]; this.clicks=0; this.synthetic=0;
    this.lastKey=null; this.lastPointer=null; this.started=performance.now();
    for(const type of ['keydown','pointermove','click']) this.target.addEventListener(type,this.handler);
  }
  observe(event) {
    if(!event.isTrusted){this.synthetic++;return;}
    const t=event.timeStamp;
    if(event.type==='keydown'&&!event.repeat&&!event.isComposing){
      const dt=t-this.lastKey;
      if(this.lastKey!==null&&dt>0&&dt<2000&&this.intervals.length<2000)this.intervals.push(dt);
      this.lastKey=t;
    }
    if(event.type==='pointermove'){
      const p=this.lastPointer;
      if(p&&p.type===event.pointerType&&t>p.t&&t-p.t<500&&this.speeds.length<4000)
        this.speeds.push(Math.hypot(event.clientX-p.x,event.clientY-p.y)*1000/(t-p.t));
      this.lastPointer={x:event.clientX,y:event.clientY,t,type:event.pointerType};
    }
    if(event.type==='click')this.clicks++;
  }
  sample(){return {interval:median(this.intervals),speed:median(this.speeds),keys:this.intervals.length,moves:this.speeds.length,clicks:this.clicks,synthetic:this.synthetic,seconds:(performance.now()-this.started)/1000};}
  stop(){for(const type of ['keydown','pointermove','click'])this.target.removeEventListener(type,this.handler);return this.intervals?this.sample():null;}
}
export function quality(s){return Math.round(100*Math.min(1,s.keys/10,s.moves/10,s.clicks/4));}
export function compare(baseline,sample){
  const features=['interval','speed'].map(metric=>{
    const values=baseline.map(s=>s[metric]);const center=median(values);
    const mad=median(values.map(v=>Math.abs(v-center)));
    const distance=Math.abs(sample[metric]-center)/Math.max(mad*1.4826,Math.abs(center)*.15,1);
    return {metric,center,mad,current:sample[metric],score:100/(1+distance)};
  });
  return {features,score:Math.round(median(features.map(f=>f.score)))};
}
export function validSample(s){return s&&['interval','speed','keys','moves','clicks','synthetic','seconds'].every(k=>typeof s[k]==='number'&&Number.isFinite(s[k])&&s[k]>=0)&&quality(s)===100;}
export async function digest(profile){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(profile)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
