'use strict';
const $=id=>document.getElementById(id), te=new TextEncoder(), td=new TextDecoder();
const storageKey='edwardcher.webauthn.lab.v1.'+location.hostname;
const b64=buf=>{let s='';for(const b of new Uint8Array(buf))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const bytes=str=>Uint8Array.from(atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4)),c=>c.charCodeAt(0));
const random=n=>crypto.getRandomValues(new Uint8Array(n));
const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const read=()=>{try{const a=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(a)?a:[]}catch{return []}};
const save=a=>localStorage.setItem(storageKey,JSON.stringify(a));
const log=(message,kind='')=>{const now=new Date().toLocaleTimeString();$('output').textContent=`[${now}] ${message}`;$('output').style.color=kind==='error'?'#ffb0a6':kind==='ok'?'#79efba':'#c4e5dc'};
const rpId=location.hostname;
function refresh(){const records=read(),select=$('credential'),old=select.value;select.replaceChildren();if(!records.length)select.add(new Option('No local credentials',''));for(const r of records)select.add(new Option(r.username+' · '+r.id.slice(0,13)+'…',r.id));if(records.some(x=>x.id===old))select.value=old;$('stored').textContent='LOCAL CREDENTIALS: '+records.length}
function busy(v){for(const id of ['enroll','auth','discover','clear'])$(id).disabled=v}
function progress(n){for(let i=1;i<=3;i++)$('step'+i).className='step'+(i===n?' active':i<n?' done':'')}
let lastCapabilities={};
async function capabilities(){try{lastCapabilities=await PublicKeyCredential.getClientCapabilities?.()||{}}catch(e){lastCapabilities={error:e.message}}$('capability').textContent='CAPABILITIES: '+Object.keys(lastCapabilities).length;return lastCapabilities}

function parseDerSignature(der,size=32){ // WebAuthn ECDSA signatures use ASN.1 DER; WebCrypto expects IEEE P1363 r||s.
 const b=new Uint8Array(der);let i=0;const length=()=>{let n=b[i++];if(n<128)return n;const c=n&127;if(c>3||!c)throw Error('Invalid DER length');n=0;for(let k=0;k<c;k++)n=(n<<8)|b[i++];return n};
 if(b[i++]!==0x30)throw Error('Invalid ECDSA signature');const seqLen=length(),end=i+seqLen;if(end!==b.length)throw Error('Invalid ECDSA sequence length');
 const integer=()=>{if(b[i++]!==0x02)throw Error('Invalid DER integer');const len=length();let x=b.slice(i,i+len);i+=len;while(x.length>size&&x[0]===0)x=x.slice(1);if(x.length>size)throw Error('Invalid ECDSA integer size');const out=new Uint8Array(size);out.set(x,size-x.length);return out};
 const r=integer(),s=integer();if(i!==end)throw Error('Trailing DER signature bytes');const out=new Uint8Array(size*2);out.set(r);out.set(s,size);return out;
}
function authDataInfo(buffer){const a=new Uint8Array(buffer);if(a.length<37)throw Error('Authenticator data too short');const view=new DataView(a.buffer,a.byteOffset,a.byteLength);return {rpHash:a.slice(0,32),flags:a[32],count:view.getUint32(33,false)}}
function clientData(buffer,type,challenge){const d=JSON.parse(td.decode(buffer));if(d.type!==type)throw Error('Unexpected WebAuthn operation');if(d.challenge!==b64(challenge))throw Error('Challenge mismatch');if(d.origin!==location.origin)throw Error('Origin mismatch');if(d.crossOrigin===true)throw Error('Cross-origin request rejected');return d}
async function enroll(){busy(true);try{
 if(!window.isSecureContext||!navigator.credentials?.create)throw Error('WebAuthn requires HTTPS or localhost and a compatible browser');
 const username=$('username').value.trim();if(!username)throw Error('Enter a test identity');
 const challenge=random(32),userId=random(24),old=read();
 progress(1);const options={challenge,rp:{id:rpId,name:'Edwardcher Security-Key Lab'},user:{id:userId,name:username,displayName:username},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],timeout:120000,attestation:'none',hints:$('strict').checked?['security-key']:undefined,authenticatorSelection:{authenticatorAttachment:$('strict').checked?'cross-platform':undefined,residentKey:$('resident').checked?'required':'preferred',userVerification:$('uv').checked?'required':'preferred'},extensions:{credProps:true},excludeCredentials:old.filter(x=>x.username===username).map(x=>({type:'public-key',id:bytes(x.id),transports:x.transports||['usb','nfc']}))};
 beginDiagnostic('registration',options);
 log('Starting hardware-key registration…\nInsert/present your key or FIDO2 smart card; follow the browser PIN/touch prompts.');
 progress(2);const c=await navigator.credentials.create({publicKey:options});progress(3);if(!c||c.type!=='public-key')throw Error('No WebAuthn credential returned');
 clientData(c.response.clientDataJSON,'webauthn.create',challenge);
 const key=c.response.getPublicKey?.(),alg=c.response.getPublicKeyAlgorithm?.();if(!key||![-7,-257].includes(alg))throw Error('Browser cannot export supported credential public key (SPKI); no record saved');
 const info=authDataInfo(c.response.getAuthenticatorData());const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(rpId)));if(!equal(info.rpHash,expected))throw Error('RP ID hash mismatch');if(!(info.flags&1))throw Error('User presence not set');if($('uv').checked&&!(info.flags&4))throw Error('User verification not set');
 const entry={id:b64(c.rawId),username,userId:b64(userId),spki:b64(key),alg,transports:c.response.getTransports?.()||[],created:new Date().toISOString(),count:info.count,uvRequired:$('uv').checked,attachment:c.authenticatorAttachment||'unknown'};
 const updated=old.filter(x=>x.id!==entry.id);updated.push(entry);save(updated);refresh();$('credential').value=entry.id;
 successDiagnostic('registration',responseData(c),{summary:'Credential created and locally recorded. Browser-returned authenticator data and origin checks passed; attestation was not verified by a server.',rpId,origin:location.origin,algorithm:alg,authenticatorAttachment:entry.attachment,userPresent:!!(info.flags&1),userVerified:!!(info.flags&4),discoverable:c.getClientExtensionResults()?.credProps?.rk??null,signCount:info.count,attestationVerified:false});
 progress(3);log('REGISTERED · LOCAL DEMO ONLY\nUser: '+username+'\nAlgorithm: '+(alg===-7?'ES256':'RS256')+'\nAttachment: '+entry.attachment+'\nUser verified: '+!!(info.flags&4)+'\nDiscoverable: '+String(c.getClientExtensionResults()?.credProps?.rk??'not reported')+'\nCredential: '+entry.id.slice(0,22)+'…\nAttestation NOT validated; registration NOT server-trusted.','ok');
 }catch(e){failDiagnostic('registration',e);log('REGISTRATION NOT COMPLETED\n'+e.name+': '+e.message,'error')}finally{busy(false)}}
