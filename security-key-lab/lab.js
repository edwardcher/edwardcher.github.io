'use strict';
const $=id=>document.getElementById(id), te=new TextEncoder(), td=new TextDecoder();
const storageKey='edwardcher.webauthn.lab.v1.'+location.hostname; // Origin-specific browser storage; never shared between local and production.
const b64=buf=>{let s='';for(const b of new Uint8Array(buf))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const bytes=str=>Uint8Array.from(atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4)),c=>c.charCodeAt(0));
const random=n=>crypto.getRandomValues(new Uint8Array(n));
const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const read=()=>{try{const a=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(a)?a:[]}catch{return []}};
const save=a=>localStorage.setItem(storageKey,JSON.stringify(a));
const log=(message,kind='')=>{const now=new Date().toLocaleTimeString();$('output').textContent=`[${now}] ${message}`;$('output').style.color=kind==='error'?'#ffb0a6':kind==='ok'?'#79efba':'#c4e5dc'};
// The RP ID must match the hostname serving this document, not the deployment domain.
// Use localhost for local WebAuthn; loopback IP literals are not valid RP IDs.
const rpId=location.hostname;
const explicitRpId = /^(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i.test(rpId) ? rpId : undefined;
// WebAuthn RP IDs are domains, not arbitrary IP literals. On loopback IPs,
// let the browser derive the RP ID; localhost is the recommended test origin.

function assertWebAuthnContext(){
 if(location.protocol==='file:')throw new DOMException('This page was opened as a file. Start `zola serve` and open http://localhost:1111/security-key-lab/ (or use HTTPS on edwardcher.online).','SecurityError');
 if(!window.isSecureContext)throw new DOMException('WebAuthn requires HTTPS, localhost, or a trustworthy loopback origin. Current origin: '+location.origin,'SecurityError');
 if(!navigator.credentials?.create||!navigator.credentials?.get)throw new DOMException('WebAuthn is unavailable in this browser or context.','NotSupportedError');
 if(window.top!==window.self){
  try{if(window.top.location.origin!==location.origin)throw new DOMException('Cross-origin iframe: open the lab directly in a tab at '+location.origin+'/security-key-lab/','SecurityError');}
  catch(e){throw new DOMException('Embedded cross-origin context: open the lab directly in a tab.','SecurityError');}
 }
}

function newTestIdentity(){
 const input=$('username');const name=window.prompt('New test identity (existing credentials are preserved):','security-key-lab-'+Math.random().toString(36).slice(2,7));
 if(name===null)return;const value=name.trim();if(!value||value.length>64){window.alert('Enter 1–64 characters.');return;}
 input.value=value;input.focus();const note=$('identity-workflow-note');if(note)note.textContent='New identity selected. Register to create a credential. Existing records and card credentials are unchanged.';
}
function refresh(){
 const records=read(),select=$('credential'),old=select.value;
 select.replaceChildren();
 if(!records.length)select.add(new Option('No local credentials',''));
 for(const r of records)select.add(new Option(r.username+' · '+r.id.slice(0,13)+'…',r.id));
 if(records.some(x=>x.id===old))select.value=old;
 $('stored').textContent='LOCAL CREDENTIALS: '+records.length;
 renderBrowserRecordInventory();
}
function renderBrowserRecordInventory(){
 const list=$('browser-record-inventory');if(!list)return;
 const records=read(),selected=$('credential').value;
 list.replaceChildren();
 if(!records.length){const empty=document.createElement('div');empty.className='browser-record-empty';empty.textContent='No browser test records yet. Register a credential to see it here.';list.append(empty);return;}
 const fmt=iso=>{if(!iso)return 'Not recorded';const date=new Date(iso);return Number.isNaN(date.getTime())?'Not recorded':date.toLocaleString();};
 for(const r of records){
  const item=document.createElement('div');item.className='browser-record-item'+(r.id===selected?' is-selected':'');item.setAttribute('role','listitem');
  const top=document.createElement('div');top.className='browser-record-main';
  const name=document.createElement('div');name.className='browser-record-identity';name.textContent=r.username||'Unnamed test identity';
  const select=document.createElement('button');select.type='button';select.className='browser-record-select';select.textContent=r.id===selected?'SELECTED':'SELECT';select.disabled=activeCeremony||r.id===selected;
  select.setAttribute('aria-label','Select '+(r.username||'unnamed identity')+' for credential-ID authentication');
  select.addEventListener('click',()=>{
   if(activeCeremony)return;
   const field=$('credential');field.value=r.id;field.dispatchEvent(new Event('change',{bubbles:true}));
   renderBrowserRecordInventory();managementMessage('Selected '+(r.username||'test identity')+'. Use AUTHENTICATE for credential-ID sign-in, or DISCOVERABLE SIGN-IN to let the authenticator choose.');
  });
  top.append(name,select);
  const status=document.createElement('div');status.className='browser-record-tag';
  status.textContent=r.discoverable===true?'Discoverable · confirmed':r.discoverable===false?'Non-discoverable · reported':r.discoverableRequired?'Discoverable · required':'Discoverability · unknown';
  const meta=document.createElement('div');meta.className='browser-record-meta';
  const alg=r.alg===-7?'ES256':r.alg===-257?'RS256':'Algorithm unknown';
  meta.textContent='ID '+String(r.id||'').slice(0,16)+'… · '+alg+' · '+(r.transports?.join(', ')||'Transport unreported')+'\nRegistered: '+fmt(r.created)+' · Last verified: '+fmt(r.lastVerifiedAt);
  meta.style.whiteSpace='pre-line';item.append(top,status,meta);list.append(item);
 }
}
// A native FIDO PIN dialog is owned by the browser/OS. Avoid overlapping
// ceremonies and changes to form controls while that dialog is active.
let activeCeremony = false;
function busy(v){
 activeCeremony = v;
 for(const id of ['enroll','auth','discover','clear','forget-all','new-test-identity','credential','username','test-profile','uv','resident','strict','identify-authenticator']){
  const control=$(id); if(control)control.disabled=v;
 }
 setDeviceState(v?'prompt':'idle');
 renderBrowserRecordInventory();
}
function setDeviceState(mode){for(const id of ['usb','card']){const el=$(id+'-method'),status=$(id+'-state');el.classList.toggle('ceremony-active',mode==='prompt');if(mode==='prompt'){status.textContent='Waiting for browser response';}else if(!el.classList.contains('transport-confirmed')){status.textContent='Ready for testing';}}}
function progress(n){for(let i=1;i<=3;i++)$('step'+i).className='step'+(i===n?' active':i<n?' done':'')}
let lastCapabilities={};
async function capabilities(){try{lastCapabilities=await PublicKeyCredential.getClientCapabilities?.()||{}}catch(e){lastCapabilities={error:e.message}}$('capability').textContent='BROWSER CAPABILITIES: '+(Object.keys(lastCapabilities).length||'not reported');return lastCapabilities}

function parseDerSignature(der,size=32){ // WebAuthn ECDSA signatures use ASN.1 DER; WebCrypto expects IEEE P1363 r||s.
 const b=new Uint8Array(der);let i=0;const length=()=>{let n=b[i++];if(n<128)return n;const c=n&127;if(c>3||!c)throw Error('Invalid DER length');n=0;for(let k=0;k<c;k++)n=(n<<8)|b[i++];return n};
 if(b[i++]!==0x30)throw Error('Invalid ECDSA signature');const seqLen=length(),end=i+seqLen;if(end!==b.length)throw Error('Invalid ECDSA sequence length');
 const integer=()=>{if(b[i++]!==0x02)throw Error('Invalid DER integer');const len=length();let x=b.slice(i,i+len);i+=len;while(x.length>size&&x[0]===0)x=x.slice(1);if(x.length>size)throw Error('Invalid ECDSA integer size');const out=new Uint8Array(size);out.set(x,size-x.length);return out};
 const r=integer(),s=integer();if(i!==end)throw Error('Trailing DER signature bytes');const out=new Uint8Array(size*2);out.set(r);out.set(s,size);return out;
}
function authDataInfo(buffer){const a=new Uint8Array(buffer);if(a.length<37)throw Error('Authenticator data too short');const view=new DataView(a.buffer,a.byteOffset,a.byteLength);return {rpHash:a.slice(0,32),flags:a[32],count:view.getUint32(33,false)}}
// AAGUID is 16 bytes at offset 37 in authenticatorData when the AT flag (0x40) is set.
// This is a model/class identifier; without verified attestation it is not proof of manufacturer.
function registrationAaguid(buffer){
 const a=new Uint8Array(buffer);
 if(a.length<53 || !(a[32]&0x40))return null;
 const h=Array.from(a.slice(37,53),x=>x.toString(16).padStart(2,'0')).join('');
 if(/^0{32}$/.test(h))return null;
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function renderAuthenticatorDetails(record){
 const panel=$('authenticator-details');if(!panel)return;
 panel.hidden=!record;if(!record){panel.open=false;return;}
 const facts=$('authenticator-details-facts');facts.replaceChildren();
 const rows=[['Algorithm',record.alg===-7?'ES256':record.alg===-257?'RS256':'Not reported'],['Transport',record.transports?.length?record.transports.join(', ').toUpperCase():'Not reported'],['Attachment',record.attachment||'Not reported'],['AAGUID',record.aaguid||'Not reported']];
 for(const [label,value] of rows){const box=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');small.textContent=label;strong.textContent=value;box.append(small,strong);facts.append(box)}
 const link=$('authenticator-mds-link'),fallback=$('authenticator-no-aaguid');
 link.hidden=!record.aaguid;fallback.hidden=true;
 if(record.aaguid)link.href='/fido-mds-explorer/?aaguid='+encodeURIComponent(record.aaguid);
 link.textContent='Find matching AAGUID in FIDO MDS ↗';
}
function clientData(buffer,type,challenge){const d=JSON.parse(td.decode(buffer));if(d.type!==type)throw Error('Unexpected WebAuthn operation');if(d.challenge!==b64(challenge))throw Error('Challenge mismatch');if(d.origin!==location.origin)throw Error('Origin mismatch');if(d.crossOrigin===true)throw Error('Cross-origin request rejected');return d}
// Default: prioritize external physical authenticators without requesting synced passkeys.
// Custom mode preserves the previous low-level test controls.
function testProfile(){return $('test-profile')?.value||'hardware'}
function profileResidentKey(){const p=testProfile();return p==='custom'?($('resident').checked?'required':'preferred'):p==='discoverable'?'required':'discouraged'}
function profileUV(){const p=testProfile();return p==='custom'?($('uv').checked?'required':'preferred'):p==='pin'||p==='discoverable'?'required':'discouraged'}
function applyTestProfile(){const p=testProfile();const custom=$('custom-test-options');if(custom)custom.hidden=p!=='custom';const description=$('profile-explainer');if(description)description.textContent={hardware:'Physical security key: no PIN or resident credential requested. Choose More Options → Security Key if your OS offers a platform passkey.',pin:'Require PIN or biometric user verification; the UV flag must be present.',discoverable:'Require a resident credential and user verification. Use Discoverable sign-in to test without a credential ID.',custom:'Adjust the individual WebAuthn flags below. Browser dialogs remain outside website control.'}[p];if(p!=='custom'){$('strict').checked=true;$('identify-authenticator').checked=false;}}
$('test-profile')?.addEventListener('change',applyTestProfile);applyTestProfile();
async function enroll(){if(activeCeremony)return;busy(true);try{
 assertWebAuthnContext();
 const username=$('username').value.trim();if(!username)throw Error('Enter a test identity');
 const challenge=random(32),userId=random(24),old=read(),requestedUV=profileUV(),requestedRK=profileResidentKey();
 progress(1);const options={challenge,rp:{...(explicitRpId?{id:explicitRpId}:{}),name:'Edwardcher Security-Key Lab'},user:{id:userId,name:username,displayName:username},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],timeout:120000,attestation:$('identify-authenticator')?.checked?'direct':'none',...($('strict').checked?{hints:['security-key']}:{} ),authenticatorSelection:{authenticatorAttachment:$('strict').checked?'cross-platform':undefined,residentKey:requestedRK,userVerification:requestedUV},extensions:{credProps:true},excludeCredentials:old.filter(x=>x.username===username).map(x=>({type:'public-key',id:bytes(x.id),transports:x.transports||['usb','nfc']}))};
 beginDiagnostic('registration',options);
 log('Starting hardware-key registration…\nInsert/present your key or FIDO2 smart card; follow the browser PIN/touch prompts.');
 progress(2);const c=await navigator.credentials.create({publicKey:options});progress(3);if(!c||c.type!=='public-key')throw Error('No WebAuthn credential returned');
 clientData(c.response.clientDataJSON,'webauthn.create',challenge);
 const key=c.response.getPublicKey?.(),alg=c.response.getPublicKeyAlgorithm?.();if(!key||![-7,-257].includes(alg))throw Error('Browser cannot export supported credential public key (SPKI); no record saved');
 const info=authDataInfo(c.response.getAuthenticatorData());const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(rpId)));if(!equal(info.rpHash,expected))throw Error('RP ID hash mismatch');if(!(info.flags&1))throw Error('User presence not set');if(requestedUV==='required'&&!(info.flags&4))throw Error('User verification not set');
 const entry={id:b64(c.rawId),username,userId:b64(userId),spki:b64(key),alg,transports:c.response.getTransports?.()||[],created:new Date().toISOString(),count:info.count,uvRequired:requestedUV==='required',attachment:c.authenticatorAttachment||'unknown',aaguid:registrationAaguid(c.response.getAuthenticatorData()),attestationRequested:!!$('identify-authenticator')?.checked,discoverable:c.getClientExtensionResults()?.credProps?.rk??null,discoverableRequired:requestedRK==='required'};
 const updated=old.filter(x=>x.id!==entry.id);updated.push(entry);save(updated);refresh();$('credential').value=entry.id;
 successDiagnostic('registration',responseData(c),{summary:'Credential created and locally recorded. Browser-returned authenticator data and origin checks passed; attestation was not verified by a server.',rpId,origin:location.origin,algorithm:alg,authenticatorAttachment:entry.attachment,userPresent:!!(info.flags&1),userVerified:!!(info.flags&4),discoverable:c.getClientExtensionResults()?.credProps?.rk??null,discoverableRequired:requestedRK==='required',discoverableEvidence:c.getClientExtensionResults()?.credProps?.rk===true?'credProps.rk=true':requestedRK==='required'?'residentKey=required; extension not confirmed':'not established',signCount:info.count,attestationVerified:false,aaguid:entry.aaguid});
 renderAuthenticatorDetails(entry);
 progress(3);log('REGISTERED · LOCAL DEMO ONLY\nUser: '+username+'\nAlgorithm: '+(alg===-7?'ES256':'RS256')+'\nAttachment: '+entry.attachment+'\nUser verified: '+!!(info.flags&4)+'\nDiscoverable: '+String(c.getClientExtensionResults()?.credProps?.rk??(requestedRK==='required'?'required by registration (credProps unavailable)':'not reported'))+'\nCredential: '+entry.id.slice(0,22)+'…\nAttestation NOT validated; registration NOT server-trusted.','ok');
 }catch(e){failDiagnostic('registration',e);log(e.name==='InvalidStateError'?'REGISTRATION NOT COMPLETED\nExisting credential may be recognized. Choose Authenticate for the enrolled key, or present a different key/card to register. See Overview for details.':['NotAllowedError','AbortError'].includes(e.name)?'REGISTRATION NOT COMPLETED\nBrowser prompt closed, timed out, or was blocked. Open Overview for guidance; Raw WebAuthn retains the exception.':'REGISTRATION NOT COMPLETED\n'+e.name+': '+e.message,['NotAllowedError','AbortError','InvalidStateError'].includes(e.name)?'info':'error')}finally{busy(false)}}
