'use strict';
const $=id=>document.getElementById(id), n=navigator, ua=n.userAgent;
const rows=[
['Operating system',n.userAgentData?.platform||n.platform,'navigator.userAgentData?.platform || navigator.platform','Reported platform, not verified OS or exact version.'],
['Device',n.maxTouchPoints>0?'Touch-capable device':'No touch points reported','navigator.maxTouchPoints','Input capability is not a device model.'],
['Browser / application',ua,'navigator.userAgent','May be reduced or spoofed; embedded browsers may be indistinguishable.'],
['Display',`${screen.width} × ${screen.height} / ${screen.colorDepth} bit`,'[screen.width, screen.height, screen.colorDepth]','CSS pixels, not physical dimensions.'],
['Logical processors',n.hardwareConcurrency,'navigator.hardwareConcurrency','May be capped by the browser.'],
['Device memory',n.deviceMemory,'navigator.deviceMemory','Approximate GiB; not available in all browsers.'],
['Language',n.language,'navigator.language','Preference, not nationality.'],
['Time zone',Intl.DateTimeFormat().resolvedOptions().timeZone,'Intl.DateTimeFormat().resolvedOptions().timeZone','Configured time zone, not physical location.'],
['Network',n.connection?.effectiveType,'navigator.connection?.effectiveType','Estimated connection class, not ISP or physical transport.'],
['Pixel ratio',devicePixelRatio,'window.devicePixelRatio','Changes with display or zoom.']];
// Additional browser-reported rendering capabilities; no permission prompts.
function graphics(){try{const gl=document.createElement('canvas').getContext('webgl');if(!gl)return null;const ext=gl.getExtension('WEBGL_debug_renderer_info');return [ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gl.getParameter(gl.MAX_TEXTURE_SIZE)].join(' · ');}catch{return null;}}
rows.push(['Graphics renderer / texture limit',graphics(),'WebGL getParameter(RENDERER, MAX_TEXTURE_SIZE)','May be standardized or masked; not a hardware identifier.'],['Colour gamut',matchMedia('(color-gamut: p3)').matches?'P3 or wider':'sRGB or unspecified','matchMedia("(color-gamut: p3)")','Display and browser dependent.'],['Dynamic range',matchMedia('(dynamic-range: high)').matches?'High':'Standard or unspecified','matchMedia("(dynamic-range: high)")','Not proof of physical display capability.']);
const icons=['M3 4h18v13H3z M8 21h8 M12 17v4','M7 3h10v18H7z M10 17h4','M3 4h18v16H3z M3 8h18','M2 4h20v14H2z M8 22h8 M12 18v4','M6 6h12v12H6z M9 9h6v6H9z M9 2v4 M15 2v4 M9 18v4 M15 18v4','M3 7h18v10H3z M7 10v4 M12 10v4 M17 10v4','M3 4h18v13H8l-5 4z','M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M12 7v5l4 2','M3 9q9-8 18 0 M6 13q6-5 12 0 M9 17q3-3 6 0 M12 21h.1','M3 3h18v18H3z M3 12h18 M12 3v18'];
function friendly(label,value){if(value==null)return label==='Network'?'Connection API unavailable':'Not exposed';if(label==='Operating system')return /Mac/i.test(value)?'macOS (reported platform)':/Win/i.test(value)?'Windows (reported platform)':value;if(label==='Browser / application'){const m=ua.match(/(?:Edg|EdgiOS|EdgA)\/([\d.]+)/)||ua.match(/(?:Chrome|CriOS)\/([\d.]+)/)||ua.match(/(?:Firefox|FxiOS)\/([\d.]+)/)||ua.match(/Version\/([\d.]+).*Safari/);return m?(/Edg/.test(m[0])?'Edge':/Chrome|CriOS/.test(m[0])?'Chrome':/Firefox|FxiOS/.test(m[0])?'Firefox':'Safari')+' '+m[1]: 'Browser reported via user agent';}return String(value);}
function add(row,i,parent){const [label,value,code,note]=row,d=document.createElement('details'),s=document.createElement('summary'),wrap=document.createElement('span'),b=document.createElement('strong'),v=document.createElement('b'),p=document.createElement('pre'),q=document.createElement('p'),raw=document.createElement('pre');const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',icons[i]||icons[4]);svg.append(path);b.textContent=label;v.textContent=friendly(label,value);wrap.append(b,v);s.append(svg,wrap);p.textContent=code;raw.textContent='Raw value: '+(value??'Not exposed');q.textContent=note;d.append(s,p,raw,q);parent.append(d);}
const groups=[['Device & operating system',[0,1,4,5],0],['Browser & application',[2],2],['Network & IP intelligence',[8],8],['Display & environment',[3,6,7,9],3],['Hardware & rendering',[10,11,12],4]];for(const [label,indices,icon] of groups){const d=document.createElement('details'),s=document.createElement('summary'),wrap=document.createElement('span'),title=document.createElement('strong'),sub=document.createElement('b'),body=document.createElement('div');d.className='signal-group';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',icons[icon]);svg.append(path);title.textContent=label;sub.textContent=indices.slice(0,2).map(i=>friendly(rows[i][0],rows[i][1])).join(' · ');if(icon===8)sub.textContent='Browser connection details · optional public IP lookup';wrap.append(title,sub);s.append(svg,wrap);d.append(s,body);indices.forEach(i=>add(rows[i],i,body));if(icon===8)body.append($('networklookup'));$('signals').append(d);}const available=rows.filter(r=>r[1]!=null).length;const coverage=available/rows.length;$('coverage').textContent=`${Math.round(coverage*100)}% · ${available}/${rows.length} signals`;$('summarymeter').style.width=`${coverage*100}%`;$('meter').style.width=`${coverage*100}%`;
(async()=>{try{const data=JSON.stringify(rows.map(([k,v])=>[k,v??null]));$('hashinput').textContent=data;const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));const full=Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join('');$('hash').textContent=full.slice(0,12)+'…';$('hash').title=full;$('fullhash').textContent=full;$('copyhash').disabled=false;$('copyhash').onclick=async()=>{try{await navigator.clipboard.writeText(full);$('hashstatus').textContent='Full SHA-256 copied';}catch{$('hash').textContent=full;$('hashstatus').textContent='Select the full hash to copy';}};}catch{$('hash').textContent='Unavailable: secure context required';}})();
// Explicit, opt-in public IP lookup using ipify only.
const ipCache = new Map();
const ipCooldown = new Map();
$('ip').onclick = async () => {
  const button = $('ip'), status = $('ipstatus');
  const endpoint = 'https://api64.ipify.org?format=json';
  const name = 'ipify';
  if (ipCache.has(name)) { status.textContent = ipCache.get(name); return; }
  if ((ipCooldown.get(name)||0)>Date.now()) { status.textContent='Provider cooling down. Try again later.'; return; }
  button.disabled = true;
  status.textContent = 'Requesting '+name+'…';
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),8000);
  try {
    const response = await fetch(endpoint, {credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
    if(response.status===429) {
      const retry = response.headers.get('Retry-After');
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : 60;
      ipCooldown.set(name,Date.now()+Math.max(60,seconds)*1000);
      throw new Error('HTTP 429: provider rate limit');
    }
    if(!response.ok) throw new Error('HTTP '+response.status);
    const d = await response.json();
    if(d.error||d.success===false||typeof d.ip!=='string'||!d.ip.trim()) throw new Error('No usable IP returned');
    const result = d.ip.trim()+' · Public '+(d.ip.includes(':')?'IPv6':'IPv4')+' observed by ipify';
    ipCache.set(name,result); status.textContent=result; $('ipdiagnostic').textContent='Successful lookup; cached in page memory.';
  } catch(e) {
    status.textContent='Public IP lookup unavailable. Try again later.';
    $('ipdiagnostic').textContent=name+': '+(e.name==='AbortError'?'Timed out':e instanceof TypeError?'Network or browser policy prevented request':e.message);
  } finally { clearTimeout(timer); button.disabled=false; }
};

const key='bf_visits';function read(){return Number(document.cookie.split('; ').find(x=>x.startsWith(key+'='))?.split('=')[1])||0}function save(v){document.cookie=`${key}=${v}; Max-Age=2592000; Path=/toolbox/browser-footprint/; SameSite=Strict${location.protocol==='https:'?'; Secure':''}`; $('visit').textContent=read()?`${read()} recorded page load(s)`:'Cookie unavailable';}if(read())save(read()+1);else $('visit').textContent='Not remembering visits';$('remember').onclick=()=>{if(!read())save(1)};$('forget').onclick=()=>{document.cookie=`${key}=; Max-Age=0; Path=/toolbox/browser-footprint/; SameSite=Strict`;$('visit').textContent='Not remembering visits';};
const c=$('portrait'),ctx=c.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)'),points=[];
// Front-facing parametric relief: symbolic geometry, never biometric data.
for(let i=0;i<4200;i++){const y=2*(i+.5)/4200-1,a=i*2.399963,r=Math.sqrt(1-y*y),x=r*Math.cos(a),z=r*Math.sin(a);if(z<0)continue;const jaw=1-.30*Math.max(0,y);let depth=z*.50;const gauss=(cx,cy,sx,sy)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));depth+=.37*gauss(0,.02,.14,.24);depth-=.25*(gauss(.34,-.19,.22,.12)+gauss(-.34,-.19,.22,.12));depth+=.10*(gauss(.34,-.19,.10,.055)+gauss(-.34,-.19,.10,.055));depth-=.13*gauss(0,.40,.36,.045);depth+=.09*gauss(0,.50,.28,.12);const shade=Math.max(.12,Math.min(1,.52+depth*.6-.35*(gauss(.34,-.19,.18,.08)+gauss(-.34,-.19,.18,.08))-.35*gauss(0,.40,.32,.035)));points.push([x*jaw,y,depth,(Math.random()-.5)*4,(Math.random()-.5)*4,shade,i%rows.length]);}
let behaviorLayer=0;document.addEventListener('bf-behavior',e=>{behaviorLayer=e.detail.samples;replay()});let start=performance.now(),frame;function draw(t){if(!ctx)return;const w=c.clientWidth,h=c.clientHeight,d=Math.min(devicePixelRatio,2);if(c.width!==Math.round(w*d)||c.height!==Math.round(h*d)){c.width=Math.round(w*d);c.height=Math.round(h*d);}ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);const p=reduced.matches?1:Math.min(1,(t-start)/2400),s=Math.min(w,h)*.39;for(const [x,y,z,rx,ry,shade,g] of points){const missing=rows[g][1]==null;const local=Math.max(0,Math.min(1,p*1.6-g/rows.length*.6)),e=1-(1-local)**3;const X=rx*(1-e)+x*e,Y=ry*(1-e)+y*e;const pers=3/(3-z*e);ctx.fillStyle=behaviorLayer>0&&g<behaviorLayer&&!missing?'rgba(145,201,255,.85)':missing?`rgba(233,139,119,${shade*.38})`:`rgba(113,239,179,${shade})`;ctx.fillRect(w/2+X*s*pers,h/2+Y*s*pers,missing?1:1.8,missing?1:1.8);}$('portraitstate').textContent=p<1?'Assembling observed signal groups…':`${available} observed · ${rows.length-available} unavailable${behaviorLayer?` · ${behaviorLayer} behaviour samples (blue)`:''}`;if(p<1)frame=requestAnimationFrame(draw);}function replay(){cancelAnimationFrame(frame);start=performance.now();frame=requestAnimationFrame(draw)}$('replay').onclick=replay;window.addEventListener('resize',()=>{if(!frame)draw(start+2400);else draw(start+2400)});replay();
