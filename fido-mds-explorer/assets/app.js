const $=id=>document.getElementById(id);const state={all:[],filtered:[],selected:null,view:'focus',type:'all',page:0,tab:'Overview',source:'sample'};const pageSize=12;const selectionGroups=new Map([['Default selection',new Map()]]);let activeSelectionGroup='Default selection';let entraSelection=selectionGroups.get(activeSelectionGroup);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>s&&!Number.isNaN(Date.parse(s))?new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Not provided';
// Product image > device-specific pictogram. Classifications are presentation hints,
// not claims that an authenticator has a particular biometric capability.
const deviceKind=d=>{
 const name=String([d.name,d.fullName,d.description].filter(Boolean).join(' ')).toLowerCase();
 const transports=(d.transports||[]).map(x=>String(x).toLowerCase());
 const type=String(d.type||'').toLowerCase();
 if(/\b(face|facial|faceid|face id|face recognition)\b/.test(name))return 'face';
 if(/\b(fingerprint|finger print|touch id|touchid|biometric finger)\b/.test(name))return 'fingerprint';
 if(/\b(phone|mobile|android|iphone|ios|smartphone)\b/.test(name))return 'phone';
 if(/smart.?card|\bcard\b|\bpiv\b|\bpkcs.?11\b/.test(name)||type==='smart card')return 'smartcard';
 if(/\b(usb|yubikey|security key|securitykey|fido key|fido2 key|token|dongle)\b/.test(name)||type==='security key'||transports.includes('usb'))return 'usbkey';
 if(type==='platform'||/windows hello|macos|platform authenticator/.test(name))return 'platform';
 return 'general';
};
const deviceIcons={
 smartcard:'<rect x="5" y="8" width="54" height="40" rx="5"/><rect x="12" y="17" width="16" height="13" rx="2"/><path d="M20 17v13M12 23.5h16M36 20h16M36 27h12M12 39h40"/>',
 face:'<path d="M21 7H12a5 5 0 0 0-5 5v9M43 7h9a5 5 0 0 1 5 5v9M7 43v9a5 5 0 0 0 5 5h9M57 43v9a5 5 0 0 1-5 5h-9"/><path d="M22 25v5M42 25v5M26 42q6 6 12 0M32 12c-13 0-20 10-20 20s7 20 20 20 20-10 20-20S45 12 32 12z"/>',
 fingerprint:'<path d="M14 28c0-11 7-18 18-18s18 7 18 18M9 27c0-15 9-23 23-23s23 8 23 23M21 29c0-7 4-11 11-11s11 4 11 11v9M27 29c0-3 2-5 5-5s5 2 5 5v13M15 36c1 10 4 16 8 21M21 35c1 11 5 19 11 24M32 32v13c0 6 3 11 7 14M48 34c0 10-1 17-5 23"/>',
 phone:'<rect x="18" y="5" width="28" height="54" rx="6"/><path d="M26 12h12M29 52h6"/><circle cx="32" cy="32" r="8"/><path d="m28 32 3 3 6-7"/>',
 usbkey:'<path d="M14 19h28a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H14a8 8 0 0 1-8-8V27a8 8 0 0 1 8-8zM48 25h10v14H48M52 25v-7M56 25v-7"/><circle cx="18" cy="32" r="5"/>',
 platform:'<rect x="7" y="9" width="50" height="36" rx="4"/><path d="M3 53h58l-5-8H8zM26 25l5 5 9-10"/>',
 general:'<path d="M32 5 54 17v30L32 59 10 47V17zM10 17l22 13 22-13M32 30v29"/><circle cx="32" cy="30" r="5"/>'
};
const art=d=>{const kind=deviceKind(d);return `<span class="device-pictogram" role="img" aria-label="${kind==='smartcard'?'Smart card':kind==='usbkey'?'Security key':kind==='fingerprint'?'Fingerprint':kind==='face'?'Face recognition':kind==='phone'?'Mobile device':kind==='platform'?'Platform authenticator':'Authenticator'} icon"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${deviceIcons[kind]}</svg></span>`};
const logo=d=>d.providerLogo?`<img class="provider-logo" src="${esc(d.providerLogo)}" alt="${esc(d.vendor)} logo">`:d.vendor==='Vendor not identified'||d.vendor==='Unknown vendor'?'':`<span class="vendor-logo ${esc(d.vendor.toLowerCase().replace(/[^a-z]/g,''))}">${esc(d.vendor)}</span>`;
// Curated official product pages supplement MDS; they are not MDS certification evidence.
const productLink=d=>{const n=String(d.name||'').toLowerCase();if(n==='idmelon key'||n==='idmelon fido security key')return 'https://idmelon.com/products/fido-security-key';if(n==='idmelon authenticator')return 'https://idmelon.com/products/idmelonauth';return d.productPage&&/^https:\/\/(www\.)?(hidglobal\.com|support\.hidglobal\.com)\//.test(d.productPage)?d.productPage:null};
const visual=d=>(d.icon?.startsWith('data:image/png;base64,')||d.icon?.startsWith('assets/products/'))?`<img class="product-icon" src="${esc(d.icon)}" alt="${esc(d.name)} product image" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/><span class="fallback-art fallback-on-error" style="display:none">${art(d)}</span>`:`<span class="fallback-art">${art(d)}</span>`;
// Capability signals are independent of the physical form factor. Only report methods explicitly present in MDS.
const verificationSignals=d=>{
 const v=(d.verification||[]).map(x=>String(x).toLowerCase()).join(' ');
 const out=[];
 if(/fingerprint/.test(v))out.push(['fingerprint','Fingerprint']);
 if(/face|facial/.test(v))out.push(['scan-face','Face']);
 if(/pin|passcode/.test(v))out.push(['lock-keyhole','PIN']);
 if(/presence/.test(v))out.push(['hand','User presence']);
 return out;
};
const signalIcons={fingerprint:'<path d="M14 29c0-11 7-18 18-18s18 7 18 18M21 29c0-7 4-11 11-11s11 4 11 11v9M27 29c0-3 2-5 5-5s5 2 5 5v13M15 36c1 10 4 16 8 21M21 35c1 11 5 19 11 24M32 32v13c0 6 3 11 7 14"/>',
 'scan-face':'<path d="M20 7h-8a5 5 0 0 0-5 5v8M44 7h8a5 5 0 0 1 5 5v8M7 44v8a5 5 0 0 0 5 5h8M57 44v8a5 5 0 0 1-5 5h-8M23 26v5M41 26v5M25 42q7 6 14 0"/>',
 'lock-keyhole':'<rect x="14" y="28" width="36" height="28" rx="5"/><path d="M21 28v-9a11 11 0 0 1 22 0v9M32 39v8"/>',
 hand:'<path d="M18 34V19a4 4 0 0 1 8 0v11-18a4 4 0 0 1 8 0v18-14a4 4 0 0 1 8 0v15-8a4 4 0 0 1 8 0v15c0 12-7 20-18 20-8 0-13-4-18-12l-7-9a4 4 0 0 1 7-5l4 5"/>'};
const signals=d=>{let items=verificationSignals(d);return items.length?`<div class="verification-signals" aria-label="Reported verification methods">${items.map(([k,label])=>`<span class="verification-signal" title="MDS reports: ${label}"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${signalIcons[k]}</svg>${label}</span>`).join('')}</div>`:''};
// Preserve the AND/OR structure of MDS userVerificationDetails: each inner group
// is a conjunction; outer groups are alternatives. Display only reported methods.
const uvInfo={
 faceprint_internal:['face','Face recognition'],faceprint_external:['face','Face recognition'],
 eyeprint_internal:['eye','Iris / eye recognition'],eyeprint_external:['eye','Iris / eye recognition'],
 fingerprint_internal:['fingerprint','Fingerprint'],fingerprint_external:['fingerprint','Fingerprint'],
 passcode_internal:['pin','PIN / passcode'],passcode_external:['pin','PIN / passcode'],
 presence_internal:['presence','User presence'],voiceprint_internal:['voice','Voice recognition'],
 handprint_internal:['handprint','Hand / palm recognition'],pattern_internal:['pattern','Pattern'],
 pattern_external:['pattern','Pattern'],none:['none','No verification'],location_internal:['location','Location']
};
const uvIcons={
 face:signalIcons['scan-face'],fingerprint:signalIcons.fingerprint,pin:signalIcons['lock-keyhole'],presence:signalIcons.hand,
 eye:'<path d="M5 32s11-17 27-17 27 17 27 17-11 17-27 17S5 32 5 32Z"/><circle cx="32" cy="32" r="9"/><circle cx="32" cy="32" r="3"/>',
 voice:'<rect x="25" y="8" width="14" height="30" rx="7"/><path d="M18 29a14 14 0 0 0 28 0M32 43v13M23 56h18"/>',
 handprint:signalIcons.hand,pattern:'<circle cx="12" cy="12" r="4"/><circle cx="50" cy="12" r="4"/><circle cx="12" cy="50" r="4"/><circle cx="50" cy="50" r="4"/><path d="M16 12h30L12 46h34"/>',
 none:'<circle cx="32" cy="32" r="23"/><path d="M16 48 48 16"/>',location:'<path d="M32 58s20-20 20-34a20 20 0 0 0-40 0c0 14 20 34 20 34Z"/><circle cx="32" cy="24" r="7"/>'
};
function verificationGroups(d){
 const raw=d.raw?.metadataStatement?.userVerificationDetails;
 if(Array.isArray(raw)&&raw.length){return raw.map(group=>Array.isArray(group)?group.map(item=>String(item?.userVerificationMethod||'').toLowerCase()).filter(Boolean):[]).filter(g=>g.length)}
 return (d.verification||[]).map(x=>[String(x).toLowerCase().replace(/\s+/g,'_').replace(/^pin_/,'passcode_')]);
}
function uvMethod(raw){let v=uvInfo[raw]||[raw.includes('eye')?'eye':raw.includes('face')?'face':raw.includes('finger')?'fingerprint':raw.includes('pin')||raw.includes('passcode')?'pin':'none',raw.replace(/_/g,' ')];return v}
function uvChip(raw){let [kind,label]=uvMethod(raw);return `<span class="uv-chip" title="Reported by FIDO metadata: ${esc(raw)}"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uvIcons[kind]||uvIcons.none}</svg><span>${esc(label)}</span></span>`}
function verificationPanel(d){let groups=verificationGroups(d);if(!groups.length)return '<p class="uv-empty">No verification methods specified in this metadata record.</p>';return `<section class="uv-panel" aria-label="Supported verification methods"><div class="uv-heading">Reported verification methods <span class="uv-source">FIDO MDS</span></div><p class="uv-help">${groups.length>1?'Alternative methods (OR).':'Reported method combination.'} Methods shown reflect the authenticator metadata, not necessarily what every device configuration enables.</p><div class="uv-options">${groups.map((g,i)=>`<div class="uv-option">${i?'<span class="uv-operator">OR</span>':''}<div class="uv-group">${g.map((m,j)=>`${j?'<span class="uv-and">AND</span>':''}${uvChip(m)}`).join('')}</div></div>`).join('')}</div></section>`}
const pretty=v=>Array.isArray(v)?v.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(', '):String(v??'');

// Evidence-based, model-scoped manufacturer claims, kept separate from FIDO MDS.
// CC EAL6+ describes the NXP secure-element platform, NOT the whole authenticator.
// Never match other Crescendo generations or derive certification from vendor alone.
function manufacturerAssurance(d){
 // Match only explicitly documented Crescendo model families, not all HID products.
 // Manufacturer naming can differ between cached and resynchronized MDS records.
 const name=String(d.name||d.description||'').trim();
 const vendor=String(d.vendor||'').trim();
 if(!/^(HID(?: Global)?|HIDGlobal)$/i.test(vendor) && !/^HID\s+Crescendo\s+/i.test(name))return null;
 const model=name.replace(/^HID\s+/i,'').replace(/\s+/g,' ');
 const evidence={cc:'EAL6+',scope:'NXP JCOP 4.5 P71D600 secure-element platform (not full authenticator)',level:'platform',sourceType:'manufacturer datasheet'};
 if(/^Crescendo\s+4000(?:\s|$)/i.test(model))return {...evidence,fips:'L2',fipsScope:'Crescendo 4000 dual-interface configuration only (base part 4043)',fipsDetail:'Manufacturer datasheet reports FIPS 140-3 Level 2 validated for the dual-interface card. Not established for contactless-only variants or every AAGUID.',source:'HID Crescendo 4000 datasheet (2026), p. 2',url:'https://www.hidglobal.com/documents/hid-crescendo-cards-datasheet'};
 if(/^Crescendo\s+Key\s+V3(?:\s|$)/i.test(model))return {...evidence,fips:'L2',fipsScope:'Crescendo Key v3 product-level claim; secure element separately reports Level 3',fipsDetail:'HID Applets v4.0 on NXP JCOP 4.5 P71D600: FIPS 140-3 Level 2 (NIST CMVP #5390). Underlying JCOP 4.5 platform: separate Level 3 (#4679). Confirm the deployed module and configuration.',source:'HID Crescendo Key v3 datasheet (2026), p. 2; NIST CMVP #5390',url:'https://www.hidglobal.com/documents/hid-crescendo-key-v3-datasheet',cmvp:'https://csrc.nist.gov/projects/cryptographic-module-validation-program/certificate/5390'};
 return null;
}
function displayedFips(d){const m=manufacturerAssurance(d);return d.fips||(m?.fips ? ('FIPS 140-3 '+m.fips+(m.fipsScope.includes('dual-interface')?' · dual-interface':' · Key v3')):'Not established')}
function assuranceTile(label,value,kind,detail){return `<div class="assurance-tile ${kind}" title="${esc(detail)}"><span class="assurance-icon" aria-hidden="true">${kind==='fido'?'◆':kind==='reported'?'✦':'○'}</span><span class="assurance-label">${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`}
function assurancePanel(d){
 const fido=d.fidoLevel||'Not reported',manufacturer=manufacturerAssurance(d),fips=d.fips|| (manufacturer?.fips ? (manufacturer.fips+' · '+(manufacturer.fipsScope.includes('dual-interface')?'dual-interface':'Key v3')) : 'Not established');
 const cc=manufacturer?.cc||d.ccCertification||null;
 const ccDetail=manufacturer?'Secure element only · manufacturer datasheet':cc?'Certificate and evaluated configuration require verification':'Not established by FIDO MDS';
 const evidence=manufacturer?`<div class="assurance-evidence"><strong>Manufacturer assurance evidence</strong> · ${esc(manufacturer.scope)}. Source: ${esc(manufacturer.source)}. <a href="${esc(manufacturer.url)}" target="_blank" rel="noopener noreferrer">Manufacturer datasheet ↗</a><span>CC EAL6+ applies to the secure-element platform, not the complete authenticator.</span>${manufacturer.fips?`<span><strong>FIPS 140-3 ${esc(manufacturer.fips)}</strong> · ${esc(manufacturer.fipsScope)}. ${esc(manufacturer.fipsDetail)} ${manufacturer.cmvp?`<a href="${esc(manufacturer.cmvp)}" target="_blank" rel="noopener noreferrer">NIST CMVP #5390 ↗</a>`:''} Verify the exact module and configuration for tender use.</span>`:''}</div>`:'';
 return `<section class="assurance-panel" aria-label="Certification summary"><div class="assurance-heading"><h3>Certification snapshot</h3></div><div class="assurance-grid">${assuranceTile('FIDO',fido,d.fidoLevel?'fido':'unknown','MDS-reported certification level')}${assuranceTile('FIPS 140',fips,(d.fips||manufacturer?.fips)?'reported':'unknown',manufacturer?.fips?manufacturer.fipsDetail:(d.fips?'Reported; verify NIST CMVP certificate and module scope':'Not established by FIDO MDS'))}${assuranceTile('Common Criteria',cc||'Not established',cc?'reported':'unknown',ccDetail)}</div>${evidence}<p class="assurance-disclaimer">FIDO, FIPS and Common Criteria have different certification scopes. A secure-element CC rating does not certify the complete authenticator. Check current certificates, exact model and evaluated configuration before tender submission.</p></section>`;
}


function progress(p,msg){$('progress-bar').style.width=p+'%';$('progress-label').textContent=p+'%';$('load-message').textContent=msg}
async function load(path='data/catalog.json'){progress(12,'Loading catalog…');let r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error('Catalog unavailable ('+r.status+')');progress(46,'Parsing authenticator metadata…');let data=await r.json();if(!Array.isArray(data.entries))throw Error('Invalid catalog format');state.all=data.entries.map(d=>{const n=String(d.name||'').toLowerCase();if(n==='idmelon key'||n==='idmelon authenticator'){return {...d,vendor:'IDmelon',productPage:n==='idmelon key'?'https://idmelon.com/products/fido-security-key':'https://idmelon.com/products/idmelonauth'}}return d});state.source=data.source||'sample';$('source-label').textContent=data.verified?'FIDO MDS · signature verified':state.source==='sample'?'Illustrative sample data':'FIDO MDS · cached reference';$('source-dot').style.color=data.verified?'#48ef9a':'#e5b954';const syncDate=data.lastSuccessfulSyncAt?new Date(data.lastSuccessfulSyncAt):null;const syncValid=syncDate&&!Number.isNaN(syncDate.getTime());const synced=syncValid&&data.cacheOrigin==='resync';const imported=syncValid&&data.cacheOrigin==='import';const syncLabel=syncValid?syncDate.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):null;$('sync-time').textContent=(synced?'· Last successful sync: '+syncLabel:imported?'· Last imported: '+syncLabel:'· Bundled cache: '+(data.cacheLabel||date(data.fetchedAt)))+' · BLOB #'+(data.blobSerial||'?');$('sync-time').title=synced?'Successful MDS resync stored locally. JWT signature has not been verified.':imported?'Local BLOB import completed. JWT signature has not been verified.':'Bundled cache. No successful live resync recorded in this installation.';progress(76,'Preparing cards and filters…');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const params=new URLSearchParams(location.search);
 // Deep-link filters are optional and can always be changed in the UI.
 const requestedType=(params.get('type')||params.get('category')||'').trim().toLowerCase();
 const typeAliases={'security-key':'Security key','security key':'Security key','security-keys':'Security key','smart-card':'Smart card','smart card':'Smart card','smart-cards':'Smart card','platform':'Platform','other':'Other','all':'all'};
 if(Object.prototype.hasOwnProperty.call(typeAliases,requestedType)){
   state.type=typeAliases[requestedType];
   document.querySelectorAll('[data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type===state.type));
   if(state.type==='Security key')$('sort').value='featured';
 }
 const requestedVendor=(params.get('vendor')||'').trim();
 if(requestedVendor && requestedVendor.length<=80) $('search').value=requestedVendor;
 const requestedAaguid=(params.get('aaguid')||'').trim().toLowerCase();const match=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(requestedAaguid)&&state.all.find(d=>d.aaguid?.toLowerCase()===requestedAaguid);if(requestedAaguid){$('search').value=requestedAaguid;state.type='all';document.querySelectorAll('[data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type==='all'));}state.selected=requestedAaguid?(match?.id||null):(state.all.find(d=>/^HID Crescendo 4000$/i.test(d.name))?.id||state.all[0]?.id||null);state.view=params.get('view')==='hybrid'&&!window.matchMedia('(max-width:700px)').matches?'hybrid':'focus';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===state.view));$('stream').hidden=state.view!=='hybrid';progress(96,'Rendering explorer…');apply();setTimeout(()=>{$('loading').hidden=true;$('loading').style.display='none'},240)}
function preferredSecurityKey(d){const n=String(d.name||'').toLowerCase();if(d.vendor==='HID'&&/crescendo key v3/.test(n))return 0;if(d.vendor==='HID'&&/crescendo key/.test(n))return 1;if(d.vendor==='IDmelon'||/idmelon/.test(n))return 2;return 3}
function featuredRank(d){const n=d.name.toLowerCase(),v=d.vendor;const tests=[['Microsoft','windows hello'],['Swissbit','ishield'],['Yubico','yubikey 5'],['HID','crescendo 4000'],['Thales','idprime'],['FEITIAN','epass'],['Google','android']];let ix=tests.findIndex(([vendor,needle])=>v===vendor&&n.includes(needle));return ix>=0?ix*1000+(n==='hid crescendo 4000'?0:n.length):100000+d.name.toLowerCase().charCodeAt(0)*1000+d.name.length}
function updateFilterCounts(){
 const q=$('search').value.trim().toLowerCase(),lev=$('level').value,fips=$('fips').value;
 const base=state.all.filter(d=>(state.type==='all'||d.type===state.type)&&(!q||[d.name,d.vendor,d.aaguid,d.description].some(v=>String(v||'').toLowerCase().includes(q))));
 const levels=base.filter(d=>fips==='all'||(fips==='reported'?!!d.fips:!d.fips));
 const fipsPool=base.filter(d=>lev==='all'||d.fidoLevel===lev);
 for(const option of $('level').options){const count=option.value==='all'?levels.length:levels.filter(d=>(option.value==='unreported'?!d.fidoLevel:d.fidoLevel===option.value)).length;option.textContent=(option.dataset.label||option.textContent.replace(/ \(\d+\)$/,''))+' ('+count+')';option.dataset.label=option.textContent.replace(/ \(\d+\)$/,'');}
 for(const option of $('fips').options){const count=option.value==='all'?fipsPool.length:fipsPool.filter(d=>option.value==='reported'?!!d.fips:!d.fips).length;option.textContent=(option.dataset.label||option.textContent.replace(/ \(\d+\)$/,''))+' ('+count+')';option.dataset.label=option.textContent.replace(/ \(\d+\)$/,'');}
 for(const b of document.querySelectorAll('[data-type]')){const count=state.all.filter(d=>(b.dataset.type==='all'||d.type===b.dataset.type)&&(!q||[d.name,d.vendor,d.aaguid,d.description].some(v=>String(v||'').toLowerCase().includes(q)))&&(lev==='all'||(lev==='unreported'?!d.fidoLevel:d.fidoLevel===lev))&&(fips==='all'||(fips==='reported'?!!d.fips:!d.fips))).length;
  let counter=b.querySelector('.filter-count');if(!counter){counter=document.createElement('span');counter.className='filter-count';b.append(counter)}counter.textContent=' ('+count.toLocaleString()+')';}
}
function apply(){const q=$('search').value.trim().toLowerCase(),lev=$('level').value,fips=$('fips').value;
 let list=state.all.filter(d=>(state.type==='all'||d.type===state.type)&&(!q||[d.name,d.vendor,d.aaguid,d.description].some(v=>String(v||'').toLowerCase().includes(q)))&&(lev==='all'||(lev==='unreported'?!d.fidoLevel:d.fidoLevel===lev))&&(fips==='all'||(fips==='reported'?!!d.fips:!d.fips)));
 let sort=$('sort').value;list.sort((a,b)=>sort==='featured'?(state.type==='Security key'?(preferredSecurityKey(a)-preferredSecurityKey(b)||featuredRank(a)-featuredRank(b)):featuredRank(a)-featuredRank(b)):sort==='recent'?(b.updated||'').localeCompare(a.updated||''):sort==='oldest'?(a.updated||'').localeCompare(b.updated||''):sort==='vendor'?a.vendor.localeCompare(b.vendor):sort==='level'?(b.fidoLevel||'').localeCompare(a.fidoLevel||''):a.name.localeCompare(b.name));
 state.filtered=list;state.page=Math.min(state.page,Math.max(0,Math.ceil(list.length/pageSize)-1));if(!list.some(d=>d.id===state.selected))state.selected=list[0]?.id||null;
 updateFilterCounts();$('footer-count').textContent=list.length.toLocaleString()+' matching authenticators';$('result-count').textContent=list.length.toLocaleString()+' results';
 const counter=$('matching-count');if(counter)counter.textContent=list.length.toLocaleString()+' of '+state.all.length.toLocaleString()+' authenticators';
 const notice=$('filter-empty');if(notice){notice.hidden=list.length!==0;if(!list.length){notice.textContent=fips==='reported'?'No FIPS 140 certifications are established by this FIDO MDS catalog. FIPS validation must be checked separately against NIST CMVP.':lev==='L3'?'No exact FIDO L3 entries in this catalog. Try L3+ (a distinct reported level).':'No authenticators match these filters. Change or clear one or more filters.';}}
 renderDeck();renderRows();renderDetail();}

function select(id){state.selected=id;renderDeck();renderRows();renderDetail()}
// Hybrid list keyboard navigation follows the filtered order and keeps pagination in sync.
function hybridJump(index){const items=state.filtered;if(!items.length)return;const i=Math.max(0,Math.min(items.length-1,index));state.page=Math.floor(i/pageSize);select(items[i].id);const row=$('rows').querySelector('tr.active');if(row)row.scrollIntoView({block:'nearest',behavior:'auto'});}
function hybridStep(delta){const i=state.filtered.findIndex(d=>d.id===state.selected);hybridJump((i<0?0:i)+delta)}
function hybridPage(delta){const total=Math.ceil(state.filtered.length/pageSize);if(!total)return;const target=Math.max(0,Math.min(total-1,state.page+delta));if(target===state.page)return;hybridJump(target*pageSize)}
function move(n){const i=state.filtered.findIndex(d=>d.id===state.selected);if(!state.filtered.length)return;select(state.filtered[(i+n+state.filtered.length)%state.filtered.length].id)}
function renderDeck(){
 let list=state.filtered,idx=list.findIndex(d=>d.id===state.selected),deck=$('deck');
 $('position').textContent=list.length?(idx+1)+' / '+list.length.toLocaleString()+' · '+list[idx].name:'No matching authenticators';
 const visible=new Set();if(idx<0){deck.replaceChildren();return}
 for(let off=-3;off<=3;off++){
  let j=idx+off;if(j<0||j>=list.length)continue;
  let d=list[j],key=d.id;visible.add(key);
  let b=Array.from(deck.children).find(n=>n.dataset.id===key);
  if(!b){b=document.createElement('button');b.className='device-card';b.dataset.id=key;b.setAttribute('aria-label','Select '+d.name);if(productLink(d))b.title='Select authenticator. Official HID product information available in the details panel.';b.innerHTML=`<div class="vendor">${logo(d)||'<span class="vendor-unknown">Vendor not identified</span>'}</div><div class="device-art" aria-hidden="true">${visual(d)}</div><span class="selection-card-mark" aria-hidden="true">✓</span><h3 title="${esc(d.fullName||d.name)}">${esc(d.name)}</h3><div class="type">${esc(d.type)}</div>${signals(d)}<div class="badges"><span class="badge fido">${esc(d.fidoLevel||'FIDO level unknown')}</span></div>`;b.onclick=()=>{if(isCompactMobile()&&state.selected===key)openMobileDetails();else select(key)};deck.append(b)}
  b.classList.toggle('in-selection',!!safeAaguid(d)&&entraSelection.has(safeAaguid(d)));b.classList.toggle('center',off===0);b.style.zIndex=String(10-Math.abs(off));b.style.opacity=String(Math.max(.3,1-Math.abs(off)*.18));b.style.pointerEvents='auto';
  const target=`translateX(calc(-50% + ${off*77}%)) rotateY(${-off*16}deg) scale(${1-Math.abs(off)*.12})`;if(!b.dataset.positioned){b.style.transform=`translateX(calc(-50% + ${(off+(off<0?-1:1))*77}%)) rotateY(${-off*18}deg) scale(.72)`;b.style.opacity='0';requestAnimationFrame(()=>requestAnimationFrame(()=>{b.style.transform=target;b.style.opacity=String(Math.max(.3,1-Math.abs(off)*.18))}));b.dataset.positioned='1'}else b.style.transform=target;
 }
 // Existing cards animate to their new positions; departing cards fade out before removal.
 Array.from(deck.children).filter(b=>!visible.has(b.dataset.id)).forEach(b=>{b.style.opacity='0';b.style.pointerEvents='none';b.style.transform+=' scale(.8)';setTimeout(()=>{if(!visible.has(b.dataset.id))b.remove()},450)});
}
function renderRows(){let list=state.filtered.slice(state.page*pageSize,(state.page+1)*pageSize);$('rows').innerHTML=list.map(d=>`<tr data-id="${esc(d.id)}" class="${d.id===state.selected?'active':''}"><td><strong>${esc(d.name)}</strong><br><small>${esc(d.vendor)}</small></td><td>${esc(d.type)}</td><td>${esc(d.fidoLevel||'Unknown')}</td><td>${esc(displayedFips(d))}</td><td>${date(d.updated)}</td></tr>`).join('');$('rows').querySelectorAll('tr').forEach(r=>r.onclick=()=>select(r.dataset.id));$('page-label').textContent=`Page ${state.page+1} of ${Math.max(1,Math.ceil(state.filtered.length/pageSize))}`;$('page-prev').disabled=state.page===0;$('page-next').disabled=(state.page+1)*pageSize>=state.filtered.length}
function row(k,v){return `<dl class="kv"><dt>${esc(k)}</dt><dd>${esc(v??'Not provided')}</dd></dl>`}
function renderDetail(){let d=state.all.find(d=>d.id===state.selected);if(!d){$('detail-content').innerHTML='<p>No authenticator selected.</p>';return}let tabs=['Overview','Capabilities','Certification','Metadata'];let content=state.tab==='Overview'?`<div class="detail-section"><h3>What it is</h3><p>${esc(d.description||'Metadata record for this authenticator. Further product information is not provided.')}</p></div><div class="detail-section"><h3>At a glance</h3>${row('Device type',d.type)}${row('Transports',(d.transports||[]).join(', ')||'Not provided')}${row('FIDO level',d.fidoLevel||'Not established')}${row('FIPS',displayedFips(d))}${row('Status',d.status||'Not reported')}</div>${assurancePanel(d)}${verificationPanel(d)}`:state.tab==='Capabilities'?`<div class="detail-section"><h3>Authenticator capabilities</h3>${row('Protocols',(d.protocols||[]).join(', ')||'Not provided')}${row('Transports',(d.transports||[]).join(', ')||'Not provided')}${verificationPanel(d)}${row('Key protection',pretty(d.keyProtection||[])||'Not provided')}${row('Attachment',d.type)}</div>`:state.tab==='Certification'?`<div class="detail-section"><h3>Certification and assurance</h3>${row('FIDO level',d.fidoLevel||'Not established')}${row('FIPS',displayedFips(d))}${row('MDS status',d.status||'Not reported')}${assurancePanel(d)}</div>`:`<div class="detail-section"><h3>Metadata identifiers</h3>${row('AAGUID',d.aaguid||'Not provided')}${row('Last status date',date(d.updated))}${row('Source',state.source==='sample'?'Illustrative sample':'FIDO MDS cached reference (signature validation pending)')}${row('BLOB serial',d.blobSerial||'Not provided')}</div>`;
$('detail-content').className='';$('detail-content').innerHTML=`<div class="detail-head"><h2>${esc(d.name)}</h2><div class="detail-identity"><div class="detail-manufacturer">${logo(d)||`<span class="vendor-unknown">${esc(d.vendor)}</span>`}</div><div class="detail-device-type">${esc(d.type)} authenticator</div></div></div><div class="hero-art" aria-hidden="true">${visual(d)}</div><div class="tabs">${tabs.map(t=>`<button data-tab="${t}" class="${state.tab===t?'active':''}">${t}</button>`).join('')}</div>${content}<div class="detail-actions"><button id="copy-aaguid">Copy AAGUID</button><button class="primary" id="view-raw">View raw data</button><button id="copy-json">Copy JSON</button><button id="selection-toggle" title="Add or remove this authenticator from your current selection">${safeAaguid(d)&&entraSelection.has(safeAaguid(d))?'✓ In your selection':'+ Add to selection'}</button>${productLink(d)?`<a class="product-page-link" href="${esc(productLink(d))}" target="_blank" rel="noopener noreferrer" title="Open official product information (supplementary to FIDO MDS) in a new tab">Official product page ↗</a>`:''}</div><p class="note">${state.source==='sample'?'Illustrative entries: no certification claims are verified.':'Metadata provided for exploration. Cryptographic signature and certificate-chain validation have not been completed; do not use this viewer for authentication trust decisions.'}</p>`;$('detail-content').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;renderDetail()});$('copy-aaguid').onclick=()=>copy(d.aaguid||'');$('copy-json').onclick=()=>copy(JSON.stringify(d.raw||d,null,2));$('selection-toggle').onclick=()=>toggleSelection(d);$('view-raw').onclick=()=>{openJsonExplorer(d.raw||d)}}
async function copy(s){try{await navigator.clipboard.writeText(s)}catch{alert('Clipboard unavailable. Use the raw data dialog to select and copy.')}}
async function resync(){if(!confirm('Resync metadata from the FIDO service? Downloading and processing the full catalog may take time. The FIDO service may rate-limit downloads to once per hour. This prototype does not cryptographically verify the BLOB.'))return;$('loading').style.display='grid';progress(5,'Requesting FIDO MDS…');$('detail-content').className='skeleton';$('detail-content').innerHTML='<div class="shimmer sk-title"></div><div class="shimmer sk-image"></div><div class="shimmer sk-line"></div><div class="shimmer sk-line"></div>';try{let r=await fetch('/api/resync',{method:'POST'});let d=await r.json();if(!r.ok)throw Error(d.error||'Resync failed');progress(55,'Preparing new catalog…');await load('data/catalog.json')}catch(e){$('loading').style.display='none';alert(e.message);renderDetail()}}
const compactMedia=window.matchMedia('(max-width:700px)');
function isCompactMobile(){return compactMedia.matches}
function openMobileDetails(){if(!isCompactMobile())return;document.body.classList.add('mobile-detail-visible');$('mobile-detail-close').focus({preventScroll:true})}
function closeMobileDetails(){document.body.classList.remove('mobile-detail-visible');$('mobile-detail-open').focus({preventScroll:true})}
$('mobile-detail-open').onclick=openMobileDetails;
$('mobile-detail-close').onclick=closeMobileDetails;
$('mobile-filter-toggle').onclick=()=>{const expanded=$('filters').classList.toggle('mobile-expanded');$('mobile-filter-toggle').setAttribute('aria-expanded',String(expanded))};
compactMedia.addEventListener('change',()=>{if(!isCompactMobile())document.body.classList.remove('mobile-detail-visible')});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('mobile-detail-visible')){e.preventDefault();closeMobileDetails()}});
$('search').addEventListener('input' ,()=>{state.page=0;apply()});$('sort').onchange=apply;$('level').onchange=apply;$('fips').onchange=apply;document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{state.type=b.dataset.type;if(state.type==='Security key'){$('sort').value='featured';state.selected=null;}document.querySelectorAll('[data-type]').forEach(x=>x.classList.toggle('active',x===b));state.page=0;apply()});document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('selected',x===b));$('stream').hidden=state.view!=='hybrid';$('stage').style.height=state.view==='hybrid'?'350px':'465px';$('deck').style.height=state.view==='hybrid'?'250px':'355px';renderDeck()});$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);$('shuffle').onclick=()=>{if(state.filtered.length)select(state.filtered[Math.floor(Math.random()*state.filtered.length)].id)};$('page-prev').onclick=()=>{state.page--;renderRows()};$('page-next').onclick=()=>{state.page++;renderRows()};$('resync').onclick=resync;$('import-blob').onclick=()=>$('blob-file').click();
// Static deployments (including GitHub Pages) have no writable Python API.
// Keep the local server workflows intact, but don't expose broken actions publicly.
const isStaticDeployment = true; // Zola/GitHub Pages distribution has no write API
if(isStaticDeployment){
  for(const id of ['resync','import-blob']){
    const button=$(id);button.disabled=true;
    button.setAttribute('aria-disabled','true');
    button.title='Available in the local Python-server edition. Public static hosting uses the bundled MDS catalog; updates require publishing a refreshed catalog.';
  }
  const syncNote=document.createElement('span');
  syncNote.className='static-cache-note';
  syncNote.textContent='Bundled FIDO MDS snapshot · refreshed monthly';
  syncNote.title='The public explorer is read-only. Its FIDO MDS JWT signature has not been cryptographically verified.';
  $('sync-time').insertAdjacentElement('afterend',syncNote);
}
$('blob-file').onchange=importBlob;$('close-raw').onclick=()=>$('raw-dialog').close();$('copy-raw').onclick=()=>copy(JSON.stringify(jsonData,null,2));let hybridPendingG=false;
function explorerKeyboardBlocked(e){return e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,[contenteditable=true],dialog')||$('raw-dialog').open||$('entra-dialog')?.open||$('selection-drawer')?.classList.contains('open')}
document.addEventListener('keydown',e=>{
 if(explorerKeyboardBlocked(e))return;
 if(e.key==='/'){e.preventDefault();hybridPendingG=false;$('search').focus();return}
 if(state.view==='hybrid'){
  if(['j','k','g','G','h','l'].includes(e.key)){
   e.preventDefault();
   if(e.key==='j')hybridStep(1);
   else if(e.key==='k')hybridStep(-1);
   else if(e.key==='G')hybridJump(state.filtered.length-1);
   else if(e.key==='g'&&hybridPendingG)hybridJump(0);
   else if(e.key==='h')hybridPage(-1);
   else if(e.key==='l')hybridPage(1);
   hybridPendingG=e.key==='g'&&!hybridPendingG;
   return;
  }
 }else if(e.key==='h'||e.key==='l'){
  e.preventDefault();move(e.key==='h'?-1:1);return;
 }
 hybridPendingG=false;
 if(e.key==='ArrowLeft'){e.preventDefault();move(-1)}
 else if(e.key==='ArrowRight'){e.preventDefault();move(1)}
});let touchX=0;$('deck').addEventListener('touchstart',e=>touchX=e.touches[0].clientX,{passive:true});$('deck').addEventListener('touchend',e=>{let dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>40)move(dx<0?1:-1)},{passive:true});load().catch(e=>{progress(0,'Unable to load: '+e.message);$('load-message').textContent+=' · Check README for local server instructions.'});