async function authenticate(discoverable=false){if(activeCeremony)return;busy(true);try{
 assertWebAuthnContext();
 const selected=read().find(x=>x.id===$('credential').value);if(!discoverable&&!selected)throw Error('Enroll a credential first in this browser');if(discoverable&&!read().length)throw Error('No local credential public key is available. Register a discoverable credential first.');
 const requestedUV=discoverable?'required':profileUV();
 const challenge=random(32),options={challenge,...(explicitRpId?{rpId:explicitRpId}:{}),timeout:120000,userVerification:requestedUV,...($('strict').checked?{hints:['security-key']}:{} ),allowCredentials:discoverable?[]:[{type:'public-key',id:bytes(selected.id),transports:selected.transports.length?selected.transports:undefined}]};progress(1);beginDiagnostic(discoverable?'discoverable authentication':'authentication',options);
 log(discoverable?'Requesting discoverable assertion (no credential IDs supplied)…\nKeep the NFC card steady. Safari controls PIN entry; do not repeatedly retry if the native prompt reports an incorrect PIN.':'Requesting signed assertion…\nPresent the same security key / smart card and complete the browser prompts.');
 progress(2);const c=await navigator.credentials.get({publicKey:options});progress(3);if(!c||c.type!=='public-key')throw Error('No WebAuthn assertion returned');
 const record=discoverable?read().find(x=>x.id===b64(c.rawId)):selected;if(!record)throw Error('Credential selected by the browser is not in this lab’s local records. Its public key is unavailable for local signature verification; register it in this browser or select a saved credential.');if(b64(c.rawId)!==record.id)throw Error('Credential ID mismatch');
 if(discoverable&&c.response.userHandle&&b64(c.response.userHandle)!==record.userId)throw Error('Discoverable assertion user handle does not match the locally registered identity');
 clientData(c.response.clientDataJSON,'webauthn.get',challenge);
 const info=authDataInfo(c.response.authenticatorData),expected=new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(rpId)));if(!equal(info.rpHash,expected))throw Error('RP ID hash mismatch');if(!(info.flags&1))throw Error('User presence flag absent');if(requestedUV==='required'&&!(info.flags&4))throw Error('Required user verification absent');
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',c.response.clientDataJSON));const data=new Uint8Array(c.response.authenticatorData.byteLength+hash.length);data.set(new Uint8Array(c.response.authenticatorData));data.set(hash,c.response.authenticatorData.byteLength);
 const isEc=record.alg===-7;const key=await crypto.subtle.importKey('spki',bytes(record.spki),isEc?{name:'ECDSA',namedCurve:'P-256'}:{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const sig=isEc?parseDerSignature(c.response.signature):new Uint8Array(c.response.signature);const verified=await crypto.subtle.verify(isEc?{name:'ECDSA',hash:'SHA-256'}:'RSASSA-PKCS1-v1_5',key,sig,data);if(!verified)throw Error('Cryptographic assertion signature INVALID');
 if(info.count&&record.count&&info.count<=record.count)throw Error('Signature counter did not advance; investigate authenticator state');
 const updated=read();const index=updated.findIndex(x=>x.id===record.id);if(index>=0){updated[index].count=info.count;save(updated)}
 renderAuthenticatorDetails(record);
 const updatedRecords=read();const verifiedRecord=updatedRecords.find(x=>x.id===record.id);if(verifiedRecord){verifiedRecord.lastVerifiedAt=new Date().toISOString();save(updatedRecords);renderBrowserRecordInventory();}
 successDiagnostic(discoverable?'discoverable authentication':'authentication',responseData(c),{summary:discoverable?'Discoverable sign-in succeeded: no credential IDs were supplied in allowCredentials, and the returned assertion signature was verified against a locally stored public key. This does not establish when or how that credential was registered.':'Signature verified using the locally stored public key. This is not a server-authenticated session.',rpId,origin:location.origin,algorithm:record.alg,signatureVerified:true,userPresent:!!(info.flags&1),userVerified:!!(info.flags&4),discoverableRequest:discoverable,allowCredentialsCount:options.allowCredentials.length,returnedUserHandle:c.response.userHandle?b64(c.response.userHandle):null,userHandleMatched:discoverable&&!!c.response.userHandle?b64(c.response.userHandle)===record.userId:null,signCount:info.count});
 log((discoverable?'✓  DISCOVERABLE SIGN-IN VERIFIED LOCALLY\n  allowCredentials: empty; credential selected by authenticator/browser\n\n':'✓  ASSERTION VERIFIED LOCALLY\n\n')+'IDENTITY\n  User: '+record.username+'\n  Credential: '+record.id.slice(0,18)+'…\n\nCRYPTOGRAPHY\n  Signature: VALID ('+(isEc?'ES256':'RS256')+')\n  Signature counter: '+info.count+'\n\nRELYING PARTY\n  Origin: '+location.origin+'\n  RP ID: '+rpId+'\n\nAUTHENTICATOR FLAGS\n  User present: YES\n  User verified: '+((info.flags&4)?'YES':'NO (not required)')+'\n\nBOUNDARY\n  Browser-local verification only; no server session.','ok');
 }catch(e){failDiagnostic(discoverable?'discoverable authentication':'authentication',e);log(['NotAllowedError','AbortError'].includes(e.name)?'AUTHENTICATION NOT COMPLETED\nBrowser prompt closed, timed out, or was blocked. Open Overview for guidance; Raw WebAuthn retains the exception.':'AUTHENTICATION NOT COMPLETED\n'+e.name+': '+e.message,['NotAllowedError','AbortError'].includes(e.name)?'info':'error')}finally{busy(false)}}

