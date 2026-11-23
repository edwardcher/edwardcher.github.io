'use strict';
// Read-only inspector of the existing WebAuthn lab. No calls to create/get originate here.
(()=>{
const el=id=>document.getElementById(id);
const drawer=el('api-inspector'), backdrop=el('inspector-backdrop');
const tabs=[...drawer.querySelectorAll('[data-pane]')];
let snapshot={operation:'idle',state:'ready',request:null,response:null,verification:null,error:null};
let lastFocus=null;
const json=value=>value==null?'No data yet. Run a registration or authentication ceremony.':JSON.stringify(value,null,2);
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function selectPane(name){
 for(const tab of tabs){const active=tab.dataset.pane===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;el('inspector-'+tab.dataset.pane).hidden=!active}
}
const wideWorkspace=()=>window.matchMedia('(min-width: 1400px)').matches;
function syncInspectorMode(){
 if(drawer.hidden)return;
 const wide=wideWorkspace();
 backdrop.hidden=wide;
 drawer.setAttribute('role',wide?'complementary':'dialog');
 if(wide)drawer.removeAttribute('aria-modal');else drawer.setAttribute('aria-modal','true');
}
function openInspector(pane='guide'){
 lastFocus=document.activeElement;drawer.hidden=false;document.body.classList.add('inspector-open');
 syncInspectorMode();selectPane(pane);render();
 if(!wideWorkspace())drawer.focus();
}
function closeInspector(){if(drawer.hidden)return;drawer.hidden=true;backdrop.hidden=true;document.body.classList.remove('inspector-open');lastFocus?.focus?.()}
window.addEventListener('resize',syncInspectorMode);
const op=()=>snapshot.operation||'idle';
function render(){
 const registration=op()==='registration',authentication=op().includes('authentication');
 const method=registration?'navigator.credentials.create()':authentication?'navigator.credentials.get()':'navigator.credentials.create() / get()';
 el('inspector-state').textContent=(snapshot.state==='error'?'Action needed':snapshot.state==='ok'?'Ceremony completed locally':snapshot.state==='pending'?'Waiting for browser prompt':'Ready')+' · '+method;
 el('inspect-operation-title').textContent=registration?'Registration · create()':authentication?'Authentication · get()':'WebAuthn browser ceremonies';
 el('inspect-operation-explain').textContent=registration?'The browser asks an authenticator to create a new credential for this relying party. The lab checks returned client and authenticator data, then stores a local record. Attestation is not independently verified.':authentication?'The browser requests an assertion for the relying party. The lab checks origin, challenge, RP ID hash, user-presence flags and verifies the signature against the locally saved public key.':'Registration creates a public-key credential; authentication requests a signed assertion. Both are mediated by the browser, which decides how to contact authenticators.';
 el('inspect-call').textContent=registration?'const credential = await navigator.credentials.create({\n  publicKey: options\n});':authentication?'const assertion = await navigator.credentials.get({\n  publicKey: options\n});':'// Registration\nawait navigator.credentials.create({ publicKey: options });\n\n// Authentication\nawait navigator.credentials.get({ publicKey: options });';
 const points=registration?[
  ['challenge','Random nonce, checked against clientDataJSON.'],['rp.id','Relying party ID; the key is scoped to this domain.'],['pubKeyCredParams','Supported signature algorithms, ES256 and RS256 in this lab.'],['authenticatorSelection','Cross-platform preference, resident key and user verification policy.'],['excludeCredentials','Existing local credential IDs supplied to avoid duplicates.'],['attestation','Set to none; this lab does not validate manufacturer attestation.']
 ]:authentication?[
  ['challenge','New random nonce checked against clientDataJSON.'],['rpId','Relying party domain used for the assertion.'],['allowCredentials','Registered credential IDs; empty for discoverable mode.'],['userVerification','Browser policy for PIN or other user verification.'],['authenticatorData','RP ID hash, UP/UV flags and sign count.'],['signature','Verified locally with the stored public key; no server session.']
 ]:[['create()','Creates a new credential.'],['get()','Requests a signed assertion.'],['Browser mediation','USB/NFC transport and prompts are controlled by the platform.']];
 const ul=el('inspect-explanation');ul.replaceChildren();for(const [name,meaning] of points){const li=document.createElement('li');const b=document.createElement('strong');b.textContent=name+' — ';li.append(b,document.createTextNode(meaning));ul.append(li)}
 el('inspect-request-json').textContent=json(snapshot.request);
 el('inspect-response-json').textContent=json(snapshot.response||snapshot.verification||snapshot.error?{response:snapshot.response,verification:snapshot.verification,error:snapshot.error}:null);
 renderEnvironment();
}
function detectPlatform(){const ua=navigator.userAgent||'';if(/iPad|iPhone|iPod/.test(ua))return 'iOS / iPadOS (user-agent estimate)';if(/Android/.test(ua))return 'Android (user-agent estimate)';if(/Macintosh|Mac OS X/.test(ua))return 'macOS (user-agent estimate)';if(/Windows/.test(ua))return 'Windows (user-agent estimate)';if(/Linux/.test(ua))return 'Linux (user-agent estimate)';return 'Unknown / masked'}
function detectBrowser(){const ua=navigator.userAgent||'';if(/Edg\/|EdgiOS\/|EdgA\//.test(ua))return 'Edge (user-agent estimate)';if(/CriOS|Chrome\//.test(ua))return 'Chrome family (user-agent estimate)';if(/FxiOS|Firefox\//.test(ua))return 'Firefox family (user-agent estimate)';if(/Safari\//.test(ua))return 'Safari / WebKit (user-agent estimate)';return 'Unknown / masked'}
function renderEnvironment(){
 const facts=[['Platform',detectPlatform()],['Browser',detectBrowser()],['Secure context',String(window.isSecureContext)],['WebAuthn API',String(!!window.PublicKeyCredential)],['Origin',location.origin],['RP ID',location.hostname],['Authenticator presence','Not observable via standard WebAuthn']];
 const host=el('inspect-facts');host.replaceChildren();for(const [key,value] of facts){const row=document.createElement('div');row.className='inspector-fact';const a=document.createElement('span');a.textContent=key;const b=document.createElement('span');b.textContent=value;row.append(a,b);host.append(row)}
 el('inspect-capabilities').textContent=typeof lastCapabilities!=='undefined'?JSON.stringify(lastCapabilities,null,2):'Not available';
}
el('open-inspector').addEventListener('click',()=>drawer.hidden?openInspector():closeInspector());el('close-inspector').addEventListener('click',closeInspector);backdrop.addEventListener('click',closeInspector);
for(const tab of tabs)tab.addEventListener('click',()=>selectPane(tab.dataset.pane));
for(const button of drawer.querySelectorAll('[data-copy]'))button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(el(button.dataset.copy).textContent);const old=button.textContent;button.textContent='Copied';setTimeout(()=>button.textContent=old,1000)}catch{button.textContent='Copy unavailable'}});
window.addEventListener('fido-lab-diagnostic',event=>{snapshot=event.detail;render()});
function inEditable(target){return !!target.closest('input,textarea,select,[contenteditable="true"]')}
document.addEventListener('keydown',event=>{
 if(event.metaKey||event.ctrlKey||event.altKey||inEditable(event.target))return;
 if(event.key==='Escape'&&!drawer.hidden){event.preventDefault();closeInspector();return}
 if(drawer.hidden){if(event.key==='i'||event.key==='?'){event.preventDefault();openInspector('guide')}return}
 if(event.key==='Tab'&&!wideWorkspace()){const focusables=[...drawer.querySelectorAll('button:not([disabled]),a[href],[tabindex="0"]')].filter(x=>!x.closest('[hidden]'));if(!focusables.length)return;const first=focusables[0],last=focusables[focusables.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}return}
 if(event.key==='j'||event.key==='k'){const active=drawer.querySelector('.inspector-pane:not([hidden]) .inspector-code');const target=active||drawer.querySelector('.inspector-content');target.scrollTop+=(event.key==='j'?70:-70);event.preventDefault()}
});
render();
})();