async function importBlob(e){let file=e.target.files?.[0];if(!file)return;
 $('loading').style.display='grid';progress(12,'Importing local MDS BLOB…');
 try{let raw=await file.text();progress(40,'Normalizing metadata…');let r=await fetch('/api/import',{method:'POST',headers:{'Content-Type':'application/jwt'},body:raw});let result=await r.json();if(!r.ok)throw Error(result.error||'Import failed');await load('data/catalog.json')}
 catch(err){$('loading').style.display='none';alert(err.message);renderDetail()}finally{e.target.value=''}
}


function safeAaguid(d){return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(d?.aaguid||'')?d.aaguid.toLowerCase():null}
function entraItems(){return [...entraSelection.values()].sort((a,b)=>a.name.localeCompare(b.name))}
function entraPayload(){return {format:'fido-aaguid-inventory',version:1,source:'FIDO MDS explorer cache (not cryptographically verified)',exportedAt:new Date().toISOString(),authenticators:entraItems().map(d=>({aaguid:safeAaguid(d),product:d.name,manufacturer:d.vendor,deviceType:d.type||null,fidoCertificationLevel:d.fidoLevel||null,mdsStatus:d.status||null,metadataDate:d.updated||null}))}}
function entraGraph(){return {note:'REVIEW ONLY. Example PATCH fragment for an existing passkey profile. Merge with tenant settings; never replace passkeyProfiles or aaGuids blindly.',keyRestrictions:{isEnforced:true,enforcementType:'allow',aaGuids:entraItems().map(safeAaguid).filter(Boolean)}}}
function entraDownload(filename,content,mime){const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function openEntra(){if(!entraSelection.size)return;closeSelectionDrawer();renderEntra();$('entra-dialog').showModal()}
function exportDestination(){return document.querySelector('input[name="export-destination"]:checked')?.value||'entra'}
function exportFormat(){return exportDestination()==='entra'?'graph':$('entra-format').value}
function renderEntra(){const items=entraItems(),ids=items.map(safeAaguid).filter(Boolean);$('entra-count').textContent=items.length+' selected authenticator'+(items.length===1?'':'s');$('entra-items').innerHTML=items.length?items.map(d=>`<div class="entra-item"><div><strong>${esc(d.name)}</strong><small>${esc(d.vendor)} · ${esc(d.aaguid)}</small></div><button data-remove="${esc(safeAaguid(d))}" aria-label="Remove ${esc(d.name)}">Remove</button></div>`).join(''):'<p>No valid AAGUIDs selected.</p>';$('entra-items').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{entraSelection.delete(b.dataset.remove);renderEntra();renderSelectionUI();renderDetail();renderDeck()});const generic=exportDestination()==='generic';$('generic-format-wrap').hidden=!generic;$('export-caution').innerHTML=generic?'<strong>Portable inventory only:</strong> This export is a reference template, not a ready-to-import configuration. Your identity provider may require changes to field names, structure, supported restrictions, or additional values. Review and adapt it before use. MDS records do not guarantee registration compatibility.':'<strong>Review before applying:</strong> Graph preview is an illustrative fragment, not a complete request body. Read the existing passkey profile and merge AAGUIDs; never overwrite other profiles or restrictions. MDS presence does not establish Entra registration compatibility. AAGUIDs restrict authenticator models, not individual devices.';const format=exportFormat();$('entra-preview').textContent=format==='graph'?JSON.stringify(entraGraph(),null,2):format==='json'?JSON.stringify(entraPayload(),null,2):ids.join('\n');$('entra-copy').disabled=$('entra-download').disabled=!ids.length}