async function authenticate(discoverable=false){busy(true);try{
 const selected=read().find(x=>x.id===$('credential').value);if(!discoverable&&!selected)throw Error('Enroll a credential first in this browser');if(discoverable&&!read().length)throw Error('Enroll a discoverable credential first');
 const challenge=random(32),options={challenge,rpId,timeout:120000,userVerification:$('uv').checked?'required':'preferred',hints:$('strict').checked?['security-key']:undefined,allowCredentials:discoverable?[]:[{type:'public-key',id:bytes(selected.id),transports:selected.transports.length?selected.transports:undefined}]};progress(1);beginDiagnostic(discoverable?'discoverable authentication':'authentication',options);
 log('Requesting signed assertion…\nPresent the same security key / smart card and complete the browser prompts.');
 progress(2);const c=await navigator.credentials.get({publicKey:options});progress(3);if(!c||c.type!=='public-key')throw Error('No WebAuthn assertion returned');
 const record=discoverable?read().find(x=>x.id===b64(c.rawId)):selected;if(!record)throw Error('Credential is not registered in this browser local database');if(b64(c.rawId)!==record.id)throw Error('Credential ID mismatch');
 clientData(c.response.clientDataJSON,'webauthn.get',challenge);
 const info=authDataInfo(c.response.authenticatorData),expected=new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(rpId)));if(!equal(info.rpHash,expected))throw Error('RP ID hash mismatch');if(!(info.flags&1))throw Error('User presence flag absent');if($('uv').checked&&!(info.flags&4))throw Error('Required user verification absent');
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',c.response.clientDataJSON));const data=new Uint8Array(c.response.authenticatorData.byteLength+hash.length);data.set(new Uint8Array(c.response.authenticatorData));data.set(hash,c.response.authenticatorData.byteLength);
 const isEc=record.alg===-7;const key=await crypto.subtle.importKey('spki',bytes(record.spki),isEc?{name:'ECDSA',namedCurve:'P-256'}:{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const sig=isEc?parseDerSignature(c.response.signature):new Uint8Array(c.response.signature);const verified=await crypto.subtle.verify(isEc?{name:'ECDSA',hash:'SHA-256'}:'RSASSA-PKCS1-v1_5',key,sig,data);if(!verified)throw Error('Cryptographic assertion signature INVALID');
 if(info.count&&record.count&&info.count<=record.count)throw Error('Signature counter did not advance; investigate authenticator state');
 const updated=read();const index=updated.findIndex(x=>x.id===record.id);if(index>=0){updated[index].count=info.count;save(updated)}
 successDiagnostic('authentication',responseData(c),{summary:'Signature verified using the locally stored public key. This is not a server-authenticated session.',rpId,origin:location.origin,algorithm:record.alg,signatureVerified:true,userPresent:!!(info.flags&1),userVerified:!!(info.flags&4),signCount:info.count});
 log('ASSERTION VERIFIED LOCALLY ✓\nUser: '+record.username+'\nSignature: VALID ('+(isEc?'ES256':'RS256')+')\nOrigin: '+location.origin+'\nRP ID: '+rpId+'\nUser present: YES\nUser verified: '+!!(info.flags&4)+'\nSign count: '+info.count+'\nNot a server-authenticated session.','ok');
 }catch(e){failDiagnostic('authentication',e);log('AUTHENTICATION NOT COMPLETED\n'+e.name+': '+e.message,'error')}finally{busy(false)}}

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
 if(name==='NotAllowedError')return {title:'The browser did not complete the security-key request',next:'Check that your FIDO2 key is connected or your NFC card is in range, then retry. Also check browser permissions, PIN/touch prompts, and whether the request was cancelled or timed out. The browser does not reveal which of these occurred.'};
 if(name==='NotFoundError')return {title:'No matching authenticator or credential was available to the browser',next:'Check USB-C connection or NFC positioning and confirm the card/key supports FIDO2. This does not prove that no hardware is physically connected.'};
 if(name==='SecurityError')return {title:'The browser rejected the origin or security context',next:'Open the lab over HTTPS on its original site. WebAuthn credentials are scoped to an RP ID and origin.'};
 if(name==='InvalidStateError')return {title:'The authenticator may already hold this credential',next:'Try another test identity or inspect the key’s credential-management options. The browser may reject duplicate registration.'};
 if(name==='NotSupportedError')return {title:'The browser or authenticator does not support the requested configuration',next:'Try a supported FIDO2 key and compatible browser. Review algorithm and authenticator preference settings.'};
 if(name==='AbortError')return {title:'The WebAuthn request was interrupted',next:'Retry the operation and complete the browser prompt.'};
 if(message.includes('Enroll a credential first'))return {title:'No locally registered credential is selected',next:'Choose Enroll security key first. Registration is tied to this browser and website origin; an existing credential from another site will not appear here.'};
 if(message.includes('Enroll a discoverable credential first'))return {title:'No local discoverable credential is available',next:'Enable “Require discoverable credential” under Authentication preferences, enroll your key, then retry passwordless authentication.'};
 if(name==='TypeError')return {title:'The browser could not process the WebAuthn request',next:'Check browser support, request parameters and available authenticator capabilities in Raw WebAuthn.'};
 return {title:operation+' did not complete',next:'Review the browser error and request details. Confirm your key or card supports FIDO2 and try again.'};
}
function showDiagnostic(){
 const heading=$('diag-heading'),message=$('diag-message'),next=$('diag-next'),status=$('diag-status');
 heading.textContent=diagnostic.overview;message.textContent=diagnostic.error?diagnostic.error.name+': '+diagnostic.error.message:(diagnostic.verification?.summary||'');next.textContent=diagnostic.next;
 status.textContent=diagnostic.state==='ok'?'VERIFIED LOCALLY':diagnostic.state==='error'?'ACTION NEEDED':diagnostic.state==='pending'?'BROWSER PROMPT':'READY';status.dataset.state=diagnostic.state;
 const raw={operation:diagnostic.operation,state:diagnostic.state,request:diagnostic.request,response:diagnostic.response,verification:diagnostic.verification,error:diagnostic.error,note:'Diagnostic data is local to this page. Never treat browser-side verification as trusted server authentication.'};
 $('diag-raw').textContent=JSON.stringify(raw,null,2);
 window.dispatchEvent(new CustomEvent('fido-lab-diagnostic',{detail:raw}));
}
function beginDiagnostic(operation,request){diagnostic={operation,state:'pending',overview:'Waiting for the browser and authenticator',next:'Insert or tap your FIDO2 key/card and complete any browser PIN or touch prompt. The page cannot determine physical device presence.',request:normalize(request),response:null,verification:null,error:null};showDiagnostic()}
function successDiagnostic(operation,response,verification){diagnostic={...diagnostic,operation,state:'ok',overview:operation==='registration'?'Security key registered in this browser':'Security-key assertion verified locally',next:operation==='registration'?'You can now select Authenticate. Open Raw WebAuthn to inspect the registration exchange.':'Review the origin, RP ID, user-presence flags and signature verification in Raw WebAuthn.',response:normalize(response),verification};showDiagnostic()}
function failDiagnostic(operation,e){const g=guidance(e,operation);diagnostic={...diagnostic,operation,state:'error',overview:g.title,next:g.next,error:{name:e?.name||'Error',message:String(e?.message||e)}};showDiagnostic()}
function responseData(c){return {id:c.id,type:c.type,authenticatorAttachment:c.authenticatorAttachment||null,clientDataJSON:c.response?.clientDataJSON?b64(c.response.clientDataJSON):null,authenticatorData:c.response?.getAuthenticatorData?b64(c.response.getAuthenticatorData()):c.response?.authenticatorData?b64(c.response.authenticatorData):null,attestationObject:c.response?.attestationObject?b64(c.response.attestationObject):null,signature:c.response?.signature?b64(c.response.signature):null,userHandle:c.response?.userHandle?b64(c.response.userHandle):null,transports:c.response?.getTransports?.()||[],extensions:c.getClientExtensionResults?.()||{}}}
$('diag-summary-tab').addEventListener('click',()=>selectDiagnosticTab('summary'));
$('diag-raw-tab').addEventListener('click',()=>selectDiagnosticTab('raw'));
function selectDiagnosticTab(tab){const raw=tab==='raw';$('diag-summary').hidden=raw;$('diag-raw-panel').hidden=!raw;for(const [id,active] of [['diag-summary-tab',!raw],['diag-raw-tab',raw]]){$(id).setAttribute('aria-selected',String(active));$(id).tabIndex=active?0:-1}}
$('diag-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('diag-raw').textContent);$('diag-copy').textContent='COPIED';setTimeout(()=>$('diag-copy').textContent='COPY RAW',1200)}catch(e){$('diag-copy').textContent='COPY UNAVAILABLE'}});
$('diag-raw').addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;const box=$('diag-raw');if(e.key==='j'||e.key==='ArrowDown'){box.scrollTop+=24;e.preventDefault()}else if(e.key==='k'||e.key==='ArrowUp'){box.scrollTop-=24;e.preventDefault()}else if(e.key==='g'){box.scrollTop=0;e.preventDefault()}else if(e.key==='G'){box.scrollTop=box.scrollHeight;e.preventDefault()}});
// Optional shortcuts only when focus is outside form fields and editable controls.
document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea,button,[contenteditable],pre'))return;if(e.key==='1')selectDiagnosticTab('summary');if(e.key==='2')selectDiagnosticTab('raw')});
showDiagnostic();

$('enroll').addEventListener('click',enroll);$('auth').addEventListener('click',()=>authenticate(false));$('discover').addEventListener('click',()=>authenticate(true));$('clear').addEventListener('click',()=>{const id=$('credential').value;if(!id)return log('No record selected');save(read().filter(x=>x.id!==id));refresh();log('Local record forgotten. Credential on physical key was NOT deleted.')});$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('output').textContent)}catch(e){log('Clipboard unavailable: '+e.message,'error')}});
$('details').addEventListener('click',async()=>{await capabilities();log('BROWSER CAPABILITIES\\n'+JSON.stringify(lastCapabilities,null,2)+'\\n\\nRP ID: '+rpId+'\\nOrigin: '+location.origin+'\\nExternal key hint: '+$('strict').checked)});
$('secure').textContent='SECURE CONTEXT: '+(isSecureContext?'YES':'NO');$('browser').textContent='WEBAUTHN: '+(window.PublicKeyCredential?'AVAILABLE':'UNAVAILABLE');refresh();

if(window.PublicKeyCredential)capabilities();progress(1);
