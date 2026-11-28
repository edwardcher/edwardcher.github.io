'use strict';
(async () => {
    window.addEventListener('error', () => { document.getElementById('status').textContent = 'Renderer error · read-only profiles available'; document.getElementById('fallback').hidden = false; document.getElementById('fallback').style.removeProperty('display'); });
    let D;
    let perspective="orbit", morph=0, researchMode="combined";

    let selectMode=false;
    let shortlist=[], differences=false, view="map", returnView="map";
    const $ = id => document.getElementById(id);
    const dialog=$("planetDialog");
    const c = $('c'), ctx = c.getContext('2d');
    if (!ctx)
        throw new Error('Canvas unavailable');
    let firstFrame = false, projectionStart = null;
    const projectionDuration = 2400;
    let roomTime=0, droidDone=false;
    function maintenanceDroid(dt) {
        if(droidDone || document.hidden || $('scene').classList.contains('space') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        roomTime += dt;
        if(roomTime<120) return;
        const u=(roomTime-120)/12;
        if(u>=1){droidDone=true;return;}
        ctx.save(); ctx.scale(W/400,H/400);
        // Occlude the visitor behind the existing chair backs and table.
        ctx.beginPath();ctx.rect(0,0,400,267);
        for(const x of [65,120,175,230,285]) {ctx.roundRect(x-1,228,45,67,9);}
        ctx.clip('evenodd');
        ctx.translate(-20+440*u,246+Math.sin(u*60)*.35);
        ctx.scale(.72,1);
        ctx.fillStyle='#879ba5';ctx.beginPath();ctx.ellipse(0,12,12,2,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#c5d2d8';ctx.fillRect(-8,-13,16,23);
        ctx.beginPath();ctx.ellipse(0,-13,8,8,0,Math.PI,2*Math.PI);ctx.fill();
        ctx.fillStyle='#356b99';ctx.fillRect(-7,-15,14,3);ctx.fillRect(-5,-7,10,5);ctx.fillRect(-4,1,8,5);
        ctx.fillStyle='#14252e';ctx.beginPath();ctx.arc(3,-16,2.2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#8de5ff';ctx.fillRect(2,-17,1.5,1.5);
        ctx.fillStyle='#a7b7c0';ctx.fillRect(-12,-9,4,20);ctx.fillRect(8,-9,4,20);ctx.fillRect(-13,9,6,3);ctx.fillRect(7,9,6,3);
        ctx.restore();
    }
    let W, H, az = .35, tilt = .18, zoom = 1, panX = 0, panY = 0, t = 0, paused = matchMedia('(prefers-reduced-motion: reduce)').matches, selected = null, track = null, items = [], nodes = [], last = 0;
    const palette = ['#46e99a', '#a8ffd1', '#37b879', '#d9ffe6', '#79dba4'];
    function resize() { let r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; c.width = W * d; c.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
    new ResizeObserver(resize).observe(c);
    resize();
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    function project(x,y,z) {
        const X=x*Math.cos(az)-z*Math.sin(az), Z=x*Math.sin(az)+z*Math.cos(az);
        const Y=y*Math.cos(tilt)-Z*Math.sin(tilt), depth=y*Math.sin(tilt)+Z*Math.cos(tilt), s=5/(5-depth);
        const roll=-.14, RX=X*Math.cos(roll)-Y*Math.sin(roll), RY=X*Math.sin(roll)+Y*Math.cos(roll);
        // Bound every orbit using conservative analytic extents, including perspective.
        const space=$('scene').classList.contains('space'), top=H*(space?.16:.23), bottom=H*(space?.91:.72), mid=(top+bottom)/2;
        const maxR=1.43, perspective=5/(5-maxR), ex=maxR*perspective, ey=maxR*perspective*Math.hypot(Math.sin(roll),Math.sin(tilt)*Math.cos(roll));
        // Wide framing: use the exact horizontal perspective envelope for the orbital plane.
        const a=Math.cos(roll), b=Math.sin(tilt)*Math.sin(roll), d=Math.cos(tilt), q=maxR*d/5;
        const horizontalExtent=maxR*(Math.abs(b*q)+Math.sqrt(a*a*(1-q*q)+b*b))/(1-q*q);
        const padX=Math.min(85,W*.16), padY=Math.min(36,H*.075);
        const halfX=Math.max(1,W/2-padX), halfY=Math.max(1,(bottom-top)/2-padY);
        const fit=Math.min(halfX/horizontalExtent,halfY/ey), k=fit*clamp(zoom,.55,1);
        const px=clamp(panX,-Math.max(0,halfX-k*horizontalExtent),Math.max(0,halfX-k*horizontalExtent));
        const py=clamp(panY,-Math.max(0,halfY-k*ey),Math.max(0,halfY-k*ey));
        return {x:W/2+px+RX*k*s,y:mid+py+RY*k*s,s,depth};
    }
    function radius(i){return [.62,1.02,1.43][i%3];}
    function researchRefs(v) {
        return (v.research_refs || []).map(ref => ({ref, report:(D.research_reports || []).find(r => r.id===ref.report_id)})).filter(x=>x.report);
    }
    function monitors(){
        const total=D.vendors.length, eligible=D.vendors.filter(v=>v.initiatives[$('lens').selectedIndex]).length;
        $('monitorEco').textContent=items.length+' / '+total+' companies';
        $('monitorEcoSub').textContent=new Set(items.map(v=>v.category)).size+' categories in view';
        $('monitorLens').textContent=D.lenses[$('lens').selectedIndex];
        $('monitorLensSub').textContent=eligible+' flagged candidates · not ranked';
        const mapped=items.filter(v=>researchRefs(v).length).length;
        $('monitorEvidence').textContent=mapped+' / '+items.length+' mapped';
        $('monitorEvidenceSub').textContent=(D.findings||[]).length+' capability findings in project · references are not validation'; $('researchModeNote').textContent=researchMode==='combined'?'Includes provisional mappings and recorded findings. Other filters require recorded evidence.':items.length?'Showing matching recorded findings.':'No matching capability findings. Choose All available evidence.';
    }
    function syncEvidenceModes(){const select=$('researchMode'),index=$('lens').selectedIndex;for(const option of select.options){if(option.value==='combined')continue;const kind=option.value;option.disabled=!(D.findings||[]).some(f=>f.initiative===index&&f.kind===kind);const labels={analyst:'Analyst research',technical:'Technical documentation',private:'My research'};option.textContent=labels[kind]+(option.disabled?' (no records)':'');}if(select.selectedOptions[0]?.disabled){researchMode='combined';select.value='combined';}}
    function rebuild() { syncEvidenceModes(); showPreview(null); $('workspaceCompany').replaceChildren(el('h2','Company intelligence'),el('p','Select a visible company to inspect its initiative fit and evidence.')); items = D.vendors.filter(v => v.initiatives[$('lens').selectedIndex] && (researchMode==='combined'||positioning(v).plottable) && [v.name,v.category,v.description,v.portfolio].join(' ').toLowerCase().includes($('companySearch').value.trim().toLowerCase()) && ($('filter').value === 'All categories' || v.category === $('filter').value)); $('labels').replaceChildren(); nodes = items.map(v => { let n = document.createElement('button'); n.className = 'tag'; n.textContent = v.name; n.onclick = () => activatePlanet(v); n.onpointerenter = e => { if(e.pointerType==='mouse')showPreview(v); }; n.onpointerleave = () => showPreview(null); n.onfocus = () => showPreview(v); n.onblur = () => showPreview(null); n.ondblclick = () => { track = v; $('focus').value = v.name; }; $('labels').append(n); return n; }); let sun = document.createElement('button'); sun.className = 'tag sun'; sun.onclick = () => { track = null; selected = null; $('focus').value = ''; $('panel').textContent = 'The customer is the centre of the ecosystem.'; }; $('labels').append(sun); nodes.push(sun); $('focus').replaceChildren(new Option('Full constellation', ''), ...items.map(v => new Option(v.name, v.name))); track = null; selected = null; $('panel').textContent = 'Select a planet to inspect its intelligence.'; renderMatrix(); monitors(); renderSearch(); if(view==='brief')setView(returnView); else setView(view); }
    function pos(i) { let r = radius(i), a = (Math.floor(i/3)*2*Math.PI/Math.ceil(items.length/3)) + (i%3)*.7 + t * (.15 + .16 / r); return [r * Math.cos(a), 0, r * Math.sin(a)]; }
    function sphere(p,r,color,edge) {
        ctx.save(); const halo=ctx.createRadialGradient(p.x,p.y,r*.7,p.x,p.y,r*2.2);halo.addColorStop(0,color+'45');halo.addColorStop(1,color+'00');ctx.fillStyle=halo;ctx.fillRect(p.x-r*2.2,p.y-r*2.2,r*4.4,r*4.4);
        ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.clip();const g=ctx.createRadialGradient(p.x-r*.42,p.y-r*.48,r*.04,p.x+r*.12,p.y+r*.15,r*1.25);g.addColorStop(0,'#d8fff0');g.addColorStop(.25,color);g.addColorStop(.65,edge);g.addColorStop(1,'#020709');ctx.fillStyle=g;ctx.fillRect(p.x-r,p.y-r,r*2,r*2);
        for(let i=0;i<16;i++){const yy=p.y-r+i*r/8;ctx.strokeStyle=i%3?'#c4ffdf12':'#c4ffdf30';ctx.lineWidth=.6;ctx.beginPath();ctx.ellipse(p.x,yy,r, r*.16,-.2,0,Math.PI*2);ctx.stroke();}ctx.restore();ctx.strokeStyle=color+'88';ctx.lineWidth=.65;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();
    }
    // Decorative sky, independent of vendor geometry and hit testing.
    // Seeded, layered sky: stable positions, natural distribution and subtle depth.
    let skySeed=108; const skyRandom=()=>{skySeed=(Math.imul(1664525,skySeed)+1013904223)>>>0;return skySeed/4294967296;};
    const skyStars=Array.from({length:460},(_,i)=>({x:skyRandom(),y:skyRandom(),r:i<12?1.45:i<90?.85:.35+skyRandom()*.35,a:i<12?.82:i<90?.48:.12+skyRandom()*.23,depth:.35+skyRandom()*.65,tint:i%7===0?'185,211,239':i%11===0?'246,226,193':'224,239,235'}));
    let skyOpacity=0, skyTime=0;
    function drawSky(dt){
        const active=$('scene').classList.contains('space'), reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
        skyOpacity=reduced?Number(active):clamp(skyOpacity+(active?1:-1)*dt*2.5,0,1);
        if(!skyOpacity)return;
        if(!paused&&!reduced)skyTime+=dt;
        ctx.save();ctx.globalAlpha=skyOpacity;
        ctx.fillStyle='#020506';ctx.fillRect(0,0,W,H);
        function cloud(x,y,rx,ry,angle,color){ctx.save();ctx.translate(W*x,H*y);ctx.rotate(angle);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,color);g.addColorStop(.48,color.replace(/,[\d.]+\)$/,',.045)'));g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();}
        cloud(.36,.39,W*.72,H*.66,-.24,'rgba(36,103,82,.25)');
        cloud(.76,.24,W*.43,H*.43,-.35,'rgba(31,67,91,.19)');
        cloud(.18,.78,W*.38,H*.38,-.3,'rgba(32,83,69,.16)');
        for(const [i,s] of skyStars.entries()){
            const x=((s.x+az*.008*s.depth)%1+1)%1*W,y=((s.y+tilt*.012*s.depth)%1+1)%1*H;
            const alpha=s.a*(.9+.1*Math.sin(skyTime*.7+i));
            if(i<12){const g=ctx.createRadialGradient(x,y,0,x,y,5);g.addColorStop(0,`rgba(${s.tint},${alpha*.5})`);g.addColorStop(1,`rgba(${s.tint},0)`);ctx.fillStyle=g;ctx.fillRect(x-5,y-5,10,10);}
            ctx.fillStyle=`rgba(${s.tint},${alpha})`;ctx.beginPath();ctx.arc(x,y,s.r,0,Math.PI*2);ctx.fill();
        }
        const vignette=ctx.createRadialGradient(W*.5,H*.48,Math.min(W,H)*.22,W*.5,H*.48,Math.hypot(W,H)*.57);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.56)');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
        // Schematic Capricornus outline, based on its broad triangular sky pattern.
        const pts=[[.05,.10],[.13,.16],[.22,.32],[.43,.75],[.65,.86],[.87,.52],[.96,.39],[.84,.35],[.59,.43],[.36,.30],[.13,.16]];
        const size=Math.min(W*.23,H*.34,220), ox=W*.68,oy=H*.045;
        ctx.strokeStyle='#91bca94a';ctx.lineWidth=.8;ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(ox+x*size,oy+y*size):ctx.moveTo(ox+x*size,oy+y*size));ctx.stroke();
        for(const [x,y] of pts.slice(0,-1)){ctx.fillStyle='#cce8dcaa';ctx.beginPath();ctx.arc(ox+x*size,oy+y*size,1.65,0,Math.PI*2);ctx.fill();}
        ctx.font='10px ui-monospace, monospace';ctx.fillStyle='#8eafa0';ctx.fillText('CAPRICORNUS',ox,oy+size*.98);ctx.restore();
    }
    function hologram(now,progress){if($('scene').classList.contains('space'))return;const x=W/2,y=H*305/400,top=H*.12,spread=W*.47;ctx.save();ctx.beginPath();ctx.rect(0,y-(y-top)*progress,W,H);ctx.clip();
      // Soft overlapping light shafts, rather than a solid geometric cone.
      for(let i=0;i<24;i++){const q=(i-11.5)/11.5, end=x+q*spread;const g=ctx.createLinearGradient(0,y,0,top);g.addColorStop(0,'rgba(105,255,181,.065)');g.addColorStop(.35,'rgba(65,218,153,.018)');g.addColorStop(1,'rgba(65,218,153,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x-4,y);ctx.lineTo(end-spread*.12,top);ctx.lineTo(end+spread*.12,top);ctx.lineTo(x+4,y);ctx.fill();}
      for(let i=0;i<120;i++){const f=(i*.618033+t*.012)%1,q=Math.sin(i*91.7);ctx.fillStyle='rgba(145,255,200,'+(.05+.14*(1-f))+')';ctx.fillRect(x+q*spread*f,y-(y-top)*f,i%9===0?1.6:.7,i%9===0?1.6:.7);}
      ctx.restore();ctx.save();ctx.translate(x,y);ctx.scale(1,.22);const g=ctx.createRadialGradient(0,0,0,0,0,W*.16);g.addColorStop(0,'#b9ffcfaa');g.addColorStop(.2,'#48ef8955');g.addColorStop(1,'#48ef8900');ctx.fillStyle=g;ctx.fillRect(-W*.16,-W*.16,W*.32,W*.32);ctx.strokeStyle='#a1ffce88';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,W*.055,0,Math.PI*2);ctx.stroke();ctx.restore();}
    let hit = [], hovered = null;
    const preview = $('planetPreview');
    function updateWorkspaceCompany(v){if(!v)return;const card=$('workspaceCompany');const explore=el('button','Explore company →');explore.onclick=()=>inspect(v);const add=el('button',shortlist.includes(v.id)?'Remove from comparison':'Add to comparison');add.className='secondary-action';add.onclick=()=>{toggleCompare(v.id);updateWorkspaceCompany(v);};explore.className='primary-action';card.replaceChildren(el('small',v.category),el('h2',v.name),el('p',v.description),el('h3','Portfolio'),el('p',v.portfolio),el('h3','Considerations'),el('p',v.due_diligence),positionEvidence(v),explore,add);}
    function showPreview(v) {
        if (hovered === v) return;
        hovered = v; preview.hidden = true; if(v)updateWorkspaceCompany(v);
        if (!v) { preview.replaceChildren(); return; }
        preview.replaceChildren(el('small',v.category),el('strong',v.name),el('p',v.description),el('small','Select planet for full intelligence'));
    }
    function quoteUrl(ticker) { const parts=ticker.split(':'); return 'https://www.google.com/finance/quote/'+encodeURIComponent(parts.length===2?parts[1]+':'+parts[0]:ticker); }
    function productArt(name) {
        const kind=/card|key|token|crescendo|yubikey/i.test(name)?'key':/mobile|approve|push|phone/i.test(name)?'mobile':/finger|biometric|persona/i.test(name)?'bio':'platform';
        const img=el('img'); img.src='../assets/boardroom/illustrations/'+kind+'.svg'; img.alt=''; img.loading='lazy'; return img;
    }
    const defaultPositioning = {"version": 1, "axes": ["Mapped role breadth within initiative", "Mapped core role coverage"], "threshold": 0.5, "initiatives": [{"roles": ["auth", "platform", "credential", "proofing", "endpoint", "federation"], "core": ["auth", "credential", "endpoint", "proofing"]}, {"roles": ["physical", "credential", "auth", "platform", "endpoint", "key protection"], "core": ["physical", "credential", "auth"]}, {"roles": ["auth", "platform", "endpoint", "credential", "risk", "transaction signing", "privileged"], "core": ["auth", "platform", "endpoint"]}, {"roles": ["risk", "auth", "endpoint", "platform"], "core": ["risk", "auth"]}], "status": "Editorial role proxy; not verified product capabilities or analyst scores"};
    function positioning(v){return BoardroomIntelligence.assess({...D,positioning_model:D.positioning_model||defaultPositioning},v,$('lens').selectedIndex,researchMode);}
    function evidenceSummary(v){const q=positioning(v);return q.claims.filter(c=>c.status!=='Insufficient evidence').map(c=>c.role+': '+c.status).join(' · ')||'No applicable capability findings';}
    function quadrantBounds(){return {l:W*.15,r:W*.94,top:H*.18,bot:H*.76};}
    function positionEvidence(v){const q=positioning(v), section=el('section',undefined,'position-evidence');section.append(el('h3','Why this position?'),el('p',D.lenses[$('lens').selectedIndex]+' · editorial role proxy'),el('p','Breadth: '+q.breadth.length+'/'+q.m.roles.length+' · '+(q.breadth.join(', ')||'none mapped')),el('p','Core coverage: '+q.core.length+'/'+q.m.core.length+' · '+(q.core.join(', ')||'none mapped')),el('small','Core roles not mapped: '+(q.m.core.filter(r=>!q.core.includes(r)).join(', ')||'none')+'. Not a capability validation.'));for(const claim of q.claims){const line=el('p',claim.role+' — '+claim.status);section.append(line);for(const f of claim.evidence)section.append(el('small',f.statement+' · '+f.origin+' · '+f.date),link('Source ↗',f.source));}const ref=v.leadership_reference;if(ref&&$('lens').selectedIndex===0&&researchMode!=='technical'&&researchMode!=='private'){section.append(el('h3','Research recognition'),el('p',ref.designations.join(' · ')+' Leadership'),link('KuppingerCole · March 2026 ↗',D.source));}else section.append(el('small','No applicable public leadership designation recorded for this initiative.'));return section;}
    function frame(now) { let dt = Math.min(.05, (now - last) / 1000 || 0); last = now; if (W <= 0 || H <= 0) {requestAnimationFrame(frame);return;}
    if (projectionStart === null) projectionStart = now;
    const progress = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : clamp((now-projectionStart)/projectionDuration,0,1);
    const constellation = clamp((progress-.7)/.3,0,1);
    $('labels').style.opacity = String(constellation);
    $('labels').style.visibility = constellation > 0 ? 'visible' : 'hidden';
    $('labels').inert = progress < 1;
    if (!paused && !document.hidden && constellation > 0)
        t += dt * Math.max(0, Math.min(3, Number($('speed').value) || 0)); if (track) {
        let i = items.indexOf(track);
        if (i >= 0) {
            let p = project(...pos(i));
            panX += (W / 2 - p.x) * .08;
            panY += (H * .48 - p.y) * .08;
        }
    } ctx.clearRect(0, 0, W, H); maintenanceDroid(dt); hologram(now, progress); drawSky(dt); ctx.save(); ctx.globalAlpha = constellation; morph += ( (perspective==="quadrant"?1:0)-morph)* (matchMedia("(prefers-reduced-motion: reduce)").matches?1:Math.min(1,dt*8)); if(morph>.01){ctx.save();ctx.globalAlpha=morph;const {l,r,top,bot}=quadrantBounds(),mx=(l+r)/2,my=(top+bot)/2;ctx.fillStyle='#102c2344';ctx.fillRect(l,top,r-l,bot-top);ctx.fillStyle='#274c382e';ctx.fillRect(mx,top,r-mx,my-top);ctx.strokeStyle='#527c69';ctx.strokeRect(l,top,r-l,bot-top);ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(mx,top);ctx.lineTo(mx,bot);ctx.moveTo(l,my);ctx.lineTo(r,my);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#b6e0cc';ctx.font='600 13px sans-serif';ctx.textAlign='center';ctx.fillText(D.lenses[$('lens').selectedIndex]+' · '+(researchMode==='combined'?'Mapped roles, not market rankings':'Recorded findings only'),W*.55,H*.09);ctx.font='12px sans-serif';ctx.fillText('Mapped initiative role breadth →', (l+r)/2,H*.83);ctx.save();ctx.translate(W*.055,my);ctx.rotate(-Math.PI/2);ctx.fillText('Mapped core role coverage →',0,0);ctx.restore();ctx.textAlign='left';ctx.fillText('Focused specialists',l+9,top+17);ctx.fillText('Limited mapped fit',l+9,bot-9);ctx.textAlign='right';ctx.fillText('Broad core coverage',r-9,top+17);ctx.fillText('Broad enablers',r-9,bot-9);ctx.restore();} for (let i = 0; i < Math.min(3,items.length); i++) {
        let r = radius(i);
        ctx.beginPath();
        for (let j = 0; j <= 100; j++) {
            let a = j * Math.PI / 50, p = project(r * Math.cos(a), 0, r * Math.sin(a));
            j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        }
        ctx.strokeStyle = `rgba(128,220,182,${.29*(1-morph)})`; ctx.lineWidth=.8;
        ctx.stroke();
    } let sun = project(0, 0, 0), sr = Math.min(19,H*.032) * zoom; ctx.save();ctx.globalAlpha*=1-morph; let glow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sr * 3); glow.addColorStop(0, '#fff5b8'); glow.addColorStop(.32, '#ffce5766'); glow.addColorStop(1, '#ffb52a00'); ctx.fillStyle = glow; ctx.fillRect(sun.x - sr * 3, sun.y - sr * 3, sr * 6, sr * 6); const core=ctx.createRadialGradient(sun.x-sr*.25,sun.y-sr*.3,0,sun.x,sun.y,sr);core.addColorStop(0,'#fff9dc');core.addColorStop(.55,'#ffe3a0');core.addColorStop(1,'#e8a64b');ctx.fillStyle=core;ctx.beginPath();ctx.arc(sun.x,sun.y,sr,0,Math.PI*2);ctx.fill();ctx.restore(); let points = items.map((v, i) => {const p=project(...pos(i)); const q=positioning(v), {l,r,top,bot}=quadrantBounds(), peers=items.filter(o=>{const z=positioning(o);return z.x===q.x&&z.y===q.y;});const offset=(peers.indexOf(v)-(peers.length-1)/2)*Math.min(32,W*.022);const x=clamp(l+42+(r-l-84)*q.x+offset,l+22,r-22),y=bot-48-(bot-top-96)*q.y;p.x+=(x-p.x)*morph;p.y+=(y-p.y)*morph;return {v,i,p};}).sort((a, b) => a.p.depth - b.p.depth); drawRelationships(points); hit = []; let occupied = []; let sn = nodes[items.length]; sn.style.visibility = constellation > 0 && morph<.5 ? 'visible' : 'hidden'; sn.textContent = $('org').value.slice(0, 100).trim() || 'Your organisation'; sn.style.left = sun.x + 'px'; sn.style.top = (sun.y + sr + 5) + 'px'; if(morph<.5)occupied.push([sun.x - 85, sun.y - 30, sun.x + 85, sun.y + sr + 30]); for (let o of points) {
        let { p, i, v } = o, r = Math.max(6, Math.min(15,H*.026, 12 * p.s * zoom));
        sphere(p,r,v.id==='hid'?'#629ec8':'#52c98d',v.id==='hid'?'#0b202c':'#08291d'); if(v===selected||v===hovered||shortlist.includes(v.id)){ctx.strokeStyle='#b9f7d0';ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(p.x,p.y,r+5,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
        hit.push({ p, r, v });
        let n = nodes[i]; n.classList.toggle('map-picked',shortlist.includes(v.id)); let x = p.x, y = p.y + r + 5, w = n.offsetWidth || 80;
        let box = [x - w / 2, y, x + w / 2, y + 19];
        const collides=b=>occupied.some(o=>b[0]<o[2]&&b[2]>o[0]&&b[1]<o[3]&&b[3]>o[1]);
        for(const offset of [0,-(2*r+29),22,-(2*r+51),44]){const yy=p.y+r+5+offset,bb=[x-w/2,yy,x+w/2,yy+19];if(yy>45&&yy+19<H-35&&!collides(bb)){y=yy;box=bb;break;}}
        let overlap = occupied.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
        n.style.visibility = constellation === 0 || (overlap && v !== selected) ? 'hidden' : 'visible';
        if (!overlap)
            occupied.push(box);
        n.style.left = x + 'px';
        n.style.top = y + 'px';
    } ctx.restore(); if (progress < 1) hit = []; if (W > 0 && H > 0) {
        $('fallback').hidden = true; $('liveMonitors').hidden = false;
        
    } if (!firstFrame) {
        firstFrame = true;
        document.body.classList.add('boardroom-entered');
        $('fallback').style.display = 'none';
        $('status').textContent = 'INTERACTIVE · Canvas perspective · provisional evidence';
    } requestAnimationFrame(frame); }
    let flight=0, flightFrame=0, priorFocus=null;
    function inspect(v) {
      selected=v;showPreview(null);updateWorkspaceCompany(v);priorFocus=document.activeElement;
      const content=$('planetContent'); const actions=el('div',undefined,'brief-actions');
      const back=el('button','← Return to '+({map:'Star Map',directory:'Companies',compare:'Compare',reports:'Reports',cooperate:'Cooperate'}[view]||'previous view'));back.onclick=depart;
      const add=el('button',shortlist.includes(v.id)?'Remove from compare':'+ Add to compare');add.onclick=()=>{toggleCompare(v.id);add.textContent=shortlist.includes(v.id)?'Remove from compare':'+ Add to compare';};
      actions.append(back,add);content.replaceChildren(actions,companyCard(v));content.scrollTop=0;
      if(!dialog.open)dialog.showModal();syncTrayVisibility();dialog.classList.remove('departing');flight=performance.now();cancelAnimationFrame(flightFrame);
      const pc=$('planetCanvas'), g=pc.getContext('2d');
      function animate(now){if(!dialog.open)return;const r={width:pc.clientWidth,height:pc.clientHeight},d=Math.min(devicePixelRatio||1,2);if(pc.width!==Math.round(r.width*d)||pc.height!==Math.round(r.height*d)){pc.width=Math.round(r.width*d);pc.height=Math.round(r.height*d);}g.setTransform(d,0,0,d,0,0);const w=r.width,h=r.height;if(w<1||h<1){flightFrame=requestAnimationFrame(animate);return;}const haze=g.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,Math.max(w,h)*.65);haze.addColorStop(0,'#10241d');haze.addColorStop(1,'#030907');g.fillStyle=haze;g.fillRect(0,0,w,h);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;const u=reduced?1:Math.min(1,(now-flight)/1000),e=u*u*(3-2*u);for(const st of skyStars){g.fillStyle=`rgba(${st.tint},${st.a})`;g.beginPath();g.arc(st.x*w,st.y*h,st.r,0,Math.PI*2);g.fill();}const x=w*(.65-.15*e),y=h*.5,R=Math.max(2,Math.min(w*.33,h*.36)*(.08+.92*e));const grad=g.createRadialGradient(x-R*.35,y-R*.4,0,x,y,R);grad.addColorStop(0,v.id==='hid'?'#a8e2ff':'#b6f9d7');grad.addColorStop(.45,v.id==='hid'?'#327eac':'#288b61');grad.addColorStop(1,'#031019');g.fillStyle=grad;g.beginPath();g.arc(x,y,R,0,Math.PI*2);g.fill();g.save();g.beginPath();g.arc(x,y,R,0,Math.PI*2);g.clip();g.strokeStyle='#b9e8df44';for(let i=1;i<9;i++){g.beginPath();g.ellipse(x,y+R*(i/5-1),R,R*.14,0,0,Math.PI*2);g.stroke();}for(let i=0;i<6;i++){g.beginPath();g.ellipse(x,y,Math.max(1,R*Math.abs(Math.cos(i*Math.PI/6+(reduced?0:now*.00025)))),R,0,0,Math.PI*2);g.stroke();}g.restore();g.strokeStyle='#80cdbb66';g.beginPath();g.ellipse(x,y,R*1.35,R*.27,-.25,0,Math.PI*2);g.stroke();flightFrame=requestAnimationFrame(animate);}
      flightFrame=requestAnimationFrame(animate);back.focus({preventScroll:true});
    }
    function depart(){if(!dialog.open)return;dialog.classList.add('departing');setTimeout(()=>{dialog.close();cancelAnimationFrame(flightFrame);priorFocus?.focus({preventScroll:true});},matchMedia('(prefers-reduced-motion: reduce)').matches?0:500);}
    dialog.addEventListener('cancel',e=>{e.preventDefault();depart();});
    for(const b of document.querySelectorAll('[data-perspective]'))b.onclick=()=>{perspective=b.dataset.perspective;for(const q of document.querySelectorAll('[data-perspective]'))q.setAttribute('aria-pressed',String(q===b));if(perspective==='constellation'&&!selectMode)$('selectMode').click();if(view!=='map')setView('map');if(perspective==='quadrant'&&!$('scene').classList.contains('space'))$('space').click();};
    function renderSearch(){
        const q=$('companySearch').value.trim(), root=$('searchResults');
        $('searchCount').textContent=items.length+' matching companies in this initiative';
        root.replaceChildren(); root.hidden=!q || !$('searchDisclosure').open; $('clearSearch').disabled=!q;
        if(!q)return;
        for(const v of items){const b=el('button',v.name); b.type='button'; b.append(el('small',v.category)); b.onclick=()=>{root.hidden=true; inspect(v);}; root.append(b);}
        if(!items.length)root.append(el('p','No matches. Clear search or change initiative/category.'));
    }
    $('searchDisclosure').addEventListener('toggle',()=>{if(!D)return;if($('searchDisclosure').open)renderSearch();});
    $('clearSearch').onclick=()=>{$('companySearch').value='';rebuild();$('companySearch').focus();};
    $('companySearch').addEventListener('keydown',e=>{if(e.key==='Escape'){$('searchResults').hidden=true;}if(e.key==='Enter'&&items.length===1){e.preventDefault();$('searchResults').hidden=true;inspect(items[0]);}});
    $('companySearch').addEventListener('focus',()=>{if(D)renderSearch();});
    // Editorial role hypotheses, not analyst findings or integration claims.
    const architectureRoles = {
      hid:['Credential convergence','Physical and logical credentials'], microsoft:['Identity platform','Workforce identity and endpoint sign-in'], okta:['Identity platform','Workforce identity and authentication'], thales:['Credential and key protection','Authentication and cryptographic key protection'], ibm:['Identity platform','Enterprise identity services'], 'ping-identity':['Identity platform','Federation and orchestration'], hypr:['Authentication','Workforce passwordless authentication'], '1kosmos':['Authentication','Identity verification and authentication'], 'beyond-identity':['Authentication','Device-bound authentication'], yubico:['Authentication','Hardware security keys'], onespan:['Authentication','Authentication and transaction signing'], rsa:['Authentication','Enterprise MFA'], cisco:['Authentication','Access MFA'], cyberark:['Privileged identity','Privileged access security']
    };
    function role(v){return architectureRoles[v.id]||[v.category,(v.architecture_roles||[]).join(' · ')||'Architectural role requires review'];}
    // Editorial capability hypotheses; never infer certified interoperability from shared roles.
    const names={credential:'hardware credentials',physical:'physical access',auth:'authentication',platform:'identity policy and orchestration',endpoint:'endpoint assurance',federation:'federation',proofing:'identity proofing',privileged:'privileged access'};
    const labelCap=x=>names[x]||x;
    function pairRoles(a,b){const idx=$('lens').selectedIndex;const A=mappedRoles(a),B=mappedRoles(b);if(!A.length||!B.length||!a.initiatives[idx]||!b.initiatives[idx])return null;return {both:A.filter(x=>B.includes(x)),onlyA:A.filter(x=>!B.includes(x)),onlyB:B.filter(x=>!A.includes(x))};}
    function drawRelationships(points){if(perspective!=="constellation"&&!$('relationshipMode').checked)return;const chosen=points.filter(o=>shortlist.includes(o.v.id));for(let i=0;i<chosen.length;i++)for(let k=i+1;k<chosen.length;k++){const a=chosen[i],b=chosen[k],roles=pairRoles(a.v,b.v);if(!roles)continue;const mixed=roles.onlyA.length||roles.onlyB.length;ctx.save();ctx.strokeStyle=mixed?'#8ce9b0':'#e9bd76';ctx.lineWidth=2;ctx.setLineDash(mixed?[7,5]:[2,5]);ctx.beginPath();ctx.moveTo(a.p.x,a.p.y);ctx.lineTo(b.p.x,b.p.y);ctx.stroke();ctx.restore();}}
    const baselineRequirements=[['auth','platform','credential','proofing'],['physical','credential','auth','platform'],['auth','platform','endpoint'],['risk','auth']];
    const checkpoints={risk:'Validate pre-auth telemetry, latency, privacy and decision API.',auth:'Choose one policy owner; test enrollment, fallback and recovery.',platform:'Confirm federation, application coverage and policy ownership.',credential:'Test issuance, revocation and replacement with the target applications.',physical:'Check reader compatibility and badge lifecycle.',endpoint:'Test device posture signals and enforcement at the access gateway.',proofing:'Confirm identity binding and enrollment handoff.',federation:'Test issuer trust, claims and session termination.',privileged:'Confirm privileged session and account controls.','key protection':'Confirm key custody and cryptographic interfaces.','transaction signing':'Verify transaction binding and approval evidence.'};
    function mappedRoles(v){return positioning(v).breadth;}
    function analyze(vendors,idx,requirements){
      const eligible=vendors.filter(v=>v.initiatives[idx]);const map=new Map();
      for(const v of eligible)for(const r of mappedRoles(v)){if(!map.has(r))map.set(r,[]);map.get(r).push(v.name);}
      const required=requirements!==null?requirements:baselineRequirements[idx];
      return {map,required,gaps:required.filter(r=>!map.has(r)),overlap:[...map].filter(([r,a])=>a.length>1),distinct:[...map].filter(([r,a])=>a.length===1),unmapped:vendors.filter(v=>!eligible.includes(v)||!mappedRoles(v).length).map(v=>v.name)};
    }
    function relationships(vendors){
      const idx=$('lens').selectedIndex,lens=D.lenses[idx],section=el('section',undefined,'relationship-section ecosystem');
      const a=analyze(vendors,idx,D.requirements??null);
      section.append(el('h3','Ecosystem intelligence'),el('p','How these companies could fit together · '+lens));
      const summary=el('div',undefined,'cooperation-summary');
      summary.append(el('strong','Board briefing'),el('p',a.distinct.length?a.distinct.map(([r,n])=>n[0]+' — '+labelCap(r)).join(' · '):'No distinct roles mapped.'));
      if(a.overlap.length)summary.append(el('p','Decide ownership: '+a.overlap.map(([r,n])=>labelCap(r)+' ('+n.join(', ')+')').join('; ')+'.'));
      if(a.gaps.length)summary.append(el('p','Investigate unmapped requirements: '+a.gaps.map(labelCap).join(', ')+'.'));
      if(a.unmapped.length)summary.append(el('small','Outside current mapping: '+a.unmapped.join(', ')));
      section.append(summary);
      const diagram=el('div',undefined,'eco-diagram');diagram.append(el('div',$('org').value.trim()||'Your organisation','eco-customer'),el('div','↓  Architectural responsibilities  ↓','eco-arrow'));
      const grid=el('div',undefined,'eco-grid');for(const [r,owners] of a.map){const card=el('article',undefined,'eco-role '+(owners.length>1?'eco-overlap':''));card.append(el('strong',labelCap(r)),el('p',owners.join(' / ')),el('small',owners.length>1?'Shared scope · assign owner':'Distinct contribution'));grid.append(card);}diagram.append(grid);section.append(diagram);
      const req=el('details');req.append(el('summary','Requirements & coverage · '+(Array.isArray(D.requirements)?'project requirements':'illustrative defaults')));const fields=el('div',undefined,'eco-grid');for(const r of Object.keys(checkpoints)){const l=el('label');const c=el('input');c.type='checkbox';c.checked=a.required.includes(r);c.onchange=()=>{const next=new Set(a.required);c.checked?next.add(r):next.delete(r);D.requirements=[...next];renderMatrix();if(view==='cooperate')setView('cooperate',false,false);};l.append(c,document.createTextNode(' '+labelCap(r)));fields.append(l);}req.append(fields,el('p','Mapped does not mean verified coverage.'));section.append(req);
      const decisions=el('details');decisions.append(el('summary','Decision checkpoints'));for(const [r,owners] of a.map)decisions.append(el('p',labelCap(r)+' · '+owners.join(', ')+': '+checkpoints[r]));for(const r of a.gaps)decisions.append(el('p','Gap · '+labelCap(r)+': '+checkpoints[r]));section.append(decisions);
      const evidence=el('details');evidence.append(el('summary','Product evidence & protocol validation'));const cards=el('div',undefined,'evidence-grid');for(const v of vendors){const card=el('article',undefined,'evidence-card');card.append(el('h4',v.name));for(const e of v.technical_evidence||[]){const item=el('div',undefined,'evidence-item');item.append(el('strong',e.product),el('small',e.status),el('p',e.protocols.length?'Recorded protocols: '+e.protocols.join(', '):'Protocols not verified'),link('Vendor source ↗',e.source));card.append(item);}if(!v.technical_evidence?.length)card.append(el('p','No product evidence recorded.'));cards.append(card);}evidence.append(cards,el('small','Editorial mappings and recorded protocols do not establish interoperability.'));section.append(evidence);
      section.append(aiResearch(vendors),el('small','Live local reasoning from editorial mappings. No verified integration or live external research implied.'));return section;
    }
    function aiResearch(vendors){
      const idx=$('lens').selectedIndex,lens=D.lenses[idx],a=analyze(vendors,idx,D.requirements??null);
      const ai=el('section',undefined,'ai-handoff ai-research-panel');
      const heading=el('h3');const robot=el('span','🤖','ai-robot');robot.setAttribute('aria-hidden','true');heading.append(robot,document.createTextNode(' Explore further with AI'));ai.append(heading,el('p',vendors.map(v=>v.name).join(' × ')+' · '+lens));
      const AI_CONTENT_LABEL = "AI-generated comparison and content";
      const snapshots = {"hid--yubico": "AI-analysis-Passwordless-HID-Yubico-2026-11-28", "hid--thales": "AI-analysis-Passwordless-HID-Thales-2026-11-28", "thales--yubico": "AI-analysis-Passwordless-Thales-Yubico-2026-11-28", "hid--thales--yubico": "AI-analysis-Passwordless-HID-Thales-Yubico-2026-11-28", "hid--microsoft": "AI-analysis-Passwordless-HID-Microsoft-2026-11-28", "hid--hypr--microsoft": "AI-analysis-Passwordless-HID-HYPR-Microsoft-2026-11-28", "hid--hypr": "AI-analysis-Passwordless-HID-HYPR-2026-11-28", "hid--ping": "AI-analysis-Passwordless-HID-Ping-Identity-2026-11-28", "hid--okta": "AI-analysis-Passwordless-HID-Okta-2026-11-28"};
      const key=vendors.map(v=>v.id).sort().join('--');
      if(idx===0 && Object.prototype.hasOwnProperty.call(snapshots,key)){const card=el('div',undefined,'ai-snapshot-card');const base='/boardroom/research/'+snapshots[key];const read=el('a','Read research snapshot →','ai-read');read.href=base+'.html';card.append(el('h4','AI Research Snapshot'),el('small','28 November 2026 · '+AI_CONTENT_LABEL),el('p','Read the previously generated executive brief.'),read);ai.append(card);}
      ai.append(el('h4','Ask AI'),el('p','Generate a fresh analysis using your preferred AI assistant.'));
      const prompt=el('textarea');prompt.rows=16;prompt.readOnly=true;prompt.value=[
        'Act as an independent identity and cybersecurity solutions architect advising an executive board on '+lens+'.',
        'COMPANIES UNDER CONSIDERATION',...vendors.map(v=>'- '+v.name+' — '+v.portfolio),
        '', 'STRATEGIC QUESTIONS',
        '1. Differentiation: What distinguishes each company, its products and technology approach?',
        '2. Strengths: What does each do particularly well, and for which use cases and user populations?',
        '3. Competition: Where do capabilities overlap, and when is one an alternative to another?',
        '4. Cooperation: Which combinations could complement each other? Explain concrete product roles, integration boundaries and prerequisites.',
        '5. Architecture: Compare single-vendor and multi-vendor options, including a conceptual diagram.',
        '6. Business value: Assess security, operational complexity, lifecycle ownership, recovery and commercial trade-offs.',
        '7. Board decision: Identify gaps, shortlist criteria and practical validation tests.',
        '', 'PRELIMINARY ARCHITECTURAL CONTEXT', 'Requirements: '+(a.required.map(labelCap).join(', ')||'None specified'), 'Mapped roles (editorial hypotheses):', ...[...a.map].map(([r,n])=>'- '+labelCap(r)+': '+n.join(', ')), 'Unmapped requirements: '+(a.gaps.map(labelCap).join(', ')||'None identified in mapping'),
        '', 'EVIDENCE AND OUTPUT', 'Use current primary product sources and cite them. Distinguish documented capabilities from hypotheses. Do not assume partnerships or interoperability. Remain vendor-neutral; multi-vendor is not inherently better. Provide an executive summary, differentiation matrix, cooperation scenarios, conceptual architecture and actionable next steps.'
      ].join('\n');
      const preview=el('details');preview.append(el('summary','Review or copy analysis prompt'),prompt);const status=el('p','','ai-status');status.setAttribute('role','status');
      async function copyPrompt(){try{await navigator.clipboard.writeText(prompt.value);status.textContent='Prompt copied. Paste it into your AI conversation.';}catch{preview.open=true;prompt.focus();prompt.select();status.textContent='Clipboard unavailable. Copy the selected prompt manually.';}}
      const actions=el('div',undefined,'ai-actions');for(const [name,url,symbol] of [['ChatGPT','https://chatgpt.com/','✳'],['Claude','https://claude.ai/new','✦']]){const b=el('button',undefined,'ai-provider');b.type='button';b.append(el('span',symbol,'ai-symbol'),el('span',name),el('span','↗','ai-arrow'));b.onclick=()=>{copyPrompt();window.open(url,'_blank','noopener,noreferrer');};actions.append(b);}const copy=el('button','Copy prompt');copy.type='button';copy.onclick=copyPrompt;preview.append(copy);ai.append(actions,preview,el('small','Review before sharing. Organisation name and private dossier are excluded. External AI responses are not verified evidence.'),status);return ai;
    }
    function activatePlanet(v){if(selectMode){toggleCompare(v.id);return;} closeExpanded();inspect(v);}
    const scene=$('scene');
    let trayDismissed=false;
    function syncTrayVisibility(){const visible=view==='map'&&!dialog.open&&!trayDismissed&&(selectMode||shortlist.length>0);$('mapSelection').hidden=!visible;$('compareTray').parentElement.hidden=view!=='map'||dialog.open||trayDismissed;}
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&view==='map'&&!dialog.open&&!expanded()&&!e.defaultPrevented){trayDismissed=true;syncTrayVisibility();}});
    dialog.addEventListener('close',syncTrayVisibility);
    function syncMapSelection(){const tray=$('mapSelected');tray.replaceChildren();for(const id of shortlist){const v=D.vendors.find(x=>x.id===id);if(!v)continue;const b=el('button',v.name+' ×');b.setAttribute('aria-label','Remove '+v.name);b.onclick=()=>toggleCompare(id);tray.append(b);}if(shortlist.length<2)tray.append(el('small',shortlist.length?'Select one more company':'Select two or three planets'));syncTrayVisibility();$('mapCompareNow').disabled=shortlist.length<2; $('relationshipLegend').hidden=!$('relationshipMode').checked; $('relationshipLegend').textContent='Editorial hypotheses · green dashed: distinct roles · amber dotted: shared roles only · '+shortlist.length+' selected';}
    $('relationshipMode').onchange=()=>{if($('relationshipMode').checked&&!selectMode)$('selectMode').click();syncMapSelection();};
    $('selectMode').onclick=()=>{trayDismissed=false;selectMode=!selectMode;$('selectMode').setAttribute('aria-pressed',String(selectMode));$('selectMode').textContent=selectMode?'✓ Selecting companies':'＋ Select companies';syncMapSelection();};
    function expanded(){return document.fullscreenElement===scene||scene.classList.contains('map-expanded');}
    function syncExpanded(){const on=expanded();$('expandMap').setAttribute('aria-pressed',String(on));$('expandMap').textContent=on?'⤢ Exit':'⛶ Expand';document.body.classList.toggle('map-lock',on);resize();}
    function closeExpanded(){scene.classList.remove('map-expanded');if(document.fullscreenElement===scene)document.exitFullscreen().catch(()=>{});syncExpanded();}
    $('expandMap').onclick=async()=>{if(expanded()){closeExpanded();return;}try{if(!scene.requestFullscreen)throw Error();await scene.requestFullscreen();}catch{scene.classList.add('map-expanded');}syncExpanded();};
    document.addEventListener('fullscreenchange',syncExpanded);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded())closeExpanded();});
    $('mapCompareNow').onclick=()=>{closeExpanded();setView('compare',true);};
    function toggleCompare(id){
        trayDismissed=false;
        if(shortlist.includes(id)) shortlist=shortlist.filter(x=>x!==id);
        else if(shortlist.length<3) shortlist.push(id);
        else { $('compareNotice').textContent='Three companies selected. Remove one before adding another.'; $('mapSelected').setAttribute('aria-label','Three selected; remove one first'); return; }
        renderMatrix(); renderDirectory();
    }
    function renderMatrix(){
        syncMapSelection(); const m=$('matrix'); m.replaceChildren(); $('compareNow').disabled=shortlist.length<2; for(const b of document.querySelectorAll('.brief-compare'))b.disabled=shortlist.length<2;
        $('matrixBtn').querySelector('span').textContent='Compare ('+shortlist.length+')'; $('matrixBtn').disabled=false;
        const tray=$('compareTray'); tray.replaceChildren();
        for(const id of shortlist){const v=D.vendors.find(x=>x.id===id);const b=el('button',v.name+' ×');b.setAttribute('aria-label','Remove '+v.name);b.onclick=()=>toggleCompare(id);tray.append(b);}
        $('compareNotice').textContent=shortlist.length?shortlist.length+' of 3 selected':'Select up to three companies to compare.';
        const head=el('div',undefined,'compare-head');head.append(el('div',D.lenses[$('lens').selectedIndex]+' / Comparative analysis','compare-kicker'),el('h2','Compare companies'),el('p','Explore capabilities, understand differences and identify opportunities for cooperation.','compare-intro'),el('p','Capability mappings are indicative, not verified capabilities or vendor rankings.','compare-caveat'));m.append(head);
        const controls=el('div',undefined,'compare-selectors');
        for(let i=0;i<Math.min(3,Math.max(2,shortlist.length+1));i++){const label=el('label','Company '+(i+1)+(i===2?' · Optional':''));const select=el('select');select.append(new Option('Select company',''));for(const v of D.vendors.filter(v=>v.initiatives[$('lens').selectedIndex]&&(researchMode==='combined'||positioning(v).plottable))){const o=new Option(v.name,v.id);o.disabled=shortlist.includes(v.id)&&shortlist[i]!==v.id;select.append(o);}select.value=shortlist[i]||'';select.onchange=()=>{const next=[...shortlist];if(select.value){if(i<next.length)next[i]=select.value;else next.push(select.value);}else next.splice(i,1);shortlist=next;renderMatrix();renderDirectory();};label.append(select);controls.append(label);}m.append(controls);
        const label=el('label',undefined,'compare-diff');const check=el('input');check.type='checkbox';check.checked=differences;check.onchange=()=>{differences=check.checked;renderMatrix();};label.append(check,document.createTextNode(' Show differences only'));m.append(label);
        const vendors=shortlist.map(id=>D.vendors.find(v=>v.id===id));if(vendors.length<2){m.append(el('p','Choose at least two companies to see the comparison.'));return;}
        const wrap=el('div',undefined,'compare-scroll'),table=el('table');const th=table.createTHead().insertRow();const corner=el('th','Company');corner.className='compare-visually-hidden';th.append(corner);for(const v of vendors){const cell=el('th');const planet=el('span',undefined,'compare-planet');planet.setAttribute('aria-hidden','true');cell.scope='col';const profile=el('button',v.name,'compare-company-link');profile.onclick=()=>inspect(v);cell.append(planet,profile,el('small',v.category));th.append(cell);}const body=table.createTBody();
        const group=name=>{const r=body.insertRow();r.className='compare-group';const h=el('th',name);h.colSpan=vendors.length+1;h.scope='colgroup';r.append(h);};
        const row=(name,values)=>{const differs=new Set(values).size>1;if(differences&&!differs)return;const r=body.insertRow();r.className=differs?'compare-different':'compare-same';const h=el('th',name);h.scope='row';r.append(h);for(const value of values){const cell=r.insertCell();if(value==='Flagged'||value.startsWith('Not flagged')){cell.append(el('span',value,value==='Flagged'?'compare-flag':'compare-neutral'));}else {cell.textContent=value;if(value==='Not supplied'||value==='Not mapped')cell.classList.add('compare-missing');}}};
        group('Strategic fit');
        row('Company focus',vendors.map(v=>v.description));row('Potential architectural role',vendors.map(v=>role(v)[1]));
        D.lenses.forEach((name,i)=>row(name,vendors.map(v=>v.initiatives[i]?'Flagged':'Not flagged · not an exclusion')));
        group('Evidence & corroboration');row('Initiative findings',vendors.map(evidenceSummary));group('Capabilities & assessment');row('Technology portfolio',vendors.map(v=>v.portfolio));row('Executive impression',vendors.map(v=>v.impression));
        group('Research & corporate context');row('Research references',vendors.map(v=>researchRefs(v).map(x=>x.report.publisher+' · '+x.report.title+' · '+x.report.edition+' · '+x.ref.section).join(' / ')||'Not mapped'));
        row('Corporate issuer',vendors.map(v=>[v.issuer,v.ticker].filter(Boolean).join(' · ')||'Not supplied'));
        row('Market snapshot',vendors.map(v=>{const q=(D.market_snapshots||[]).find(x=>x&&x.ticker===v.ticker)||D.snapshot;return v.ticker&&q&&q.ticker===v.ticker&&Number.isFinite(q.price)?q.price.toFixed(2)+' '+q.currency+' · '+q.asof+' · supplied, unverified':'Not supplied';}));
        group('Due diligence');row('Before shortlisting',vendors.map(v=>v.due_diligence));for(const g of body.querySelectorAll('.compare-group')){if(!g.nextElementSibling||g.nextElementSibling.classList.contains('compare-group'))g.remove();}wrap.append(table);const cooperate=el('button','Explore cooperation →','primary-action');cooperate.onclick=()=>setView('cooperate',true);m.append(wrap,cooperate,link('Inspect research & evidence ↗','#researchSources'),el('p','Missing evidence does not establish missing capability. Companies may complement rather than replace one another.'),aiResearch(vendors));
    }
    let pointers = new Map(), moved = false;
    function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    c.onpointerleave = () => showPreview(null);
    c.onpointerdown = e => { showPreview(null); c.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 1)
        moved = false;
    else
        moved = true; track = null; };
    c.onpointermove = e => { if (!pointers.has(e.pointerId)) { if(e.pointerType==='mouse'){const r=c.getBoundingClientRect(); const h=[...hit].reverse().find(o=>Math.hypot(e.clientX-r.left-o.p.x,e.clientY-r.top-o.p.y)<Math.max(18,o.r)); showPreview(h?h.v:null);} return; } let old = pointers.get(e.pointerId), next = { x: e.clientX, y: e.clientY }, dx = next.x - old.x, dy = next.y - old.y; if (Math.abs(dx) + Math.abs(dy) > 2)
        moved = true; if (pointers.size === 2) {
        let other = [...pointers.entries()].find(a => a[0] !== e.pointerId)[1];
        if (inProjection(next.x, next.y) && inProjection(other.x, other.y))
            zoom = clamp(zoom * distance(next, other) / Math.max(1, distance(old, other)), .55, 1);
        panX = Math.max(-W, Math.min(W, panX + dx / 2));
        panY = Math.max(-H, Math.min(H, panY + dy / 2));
    }
    else {
        az += dx * .009;
        tilt = clamp(tilt + dy * .004,.18,.48);
    } pointers.set(e.pointerId, next); };
    c.onpointerup = e => { pointers.delete(e.pointerId); if (!moved && !pointers.size) {
        let r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        let h = [...hit].reverse().find(o => Math.hypot(x - o.p.x, y - o.p.y) < Math.max(18, o.r));
        if (h)
            activatePlanet(h.v);
        else {
            let sun = project(0, 0, 0);
            if (Math.hypot(x - sun.x, y - sun.y) < Math.max(24, 22 * zoom)) {
                $('reset').click();
                $('panel').textContent = 'The customer is the centre of the ecosystem.';
            }
        }
    } };
    c.onpointercancel = e => pointers.delete(e.pointerId);
    c.addEventListener('lostpointercapture', e => pointers.delete(e.pointerId));
    c.ondblclick = e => { let r = c.getBoundingClientRect(), h = [...hit].reverse().find(o => Math.hypot(e.clientX - r.left - o.p.x, e.clientY - r.top - o.p.y) < Math.max(18, o.r)); if (h) {
        $('focus').value = h.v.name;
        $('focus').onchange();
    } };
    // Match the visible beam geometry, not the full canvas rectangle.
    function inProjection(clientX, clientY) {
        const rect = c.getBoundingClientRect();
        const x = clientX - rect.left, y = clientY - rect.top;
        if ($('scene').classList.contains('space'))
            return x >= 0 && x <= W && y >= H * .16 && y <= H * .91;
        const top = H * .25, emitter = H * (305 / 400);
        const spread = Math.min(W * .40, H * .72);
        if (y < top || y >= emitter) return false;
        const halfWidth = 5 + (spread - 5) * (emitter - y) / (emitter - H * .23);
        return Math.abs(x - W / 2) <= halfWidth;
    }
    $('scene').addEventListener('wheel', e => {
        if (e.target !== c && !e.target.closest('#labels .tag')) return;
        if (!inProjection(e.clientX, e.clientY) || !e.cancelable) return;
        e.preventDefault();
        const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1);
        zoom = clamp(zoom * Math.exp(-delta * .001), .55, 1);
    }, { passive: false });
    function syncPause() { $('pause').setAttribute('aria-pressed', String(paused)); $('pause').setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation'); $('pause').title = paused ? 'Resume animation' : 'Pause animation'; $('pause').querySelector('.pause-label').textContent = paused ? 'Resume' : 'Pause'; }
    const speedControl = $('speed');
    let resumeSpeed = Number(speedControl.value) || .2;
    function setSpeed(value) {
        const speed = Math.max(0, Math.min(3, Number(value) || 0));
        speedControl.value = String(speed);
        paused = speed === 0;
        if (!paused) resumeSpeed = speed;
        $('speedValue').textContent = paused ? 'Stopped' : speed.toFixed(1) + '×';
        speedControl.setAttribute('aria-valuetext', paused ? 'Stopped' : speed.toFixed(1) + ' times speed');
        syncPause();
    }
    setSpeed(paused ? 0 : resumeSpeed);
    speedControl.addEventListener('input', () => setSpeed(speedControl.value));
    $('pause').onclick = () => setSpeed(paused ? resumeSpeed : 0);
    $('reset').onclick = () => { az = .35; tilt = .18; zoom = 1; panX = panY = 0; track = null; $('focus').value = ''; };
    function setSpace(on){scene.classList.toggle('space',on);$('space').setAttribute('aria-pressed',String(on));$('space').textContent=on?'Boardroom':'Space';requestAnimationFrame(resize);}
    function closePane(){if(view==='map')return;setView('map',false,false);$('mapBtn').focus({preventScroll:true});}
    $('space').onclick = () => setSpace(!scene.classList.contains('space'));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&!dialog.open&&!expanded()&&view!=='map'&&!e.target.closest('select')){e.preventDefault();closePane();}});
    $('focus').onchange = () => { track = items.find(v => v.name === $('focus').value) || null; if (track) {
        inspect(track);
        zoom = .8;
    }
    else
        $('reset').click(); };
    $('lens').onchange = ()=>{delete D.requirements;shortlist=shortlist.filter(id=>D.vendors.find(v=>v.id===id).initiatives[$('lens').selectedIndex]);$('filter').value='All categories';rebuild();}; $('researchMode').onchange=()=>{researchMode=$('researchMode').value;shortlist=shortlist.filter(id=>researchMode==='combined'||positioning(D.vendors.find(v=>v.id===id)).plottable);rebuild();};
    $('filter').onchange = rebuild;
    $('companySearch').addEventListener('input',()=>{if(D)rebuild();});
    function renderDirectory(){
        const root=$('staticProfiles'); root.replaceChildren(el('h2','Companies'));  root.append(el('p',items.length+' matching companies · Select a briefing or add to compare.'));
        const grid=el('div',undefined,'directory-grid');
        for(const v of items){const card=el('article',undefined,'directory-card'); const open=el('button',v.name,'directory-name');open.onclick=()=>inspect(v);const add=el('button',shortlist.includes(v.id)?'✓ Added to compare':'+ Add to compare');add.setAttribute('aria-pressed',String(shortlist.includes(v.id)));add.disabled=!shortlist.includes(v.id)&&shortlist.length>=3;add.onclick=()=>toggleCompare(v.id);card.append(el('small',v.category),open,el('p',v.description),el('small',researchRefs(v).length?'Research reference recorded':'Research reference not mapped'),add);grid.append(card);}root.append(grid);if(!items.length)root.append(el('p','No matches. Change search or filters.'));
    }
    const navHistory=[];
    const viewNames={map:'Star Map',directory:'Companies',compare:'Compare',reports:'Reports & evidence',cooperate:'Cooperate'};
    function goBack(){const prev=navHistory.pop();if(!prev){setView('map',true,false);return;}setView(prev.view,true,false);$('workspaceAnalysis').scrollTop=prev.scroll;if(prev.company)inspect(prev.company);}
    function updateNavigation(){ $('navLocation').textContent='Research universe / '+viewNames[view];$('navBack').disabled=!navHistory.length&&view==='map';$('navMap').hidden=view==='map';$('navNext').textContent=view==='map'?'Select a planet or open Compare to build a shortlist.':view==='compare'?'Choose companies, open their profiles, or explore cooperation.':view==='cooperate'?'Review complementary roles and evidence.':view==='reports'?'Inspect sources, then return to your previous view.':'Explore a company or add it to your shortlist.'; }
    function setView(next,scroll=false,record=true){if(next!==view&&record){navHistory.push({view,scroll:$('workspaceAnalysis').scrollTop,company:null});if(navHistory.length>50)navHistory.shift();scroll=true;}if(next!=='map'&&expanded())closeExpanded();if(view!==next){trayDismissed=false;if(next==='map'){setSpace(false);projectionStart=null;perspective='orbit';for(const b of document.querySelectorAll('[data-perspective]'))b.setAttribute('aria-pressed',String(b.dataset.perspective==='orbit'));}else setSpace(true);}view=next; $('scene').hidden=false; document.body.dataset.view=next; syncTrayVisibility();$('panel').hidden=true;$('matrix').hidden=next!=='compare';$('staticProfiles').hidden=next!=='directory';const reports=next==='reports';document.querySelector('.research-home').hidden=!reports;$('researchSources').hidden=!reports;$('market').hidden=!reports;$('workspaceAnalysis').hidden=next==='map';$('cooperationView').hidden=next!=='cooperate';if(next==='cooperate'){const root=$('cooperationView');root.replaceChildren(el('h2','Cooperation analysis'));const b=el('button','Edit shortlist in Compare →');b.onclick=()=>setView('compare',true);root.append(b);if(shortlist.length>=2)root.append(relationships(shortlist.map(id=>D.vendors.find(v=>v.id===id))));else root.append(el('p','Choose at least two companies in Compare to explore cooperation.'));} $('cooperateBtn').setAttribute('aria-pressed',String(next==='cooperate'));updateNavigation();for(const [id,mode] of [['mapBtn','map'],['directoryBtn','directory'],['matrixBtn','compare'],['reportsBtn','reports']])$(id).setAttribute('aria-pressed',String(next===mode));$('matrixBtn').setAttribute('aria-expanded',String(next==='compare'));if(next==='directory')renderDirectory();if(next==='compare')renderMatrix();requestAnimationFrame(resize);if(scroll){$('workspaceAnalysis').scrollTop=0;if(next!=='map')requestAnimationFrame(()=>{$('workspaceAnalysis').scrollIntoView({block:'nearest'});if(!dialog.open)$('workspaceAnalysis').focus({preventScroll:true});});}}
    $('mapBtn').onclick=()=>setView('map');$('directoryBtn').onclick=()=>setView('directory');$('matrixBtn').onclick=()=>setView('compare');$('compareNow').onclick=()=>setView('compare');$('reportsBtn').onclick=()=>setView('reports');$('cooperateBtn').onclick=()=>setView('cooperate',true);$('navBack').onclick=goBack;$('navMap').onclick=closePane;$('navHelp').onclick=()=>{$('keyboardHelp').hidden=!$('keyboardHelp').hidden;};
    document.addEventListener('click',e=>{const a=e.target.closest('a[href="#researchSources"]');if(a){e.preventDefault();const company=dialog.open?selected:null;if(dialog.open){dialog.close();cancelAnimationFrame(flightFrame);}if(company){navHistory.push({view,scroll:$('workspaceAnalysis').scrollTop,company});setView('reports',true,false);}else setView('reports',true);const evidence=$('researchSources');evidence.open=true;requestAnimationFrame(()=>{evidence.scrollIntoView({block:'start'});evidence.querySelector('summary')?.focus({preventScroll:true});});}});
    document.addEventListener('keydown',e=>{if(!D||e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey||e.isComposing||e.target.closest('input,textarea,select,[contenteditable],summary'))return;const k=e.key;if(dialog.open){if(k==='h'&& !e.repeat){e.preventDefault();depart();}return;}if(expanded())return;const a=$('workspaceAnalysis');if(k==='?' ){e.preventDefault();$('navHelp').click();return;}if(k==='/'){e.preventDefault();$('companySearch').focus();return;}if(k==='h'){e.preventDefault();goBack();return;}if(['1','2','3','4','5'].includes(k)){e.preventDefault();setView(['map','directory','compare','cooperate','reports'][Number(k)-1],true);return;}if(k==='j'||k==='k'){e.preventDefault();if(view==='map'){const list=nodes.slice(0,items.length);if(!list.length)return;const i=list.indexOf(document.activeElement);list[(i<0?(k==='j'?0:list.length-1):(i+(k==='j'?1:-1)+list.length)%list.length)].focus({preventScroll:true});}else a.scrollBy(0,k==='j'?100:-100);return;}if(k==='l'&&view==='map'){const i=nodes.indexOf(document.activeElement);if(i>=0&&i<items.length){e.preventDefault();inspect(items[i]);}}if(k==='v'&&view==='map'){const i=nodes.indexOf(document.activeElement);if(i>=0&&i<items.length){e.preventDefault();toggleCompare(items[i].id);}}});
    new ResizeObserver(resize).observe(c);
    function validate(raw) {
        const fail = () => { throw new Error('Invalid project schema'); };
        const str = (v, max=1000) => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(v);
        if (!raw || raw.schema_version !== 1 || !Array.isArray(raw.vendors) || raw.vendors.length < 1 || raw.vendors.length > 100) fail();
        if (!str(raw.organisation,100) || !Number.isInteger(raw.initiative) || raw.initiative < 0 || raw.initiative > 3) fail();
        if (JSON.stringify(raw.lenses) !== JSON.stringify(['Passwordless','Converged Access','MFA','Real-Time Risk Intelligence'])) fail();
        const ids = new Set(), names = new Set();
        for (const v of raw.vendors) {
            if (!v || !str(v.id,80) || !/^[a-z0-9_-]+$/.test(v.id) || ids.has(v.id) || names.has(v.name)) fail();
            for (const k of ['name','issuer','category','portfolio','impression','due_diligence','description']) if (!str(v[k],1000)) fail();
            if (!v.name.trim() || !str(v.domain,253) || !/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(v.domain)) fail();
            if (v.ticker !== null && (!str(v.ticker,60) || !/^[A-Z0-9.:-]+$/.test(v.ticker))) fail();
            if (!['L','W','E'].includes(v.evidence) || !Array.isArray(v.initiatives) || v.initiatives.length !== 4 || !v.initiatives.every(x=>x===0||x===1)) fail();
            ids.add(v.id); names.add(v.name);
        }
        if(raw.research_reports!==undefined && (!Array.isArray(raw.research_reports)||raw.research_reports.length>50||raw.research_reports.some(r=>!r||!str(r.title)||!str(r.publisher)|| (r.id!==undefined&&(!str(r.id,80)||!/^[a-z0-9_-]+$/.test(r.id))))))fail();
        const reportIds=new Set(); for(const r of raw.research_reports||[]){if(r.id){if(reportIds.has(r.id))fail();reportIds.add(r.id);}}
        for(const v of raw.vendors)if(v.research_refs!==undefined&&(!Array.isArray(v.research_refs)||v.research_refs.length>50||v.research_refs.some(r=>!r||!reportIds.has(r.report_id)||!['Product/Vendor evaluation','Vendors to Watch'].includes(r.section))))fail();
        const allowed=Object.keys(checkpoints); BoardroomIntelligence.validate(raw,allowed);
        if(raw.requirements!==undefined&&(!Array.isArray(raw.requirements)||raw.requirements.some(r=>!allowed.includes(r))))fail();
        for(const v of raw.vendors){if(v.architecture_roles!==undefined&&(!Array.isArray(v.architecture_roles)||v.architecture_roles.some(r=>!allowed.includes(r))))fail();if(v.technical_evidence!==undefined&&(!Array.isArray(v.technical_evidence)||v.technical_evidence.length>30||v.technical_evidence.some(e=>!e||!str(e.product)||!str(e.status)||!str(e.source)||!/^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(e.source)||!Array.isArray(e.protocols)||e.protocols.some(x=>!str(x,80)))))fail();}
        if(raw.positioning_model!==undefined){const m=raw.positioning_model;if(!m||m.version!==1||!Array.isArray(m.initiatives)||m.initiatives.length!==4||m.initiatives.some(q=>!q||!['roles','core'].every(k=>Array.isArray(q[k])&&q[k].length>0&&q[k].length<=allowed.length&&new Set(q[k]).size===q[k].length&&q[k].every(r=>allowed.includes(r)))||q.core.some(r=>!q.roles.includes(r))))fail();}
        for(const v of raw.vendors)if(v.leadership_reference!==undefined){const r=v.leadership_reference;if(!r||r.report_id!=='kc-lc80894-2026'||r.initiative!=='Passwordless'||!Array.isArray(r.designations)||r.designations.length>4||r.designations.some(x=>!['Overall','Product','Innovation','Market'].includes(x)))fail();}
        return raw;
    }
    function el(tag,text,cls) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; }
    function link(text,url) { const a=el('a',text); if(url==='#researchSources')a.onclick=e=>{e.preventDefault();if(dialog.open)dialog.close();setView('reports',true);$('researchSources').open=true;requestAnimationFrame(()=>$('researchSources').scrollIntoView({block:'start'}));}; if(typeof url==='string'&&(url.startsWith('#')||/^https:\/\//i.test(url)))a.href=url; a.rel='noopener noreferrer'; a.referrerPolicy='no-referrer'; return a; }
    function companyCard(v) {
        const card=el('article',undefined,'intel-card executive-brief');
        const head=el('header',undefined,'brief-head'), identity=el('div');
        identity.append(el('small',v.category),el('h2',v.name),el('p',v.description));
        if(v.issuer && v.issuer!==v.name)identity.append(el('small','Parent / issuer (unverified): '+v.issuer));
        identity.append(el('small',v.ticker ? (v.issuer!==v.name?'Parent listing: ':'Exchange listing: ')+v.ticker+' · project reference' : 'No exchange listing supplied'));
        head.append(identity,link('Company website ↗','https://'+v.domain));card.append(head);
        const relevance=el('section',undefined,'brief-relevance');
        const lens=$('lens').selectedIndex;
        relevance.append(el('h3','Relevance · '+D.lenses[lens]),el('small',v.initiatives[lens]?'Flagged candidate · editorial assessment':'Not flagged in this project · not an exclusion'),el('p',v.impression));card.append(relevance);
        const grid=el('div',undefined,'brief-grid'), market=el('section',undefined,'brief-section');
        market.append(el('h3','Business & financial evidence'));
        if(v.ticker)market.append(el('small','Listed issuer: '+v.issuer+' · '+v.ticker));
        const q=(D.market_snapshots||[]).find(x=>x && x.ticker===v.ticker)||D.snapshot;
        if(v.ticker && q && q.ticker===v.ticker && Number.isFinite(q.price) && Number.isFinite(q.change)) {
            const price=el('div',undefined,'intel-price'); price.append(el('strong',q.price.toFixed(2)+' '+String(q.currency)),el('span',(q.change>=0?'+':'')+q.change.toFixed(2)+'%',q.change>=0?'gain':'loss')); market.append(el('small',String(q.asof||'Date not supplied')+' · supplied snapshot, unverified · not live'),price);
            if(Number.isFinite(q.low)&&Number.isFinite(q.high)&&q.high>q.low&&q.price>=q.low&&q.price<=q.high){
                const range=el('meter'); range.min=q.low;range.max=q.high;range.value=q.price;range.setAttribute('aria-label','Price within supplied session range');
                const ends=el('div',undefined,'range-ends');ends.append(el('span','Low '+q.low),el('span','High '+q.high));market.append(el('small','Session price range'),range,ends);
            }
            const facts=el('div',undefined,'intel-facts');
            const fact=(k,val)=>{const f=el('div');f.append(el('small',k),el('strong',val));facts.append(f);};
            if(typeof q.cap==='string')fact('Market cap',String(q.currency)+' '+q.cap);
            if(q.metrics && typeof q.metrics==='object')for(const [k,val] of Object.entries(q.metrics).slice(0,10))if(typeof val==='string')fact(k,val);
            if(Number.isFinite(q.open)&&Number.isFinite(q.previous)&&q.low<=q.open&&q.open<=q.high){const comparison=el('div',undefined,'quote-comparison'); for(const [label,value] of [['Previous close',q.previous],['Open',q.open],['Snapshot',q.price]]){const row=el('div');row.append(el('small',label),el('strong',value.toFixed(2)+' '+String(q.currency)));comparison.append(row);}market.append(comparison);} market.append(facts,el('small',String(q.asof)+' · supplied snapshot, unverified · not live'));
        } else market.append(el('p',v.ticker?'Market snapshot not available.':'No listed issuer quote in this project.','intel-muted'));
        if(v.ticker)market.append(link('View market quote ↗',quoteUrl(v.ticker)));
        const tech=el('section',undefined,'brief-section');tech.append(el('h3','Core capabilities'));
        const products=el('ul',undefined,'brief-capabilities');for(const name of v.portfolio.split('·').map(x=>x.trim()).filter(Boolean))products.append(el('li',name));tech.append(products);
        const coverage=el('div',undefined,'coverage');D.lenses.forEach((name,i)=>coverage.append(el('span',(v.initiatives[i]?'Flagged: ':'Not flagged: ')+name,v.initiatives[i]?'covered':'not-covered')));tech.append(coverage,el('small','Editorial flags · capabilities not independently verified.'));
        const provenance=el('section',undefined,'brief-section');provenance.append(el('h3','Analyst evidence')); const refs=researchRefs(v); for(const x of refs)provenance.append(el('p',x.report.publisher+' · '+x.report.edition+' · '+x.ref.section),el('small',x.report.title)); if(!refs.length)provenance.append(el('p','No report mapping recorded.')); provenance.append(el('small','Project research mapping; not a ranking or capability validation.'),link('Inspect research & evidence ↗','#researchSources'));
        const diligence=el('section',undefined,'brief-section');diligence.append(el('h3','Before shortlisting'),el('p',v.due_diligence));
        grid.append(tech,provenance,diligence,market);card.append(grid,el('small','Provisional project intelligence · not an analyst ranking or recommendation.','intel-footer'));return card;
    }
    function profile(v,i) {
        const n=el('details'); n.id='vendor-'+i; n.append(el('summary',v.name),companyCard(v));return n;
    }
    function renderSources(){
        const root=$('researchSources'); if(!root)return;
        $('landscapeOrigin').textContent='Loaded project: '+D.vendors.length+' companies · '+D.vendors.filter(v=>researchRefs(v).length).length+' have recorded research references. Scope and report edition matter.';
        const reports=(D.research_reports||[]).slice(0,50).filter(r=>r&&typeof r.title==='string'&&typeof r.publisher==='string');
        const mapped=r=>D.vendors.filter(v=>researchRefs(v).some(x=>x.report===r));
        const active=reports.filter(r=>mapped(r).length);
        root.replaceChildren(el('summary','Research & evidence · '+active.length+' mapped / '+reports.length+' sources'),el('p','Research identifies candidates. Editorial analysis explores their relevance and possible cooperation. These are separate layers of evidence.')); root.open=false;
        root.append(el('h3','Used in this project'));
        if(!active.length)root.append(el('p','No company-to-report mappings recorded.'));
        function source(r){
            const vendors=mapped(r), block=el('section',undefined,'source-note');
            block.append(el('h3',r.publisher+' · '+r.title),el('small','Edition: '+String(r.edition||'Not established')));
            if(vendors.length){
                block.append(el('p','Content used: '+(r.id==='kc-lc80894-2026'?'Public table of contents; company names and report section labels. Full report not accessed.':'Recorded company-to-report references and section labels; underlying content not independently checked.')));
                const groups=new Map(); for(const v of vendors)for(const x of researchRefs(v).filter(x=>x.report===r)){const k=x.ref.section||'Section unspecified';if(!groups.has(k))groups.set(k,new Set());groups.get(k).add(v.name);}
                for(const [k,names] of groups)block.append(el('p',k+' ('+names.size+'): '+[...names].join(', ')));
                block.append(el('p','Used in: company discovery context, company briefings and comparison research references.'),el('p','Supports: traceability of candidate inclusion. Does not establish capability, ranking, orbital relevance or interoperability.'));
            }else{
                const purpose={GigaOm:'Broader IAM platform coverage',Omdia:'Historical IDaaS market context',Forrester:'Customer identity passwordless context, not workforce coverage','FIDO Alliance':'Authenticator-level technical metadata and certification evidence'};
                block.append(el('p','Potential use: '+(purpose[r.publisher]||'Additional research context')+'.'),el('p','Not used in current analysis: no company or product mappings recorded.'));
            }
            block.append(el('small',String(r.status||'Unverified')));
            try{const u=new URL(r.url);if(u.protocol==='https:'&&['www.gartner.com','www.kuppingercole.com','gartner.com','kuppingercole.com','s.gigaom.com','omdia.tech.informa.com','www.forrester.com','fidoalliance.org'].includes(u.hostname)&&!u.username&&!u.password)block.append(link('Publisher source ↗',u.href));}catch{}
            return block;
        }
        for(const r of active)root.append(source(r));
        const pending=el('details',undefined,'pending-research');pending.append(el('summary','Additional sources · '+(reports.length-active.length)+' not mapped'));for(const r of reports.filter(r=>!mapped(r).length))pending.append(source(r));if(reports.length>active.length)root.append(pending);
        root.append(el('h3','How analysis is produced'),el('p','Initiative flags, portfolio descriptions, role mappings and cooperation scenarios are editorial project inputs or derived hypotheses, not analyst findings. Market snapshots are separate supplied financial context. Missing evidence does not establish missing capability.'));
    }
    function apply(raw) {
        D=validate(raw); researchMode='combined';$('researchMode').value=researchMode; const baseline=$('researchBaseline'); baseline.replaceChildren(el('strong','ACTIVE RESEARCH BASELINE')); const mappedReports=(D.research_reports||[]).filter(r=>D.vendors.some(v=>researchRefs(v).some(x=>x.report===r))); if(!mappedReports.length)baseline.append(el('p','No mapped analyst research in this project.')); for(const r of mappedReports){const count=D.vendors.filter(v=>researchRefs(v).some(x=>x.report===r)).length;baseline.append(el('h2',r.publisher),el('p',r.title),el('small',String(r.edition||'Edition unspecified')+' · '+count+' mapped companies'),el('p',r.id==='kc-lc80894-2026'?'Public report contents mapped; full report not accessed.':'Recorded project references; underlying report not independently checked.'));} const methodology=el('a','Inspect research methodology ↗');methodology.href='#researchSources';baseline.append(methodology); shortlist=[]; differences=false; $('companySearch').value=''; renderSources(); $('org').value=D.organisation; $('lens').selectedIndex=D.initiative;
        $('filter').replaceChildren(new Option('All categories')); for(const cat of new Set(D.vendors.map(v=>v.category))) $('filter').add(new Option(cat));
        $('viewNav').hidden=false; navHistory.length=0;setView('map',false,false);trayDismissed=false;syncTrayVisibility();
        const market=$('market'); market.open=false; market.replaceChildren(el('summary','Market intelligence · optional financial context'),el('p','Financial context only. Prices are dated snapshots, not vendor rankings. Use the issuer quote link for current information.'));
        const marketGrid=el('div',undefined,'market-grid');
        for(const v of D.vendors.filter(v=>v.ticker)){const card=el('article',undefined,'market-card');card.append(el('h3',v.name),el('small',[v.issuer,v.ticker].filter(Boolean).join(' · ')));const q=(D.market_snapshots||[]).find(x=>x && x.ticker===v.ticker)||D.snapshot;if(q&&q.ticker===v.ticker&&Number.isFinite(q.price))card.append(el('strong',q.price.toFixed(2)+' '+String(q.currency)),el('small','Supplied snapshot · unverified · not live · '+String(q.timestamp||q.as_of||q.date||'Date not supplied')));else card.append(el('p','No snapshot available'));card.append(link('View market quote ↗',quoteUrl(v.ticker)));marketGrid.append(card);}market.append(marketGrid);
        $('panel').textContent='Select a planet to inspect its intelligence.'; rebuild(); $('projectStatus').textContent='Project loaded · '+D.vendors.length+' companies · local processing'; $('saveProject').disabled=false; $('defaultProject').disabled=false;
    }
    const limit=1024*1024;
    async function loadDefault(){const r=await fetch('./projects/default.json',{credentials:'omit',redirect:'error'}); if(!r.ok)throw Error('Project unavailable'); const b=await r.blob(); if(b.size>limit)throw Error('Project too large'); apply(JSON.parse(await b.text()));}
    $('projectFile').addEventListener('change',async e=>{try{const f=e.target.files[0]; if(!f)return; if(f.size>limit)throw Error('Too large'); apply(JSON.parse(await f.text()));}catch{ $('projectStatus').textContent='Project rejected · invalid format or size (1 MiB maximum)'; }finally{e.target.value='';}});
    $('defaultProject').onclick=async()=>{try{await loadDefault();}catch{$('projectStatus').textContent='Default project unavailable';}};
    $('saveProject').onclick=()=>{const data={...D,organisation:$('org').value.trim(),initiative:$('lens').selectedIndex}; const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})); const a=el('a'); a.href=url;a.download='starmap-project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    try { await loadDefault(); requestAnimationFrame(frame); } catch { $('projectStatus').textContent='Default project failed to load · serve over HTTP; static preview remains available'; }
})();

// Start with the research disclosure collapsed, including restored browser state.
window.addEventListener("pageshow", () => { const disclosure = document.getElementById("landscapeDisclosure"); if (disclosure) disclosure.open = false; });

document.addEventListener('click', e=>{const a=e.target.closest('a[href="#researchSources"]');if(a){const r=document.getElementById('researchSources');if(r)r.open=true;}});

// Keep one utility panel open, without moving its navigation button.
const utilityPanels = [...document.querySelectorAll('.utility-disclosures details')];
utilityPanels.forEach(panel => {
  panel.open = false;
  panel.addEventListener('toggle', () => {
    if (panel.open) utilityPanels.forEach(other => { if (other !== panel) other.open = false; });
  });
});

document.addEventListener("click",e=>{if(e.target.closest('a[href="#supportDevelopment"]')){const d=document.getElementById("supportDevelopment");if(d)d.open=true;}});