$('entra-close').onclick=()=>$('entra-dialog').close();$('entra-format').onchange=renderEntra;document.querySelectorAll('input[name="export-destination"]').forEach(el=>el.onchange=renderEntra);$('entra-copy').onclick=()=>copy($('entra-preview').textContent);$('entra-download').onclick=()=>{const f=exportFormat();entraDownload((f==='graph'?'entra-passkey-graph-preview':'fido-aaguids-'+f)+(f==='txt'?'.txt':'.json'),$('entra-preview').textContent,f==='txt'?'text/plain':'application/json')};$('entra-clear').onclick=()=>{entraSelection.clear();renderEntra();renderSelectionUI();renderDetail();renderDeck()};

// Session-only selection workspace: named groups and non-destructive exports.
function renderSelectionUI(){
 const count=entraSelection.size;
 $('selection-badge').textContent=count;
 $('selection-drawer-count').textContent=count;
 $('selection-export-count').textContent=count?'('+count+')':'';
 $('selection-export').disabled=!count;
 const group=$('selection-group');group.innerHTML=[...selectionGroups.keys()].map(name=>`<option value="${esc(name)}" ${name===activeSelectionGroup?'selected':''}>${esc(name)}</option>`).join('');
 $('selection-items').innerHTML=count?entraItems().map(d=>`<div class="selection-item"><div class="selection-item-icon">${visual(d)}</div><div class="selection-item-body"><strong>${esc(d.name)}</strong><small>${esc(d.vendor)} · ${esc(d.type)}</small><code>${esc(safeAaguid(d))}</code></div><button class="selection-remove" data-selection-remove="${esc(safeAaguid(d))}" title="Remove from selection" aria-label="Remove ${esc(d.name)}">✕</button></div>`).join(''):'<div class="selection-empty"><div class="selection-empty-icon">▤</div><strong>No authenticators selected yet</strong><p>Browse the explorer and choose “Add to selection” on an authenticator to build a reference group.</p></div>';
 $('selection-items').querySelectorAll('[data-selection-remove]').forEach(b=>b.onclick=()=>{entraSelection.delete(b.dataset.selectionRemove);refreshSelection()});
}
function refreshSelection(){renderSelectionUI();renderDeck();renderDetail()}
function toggleSelection(d){const id=safeAaguid(d);if(!id){showAaguidNotice(d);return}if(entraSelection.has(id))entraSelection.delete(id);else entraSelection.set(id,d);refreshSelection()}
function openSelectionDrawer(){$('selection-backdrop').hidden=false;$('selection-drawer').classList.add('open');$('selection-drawer').setAttribute('aria-hidden','false');renderSelectionUI()}
function closeSelectionDrawer(){$('selection-backdrop').hidden=true;$('selection-drawer').classList.remove('open');$('selection-drawer').setAttribute('aria-hidden','true')}
$('selection-open').onclick=openSelectionDrawer;$('selection-close').onclick=closeSelectionDrawer;$('selection-backdrop').onclick=closeSelectionDrawer;
$('selection-export').onclick=openEntra;
$('selection-group').onchange=e=>{activeSelectionGroup=e.target.value;entraSelection=selectionGroups.get(activeSelectionGroup);refreshSelection()};
$('selection-new-group').onclick=()=>{const name=prompt('Name this selection group (e.g. Pilot, Corporate standard):');if(name===null)return;const clean=name.trim().slice(0,64);if(!clean)return;if(selectionGroups.has(clean)){activeSelectionGroup=clean;entraSelection=selectionGroups.get(clean)}else{if(selectionGroups.size>=12){alert('Up to 12 session-only selection groups are supported.');return}selectionGroups.set(clean,new Map());activeSelectionGroup=clean;entraSelection=selectionGroups.get(clean)}refreshSelection()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('selection-drawer').classList.contains('open'))closeSelectionDrawer()});
renderSelectionUI();