// A browser page cannot enumerate connected FIDO2 USB/NFC authenticators.
// NoDevice claims are intentionally avoided: NotAllowedError is ambiguous.
let diagnostic={operation:'idle',state:'ready',overview:'Choose Enroll security key to begin.',next:'Connect a FIDO2 security key or present an NFC FIDO2 card when prompted.',request:null,response:null,verification:null,error:null};
const normalize=(value)=>JSON.parse(JSON.stringify(value,(key,v)=>{
 if(v instanceof ArrayBuffer)return {base64url:b64(v),byteLength:v.byteLength};
 if(ArrayBuffer.isView(v))return {base64url:b64(v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength)),byteLength:v.byteLength};
 return v;
}));
function guidance(error,operation){
 const name=error?.name||'Error',message=String(error?.message||'Unknown error');
 if(name==='NotAllowedError')return {title:operation==='registration'?'Registration not completed':'Authentication not completed',next:'You may have cancelled the browser prompt, the request may have timed out, or the browser may have blocked it. To test a physical key, select “Use Security Key” instead of “Scan QR Code”, present your key or Crescendo card, and follow the browser prompts. The browser does not reliably reveal the exact cause.'};
 if(name==='NotAllowedError'&&operation==='discoverable authentication')return {title:'Discoverable sign-in was not completed by the browser',next:'If Safari reports an incorrect PIN or the PIN insertion cursor moves without typing, stop retrying to avoid PIN lockout. Keep the NFC card steady, dismiss the system prompt, and try a fresh ceremony once. If it persists, compare a USB reader or another browser. The lab cannot read PIN input or diagnose CTAP PIN status from WebAuthn.'};
 if(name==='NotFoundError')return {title:'No matching authenticator or credential was available to the browser',next:'Check USB-C connection or NFC positioning and confirm the card/key supports FIDO2. This does not prove that no hardware is physically connected.'};
 if(name==='SecurityError')return {title:'This browser context cannot complete WebAuthn',next:message+' Local testing: run `zola serve` and open http://localhost:1111/security-key-lab/ in its own tab. Production: use https://edwardcher.online/security-key-lab/. Enroll separately for each RP ID.'};
 if(name==='InvalidStateError'&&operation==='registration')return {title:'Credential may already exist on this key',next:'The browser did not create a new credential. If this is the previously enrolled key/card, choose Authenticate. To enroll another key/card, present that different device when prompted. The browser does not disclose which excluded credential caused the error.'};
 if(name==='NotSupportedError')return {title:'The browser or authenticator does not support the requested configuration',next:'Try a supported FIDO2 key and compatible browser. Review algorithm and authenticator preference settings.'};
 if(name==='AbortError')return {title:'The WebAuthn request was interrupted',next:'Retry the operation and complete the browser prompt.'};
 if(message.includes('Enroll a credential first'))return {title:'No locally registered credential is selected',next:'Choose Enroll security key first. Registration is tied to this browser and website origin; an existing credential from another site will not appear here.'};
 if(message.includes('Enroll a discoverable credential first'))return {title:'No local discoverable credential is available',next:'Enable “Require discoverable credential” under Authentication preferences, enroll your key, then retry passwordless authentication.'};
 if(name==='TypeError')return {title:'The browser could not process the WebAuthn request',next:'Check browser support, request parameters and available authenticator capabilities in Raw WebAuthn.'};
 return {title:operation+' did not complete',next:'Review the browser error and request details. Confirm your key or card supports FIDO2 and try again.'};
}
function showDiagnostic(){
 const heading=$('diag-heading'),message=$('diag-message'),next=$('diag-next'),status=$('diag-status');
 const duplicate=diagnostic.operation==='registration'&&diagnostic.error?.name==='InvalidStateError'&&diagnostic.request?.excludeCredentials?.length>0;
 const quick=$('diag-context-action');if(quick){quick.hidden=!duplicate;quick.textContent='AUTHENTICATE EXISTING CREDENTIAL →';quick.disabled=!read().length;}
 heading.textContent=diagnostic.overview;message.textContent=diagnostic.state==='interrupted'?'The browser did not complete the request. No new credential was saved by this test. The exact reason is not available.':duplicate?'No new credential was created. This authenticator may recognize a credential already registered for this site.':diagnostic.error?diagnostic.error.name+': '+diagnostic.error.message:(diagnostic.verification?.summary||'');next.textContent=diagnostic.next;
 status.textContent=diagnostic.state==='ok'?'VERIFIED LOCALLY':diagnostic.state==='error'?'ACTION NEEDED':diagnostic.state==='interrupted'?'NOT COMPLETED':diagnostic.state==='pending'?'BROWSER PROMPT':'READY';status.dataset.state=diagnostic.state;$('diag-interrupted-actions').hidden=diagnostic.state!=='interrupted';$('diag-retry').textContent=diagnostic.operation==='registration'?'↻ TRY REGISTRATION AGAIN':diagnostic.operation==='discoverable authentication'?'↻ RETRY DISCOVERABLE SIGN-IN':'↻ TRY AUTHENTICATION AGAIN';
 const raw={operation:diagnostic.operation,state:diagnostic.state,request:diagnostic.request,response:diagnostic.response,verification:diagnostic.verification,error:diagnostic.error,note:'Diagnostic data is local to this page. Never treat browser-side verification as trusted server authentication.'};
 $('diag-raw').textContent=JSON.stringify(raw,null,2);
 const title=$('ceremony-title'),description=$('ceremony-description'),facts=$('ceremony-facts'),icon=$('ceremony-icon');
 const v=diagnostic.verification||{},resp=diagnostic.response||{};
 const state=diagnostic.state;
 title.textContent=state==='ok'?(diagnostic.operation==='registration'?'Registration successful':diagnostic.operation==='discoverable authentication'?'Discoverable sign-in verified locally':'Authentication verified locally'):state==='interrupted'?'Operation not completed':state==='error'?'Action needed':state==='pending'?'Waiting for browser':'Ready to test';
 description.textContent=state==='ok'?(diagnostic.operation==='registration'?'Credential saved in this browser. Attestation not server-validated.':diagnostic.operation==='discoverable authentication'?'No credential ID supplied in request; browser selected a credential and its assertion signature verified locally. No server session.':'Assertion signature verified in this browser. No server session created.'):state==='interrupted'?'The browser did not complete the request. Retry when ready.':state==='error'?(duplicate?'The browser may have recognized an existing credential. Authenticate with that key, or present a different key to enroll.':diagnostic.next):state==='pending'?'Follow the system prompt. NFC cards may need to be presented again after the FIDO2 PIN step.':'Enroll a key or authenticate with an existing local credential.';
 icon.textContent=state==='ok'?'✓':state==='error'?'!':state==='interrupted'?'–':state==='pending'?'…':'○';
 $('ceremony-summary').dataset.state=state;
 const discoverableNext=$('discoverable-next-action');
 if(discoverableNext){
  discoverableNext.hidden=!(state==='ok'&&diagnostic.operation==='registration'&&v.discoverableRequired===true);
 }
 const recovery=$('ceremony-recovery'),recoveryButton=$('ceremony-recovery-action'),recoveryWhy=$('ceremony-recovery-why'),recoveryExplanation=$('ceremony-recovery-explanation');
 const recoverable=state==='error'||state==='interrupted';
 recovery.hidden=!recoverable;
 if(recoverable){
  const action=duplicate?'authenticate':state==='interrupted'?'retry':diagnostic.error?.message?.includes('Required user verification absent')?'pin':'details';
  recovery.dataset.action=action;
  recoveryButton.textContent=action==='authenticate'?'AUTHENTICATE EXISTING KEY →':action==='retry'?'RETRY '+(diagnostic.operation==='registration'?'REGISTRATION':diagnostic.operation==='discoverable authentication'?'DISCOVERABLE SIGN-IN':'AUTHENTICATION')+' →':action==='pin'?'RETRY WITH PIN / USER VERIFICATION →':'VIEW TECHNICAL DETAILS →';
  recoveryButton.disabled=action==='authenticate'&&!read().length;
  recoveryWhy.open=false;
  recoveryExplanation.textContent=duplicate?'The authenticator may recognize a credential already registered for this relying party. The browser does not reveal which credential caused the conflict. No new credential was created.':diagnostic.error?.name==='NotAllowedError'?'The browser prompt was closed, timed out, or blocked. This does not prove the security key is absent.':diagnostic.next;
  title.textContent=duplicate?'Key may already be registered':state==='interrupted'?'Browser request not completed':diagnostic.overview;
  description.textContent=duplicate?'This key may already have a credential for this site. Try signing in with the existing key.':state==='interrupted'?diagnostic.operation==='registration'?'No new credential was created. Retry registration when ready.':'The browser did not complete sign-in. Present the card again if requested, or retry.':diagnostic.error?.message?.includes('Required user verification absent')?'The authenticator did not confirm the required PIN or biometric verification.':diagnostic.next;
 }
 facts.hidden=state!=='ok';
 if(state==='ok'){
  const algorithm=v.algorithm===-7?'ES256':v.algorithm===-257?'RS256':v.algorithm||'ES256';
  const transports=Array.isArray(resp.transports)?resp.transports:[];
  const rows=diagnostic.operation==='registration'?[['Algorithm',algorithm],['Discoverable',v.discoverable===true?'Confirmed by credProps':v.discoverable===false?'Not discoverable':v.discoverableRequired?'Required by registration':'Not reported'],['Trust','Browser-local only']]:[['Signature','Valid'],['Mode',diagnostic.operation==='discoverable authentication'?'Discoverable sign-in (0 IDs)':'Credential-ID sign-in'],['UV',v.userVerified?'Confirmed':'Not reported'],['Trust','Browser-local only']];
  facts.replaceChildren(...rows.map(([label,value])=>{const row=document.createElement('div');const l=document.createElement('span');const r=document.createElement('strong');l.textContent=label;r.textContent=value;row.append(l,r);return row;}));
  for(const method of ['usb','card']){$(method+'-method').classList.remove('transport-confirmed');}
  if(diagnostic.operation==='registration'&&transports.length){
   const method=transports.includes('nfc')?'card':transports.some(t=>['usb','hybrid'].includes(t))?'usb':null;
   if(method){$(method+'-method').classList.add('transport-confirmed');$(method+'-state').textContent=(method==='card'?'NFC':'USB')+' transport reported · last registration';}
  }
 }

 window.dispatchEvent(new CustomEvent('fido-lab-diagnostic',{detail:raw}));
}
function beginDiagnostic(operation,request){renderAuthenticatorDetails(null);for(const method of ['usb','card']){const el=$(method+'-method');el.classList.remove('transport-confirmed');$(method+'-state').textContent='Ready for testing';}diagnostic={operation,state:'pending',overview:'Waiting for the browser and authenticator',next:'Insert or tap your FIDO2 key/card and complete any browser PIN or touch prompt. The page cannot determine physical device presence.',request:normalize(request),response:null,verification:null,error:null};showDiagnostic()}
function successDiagnostic(operation,response,verification){diagnostic={...diagnostic,operation,state:'ok',overview:operation==='registration'?'Security key registered in this browser':'Security-key assertion verified locally',next:operation==='registration'?'You can now select Authenticate. Open Raw WebAuthn to inspect the registration exchange.':'Review the origin, RP ID, user-presence flags and signature verification in Raw WebAuthn.',response:normalize(response),verification};showDiagnostic()}
function failDiagnostic(operation,e){renderAuthenticatorDetails(null);const g=guidance(e,operation);const neutral=['NotAllowedError','AbortError'].includes(e?.name);diagnostic={...diagnostic,operation,state:neutral?'interrupted':'error',overview:e?.name==='NotAllowedError'?(operation==='registration'?'Registration not completed':'Authentication not completed'):g.title,next:g.next,error:{name:e?.name||'Error',message:String(e?.message||e)}};showDiagnostic()}
function responseData(c){return {id:c.id,type:c.type,authenticatorAttachment:c.authenticatorAttachment||null,clientDataJSON:c.response?.clientDataJSON?b64(c.response.clientDataJSON):null,authenticatorData:c.response?.getAuthenticatorData?b64(c.response.getAuthenticatorData()):c.response?.authenticatorData?b64(c.response.authenticatorData):null,attestationObject:c.response?.attestationObject?b64(c.response.attestationObject):null,signature:c.response?.signature?b64(c.response.signature):null,userHandle:c.response?.userHandle?b64(c.response.userHandle):null,transports:c.response?.getTransports?.()||[],extensions:c.getClientExtensionResults?.()||{}}}
$('ceremony-recovery-action')?.addEventListener('click',()=>{
 const action=$('ceremony-recovery')?.dataset.action;
 if(action==='authenticate'){
  const selected=read().find(x=>x.id===$('credential').value);
  if(!selected&&read().length)$('credential').value=read()[0].id;
  authenticate(false);
 }else if(action==='retry'){
  if(diagnostic.operation==='registration')enroll();else authenticate(diagnostic.operation==='discoverable authentication');
 }else if(action==='pin'){
  const profile=$('test-profile');if(profile){profile.value='pin';profile.dispatchEvent(new Event('change',{bubbles:true}));}
  if(diagnostic.operation==='registration')enroll();else authenticate(diagnostic.operation==='discoverable authentication');
 }else{
  const details=$('test-details');details.open=true;details.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
});
$('diag-context-action')?.addEventListener('click',()=>{const selected=read().find(x=>x.id===$('credential').value);if(!selected&&read().length)$('credential').value=read()[0].id;authenticate(false)});
$('diag-retry').addEventListener('click',()=>{if(diagnostic.operation==='registration')enroll();else authenticate(diagnostic.operation==='discoverable authentication')});
$('diag-summary-tab').addEventListener('click',()=>selectDiagnosticTab('summary'));
$('diag-raw-tab').addEventListener('click',()=>selectDiagnosticTab('raw'));
function selectDiagnosticTab(tab){const raw=tab==='raw';$('diag-summary').hidden=raw;$('diag-raw-panel').hidden=!raw;for(const [id,active] of [['diag-summary-tab',!raw],['diag-raw-tab',raw]]){$(id).setAttribute('aria-selected',String(active));$(id).tabIndex=active?0:-1}}
$('diag-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('diag-raw').textContent);$('diag-copy').textContent='COPIED';setTimeout(()=>$('diag-copy').textContent='COPY RAW',1200)}catch(e){$('diag-copy').textContent='COPY UNAVAILABLE'}});
$('diag-raw').addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;const box=$('diag-raw');if(e.key==='j'||e.key==='ArrowDown'){box.scrollTop+=24;e.preventDefault()}else if(e.key==='k'||e.key==='ArrowUp'){box.scrollTop-=24;e.preventDefault()}else if(e.key==='g'){box.scrollTop=0;e.preventDefault()}else if(e.key==='G'){box.scrollTop=box.scrollHeight;e.preventDefault()}});
// Optional shortcuts only when focus is outside form fields and editable controls.
document.addEventListener('keydown',e=>{if(e.composedPath().some(node=>node instanceof HTMLDialogElement && node.open)||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea,button,[contenteditable],pre'))return;if(e.key==='2')selectDiagnosticTab('raw')});
showDiagnostic();
selectDiagnosticTab('raw');


// Passive readiness inspection: WebAuthn deliberately does not expose general-purpose key/card enumeration.
$('probe-key').addEventListener('click',async()=>{
 const result=$('probe-result');result.hidden=false;result.textContent='Checking browser capabilities and local registration records…';
 await capabilities();
 const record=read().find(x=>x.id===$('credential').value);
 const lines=['BROWSER & ORIGIN','  Secure context: '+(isSecureContext?'YES':'NO'),'  WebAuthn API: '+(!!navigator.credentials?.create&&!!navigator.credentials?.get?'AVAILABLE':'UNAVAILABLE'),'  RP ID: '+rpId,'  Browser capabilities: '+Object.keys(lastCapabilities).length+' reported','', 'LOCAL CREDENTIAL RECORD'];
 if(record){lines.push('  Identity: '+record.username,'  Credential ID: '+record.id.slice(0,22)+'…','  Algorithm: '+(record.alg===-7?'ES256':record.alg===-257?'RS256':String(record.alg)),'  Reported transports: '+(record.transports?.join(', ')||'not reported'),'  Attachment: '+(record.attachment||'not reported'),'  Last stored counter: '+(record.count??'not available'),'  Created: '+(record.created||'not recorded'));}
 else lines.push('  No local credential selected.');
 lines.push('','PHYSICAL AUTHENTICATOR','  Presence: NOT EXPOSED TO WEBSITES','  CTAP getInfo / APDUs: NOT ACCESSIBLE FROM WEB AUTHN','  PIN / UV: determined by browser ceremony and authenticator','', 'NEXT STEP','  To verify the actual key/card, select Authenticate.','  For raw CTAP/APDU inspection use a separate local tool.');
 result.textContent=lines.join('\n');
});

const managementPanel=$('credential-management');
const clearDialog=$('browser-clear-dialog');
let pendingClear=null;
function updateManagementCount(){const n=read().length;$('browser-record-count').textContent=n+' browser-local test record'+(n===1?'':'s')+' saved. These are not an inventory of credentials on your device.';}
function managementMessage(message){$('management-feedback').textContent=message;}
function closeClearDialog(){clearDialog.hidden=true;pendingClear=null;}
$('manage-credentials').addEventListener('click',()=>{managementPanel.hidden=!managementPanel.hidden;$('manage-credentials').setAttribute('aria-expanded',String(!managementPanel.hidden));$('manage-credentials').textContent=managementPanel.hidden?'BROWSER RECORDS & DEVICE GUIDE':'CLOSE RECORDS & DEVICE GUIDE';closeClearDialog();if(!managementPanel.hidden){updateManagementCount();}});
function requestBrowserClear(mode){const records=read();const selected=$('credential').value;const count=mode==='all'?records.length:records.filter(x=>x.id===selected).length;if(!count){managementMessage(mode==='all'?'No browser records to clear.':'Select a browser record first.');return;}pendingClear={mode,id:selected,count};$('browser-clear-title').textContent=mode==='all'?'Clear all '+count+' browser record'+(count===1?'':'s')+'?':'Forget selected browser record?';$('browser-clear-message').textContent='Only local test records in this browser will be deleted. Credentials on connected security keys or smart cards will remain unchanged. You may need a device-management utility to delete credentials from the authenticator.';clearDialog.hidden=false;$('browser-clear-cancel').focus();}
$('clear').addEventListener('click',()=>requestBrowserClear('selected'));
$('forget-all').addEventListener('click',()=>requestBrowserClear('all'));
$('browser-clear-cancel').addEventListener('click',closeClearDialog);
$('browser-clear-confirm').addEventListener('click',()=>{if(!pendingClear)return;const {mode,id,count}=pendingClear;save(mode==='all'?[]:read().filter(x=>x.id!==id));closeClearDialog();refresh();updateManagementCount();const msg=count+' browser test record'+(count===1?'':'s')+' removed. No credential was deleted from the physical authenticator.';managementMessage(msg);log(msg);});
$('new-test-identity')?.addEventListener('click',newTestIdentity);$('enroll').addEventListener('click',enroll);$('auth').addEventListener('click',()=>authenticate(false));$('discover').addEventListener('click',()=>authenticate(true));$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('output').textContent)}catch(e){log('Clipboard unavailable: '+e.message,'error')}});
$('details').addEventListener('click',async()=>{
 const button=$('details'),panel=$('browser-capabilities-panel');
 if(!panel.hidden){panel.hidden=true;button.textContent='Browser capabilities';button.setAttribute('aria-expanded','false');return;}
 button.disabled=true;
 try{
  await capabilities();
  $('browser-capabilities-json').textContent=JSON.stringify({origin:location.origin,rpId,capabilities:lastCapabilities},null,2);
  panel.hidden=false;
  button.textContent='Hide browser capabilities';
  button.setAttribute('aria-expanded','true');
 }catch(e){$('browser-capabilities-json').textContent='Capabilities unavailable: '+e.message;panel.hidden=false;}
 finally{button.disabled=false;}
});
$('secure').textContent='SECURE CONTEXT: '+(isSecureContext?'YES':'NO');$('browser').textContent='WEBAUTHN: '+(window.PublicKeyCredential?'AVAILABLE':'UNAVAILABLE');refresh();

if(window.PublicKeyCredential)capabilities();progress(1);

// Browser records remain selectable for authentication; selecting one does not imply a successful live ceremony.
$('credential').addEventListener('change',()=>{renderAuthenticatorDetails(null);renderBrowserRecordInventory();});
renderAuthenticatorDetails(null);

// Discoverable sign-in is user-triggered only; do not auto-retry native PIN/CTAP ceremonies.

$('discoverable-next-action')?.addEventListener('click',()=>authenticate(true));