// v1.4: read-only JSON tree explorer. Search is case-insensitive across paths, keys and scalar values.
let jsonData=null,jsonNodes=[],jsonVisible=[],jsonActive=0,jsonMatches=[],jsonMatchIndex=-1,jsonCollapsed=new Set();
function jsonType(v){return v===null?'null':Array.isArray(v)?'array':typeof v}
function jsonPath(parent,key){return typeof key==='number'?parent+'['+key+']':/^[a-zA-Z_$][\w$]*$/.test(key)?parent+'.'+key:parent+'['+JSON.stringify(key)+']'}
function jsonBuild(value,path='$',key='$',depth=0,parent=-1){
 const id=jsonNodes.length,kind=jsonType(value),node={id,path,key,depth,parent,kind,value,children:[]};jsonNodes.push(node);
 if(kind==='object'||kind==='array'){for(const [k,v] of Object.entries(value)){let child=jsonBuild(v,jsonPath(path,kind==='array'?Number(k):k),k,depth+1,id);node.children.push(child)}}return id;
}
function jsonLabel(node){const v=node.value;if(node.kind==='object')return '{'+node.children.length+' fields}';if(node.kind==='array')return '['+node.children.length+' items]';if(node.kind==='string')return JSON.stringify(v);return String(v)}
function jsonText(node){return [node.path,node.key,node.kind==='object'||node.kind==='array'?'':jsonLabel(node)].join(' ').toLowerCase()}
function jsonReveal(id){let p=jsonNodes[id].parent;while(p>=0){jsonCollapsed.delete(p);p=jsonNodes[p].parent}}
function jsonRender(){
 const q=$('json-search').value.trim().toLowerCase();jsonMatches=q?jsonNodes.filter(n=>jsonText(n).includes(q)).map(n=>n.id):[];
 if(q)jsonMatches.forEach(jsonReveal);
 jsonVisible=[];function walk(id){jsonVisible.push(id);if(!jsonCollapsed.has(id))jsonNodes[id].children.forEach(walk)}walk(0);
 if(!jsonVisible.includes(jsonActive))jsonActive=jsonVisible[0];
 $('json-tree').innerHTML=jsonVisible.map(id=>{const n=jsonNodes[id],branch=n.children.length>0,active=id===jsonActive,matched=q&&jsonMatches.includes(id);return `<div class="json-row${active?' json-active':''}${matched?' json-match':''}" role="treeitem" aria-level="${n.depth+1}" aria-selected="${active}" ${branch?`aria-expanded="${!jsonCollapsed.has(id)}"`:''} data-node="${id}" style="--indent:${n.depth}"><span class="json-toggle">${branch?(jsonCollapsed.has(id)?'▸':'▾'):'·'}</span><span class="json-key">${esc(n.key)}</span><span class="json-colon">:</span><span class="json-value json-${n.kind}">${esc(jsonLabel(n))}</span></div>`}).join('');
 $('json-count').textContent=q?`${jsonMatches.length} match${jsonMatches.length===1?'':'es'}`:`${jsonNodes.length} fields/nodes`;
 const current=jsonNodes[jsonActive];$('json-path').textContent=current.path;
 $('json-tree').querySelectorAll('.json-row').forEach(row=>row.onclick=()=>{const id=Number(row.dataset.node);if(jsonActive===id&&jsonNodes[id].children.length)jsonCollapsed.has(id)?jsonCollapsed.delete(id):jsonCollapsed.add(id);jsonActive=id;jsonRender()});
}
function jsonFocus(id){if(id===undefined||id===null)return;jsonReveal(id);jsonActive=id;jsonRender();$('json-tree').querySelector('.json-active')?.scrollIntoView({block:'nearest'})}
function jsonStepMatch(step){if(!jsonMatches.length)return;let at=jsonMatches.indexOf(jsonActive);jsonMatchIndex=at>=0?at:jsonMatchIndex;jsonMatchIndex=(jsonMatchIndex+step+jsonMatches.length)%jsonMatches.length;jsonFocus(jsonMatches[jsonMatchIndex])}
function setJsonMode(mode){
 const raw=mode==='raw';
 $('json-tree').hidden=raw;$('json-raw').hidden=!raw;$('json-toolbar').hidden=raw;
 $('json-path').hidden=raw;$('copy-path').hidden=raw;$('copy-value').hidden=raw;
 $('json-help').textContent=raw?'Raw JSON · read-only · select text or copy the complete document · Esc closes':'j/k move · h/l collapse/expand · Enter toggle · / search · n/N matches · g/G first/last · Esc close';
 $('json-view-tree').classList.toggle('active',!raw);$('json-view-raw').classList.toggle('active',raw);
 $('json-view-tree').setAttribute('aria-pressed',String(!raw));$('json-view-raw').setAttribute('aria-pressed',String(raw));
 (raw?$('json-raw'):$('json-tree')).focus();
}
$('json-view-tree').onclick=()=>setJsonMode('tree');
$('json-view-raw').onclick=()=>setJsonMode('raw');
function openJsonExplorer(data){jsonData=data;jsonNodes=[];jsonCollapsed=new Set();jsonBuild(data);jsonActive=0;jsonMatchIndex=-1;$('json-search').value='';$('json-raw').textContent=JSON.stringify(data,null,2);jsonRender();$('raw-dialog').showModal();setJsonMode('tree')}
$('json-search').addEventListener('input',()=>{jsonMatchIndex=-1;jsonRender();if(jsonMatches.length)jsonFocus(jsonMatches[0])});
$('json-next').onclick=()=>jsonStepMatch(1);$('json-prev').onclick=()=>jsonStepMatch(-1);
$('json-expand').onclick=()=>{jsonCollapsed.clear();jsonRender()};
$('json-collapse').onclick=()=>{jsonCollapsed=new Set(jsonNodes.filter(n=>n.children.length&&n.id!==0).map(n=>n.id));jsonActive=0;jsonRender()};
$('copy-path').onclick=()=>copy(jsonNodes[jsonActive]?.path||'$');
$('copy-value').onclick=()=>copy(JSON.stringify(jsonNodes[jsonActive]?.value,null,2));
$('raw-dialog').addEventListener('keydown',e=>{
 if(e.key==='Escape')return;
 if(!$('json-raw').hidden)return;
 if(e.target===$('json-search')){if(e.key==='Enter'){e.preventDefault();jsonStepMatch(e.shiftKey?-1:1);$('json-tree').focus()}return}
 if(e.target.closest('button'))return;
 const at=jsonVisible.indexOf(jsonActive),node=jsonNodes[jsonActive];let handled=true;
 switch(e.key){case '/':$('json-search').focus();$('json-search').select();break;
 case 'j':case 'ArrowDown':jsonFocus(jsonVisible[Math.min(at+1,jsonVisible.length-1)]);break;
 case 'k':case 'ArrowUp':jsonFocus(jsonVisible[Math.max(0,at-1)]);break;
 case 'l':case 'ArrowRight':if(node.children.length){if(jsonCollapsed.has(node.id)){jsonCollapsed.delete(node.id);jsonRender()}else jsonFocus(node.children[0])}break;
 case 'h':case 'ArrowLeft':if(node.children.length&&!jsonCollapsed.has(node.id)){jsonCollapsed.add(node.id);jsonRender()}else if(node.parent>=0)jsonFocus(node.parent);break;
 case 'Enter':case ' ':if(node.children.length){jsonCollapsed.has(node.id)?jsonCollapsed.delete(node.id):jsonCollapsed.add(node.id);jsonRender()}break;
 case 'n':jsonStepMatch(1);break;case 'N':jsonStepMatch(-1);break;
 case 'g':jsonFocus(jsonVisible[0]);break;case 'G':jsonFocus(jsonVisible[jsonVisible.length-1]);break;
 default:handled=false;
 }if(handled)e.preventDefault();
});

// Accessible, non-blocking alternative to browser-native alert for missing AAGUIDs.
function showAaguidNotice(d){
 const dialog=$('aaguid-notice');
 const isPlatform=String(d?.type||'').toLowerCase().includes('platform');
 $('aaguid-notice-body').textContent=isPlatform
 ? 'This platform authenticator has no exportable AAGUID in its metadata. Check its capabilities, or select a device with an AAGUID.'
 : 'This record has no valid exportable AAGUID. Inspect its raw metadata, or select another authenticator.';
 if(!dialog.open)dialog.showModal();
 $('aaguid-notice-ok').focus();
}
$('aaguid-notice-ok').onclick=()=>$('aaguid-notice').close();
$('aaguid-notice-x').onclick=()=>$('aaguid-notice').close();
$('aaguid-notice').addEventListener('click',e=>{if(e.target===$('aaguid-notice'))$('aaguid-notice').close()});
