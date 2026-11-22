const $=id=>document.getElementById(id), $$=q=>[...document.querySelectorAll(q)];
const specs={jwt:'https://www.rfc-editor.org/rfc/rfc7519',jws:'https://www.rfc-editor.org/rfc/rfc7515',security:'https://www.rfc-editor.org/rfc/rfc8725',oidc:'https://openid.net/specs/openid-connect-core-1_0.html',discovery:'https://openid.net/specs/openid-connect-discovery-1_0.html',oauth:'https://www.rfc-editor.org/rfc/rfc6749',pkce:'https://www.rfc-editor.org/rfc/rfc7636',logout:'https://openid.net/specs/openid-connect-rpinitiated-1_0.html',webauthn:'https://www.w3.org/TR/webauthn-3/',ciba:'https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html'};
const explanations={iss:['Issuer','The identity service that issued the token.'],sub:['Subject','The identifier for the person or principal.'],aud:['Audience','The application or service the token is intended for.'],exp:['Expires','The time after which the token must not be accepted.'],iat:['Issued at','When the token was created.'],nbf:['Not before','Earliest time the token may be accepted.'],auth_time:['Authenticated at','When the user actually authenticated.'],nonce:['Nonce','Helps bind the ID token to the original sign-in request.'],acr:['Authentication context','The authentication assurance context asserted by the provider.'],amr:['Authentication methods','Methods used during authentication, as reported by the provider.'],azp:['Authorized party','The client authorized to use the ID token.'],at_hash:['Access token hash','Allows certain flows to bind an access token to an ID token.'],sid:['Session identifier','Identifier for a session at the provider.'],scope:['Scopes','Permissions or information requested or granted.'],role:['Role','A provider-specific authorization attribute; interpretation depends on application policy.'],groupids:['Groups','Provider-specific group identifiers.'],securitygroupids:['Security groups','Provider-specific security group identifiers.'],preferred_username:['Preferred username','A display/login identifier; not a substitute for a stable subject ID.'],email:['Email','An email attribute; do not assume it has been verified.'],email_verified:['Email verified','Provider statement about email verification.'],deviceid:['Device identifier','Provider-specific device context.'],result:['Result','Provider-specific authentication result.'],clientapprovalstatus:['Approval status','Provider-specific approval outcome.']};
let fixture=null,current=null,diagData=null,activeJourney=0,activeStep=0,providerMetadata=null;
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const human=v=>typeof v==='object'?JSON.stringify(v):String(v);
const b64decode=s=>{if(!/^[A-Za-z0-9_-]*$/.test(s)||s.length%4===1)throw Error('Invalid Base64url characters or length');const raw=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));};
const b64bytes=s=>{if(!/^[A-Za-z0-9_-]*$/.test(s)||s.length%4===1)throw Error('Invalid Base64url data');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));};
const b64encode=s=>{const bytes=new TextEncoder().encode(s);let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const showToast=s=>{const e=$('toast');e.textContent=s;e.style.display='block';clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>e.style.display='none',3000);};
function page(name){$$('.page').forEach(e=>e.classList.toggle('active',e.id===name));$$('[data-page]').forEach(e=>e.classList.toggle('active',e.dataset.page===name));window.scrollTo({top:0,behavior:'instant'});}$$('[data-page]').forEach(b=>b.addEventListener('click',()=>page(b.dataset.page)));
$$('[data-sub]').forEach(b=>b.onclick=()=>{$$('[data-sub]').forEach(x=>x.classList.toggle('active',x===b));$$('.subview').forEach(x=>x.classList.toggle('active',x.id===b.dataset.sub));});
async function loadFixtures(){if(fixture)return fixture;const r=await fetch('./samples/fixtures.json',{cache:'no-store'});if(!r.ok)throw Error('Sample files unavailable. Serve this directory using a local HTTP server.');fixture=await r.json();return fixture;}
function tokenFromInput(raw){let text=raw.trim();if(!text)throw Error('Paste a token or choose an example.');if(text.startsWith('{')){let obj=JSON.parse(text);if(obj.id_token&&typeof obj.id_token==='string')return {token:obj.id_token,response:obj};if(obj.error)return {error:obj};if(obj.access_token)return {opaque:obj.access_token,response:obj};throw Error('This JSON does not contain id_token, access_token, or error.');}if(/^Bearer\s+/i.test(text))text=text.replace(/^Bearer\s+/i,'');if(text.split('.').length!==3)return {opaque:text};return {token:text};}
function parseJWT(token){let parts=token.split('.');if(parts.length!==3)throw Error('Expected a three-segment compact JWS. Encrypted five-segment JWEs are not decoded.');let header=JSON.parse(b64decode(parts[0])),payload=JSON.parse(b64decode(parts[1]));if(!header||Array.isArray(header)||typeof header!=='object'||!payload||Array.isArray(payload)||typeof payload!=='object')throw Error('JWT header and payload must be JSON objects.');return {token,parts,header,payload};}
const date=n=>typeof n==='number'&&Number.isFinite(n)?new Date(n*1000).toLocaleString():'Not provided';
function metric(label,value,extra=''){return `<div class="metric"><div class="caption">${safe(label)}</div><strong>${safe(value)}</strong><small>${safe(extra)}</small></div>`;}
function finding(level,title,description){return `<div class="finding ${level}"><strong>${safe(title)}</strong><p>${safe(description)}</p></div>`;}
async function verifySignature(p,jwks){const alg=p.header.alg;if(!['RS256','RS384','RS512','PS256','ES256','ES384','ES512'].includes(alg))return {status:'unsupported',message:`Algorithm ${alg||'(missing)'} is not supported for automatic verification.`};if(!jwks||!Array.isArray(jwks.keys))return {status:'unverified',message:'No trusted verification key is available.'};const matching=jwks.keys.filter(k=>k.kty&&(!p.header.kid||k.kid===p.header.kid)&&(!k.alg||k.alg===alg)&&(!k.use||k.use==='sig'));if(matching.length!==1)return {status:'unverified',message:matching.length?'Multiple matching keys; cannot choose safely.':'No uniquely matching public key found.'};const k=matching[0];try{let algorithm,verifyAlgorithm,signature=b64bytes(p.parts[2]);if(alg.startsWith('RS')){algorithm={name:'RSASSA-PKCS1-v1_5',hash:'SHA-'+alg.slice(2)};verifyAlgorithm=algorithm;}else if(alg.startsWith('PS')){algorithm={name:'RSA-PSS',hash:'SHA-'+alg.slice(2)};verifyAlgorithm={name:'RSA-PSS',saltLength:Number(alg.slice(2))/8};}else{algorithm={name:'ECDSA',namedCurve:k.crv};verifyAlgorithm={name:'ECDSA',hash:'SHA-'+alg.slice(2)};}const key=await crypto.subtle.importKey('jwk',k,algorithm,false,['verify']);const ok=await crypto.subtle.verify(verifyAlgorithm,key,signature,new TextEncoder().encode(p.parts[0]+'.'+p.parts[1]));return {status:ok?'verified':'failed',message:ok?'Signature matches the selected public key.':'Signature does not match the selected public key.'};}catch(e){return {status:'unsupported',message:'Could not verify with this key/algorithm: '+e.message};}}
async function analyze(){try{const extracted=tokenFromInput($('tokenInput').value);if(extracted.error){$('diagnoseInput').value=JSON.stringify(extracted.error,null,2);page('diagnose');diagnose();return;}if(extracted.opaque){current=null;$('result').classList.remove('hidden');$('resultTitle').textContent='Opaque access token';$('resultSubtitle').textContent='This token is not a readable JWT. That can be normal.';$('resultBadge').textContent='Opaque';$('resultBadge').className='status';$('metricGrid').innerHTML=metric('Token format','Opaque')+metric('Signature','Not inspectable')+metric('Issuer','Unknown')+metric('Status','Unknown');$('findings').innerHTML=finding('','Not necessarily an error','Many providers issue opaque access tokens. Ask the resource server or authorized introspection endpoint for status; do not assume the token is invalid.');$('claims').innerHTML='No readable claims are available.';$('rawHeader').textContent='Not a JWT';$('rawPayload').textContent='Not a JWT';setJSONData(null,extracted.response);$('guideTitle').textContent='This token is not meant to be read.';$('guideText').textContent='An opaque access token is a credential for an API. It may be valid even though its contents are not visible.';$('guideNext').innerHTML='<span class="smalllabel">NEXT CHECK</span><p>Use the issuer’s authorized token introspection process.</p>';return;}
const p=parseJWT(extracted.token);current=p;let now=Math.floor(Date.now()/1000),checks=[];if(typeof p.payload.exp==='number'&&p.payload.exp<=now)checks.push(['error','Token expired','The expiry time is in the past. Obtain a fresh token and check clock synchronization.']);else if(typeof p.payload.exp==='number')checks.push(['','Expiry check passed','The expiration is in the future according to this browser clock.']);else checks.push(['warn','No expiry claim','Check whether this token type requires exp. OIDC ID tokens require it.']);if(typeof p.payload.nbf==='number'&&p.payload.nbf>now)checks.push(['error','Not valid yet','The nbf claim is in the future.']);if(p.header.alg==='none')checks.push(['warn','Unsigned token','No cryptographic signature is present. Never treat this as authenticated identity.']);if(!p.payload.iss)checks.push(['warn','Issuer missing','The issuer must be validated against the expected identity provider for ID tokens.']);if(!p.payload.aud)checks.push(['warn','Audience missing','Confirm the expected audience or client ID.']);if(p.payload.aud&&p.payload.aud==='other-application')checks.push(['warn','Example audience mismatch','This sample deliberately targets a different application. A real mismatch requires comparison with your expected client ID.']);const isSampleIssuer=Boolean(fixture?.issuer&&p.payload.iss===fixture.issuer);let verification={status:'unverified',message:'No trusted key selected. Decoding does not verify the signature.'};if(p.header.alg!=='none'&&p.parts[2]){if(fixture?.jwks&&p.payload.iss===fixture.issuer){verification=await verifySignature(p,fixture.jwks);}else if(providerMetadata?.jwks_uri&&providerMetadata.issuer===p.payload.iss){try{const u=new URL(providerMetadata.jwks_uri);if(u.protocol!=='https:')throw Error('HTTPS required');const res=await fetch(u.href,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(7000)});if(!res.ok)throw Error('JWKS HTTP '+res.status);verification=await verifySignature(p,await res.json());}catch(e){verification={status:'unverified',message:'Could not retrieve trusted JWKS (possibly CORS): '+e.message};}}}
if(verification.status==='failed')checks.unshift(['error','Signature verification failed',verification.message]);else if(verification.status==='verified')checks.unshift(['',isSampleIssuer?'Test signature verified':'Signature verified',verification.message+(isSampleIssuer?' Verified against the bundled DEMONSTRATION key only; this issuer is intentionally non-resolvable and not trusted.':' This does not establish audience, nonce, or application authorization.')]);else checks.unshift(['warn','Signature not verified',verification.message]);
$('result').classList.remove('hidden');$('resultTitle').textContent='Here is what we found';$('resultSubtitle').textContent=extracted.response?'ID token extracted from a token endpoint response.':'Decoded locally; results below separate trust checks.';$('resultBadge').textContent=verification.status==='verified'?(isSampleIssuer?'Mock key verified · issuer untrusted':'Signature verified · trust not established'):verification.status==='failed'?'Invalid signature':'Not verified';$('resultBadge').className='status '+(verification.status==='failed'?'danger':'warning');if(isSampleIssuer)checks.unshift(['warn','Mock issuer — test environment only','The .example domain is reserved for documentation (RFC 2606). This mock issuer is not a live identity provider; no issuer trust has been established.']);else if(p.payload.iss)checks.unshift(['warn','Issuer trust not established','The token issuer has not been compared against an independently configured expected issuer.']);$('metricGrid').innerHTML=metric('Issued by',p.payload.iss?(()=>{try{return new URL(p.payload.iss).hostname}catch{return 'Malformed issuer URL'}})():'Unknown',isSampleIssuer?'MOCK ISSUER · test only':p.payload.iss||'')+metric('For application',human(p.payload.aud??'Not specified'))+metric('Expires',typeof p.payload.exp==='number'?(p.payload.exp<=now?'Expired':'Not expired'):'Unknown',date(p.payload.exp))+metric('Signature',verification.status==='verified'?(isSampleIssuer?'Mock key verified':'Cryptographically verified'):verification.status==='failed'?'Failed':'Not verified',p.header.alg||'Unknown');$('findings').innerHTML=checks.map(c=>finding(...c)).join('');$('claims').innerHTML=Object.entries(p.payload).map(([k,v])=>`<div class="claim"><div><strong>${safe(k)}</strong><div class="explain">${safe(explanations[k]?.[0]||'Additional claim')}</div></div><div><div class="value">${safe(human(v))}</div><div class="explain">${safe(explanations[k]?.[1]||'Provider or application-specific data; consult its contract.')}${['exp','iat','nbf','auth_time'].includes(k)&&typeof v==='number'?' · '+safe(date(v)):''}</div></div></div>`).join('');$('rawHeader').textContent=JSON.stringify(p.header,null,2);$('rawPayload').textContent=JSON.stringify(p.payload,null,2);setJSONData(p,extracted.response);$('editHeader').value=JSON.stringify(p.header,null,2);$('editPayload').value=JSON.stringify(p.payload,null,2);$('segmentDetails').innerHTML=`<div class="claim"><strong>Header</strong><div class="value">${p.parts[0].length} characters · algorithm ${safe(p.header.alg||'unknown')}</div></div><div class="claim"><strong>Payload</strong><div class="value">${p.parts[1].length} characters · ${Object.keys(p.payload).length} claims</div></div><div class="claim"><strong>Signature</strong><div class="value">${p.parts[2].length} characters · ${safe(verification.status)}</div></div>`;$('guideTitle').textContent=isSampleIssuer?'This is a synthetic test token — not a trusted identity.' : verification.status==='verified'?'The signature checks out. What next?':verification.status==='failed'?'This signature did not verify.':'We can read it. Can we trust it?';$('guideText').textContent=isSampleIssuer?'The bundled demonstration public key matches this signature. The reserved .example mock issuer is not a live provider. No production issuer, audience, nonce, or authentication trust has been established.' : verification.status==='verified'?'The selected key verifies the signature. You still need to independently establish issuer trust and confirm audience, nonce and the expected authentication context.':'A decoded token tells you what it claims. To trust it, you need the correct issuer key and validation of its claims.';$('guideNext').innerHTML='<span class="smalllabel">NEXT USEFUL STEP</span><p>Compare the audience to your application’s client ID, then review any warnings.</p>';
}catch(e){showToast('Could not analyze: '+e.message);}}
$('analyzeToken').onclick=analyze;$('clearToken').onclick=()=>{$('tokenInput').value='';$('sampleSelect').value='';$('result').classList.add('hidden');current=null;};$('sampleSelect').onchange=async e=>{if(!e.target.value)return;try{let f=await loadFixtures();$('tokenInput').value=e.target.value==='response'?JSON.stringify(f.response,null,2):e.target.value==='opaque'?f.opaque:f.tokens[e.target.value];await analyze();}catch(err){showToast(err.message);}};

// Scoped data console. No eval, shell, dynamic imports, or network requests.
const detailTabs=['raw','segments','edit','claims'];
function detailTab(id){const button=document.querySelector(`[data-sub="${id}"]`);if(button)button.click();}
function isDetailActive(){return $('inspect')?.classList.contains('active')&&!$('result')?.classList.contains('hidden');}
function editorObjects(){const h=JSON.parse($('editHeader').value),p=JSON.parse($('editPayload').value);if(!h||!p||typeof h!=='object'||typeof p!=='object'||Array.isArray(h)||Array.isArray(p))throw Error('Header and payload must be JSON objects');return {header:h,payload:p};}
function editorFeedback(message,problem=false){const e=$('encodeFeedback');e.textContent=message;e.classList.toggle('error',problem);}
function encodeUnsigned(){const {header,payload}=editorObjects();const h={...header,alg:'none'};delete h.kid;delete h.jwk;delete h.jku;delete h.x5u;delete h.x5c;delete h.x5t;delete h['x5t#S256'];const output=b64encode(JSON.stringify(h))+'.'+b64encode(JSON.stringify(payload))+'.';$('encodedOutput').value=output;editorFeedback('Encoded successfully · 3 segments · no signature · not a trusted token.');return output;}
function readEditorPath(arg){const match=/^(header|payload)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(arg);if(!match)throw Error('Use a top-level path such as payload.aud or header.typ');return {root:match[1],key:match[2]};}
async function executeEditorCommand(raw){try{const command=raw.trim();if(!command)throw Error('Enter a command or select one below.');const [verb]=command.split(/\s+/,1);let data;
 switch(verb.toLowerCase()){
 case 'help':editorFeedback('encode · check · format · get payload.KEY · set payload.KEY JSON_VALUE · copy · reset · help. Example: set payload.aud "demo-client". Commands cannot execute JavaScript or shell.');break;
 case 'encode':encodeUnsigned();break;
 case 'check':data=editorObjects();editorFeedback(`Valid JSON · ${Object.keys(data.header).length} header fields · ${Object.keys(data.payload).length} payload claims. Signature trust is not checked.`);break;
 case 'format':data=editorObjects();$('editHeader').value=JSON.stringify(data.header,null,2);$('editPayload').value=JSON.stringify(data.payload,null,2);editorFeedback('Header and payload formatted.');break;
 case 'get':{const {root,key}=readEditorPath(command.slice(verb.length).trim());data=editorObjects();if(!Object.hasOwn(data[root],key))throw Error('Field does not exist: '+root+'.'+key);editorFeedback(root+'.'+key+' = '+JSON.stringify(data[root][key]));break;}
 case 'set':{const match=/^set\s+([^\s]+)\s+([\s\S]+)$/i.exec(command);if(!match)throw Error('Usage: set payload.aud "my-client"');const {root,key}=readEditorPath(match[1]);if(root==='header'&&['alg','kid','jwk','jku','x5u','x5c'].includes(key))throw Error('Security-sensitive header parameters are not editable using set. Edit JSON directly, then encode unsigned.');const value=JSON.parse(match[2]);data=editorObjects();data[root][key]=value;$(root==='header'?'editHeader':'editPayload').value=JSON.stringify(data[root],null,2);$('encodedOutput').value='';editorFeedback('Updated '+root+'.'+key+'. Run encode to create a new unsigned representation.');break;}
 case 'copy':{const output=$('encodedOutput').value;if(!output)throw Error('Nothing to copy. Run encode first.');await copyJSON(output);editorFeedback('Copied unsigned representation to clipboard.');break;}
 case 'reset':if(!current)throw Error('Analyze a JWT before resetting.');$('editHeader').value=JSON.stringify(current.header,null,2);$('editPayload').value=JSON.stringify(current.payload,null,2);$('encodedOutput').value='';editorFeedback('Restored header and payload from the inspected token.');break;
 default:throw Error('Unsupported command: '+verb+'. Try help.');
 }
 }catch(error){editorFeedback('Command error: '+error.message,true);}}
$('encodeBtn').onclick=()=>executeEditorCommand('encode');
$('encodeRun').onclick=()=>executeEditorCommand($('encodeCommand').value);
$('encodeCommand').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();executeEditorCommand(e.target.value);}if(e.key==='Escape'){e.target.blur();}});
document.querySelectorAll('[data-cmd]').forEach(b=>b.addEventListener('click',()=>{$('encodeCommand').value=b.dataset.cmd;executeEditorCommand(b.dataset.cmd);if(b.dataset.cmd==='get payload.iss')$('encodeCommand').focus();}));
$('copyEncoded').onclick=()=>executeEditorCommand('copy');
['editHeader','editPayload'].forEach(id=>$(id).addEventListener('input',()=>{$('encodedOutput').value='';editorFeedback('Input changed · previous encoded output cleared. Run check or encode.');}));
// Detail-level keyboard flow: bracket keys change tabs, e opens editing, y copies output.
document.addEventListener('keydown',e=>{
 if(shortcutHelpOpen()||!isDetailActive()||e.metaKey||e.altKey)return;
 if(e.ctrlKey&&e.key==='Enter'&&$('edit').classList.contains('active')){e.preventDefault();e.stopImmediatePropagation();executeEditorCommand('encode');return;}
 if(e.ctrlKey)return;
 if(e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 const tab=detailTabs.findIndex(id=>$(id).classList.contains('active'));
 if(e.key==='['||e.key===']'){detailTab(detailTabs[(tab+(e.key==='['?-1:1)+detailTabs.length)%detailTabs.length]);e.preventDefault();e.stopImmediatePropagation();}
 else if(e.key==='e'&&!$('raw').classList.contains('active')){detailTab('edit');e.preventDefault();e.stopImmediatePropagation();}
 else if(e.key==='y'&&$('edit').classList.contains('active')){executeEditorCommand('copy');e.preventDefault();e.stopImmediatePropagation();}
 else if(e.key==='?'&&$('edit').classList.contains('active')){openShortcutHelp();e.preventDefault();e.stopImmediatePropagation();}
},true);

function sanitizedReport(){if(!current)return 'No JWT analyzed.';const p=current.payload||{};const alg=typeof current.header?.alg==='string'&&/^[A-Za-z0-9_-]{1,20}$/.test(current.header.alg)?current.header.alg:'unspecified';const expires=typeof p.exp==='number'? (p.exp*1000<Date.now()?'expired':'not yet expired'):'not provided';return `JWT++ Debugger — generalized claim overview\nAlgorithm: ${alg}\nExpiration: ${expires}\nIssuer claim: ${p.iss?'present':'absent'}\nAudience claim: ${p.aud?'present':'absent'}\nSignature validity, issuer trust, and authorization must be independently evaluated.\nNo issuer, audience, subject, raw token, or customer identifiers included.`;}
$('copyReport').onclick=async()=>{try{await navigator.clipboard.writeText(sanitizedReport());showToast('Sanitized summary copied.');}catch{showToast('Clipboard access unavailable.');}};
const errors={invalid_grant:{title:'The authorization grant was rejected',explain:'The server rejected the code, refresh token, or other grant. This does not identify which condition failed.',checks:[['Check the code lifecycle','Was the authorization code expired, already redeemed, or issued for a different client?'],['Check PKCE','If PKCE was used, confirm the code_verifier produces the original code_challenge.'],['Check redirect URI','The token request redirect_uri must match the authorization request when required.']],spec:specs.oauth},invalid_client:{title:'The client could not authenticate',explain:'The authorization server did not accept client authentication.',checks:[['Check client identity','Confirm client_id and the registered token endpoint authentication method.'],['Check credentials','Verify the secret, client assertion, certificate, or key configuration in the secure environment.'],['Check request placement','Check whether credentials were supplied in the expected header or form body.']],spec:specs.oauth},invalid_request:{title:'The request is missing or malformed',explain:'One or more required parameters may be missing, duplicated, or incorrectly formatted.',checks:[['Read the error description','It may name a missing code, redirect_uri, or other parameter.'],['Check content type','Token requests normally use application/x-www-form-urlencoded.'],['Compare with the flow','Inspect grant_type and required parameters for that grant.']],spec:specs.oauth},access_denied:{title:'The request was denied',explain:'The user or authorization server denied the request. This is not necessarily a token exchange failure.',checks:[['Review consent','Was access denied by the user or policy?'],['Review provider logs','Find the corresponding authorization transaction.']],spec:specs.oauth},authorization_pending:{title:'Authentication is still pending',explain:'In asynchronous/backchannel flows, this may be an expected intermediate state.',checks:[['Wait for completion','Follow the server-provided polling interval and timeout.'],['Check the user interaction','Confirm the user received and responded to the request.']],spec:specs.ciba},expired_token:{title:'The pending authentication request expired',explain:'The relevant token or backchannel authentication request is no longer usable.',checks:[['Restart the flow','Obtain a new authorization or authentication request.'],['Check timing','Review expiry and clock skew.']],spec:specs.oauth},hid_error:{title:'The provider returned a structured error',explain:'The provider has supplied additional error fields; consult its documented error catalog and server logs.',checks:[['Inspect provider-specific fields','Capture a sanitized error code and correlation identifier.'],['Review the matching server log','The generic OAuth error alone cannot establish root cause.']],spec:specs.oauth}};
const errorExamples={invalid_grant:{error:'invalid_grant',error_description:'Authorization code is invalid or expired'},invalid_client:{error:'invalid_client',error_description:'Client authentication failed'},invalid_request:{error:'invalid_request',error_description:'Missing or empty "code" parameter'},access_denied:{error:'access_denied'},authorization_pending:{error:'authorization_pending'},hid_error:{error:'hid_error',hid_error:{code:'EXAMPLE_CODE'},error_description:'Provider-specific error example'},success:{access_token:'OPAQUE_DEMO_ACCESS_TOKEN',token_type:'Bearer',expires_in:7200,id_token:'<id-token-placeholder>'}};
function extractJSON(text){try{return JSON.parse(text);}catch{let start=text.indexOf('{'),end=text.lastIndexOf('}');if(start>=0&&end>start)return JSON.parse(text.slice(start,end+1));let match=text.match(/\berror\s*[=:]\s*([a-z_]+)/i);if(match)return {error:match[1]};throw Error('Paste JSON or an HTTP response containing JSON.');}}
function diagnose(){try{const o=extractJSON($('diagnoseInput').value);diagData=o;const root=$('diagnosisResult');root.classList.remove('hidden');$('diagToToken').style.display=o.id_token&&o.id_token.split('.').length===3?'':'none';if(!o.error){$('diagTitle').textContent='No OAuth error reported';$('diagSummary').textContent='This response contains no error field. It does not prove that the token is valid or that the end-to-end login succeeded.';$('diagChecks').innerHTML=finding('','Check the token response','Verify token_type, expiry, audience, issuer and signature. Session-bound access tokens can become invalid before their nominal lifetime.');return;}let x=errors[o.error]||{title:'The server reported '+o.error,explain:'This code is not in the built-in error guide. Inspect the provider documentation and sanitized logs.',checks:[['Check official documentation','Match the error to the provider and protocol context.']],spec:specs.oauth};$('diagTitle').textContent=x.title;$('diagSummary').textContent=x.explain;$('diagChecks').innerHTML=finding('warn','Observed error: '+o.error,o.error_description||'No description supplied')+x.checks.map((c,i)=>finding('',`Next check ${i+1}: ${c[0]}`,c[1])).join('')+`<a class="referenceLink" href="${safe(x.spec)}" target="_blank" rel="noopener noreferrer">Official protocol reference ↗</a>`;}catch(e){showToast('Cannot diagnose: '+e.message);}}
$('diagnoseBtn').onclick=diagnose;$('errorSample').onchange=e=>{if(!e.target.value)return;$('diagnoseInput').value=JSON.stringify(errorExamples[e.target.value],null,2);diagnose();};$('diagCopy').onclick=async()=>{if(!diagData)return;const code=typeof diagData.error==='string'&&Object.prototype.hasOwnProperty.call(errors,diagData.error)?diagData.error:'unrecognized';try{await navigator.clipboard.writeText(`JWT++ Debugger generalized diagnostic\nError: ${code}\nDescription: withheld (may contain production identifiers)\nNo raw tokens or credentials included.\nPlease correlate with server-side logs.`);showToast('Safe diagnostic copied.');}catch{showToast('Clipboard unavailable.');}};$('diagToToken').onclick=()=>{if(diagData?.id_token){$('tokenInput').value=diagData.id_token;page('inspect');analyze();}};

// Minimal, optional AI handoff. Never send raw input or import AI responses.
const aiSafeBrief=()=>{
 let code='invalid_grant',demo=true;
 try{const parsed=extractJSON($('diagnoseInput').value);if(typeof parsed.error==='string'&&/^[a-z_]{1,45}$/.test(parsed.error)){code=parsed.error;demo=false;}else if(!parsed.error){code='none';demo=false;}else{code='unrecognized';demo=false;}}catch{}
 // Do not include arbitrary unrecognized codes, error descriptions, URLs, names, or tokens.
 const known=Object.prototype.hasOwnProperty.call(errors,code);
 const info=known?errors[code]:null;
 const checks=info?.checks||[['Review the request and configuration','Compare non-secret parameters with the provider configuration and authoritative server evidence.']];
 return `You are helping troubleshoot an OAuth 2.0 / OpenID Connect problem. This is a generalized question, not a production log.\n\nCase: ${demo?'BUILT-IN EXAMPLE':'USER-SUPPLIED ERROR CATEGORY ONLY'}\nError category: ${known?code:(code==='none'?'no OAuth error reported':'unrecognized error')}\nProtocol interpretation: ${info?.title||'The exact cause is not established.'}\n\nExisting checks (hypotheses, not findings):\n${checks.map((c,i)=>`${i+1}. ${c[0]} — ${c[1]}`).join('\n')}\n\nSuggest other plausible root causes and practical, prioritized ways to confirm or reject them. Distinguish observed facts from assumptions. Explain the next action in plain language, and cite official OAuth/OIDC specifications where relevant. Do not assume the cause is proven. Do not request or reproduce credentials, tokens, authorization codes, personal identifiers, or raw production logs.`;
};
function refreshAiBrief(){
 const prompt=aiSafeBrief();$('aiPrompt').value=prompt;
 let code='invalid_grant';try{const parsed=extractJSON($('diagnoseInput').value);code=typeof parsed.error==='string'&&/^[a-z_]{1,45}$/.test(parsed.error)?parsed.error:'unrecognized';}catch{}
 const info=Object.prototype.hasOwnProperty.call(errors,code)?errors[code]:null;
 $('aiCaseTitle').textContent=info?.title||'General protocol investigation';
 $('aiCaseSummary').textContent='Category: '+(info?code:'unrecognized')+' · No raw error details included.';
}
function aiCopyFallback(text){const t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();let ok=false;try{ok=document.execCommand('copy');}catch{}t.remove();return ok;}
async function aiCopy(text,label){let copied=false;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);copied=true;}}catch{}if(!copied)copied=aiCopyFallback(text);showToast(copied?label+' copied.':'Clipboard blocked. Use the preview to copy manually.');if(!copied){$('aiPromptWrap').hidden=false;$('aiTogglePrompt').setAttribute('aria-expanded','true');$('aiPrompt').focus();$('aiPrompt').select();}return copied;}
const aiDrawer=$('aiDrawer');
$('aiOpenDrawer').onclick=()=>{const open=aiDrawer.hidden;aiDrawer.hidden=!open;$('aiOpenDrawer').setAttribute('aria-expanded',String(open));$('aiOpenDrawer').innerHTML=open?'✧ Hide AI Opinion <span aria-hidden="true">▴</span>':'✧ Get AI Opinion <span aria-hidden="true">▾</span>';if(open)refreshAiBrief();};
$('aiTogglePrompt').onclick=()=>{const open=$('aiPromptWrap').hidden;$('aiPromptWrap').hidden=!open;$('aiTogglePrompt').setAttribute('aria-expanded',String(open));$('aiTogglePrompt').textContent=open?'Hide safe question ▴':'Preview safe question ▾';};
$('aiCopyPrompt').onclick=()=>aiCopy(aiSafeBrief(),'Generalized question');
function openAiHandoff(provider){
 const brief=aiSafeBrief();const urls={chatgpt:'https://chatgpt.com/?prompt='+encodeURIComponent(brief),claude:'https://claude.ai/new?q='+encodeURIComponent(brief)};
 const url=urls[provider];if(!url)return;
 // URL contains only allowlisted protocol category and static reference guidance.
 const win=window.open(url,'_blank','noopener,noreferrer');
 $('aiHandoff').textContent=(win===null?'If your browser blocked the new tab, allow popups for this site. ':'')+'The question is prefilled where supported. Review before sending. Return to the Workbench to verify suggested causes against the local diagnosis.';
}
$('aiOpenChatGPT').onclick=()=>openAiHandoff('chatgpt');
$('aiOpenClaude').onclick=()=>openAiHandoff('claude');
$('diagnoseBtn').addEventListener('click',refreshAiBrief);
$('errorSample').addEventListener('change',refreshAiBrief);
$('diagnoseInput').addEventListener('input',refreshAiBrief);
refreshAiBrief();
// Keyboard support for diagnosis findings. Never capture keystrokes while editing.
let diagCursor=0;function diagItems(){return [...$('diagChecks').querySelectorAll('.finding')];}function diagSelect(i){let a=diagItems();if(!a.length)return;diagCursor=Math.max(0,Math.min(a.length-1,i));a.forEach((el,j)=>{el.classList.toggle('diag-selected',j===diagCursor);el.setAttribute('tabindex',j===diagCursor?'0':'-1');});a[diagCursor].focus({preventScroll:true});a[diagCursor].scrollIntoView({block:'nearest'});}
$('diagChecks').addEventListener('click',e=>{let item=e.target.closest('.finding');if(item)diagCursor=diagItems().indexOf(item);});
document.addEventListener('keydown',e=>{if(!$('diagnose').classList.contains('active')||shortcutHelpOpen()||e.target.closest('input,textarea,select,[contenteditable]')||e.ctrlKey||e.metaKey||e.altKey)return;const active=document.activeElement;if(['j','k','y'].includes(e.key)&&active?.closest('#diagChecks')){if(e.key==='j')diagSelect(diagCursor+1);if(e.key==='k')diagSelect(diagCursor-1);if(e.key==='y'){let a=diagItems();if(a[diagCursor])aiCopy(a[diagCursor].innerText,'Finding');}e.preventDefault();}});
const journeys=[{title:'Sign in',subtitle:'Authorization Code + PKCE',steps:[['Open the sign-in page','The application sends the browser to the provider.','GET /authorize?response_type=code&client_id=app-client&scope=openid%20profile&state=RANDOM&code_challenge=CHALLENGE&code_challenge_method=S256',specs.pkce],['Authenticate the user','The provider authenticates the person, possibly using passkeys or MFA.','Provider login page → user authentication → consent (if required)',specs.oidc],['Return to the application','The provider redirects with a one-time authorization code.','GET /callback?code=ONE_TIME_CODE&state=RANDOM',specs.oauth],['Exchange the code','The client exchanges the code and PKCE verifier for tokens.','POST /token\nContent-Type: application/x-www-form-urlencoded\n\ngrant_type=authorization_code&code=ONE_TIME_CODE&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback&client_id=app-client&code_verifier=ORIGINAL_VERIFIER',specs.pkce],['Validate and sign in','The application validates the ID token signature and required claims.','{\n  "access_token": "<opaque-access-token>",\n  "id_token": "<signed-id-token>",\n  "token_type": "Bearer",\n  "expires_in": 3600\n}',specs.oidc]]},{title:'Register',subtitle:'Account + passkey',steps:[['Create an account','Account creation is provider-specific, not a generic OIDC protocol operation.','POST /accounts (application-specific)\n{ "email": "example@example.com" }',specs.oidc],['Request passkey options','The server generates a challenge and credential creation options.','{ "publicKey": { "challenge": "<random-bytes>", "rp": { "name": "Example" } } }',specs.webauthn],['Create a credential','The browser calls navigator.credentials.create and the authenticator creates a credential.','navigator.credentials.create({ publicKey: options })',specs.webauthn],['Verify registration','The server validates the response and stores the public key.','{ "status": "registered", "credentialId": "<id>" }',specs.webauthn]]},{title:'Renew tokens',subtitle:'Refresh token grant',steps:[['Request renewal','An eligible client submits a refresh token.','POST /token\nContent-Type: application/x-www-form-urlencoded\n\ngrant_type=refresh_token&refresh_token=<secret>',specs.oauth],['Receive a response','The server may issue a new access token and rotate the refresh token.','{ "access_token": "<new-token>", "token_type": "Bearer", "expires_in": 3600 }',specs.oauth],['Handle failures','Expired or revoked refresh tokens require a new authentication journey.','{ "error": "invalid_grant" }',specs.oauth]]},{title:'Sign out',subtitle:'Local + provider session',steps:[['End local session','Clear the application session and securely discard tokens.','{ "localSession": "ended" }',specs.oidc],['Request provider logout','Where supported, use RP-initiated logout.','GET /logout?id_token_hint=<id-token>&post_logout_redirect_uri=<registered-uri>&state=<random>',specs.logout],['Confirm outcome','Local and provider sessions are distinct; upstream sessions may persist.','{ "applicationSession": "ended", "providerSession": "check-provider" }',specs.logout]]},{title:'Backchannel sign in',subtitle:'CIBA / asynchronous',steps:[['Initiate authentication','A client sends a backchannel authentication request.','POST /bc-authorize\nContent-Type: application/x-www-form-urlencoded\n\nclient_id=example&scope=openid&login_hint=user@example.com',specs.ciba],['Wait for approval','The provider prompts the user through an appropriate channel.','{ "auth_req_id": "<request-id>", "expires_in": 120, "interval": 5 }',specs.ciba],['Poll for result','The client polls the token endpoint if the provider supports poll mode.','{ "error": "authorization_pending" }',specs.ciba],['Receive tokens','On successful authentication, the token endpoint responds.','{ "access_token": "<token>", "id_token": "<signed-id-token>", "token_type": "Bearer" }',specs.ciba]]}];
// Protocol exchange explorer: illustrative wire interactions, not captured traffic.
const journeyActors=['Browser','Application','Identity provider','Authenticator'];
const traceDefinitions=[
 [
  {from:1,to:0,label:'Redirect to authorization endpoint',kind:'302 → GET /authorize',note:'Application initiates the authorization request; the browser follows the redirect.',json:{response_type:'code',scope:'openid profile',state:'<random>',code_challenge:'<S256 challenge>'}},
  {from:0,to:2,label:'User authenticates at provider',kind:'HTTPS · browser interaction',note:'Provider authenticates the user; authentication method and consent depend on policy.',json:{authentication:'provider-specific',result:'session established'}},
  {from:2,to:0,label:'Authorization code returned',kind:'302 → GET /callback',note:'The browser follows the provider redirect to the registered redirect URI. Application checks state.',json:{code:'<one-time-code>',state:'<original-state>'}},
  {from:1,to:2,label:'Back-channel code exchange',kind:'POST /token',note:'The application sends the code and original PKCE verifier. Confidential clients authenticate as required.',json:{grant_type:'authorization_code',code:'<one-time-code>',code_verifier:'<original-verifier>'}},
  {from:2,to:1,label:'Token response and validation',kind:'200 OK · JSON',note:'Provider issues tokens; client validates the ID token before establishing its own session.',json:{access_token:'<access-token>',id_token:'<signed-id-token>',token_type:'Bearer',expires_in:3600}}
 ],
 [
  {from:0,to:1,label:'Submit account registration',kind:'POST /accounts · example',note:'Account registration is application/provider-specific; OIDC does not define this endpoint.',json:{email:'user@example.invalid'}},
  {from:1,to:0,label:'Return WebAuthn creation options',kind:'GET /passkey/options · example',note:'Server supplies a fresh challenge, RP information, and user parameters.',json:{publicKey:{challenge:'<random>',rp:{name:'Example'},user:{id:'<user-handle>'}}}},
  {from:0,to:3,label:'Create passkey',kind:'WebAuthn browser API',note:'Browser mediates navigator.credentials.create with an authenticator. This is not an HTTP exchange.',json:{api:'navigator.credentials.create',publicKey:'<creation-options>'}},
  {from:0,to:1,label:'Submit credential for verification',kind:'POST /passkey/finish · example',note:'Server verifies the WebAuthn registration response and stores credential public key.',json:{credential:'<registration-response>',status:'verified'}}
 ],
 [
  {from:1,to:2,label:'Request token renewal',kind:'POST /token',note:'Eligible client presents refresh token securely; client authentication may be required.',json:{grant_type:'refresh_token',refresh_token:'<secret-redacted>'}},
  {from:2,to:1,label:'Issue renewed tokens',kind:'200 OK · JSON',note:'Provider may rotate the refresh token; clients must store and replace it securely.',json:{access_token:'<new-access-token>',token_type:'Bearer',expires_in:3600}},
  {from:2,to:1,label:'Reject invalid refresh token',kind:'400 Bad Request · JSON',note:'This is an alternative failure outcome, not an additional message after successful renewal.',json:{error:'invalid_grant'}}
 ],
 [
  {from:0,to:1,label:'Request application sign-out',kind:'POST /logout · example',note:'The application terminates its own session and clears its session cookie.',json:{local_session:'ended'}},
  {from:1,to:0,label:'Redirect to provider logout',kind:'302 → end_session_endpoint',note:'If supported, application starts RP-initiated logout with appropriate parameters.',json:{id_token_hint:'<optional-id-token>',post_logout_redirect_uri:'<registered-uri>'}},
  {from:0,to:2,label:'Provider ends its session',kind:'GET /logout · example',note:'Browser visits provider logout endpoint; provider controls its session termination.',json:{provider_session:'ended'}}
 ],
 [
  {from:1,to:2,label:'Initiate backchannel authentication',kind:'POST /bc-authorize',note:'Client initiates CIBA authentication; provider responds with auth_req_id and expiry.',json:{auth_req_id:'<request-id>',expires_in:120,interval:5}},
  {from:2,to:3,label:'Request out-of-band approval',kind:'Notification · device channel',note:'Provider prompts the user on an authentication device. Transport is implementation-specific.',json:{user_action:'approve or deny'}},
  {from:1,to:2,label:'Poll for authentication result',kind:'POST /token',note:'In poll mode the client polls with auth_req_id. Authorization_pending is a possible interim response.',json:{grant_type:'urn:openid:params:grant-type:ciba',auth_req_id:'<request-id>',interim_error:'authorization_pending'}},
  {from:2,to:1,label:'Return tokens after approval',kind:'200 OK · JSON',note:'On success, the provider returns tokens. The client validates the ID token.',json:{access_token:'<access-token>',id_token:'<signed-id-token>'}}
 ]
];

// JWT++ OIDC trace v1: a deliberately small, non-executable line DSL.
// File contents never become URLs to fetch, executable commands, or HTML.
const OIDC_TRACE_TEMPLATE=`# JWT++ OIDC trace v1
# title: Example sign in
# subtitle: Authorization Code + PKCE
# actors: Browser | Application | Identity provider | Authenticator
# STEP | source | destination | label | HTTP or protocol operation | description
STEP | Application | Browser | Start authorization | 302 GET /authorize | Browser is redirected to the authorization endpoint with state and PKCE challenge.
DATA | {"response_type":"code","scope":"openid","state":"<random>","code_challenge":"<S256>"}
STEP | Browser | Identity provider | Authenticate user | GET /authorize | The provider authenticates the user using its configured policy.
DATA | {"authentication":"provider-controlled"}
STEP | Identity provider | Browser | Return authorization code | 302 GET /callback | The browser follows the redirect and the client checks state.
DATA | {"code":"<one-time-code>","state":"<original-state>"}
STEP | Application | Identity provider | Redeem code | POST /token | Client submits the authorization code and original PKCE verifier.
DATA | {"grant_type":"authorization_code","code_verifier":"<verifier>"}
STEP | Identity provider | Application | Return token response | 200 JSON | Client validates the ID token before creating its session.
DATA | {"id_token":"<signed-id-token>","token_type":"Bearer"}`;
$('journeyTemplatePreview').textContent=OIDC_TRACE_TEMPLATE;
function traceText(v,max=160){if(!v||v.length>max||/[\x00-\x08\x0b-\x1f\x7f<>]/.test(v))throw Error('A field is empty, too long, or contains forbidden characters.');return v;}
function parseOidcTrace(raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>32768)throw Error('Trace is too large. Maximum size is 32 KB.');
 const lines=raw.replace(/\r\n?/g,'\n').split('\n');if(lines.length>100)throw Error('Too many lines. Keep the trace under 100 lines.');
 if(lines[0].trim()!=='# JWT++ OIDC trace v1')throw Error('Missing the JWT++ OIDC trace v1 header.');
 let title='',subtitle='',workspace='',steps=[],trace=[],seenActors=false;
 for(let i=1;i<lines.length;i++){
  const line=lines[i].trim();if(!line)continue;
  if(line.startsWith('# ')){
   const m=line.match(/^# (title|subtitle|workspace|actors):\s*(.*)$/);if(!m)continue;
   if(m[1]==='title')title=traceText(m[2],64);
   if(m[1]==='subtitle')subtitle=traceText(m[2],70);
   if(m[1]==='workspace')workspace=traceText(m[2],40);
   if(m[1]==='actors'){if(m[2]!=='Browser | Application | Identity provider | Authenticator')throw Error('Actor roles must match the four supported OIDC roles.');seenActors=true;}
   continue;
  }
  if(line.startsWith('STEP |')){
   if(steps.length>=12)throw Error('Too many exchanges. Maximum is 12.');
   const f=line.split('|').map(x=>x.trim());if(f.length!==6)throw Error('Line '+(i+1)+': STEP needs five fields separated by |.');
   const from=journeyActors.indexOf(f[1]),to=journeyActors.indexOf(f[2]);if(from<0||to<0||from===to)throw Error('Line '+(i+1)+': use two different supported actor roles.');
   const label=traceText(f[3],76),operation=traceText(f[4],64),note=traceText(f[5],220);
   if(!/^(GET |POST |302 |200 |400 |HTTPS |WebAuthn |OIDC |CIBA )/i.test(operation))throw Error('Line '+(i+1)+': unsupported protocol operation.');
   if(/\b(?:javascript:|data:|file:|<script|onerror=)\b/i.test(line))throw Error('Line '+(i+1)+': forbidden content.');
   steps.push([label,note,operation+'\n\n'+note,specs.oidc]);trace.push({from,to,label,kind:operation,note,json:{}});continue;
  }
  if(line.startsWith('DATA |')){
   if(!trace.length)throw Error('Line '+(i+1)+': DATA needs a preceding STEP.');
   if(trace.at(-1).hasData)throw Error('Line '+(i+1)+': only one DATA record per STEP.');
   const payload=line.slice(6).trim();if(payload.length>2048)throw Error('Line '+(i+1)+': DATA exceeds 2 KB.');
   let parsed;try{parsed=JSON.parse(payload);}catch{throw Error('Line '+(i+1)+': invalid JSON.');}
   if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error('Line '+(i+1)+': DATA must be a JSON object.');
   const check=(x,depth=0)=>{if(depth>4)throw Error('JSON nesting is too deep.');if(x&&typeof x==='object'){if(Object.keys(x).length>30)throw Error('Too many JSON fields.');for(const [k,v] of Object.entries(x)){traceText(k,60);if(['__proto__','constructor','prototype'].includes(k))throw Error('Reserved JSON field.');check(v,depth+1);}}else if(typeof x==='string'){if(x.length>256||/[\x00-\x08\x0b-\x1f\x7f]/.test(x))throw Error('Invalid JSON string.');}else if(x!==null&&typeof x!=='boolean'&&typeof x!=='number')throw Error('Unsupported JSON value.');};check(parsed);trace.at(-1).json=parsed;trace.at(-1).hasData=true;continue;
  }
  throw Error('Line '+(i+1)+': only comments, STEP, and DATA are supported.');
 }
 if(!seenActors||!title||!subtitle||steps.length<2)throw Error('Include title, subtitle, actors, and at least two exchanges.');
 return {journey:{title,subtitle,workspace,steps},trace};
}
const BUILTIN_JOURNEY_COUNT=journeys.length;
const MAX_IMPORTED_JOURNEYS=12;
function updateJourneyLibrary(){
 const custom=journeys.slice(BUILTIN_JOURNEY_COUNT);
 $('journeyLibraryCount').textContent=`${BUILTIN_JOURNEY_COUNT} examples · ${custom.length} imported`;
 const library=$('journeyLibrary');library.replaceChildren();
 if(!custom.length){const hint=document.createElement('p');hint.className='muted';hint.textContent='No custom traces yet. Your built-in examples are ready below.';library.append(hint);return;}
 custom.forEach((j,i)=>{
  const index=i+BUILTIN_JOURNEY_COUNT;
  const row=document.createElement('div');row.className='trace-library-row'+(activeJourney===index?' current':'');
  const choose=document.createElement('button');choose.type='button';choose.className='trace-library-choose';
  const label=document.createElement('strong');label.textContent=j.title;
  const meta=document.createElement('small');meta.textContent=(j.workspace?j.workspace+' · ':'')+j.steps.length+' exchanges';
  choose.append(label,meta);choose.setAttribute('aria-label','Open '+j.title);
  choose.addEventListener('click',()=>{journeySet(index);setJourneyZone('menu');});
  const remove=document.createElement('button');remove.type='button';remove.className='trace-library-remove';remove.textContent='×';remove.title='Remove imported journey';remove.setAttribute('aria-label','Remove '+j.title);
  remove.addEventListener('click',()=>{journeys.splice(index,1);traceDefinitions.splice(index,1);if(activeJourney===index)activeJourney=0;else if(activeJourney>index)activeJourney--;activeStep=0;drawJourney();$('journeyImportStatus').textContent='Removed '+j.title+' from this tab. No other journeys changed.';});
  row.append(choose,remove);library.append(row);
 });
}
function importOidcTrace(raw){
 try{
  const parsed=parseOidcTrace(raw);
  if(journeys.length-BUILTIN_JOURNEY_COUNT>=MAX_IMPORTED_JOURNEYS)throw Error('Journey shelf is full (12 imports). Remove a trace before loading another.');
  parsed.journey.custom=true;
  journeys.push(parsed.journey);traceDefinitions.push(parsed.trace);
  journeySet(journeys.length-1);setJourneyZone('menu');
  $('journeyImportStatus').textContent='Loaded: '+parsed.journey.title+' · '+parsed.trace.length+' exchanges · memory only';
  $('journeyDslEditor').open=false;
 }catch(err){$('journeyImportStatus').textContent='Packet gremlins stopped this trace: '+err.message+' Nothing was loaded.';}
}
$('journeyTemplate').addEventListener('click',()=>{const blob=new Blob([OIDC_TRACE_TEMPLATE+'\n'],{type:'text/plain'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='example.oidcflow';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('journeyDsl').value=OIDC_TRACE_TEMPLATE;});
$('journeyLoad').addEventListener('click',()=>importOidcTrace($('journeyDsl').value));
$('journeyFile').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(f.size>32768){$('journeyImportStatus').textContent='That trace ate too many packets. Maximum 32 KB.';return;}if(!/\.(oidcflow|txt)$/i.test(f.name)){$('journeyImportStatus').textContent='Unsupported file. Use .oidcflow or .txt.';return;}try{const content=await f.text();$('journeyDsl').value=content;importOidcTrace(content);}catch{$('journeyImportStatus').textContent='Could not read the trace. The original journeys are safe.';}});

let journeyView=0;
let journeyRawVisible=false;
let journeyZone="menu"; // keyboard ownership: menu or trace
function setJourneyZone(zone){journeyZone=zone;document.querySelector(".journey-workbench")?.setAttribute("data-keyboard-zone",zone);const state=document.getElementById("journeyKeyState");if(state)state.textContent=zone==="menu"?"KEYBOARD: JOURNEYS · j/k choose · l/Enter inspect":"KEYBOARD: TRACE · j/k exchange · h return to journeys · 1/2/3 detail";}
function enterJourneyTrace(){setJourneyZone("trace");$("journeyFlow").focus({preventScroll:true});}
function returnJourneyMenu(){setJourneyZone("menu");(activeJourney>=BUILTIN_JOURNEY_COUNT?document.querySelector('.trace-library-row.current .trace-library-choose'):$('journeyCards'))?.focus({preventScroll:true});}

function journeySet(next,step=0){activeJourney=(next+journeys.length)%journeys.length;activeStep=Math.max(0,Math.min(step,journeys[activeJourney].steps.length-1));drawJourney();}
function journeyStep(next){activeStep=Math.max(0,Math.min(next,journeys[activeJourney].steps.length-1));drawJourney();}
function drawJourney(){const j=journeys[activeJourney], trace=traceDefinitions[activeJourney]||[], item=trace[activeStep]||trace[0],step=j.steps[activeStep];
 $('journeyCards').innerHTML=journeys.slice(0,BUILTIN_JOURNEY_COUNT).map((x,i)=>`<button type="button" class="journeycard ${i===activeJourney?'active':''}" data-journey="${i}" aria-pressed="${i===activeJourney}"><strong>${safe(x.title)}</strong><small>${safe(x.custom?(x.workspace?x.workspace+' · ':''):'Example · ')}${safe(x.subtitle)}</small></button>`).join('');
 $$('[data-journey]').forEach(b=>b.onclick=()=>{journeySet(Number(b.dataset.journey));setJourneyZone('menu');});
 updateJourneyLibrary();
 $('journeyName').textContent=j.title+' / '+j.subtitle;$('journeyProgress').textContent=(activeStep+1)+' / '+j.steps.length;
 const columns=journeyActors.map((name,i)=>`<div class="actor-label actor-${i}">${safe(name)}</div>`).join('');
 const arrows=trace.map((t,i)=>{const selected=i===activeStep;const x1=125+250*t.from,x2=125+250*t.to;const start=x1+(x2>x1?8:-8),end=x2+(x2>x1?-12:12);const mid=(start+end)/2;const arrow=x2>x1?`${end-10},13 ${end},20 ${end-10},27`:`${end+10},13 ${end},20 ${end+10},27`;return `<button type="button" class="trace-row ${selected?'active':''} ${i<activeStep?'visited':''}" data-trace="${i}" aria-current="${selected?'step':'false'}" aria-label="Exchange ${i+1}: ${safe(t.label)}"><span class="trace-num">${String(i+1).padStart(2,'0')}</span><span class="trace-line"><svg viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><circle cx="${x1}" cy="20" r="6" fill="currentColor"/><path d="M ${start} 20 L ${end} 20" stroke="currentColor" stroke-width="3" fill="none"/><polyline points="${arrow}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg></span><span class="trace-message">${safe(t.label)}<small>${safe(t.kind)} · ${safe(journeyActors[t.from])} → ${safe(journeyActors[t.to])}</small></span></button>`}).join('');
 $('journeyFlow').innerHTML=`<div class="trace-actors">${columns}</div><div class="trace-rows">${arrows}</div>`;
 $$('[data-trace]').forEach(b=>b.onclick=()=>{journeyStep(Number(b.dataset.trace));setJourneyZone('trace');});
 $('journeyTimeline').innerHTML=j.steps.map((st,i)=>`<button type="button" class="journeystep ${i===activeStep?'active':''}" data-step="${i}" aria-current="${i===activeStep?'step':'false'}"><span class="number">${i+1}</span><span><strong>${safe(st[0])}</strong><small>${safe(st[1])}</small></span></button>`).join('');
 $$('[data-step]').forEach(b=>b.onclick=()=>{journeyStep(Number(b.dataset.step));setJourneyZone('trace');});
 $('journeyStepCaption').textContent=step[0];$('journeyPrev').disabled=activeStep===0;$('journeyNext').disabled=activeStep===j.steps.length-1;
 $('journeyExplain').innerHTML=`<div class="finding"><strong>Why this exchange matters</strong><p>${safe(item.note)}</p></div>`;
 $('journeyDetailTitle').textContent=step[0];$('journeyDetailHint').textContent=`${item.kind} · Example, not a captured request`;$('journeySpec').href=step[3];
 $$('[data-jview]').forEach(b=>{const on=Number(b.dataset.jview)===journeyView;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});
 $('journeyInsight').textContent=journeyView===0?`Exchange: ${journeyActors[item.from]} → ${journeyActors[item.to]}`:journeyView===1?'Illustrative HTTP / API exchange':'Explore the fields below. Expand objects to inspect nested values.';
 const rawToggle=$('journeyRawToggle'), code=$('journeyCode');
 rawToggle.hidden=journeyView!==2;
 rawToggle.setAttribute('aria-expanded',String(journeyRawVisible));
 rawToggle.textContent=journeyRawVisible?'Hide raw JSON ▴':'Show raw JSON ▾';
 code.hidden=journeyView===2&&!journeyRawVisible;
 code.textContent=journeyView===0?`Operation: ${item.kind}\nFrom: ${journeyActors[item.from]}\nTo: ${journeyActors[item.to]}\n\nSelect HTTP / API to inspect the example message.`:journeyView===1?step[2]:JSON.stringify(item.json,null,2);
 const tree=$('journeyJsonTree');if(tree){tree.hidden=journeyView!==2;if(journeyView===2){tree.replaceChildren();const make=(key,value,depth)=>{const container=document.createElement('div');container.className='journey-json-node';if(value!==null&&typeof value==='object'){const details=document.createElement('details');details.open=depth<2;const summary=document.createElement('summary');summary.textContent=key+' '+(Array.isArray(value)?'['+value.length+']':'{'+Object.keys(value).length+'}');details.append(summary);for(const [k,v] of Object.entries(value))details.append(make(k,v,depth+1));container.append(details);}else{const label=document.createElement('span');label.className='json-key';label.textContent=key+': ';const val=document.createElement('span');val.textContent=JSON.stringify(value);container.append(label,val);}return container;};tree.append(make('exchange',item.json,0));}}
}
$$('[data-jview]').forEach(b=>b.addEventListener('click',()=>{journeyView=Number(b.dataset.jview);journeyRawVisible=false;drawJourney();}));
$('journeyRawToggle').addEventListener('click',()=>{journeyRawVisible=!journeyRawVisible;drawJourney();$('journeyRawToggle').focus({preventScroll:true});});
$('journeyPrev').addEventListener('click',()=>journeyStep(activeStep-1));$('journeyNext').addEventListener('click',()=>journeyStep(activeStep+1));
// Scoped keyboard navigation; never intercept typing or shortcuts in another tool.
document.addEventListener('keydown',e=>{if(!$('journeys').classList.contains('active')||e.metaKey||e.ctrlKey||e.altKey||shortcutHelpOpen())return;const t=e.target;if(t.closest('input,textarea,select,[contenteditable="true"]'))return;
if(t.closest('a,summary,button')&&!t.closest('.journeycard,.trace-library-choose,.trace-row,.journeystep'))return;
// Preserve native keyboard operation in the JSON tree and text inspector.
if(t.closest('#journeyJsonTree,#journeyCode'))return;
const key=e.key;
if(!['j','k','h','l','Enter','ArrowDown','ArrowUp','ArrowLeft','ArrowRight','1','2','3'].includes(key))return;
if(journeyZone==='menu'){
 if(key==='j'||key==='ArrowDown')journeySet(activeJourney+1);
 else if(key==='k'||key==='ArrowUp')journeySet(activeJourney-1);
 else if(key==='l'||key==='ArrowRight'||key==='Enter')enterJourneyTrace();
 else return;
}else{
 if(key==='j'||key==='ArrowDown')journeyStep(activeStep+1);
 else if(key==='k'||key==='ArrowUp')journeyStep(activeStep-1);
 else if(key==='h'||key==='ArrowLeft')returnJourneyMenu();
 else if('123'.includes(key)){journeyView=Number(key)-1;drawJourney();}
 else return;
}
e.preventDefault();e.stopImmediatePropagation();},true);
$('journeyCards').addEventListener('focusin',()=>setJourneyZone('menu'));
$('journeyLibrary').addEventListener('focusin',()=>setJourneyZone('menu'));
$('journeyFlow').addEventListener('focusin',()=>setJourneyZone('trace'));
$('journeyTimeline').addEventListener('focusin',()=>setJourneyZone('trace'));

drawJourney();
const sampleMetadata={issuer:'https://login.example.com/idp/demo/authn',authorization_endpoint:'https://login.example.com/idp/demo/authn/login',token_endpoint:'https://login.example.com/idp/demo/authn/token',jwks_uri:'https://login.example.com/idp/demo/authn/jwks',userinfo_endpoint:'https://login.example.com/idp/demo/authn/userinfo',introspection_endpoint:'https://login.example.com/idp/demo/authn/introspect',registration_endpoint:'https://login.example.com/idp/demo/authn/register',pushed_authorization_request_endpoint:'https://login.example.com/idp/demo/authn/par',backchannel_authentication_endpoint:'https://login.example.com/idp/demo/authn/bcauthorize',end_session_endpoint:'https://login.example.com/idp/demo/authn/logout',grant_types_supported:['authorization_code','refresh_token','client_credentials','urn:openid:params:grant-type:ciba'],scopes_supported:['openid','profile','offline_access'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_basic','private_key_jwt','tls_client_auth'],claims_supported:['sub','iss','aud','exp','iat','auth_time','acr','amr','nonce','groupids','role']};
function oidcTarget(raw){
 let value=raw.trim();if(!value)throw Error('Give me an issuer URL first. Even scanners need a destination.');
 if(!/^https?:\/\//i.test(value))value='https://'+value;
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port)throw Error('Use a public HTTPS issuer without credentials, query, fragment, or custom port.');
 if(!u.hostname.includes('.')||u.hostname==='localhost'||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||/^(?:127|10|0|192\.168|169\.254|172\.(?:1[6-9]|2\d|3[01]))\./.test(u.hostname)||u.hostname==='[::1]')throw Error('Private and local hosts are out of scope for this public scanner.');
 let path=u.pathname.replace(/\/+$/,'');let full=false;
 if(path.endsWith('/.well-known/openid-configuration')){path=path.slice(0,-'/.well-known/openid-configuration'.length);full=true;}
 // Standard OIDC Discovery 1.0 appends the well-known segment to the issuer path.
 const issuer=u.origin+path;
 return {issuer,url:issuer+'/.well-known/openid-configuration',providedFull:full};
}
function providerChecks(m,expected){
 const issues=[];const add=(level,title,why,verify)=>issues.push({level,title,why,verify});
 const arr=k=>Array.isArray(m[k])?m[k]:[];
 if(expected&&m.issuer!==expected)add('review','Issuer differs from requested URL','Metadata issuer is '+String(m.issuer||'missing')+'. Some multi-tenant providers publish templated issuers; do not assume an exact trust match.','Confirm the intended tenant and compare the exact issuer against issued tokens and provider documentation.');
 if(!m.issuer||!m.authorization_endpoint||!m.token_endpoint||!m.jwks_uri)add('review','Core OIDC metadata incomplete','One or more standard discovery fields are missing.','Confirm this is an OIDC discovery document and review required fields in the specification.');
 for(const key of ['issuer','authorization_endpoint','token_endpoint','jwks_uri']){
  if(m[key]===undefined)continue;
  if(typeof m[key]!=='string'){add('review','Invalid '+key+' type','This required metadata field is not a URL string.','Check the discovery document against OpenID Connect Discovery 1.0.');continue;}
  try{const u=new URL(m[key]);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.hostname==='localhost')add('review','Unexpected '+key+' URL','The published value is not a conventional public HTTPS endpoint.','Confirm the issuer and endpoint URL requirements before configuring a client.');}
  catch{add('review','Malformed '+key+' URL','The published URL could not be parsed.','Correct or confirm the provider metadata before using it.');}
 }
 if(!Array.isArray(m.response_types_supported)||!m.response_types_supported.length)add('review','Response types not declared','OIDC discovery requires a nonempty response_types_supported array.','Confirm this is an OpenID Provider discovery document.');
 if(!Array.isArray(m.subject_types_supported)||!m.subject_types_supported.length)add('review','Subject types not declared','OIDC discovery requires a nonempty subject_types_supported array.','Confirm pairwise or public subject identifier support in provider documentation.');
 if(!Array.isArray(m.id_token_signing_alg_values_supported)||!m.id_token_signing_alg_values_supported.length)add('review','ID token signing algorithms not declared','OIDC discovery requires id_token_signing_alg_values_supported.','Check the provider configuration and client algorithm allowlist.');
 if(arr('code_challenge_methods_supported').includes('plain'))add('review','Plain PKCE method advertised','The plain method does not protect the verifier if the authorization request is exposed.','Require S256 for clients and verify enforcement; advertised support alone is not an exploit.');
 if(arr('request_object_signing_alg_values_supported').includes('none'))add('note','Unsigned request objects advertised','This can be legitimate for some clients, but request integrity depends on client policy.','Confirm signed request objects are required for high-assurance clients where appropriate.');

 if(arr('response_types_supported').some(x=>/\btoken\b|id_token/.test(x)&&x!=='code'))add('review','Implicit or hybrid response types advertised','Browser-delivered tokens can increase exposure if clients use legacy patterns.','Confirm applications use Authorization Code with PKCE and avoid implicit token delivery where possible.');
 if(arr('grant_types_supported').includes('password'))add('review','Resource Owner Password Credentials advertised','Password grant bypasses modern browser-based authentication patterns and is discouraged by current OAuth security guidance.','Confirm whether it is enabled for any production clients and plan migration.');
 if(arr('id_token_signing_alg_values_supported').includes('none'))add('review','Unsigned ID token algorithm advertised','Unsigned ID tokens require very specific constraints and must not be trusted by default.','Confirm client allowlists, issuer trust, and signature validation policy.');
 if(arr('id_token_signing_alg_values_supported').some(x=>/^HS/.test(x)))add('note','Symmetric ID token algorithms advertised','HS algorithms can be legitimate, but shared-secret key handling and algorithm pinning matter.','Confirm each client uses the intended algorithm and does not mix symmetric and asymmetric keys.');
 if(arr('code_challenge_methods_supported').length&&!arr('code_challenge_methods_supported').includes('S256'))add('review','S256 PKCE not advertised','The metadata lists PKCE methods but omits S256.','Confirm support for S256 and that public clients must use PKCE.');
 if(!arr('code_challenge_methods_supported').length)add('unknown','PKCE policy not established','The discovery document does not state PKCE methods. Absence of metadata does not prove PKCE is unsupported.','Check authorization-server policy and require S256 for applicable clients.');
 if(arr('token_endpoint_auth_methods_supported').includes('none'))add('note','Public client authentication advertised','The none method can be appropriate for public clients, not for confidential clients requiring authentication.','Confirm confidential clients use an appropriate client authentication method.');
 if(m.require_pushed_authorization_requests===false)add('note','PAR not mandatory','Pushed Authorization Requests are not required according to published metadata. This is not automatically a weakness.','Evaluate PAR requirements for high-assurance clients and authorization request integrity.');
 if(!issues.length)add('note','No obvious metadata red flags','No flagged patterns were detected in the published fields. That is not a security clearance.','Review client configuration, redirect URI validation, token checks, PKCE enforcement, and provider policies.');
 return issues;
}
function providerValue(v){return Array.isArray(v)?v.join(' · '):typeof v==='object'?JSON.stringify(v):String(v);}
function renderProvider(m,example=false,expected='',source='network'){
 if(!m||typeof m!=='object'||Array.isArray(m))throw Error('Expected a JSON object containing OIDC metadata.');
 const serialized=JSON.stringify(m);if(serialized.length>131072)throw Error('Metadata exceeds the 128 KB inspection limit.');
 const labels={issuer:'Issuer',authorization_endpoint:'Authorization',token_endpoint:'Token exchange',jwks_uri:'Public signing keys (JWKS)',userinfo_endpoint:'UserInfo',introspection_endpoint:'Token introspection',revocation_endpoint:'Token revocation',end_session_endpoint:'Session logout',pushed_authorization_request_endpoint:'Pushed authorization requests',backchannel_authentication_endpoint:'CIBA endpoint',response_types_supported:'Response types',grant_types_supported:'Grant types',scopes_supported:'Scopes',code_challenge_methods_supported:'PKCE methods',id_token_signing_alg_values_supported:'ID token signing',token_endpoint_auth_methods_supported:'Client authentication',claims_supported:'Claims'};
 const checks=providerChecks(m,expected);window.jwtProbeMetadata=example?null:structuredClone(m);window.jwtProbeSource=source;document.getElementById('probeResults')?.replaceChildren();document.getElementById('runProbe').disabled=example;document.getElementById('clearProbe').hidden=true;document.getElementById('probeStatus').textContent=example?'Illustrative metadata only. No endpoint requests are possible.':source==='paste'?'Locally inspected metadata. Endpoints are unverified; only check systems you are authorized to assess.':'Discovery complete. Optional endpoint checks are ready.'; // Public discovery alone must never establish a trusted issuer for JWT signature checks.
 const result=$('discoveryResult');result.replaceChildren();
 const heading=document.createElement('div');heading.className='provider-scan-head';
 const title=document.createElement('strong');title.textContent=example?'SAMPLE / NOT A LIVE SCAN':source==='paste'?'LOCAL METADATA REVIEW':'DISCOVERY RECEIVED';
 const origin=document.createElement('p');origin.className='provider-source';origin.textContent='SOURCE / '+(example?'Built-in example':source==='paste'?'Pasted JSON · origin unverified':String(m.issuer||expected||'Issuer not declared'));heading.append(origin);const sub=document.createElement('p');sub.textContent=example?'Illustrative provider configuration. No network request made.':source==='paste'?'Locally inspected pasted JSON. Its source and authenticity are unverified.':m.issuer===expected?'Public metadata retrieved. Issuer string matches the requested issuer; this is not a token trust decision.':'Public metadata retrieved. Issuer differs from the requested URL; review tenant or template behavior before establishing trust.';
 heading.append(title,sub);result.append(heading);
 const endpointKeys=Object.keys(labels).filter(k=>k.endsWith('_endpoint')||k==='jwks_uri');
 const capabilityKeys=Object.keys(labels).filter(k=>!endpointKeys.includes(k)&&k!=='issuer');
 const reviewCount=checks.filter(x=>x.level==='review').length;
 const unknownCount=checks.filter(x=>x.level==='unknown').length;
 const noteCount=checks.filter(x=>x.level==='note').length;
 const stats=document.createElement('nav');stats.className='provider-stats';stats.setAttribute('aria-label','Scan results navigation');
 const groups=[
  {title:'Endpoints',count:endpointKeys.filter(k=>m[k]!==undefined).length,id:'provider-endpoints',level:'normal'},
  {title:'Capabilities',count:capabilityKeys.filter(k=>m[k]!==undefined).length,id:'provider-capabilities',level:'normal'},
  {title:'Security review',count:reviewCount,id:'provider-reviews',level:reviewCount?'review':'normal'}
 ];
 for(const g of groups){const btn=document.createElement('button');btn.type='button';btn.className='provider-stat '+g.level;btn.setAttribute('aria-label',g.title+': '+g.count+'. Jump to section');const n=document.createElement('b');n.textContent=g.count;const l=document.createElement('small');l.textContent=g.title+' ↘';btn.append(n,l);btn.onclick=()=>{const target=document.getElementById(g.id);if(target){target.open=true;target.scrollIntoView({behavior:'smooth',block:'start'});target.focus({preventScroll:true});}};stats.append(btn);}
 result.append(stats);
 function makeGroup(id,title,keys,open){
  const group=document.createElement('details');group.id=id;group.className='provider-result-group';group.open=open;group.tabIndex=-1;
  const summary=document.createElement('summary');summary.textContent=title+' · '+keys.filter(k=>m[k]!==undefined).length;group.append(summary);
  for(const key of keys){if(m[key]===undefined)continue;const row=document.createElement('div');row.className='provider-field';const left=document.createElement('div');const strong=document.createElement('strong');strong.textContent=labels[key];const small=document.createElement('small');small.textContent=key;left.append(strong,small);const val=document.createElement('div');val.className='provider-field-value';val.textContent=providerValue(m[key]);row.append(left,val);group.append(row);}
  result.append(group);return group;
 }
 makeGroup('provider-endpoints','02 / ENDPOINTS',endpointKeys,true);
 makeGroup('provider-capabilities','03 / CAPABILITIES',capabilityKeys,false);
 const reviews=document.createElement('details');reviews.id='provider-reviews';reviews.className='provider-result-group';reviews.tabIndex=-1;reviews.open=reviewCount>0;
 const reviewSummary=document.createElement('summary');reviewSummary.textContent='04 / SECURITY REVIEW · '+(reviewCount?reviewCount+' item'+(reviewCount===1?'':'s')+' worth checking':'No immediate concerns flagged');reviews.append(reviewSummary);
 const intro=document.createElement('p');intro.className='muted small';intro.textContent=reviewCount?'These are configuration questions, not confirmed vulnerabilities. Open an item to see what to verify.':'Nothing in the advertised metadata triggered our review rules. That is a useful starting point, not a security clearance.';reviews.append(intro);
 function appendCheck(c,parent){const card=document.createElement('details');card.className='provider-check '+c.level;const summary=document.createElement('summary');summary.textContent=(c.level==='review'?'REVIEW':c.level==='unknown'?'NOT SHOWN':'FYI')+' / '+c.title;const p=document.createElement('p');p.textContent=c.why;const v=document.createElement('p');const st=document.createElement('strong');st.textContent='Next check: ';v.append(st,document.createTextNode(c.verify));card.append(summary,p,v);parent.append(card);}
 checks.filter(c=>c.level==='review').forEach(c=>appendCheck(c,reviews));
 if(unknownCount||noteCount){const more=document.createElement('details');more.className='provider-extra';const moreSummary=document.createElement('summary');moreSummary.textContent='Other observations · '+(unknownCount?' '+unknownCount+' not established':'')+(unknownCount&&noteCount?' ·':'')+(noteCount?' '+noteCount+' informational':'');more.append(moreSummary);const explain=document.createElement('p');explain.className='muted small';explain.textContent='Not shown means the metadata cannot answer the question. It is not a failed check. Informational notes are context, not findings.';more.append(explain);checks.filter(c=>c.level==='unknown'||c.level==='note').forEach(c=>appendCheck(c,more));reviews.append(more);}
 result.append(reviews);
 const footer=document.createElement('p');footer.className='muted small';footer.textContent='OWASP-aligned review prompts, not an OWASP compliance test. Discovery advertises capabilities; it cannot prove client-side enforcement, exploitability, or production exposure.';result.append(footer);
}
// Curated public metadata entry points; choosing one does not initiate a request.
const publicOidcPresets=[
 {name:'Google',url:'https://accounts.google.com',note:'Public OIDC issuer'},
 {name:'Microsoft Entra',url:'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',note:'Common authority · issuer may be templated'},
 {name:'GitLab',url:'https://gitlab.com',note:'Public GitLab.com issuer'},
 {name:'Salesforce',url:'https://login.salesforce.com',note:'Public login · orgs may use My Domain'},
 {name:'Apple',url:'https://appleid.apple.com',note:'Sign in with Apple · public OIDC issuer'},
 {name:'OIDC demo',url:'https://demo.duendesoftware.com',note:'Public demonstration issuer · not OpenID Foundation'}
];
const presetGrid=$('providerPresets');
for(const preset of publicOidcPresets){
 const button=document.createElement('button');button.type='button';button.className='provider-preset';
 const name=document.createElement('strong');name.textContent=preset.name;
 const note=document.createElement('small');note.textContent=preset.note;
 button.append(name,note);
 button.addEventListener('click',()=>{
  $('issuerInput').value=preset.url;
  presetGrid.querySelectorAll('button').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});
  button.classList.add('selected');button.setAttribute('aria-pressed','true');
  const t=oidcTarget(preset.url);
  $('providerPresetNote').textContent=preset.name+' selected · '+t.url+' · Press Discover metadata to fetch. '+preset.note+'.';
  $('issuerInput').focus({preventScroll:true});
 });
 button.setAttribute('aria-pressed','false');presetGrid.append(button);
}
$('issuerInput').addEventListener('input',()=>{presetGrid.querySelectorAll('button').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});});

$('providerClearJson').onclick=()=>{$('providerJsonInput').value='';};
$('providerAnalyzeJson').onclick=()=>{try{const raw=$('providerJsonInput').value;if(raw.length>131072)throw Error('Metadata too large (128 KB max).');const m=JSON.parse(raw);let expected='';try{expected=oidcTarget($('issuerInput').value).issuer;}catch{}renderProvider(m,false,expected,'paste');}catch(e){$('discoveryResult').textContent='Could not inspect metadata: '+e.message;}};
$('discoverBtn').onclick=async()=>{
 let target;try{target=oidcTarget($('issuerInput').value);}catch(e){$('discoveryResult').textContent=e.message;return;}
 $('providerTarget').replaceChildren();const label=document.createElement('span');label.textContent='Discovery URL · '+target.url;const link=document.createElement('a');link.href=target.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open directly ↗';$('providerTarget').append(label,link);
 $('discoveryResult').textContent='Reading public discovery metadata…';window.jwtProbeMetadata=null;$('runProbe').disabled=true;$('probeResults').replaceChildren();$('clearProbe').hidden=true;$('probeStatus').textContent='Waiting for discovery to complete…';
 try{const r=await fetch(target.url,{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error('HTTP '+r.status);const body=await r.text();if(body.length>131072)throw Error('Metadata too large (128 KB max).');renderProvider(JSON.parse(body),false,target.issuer,'network');}
 catch(e){$('discoveryResult').replaceChildren();const box=document.createElement('div');box.className='finding warn';const title=document.createElement('strong');title.textContent='Browser could not read the metadata';const msg=document.createElement('p');msg.textContent='This is not a vulnerability finding. '+e.message+'. CORS, network policy, or availability may be responsible. If needed, open the discovery URL directly. You can inspect its public JSON using the optional metadata decoder.';box.append(title,msg);$('discoveryResult').append(box);$('probeStatus').textContent='Endpoint checks unavailable: the browser could not read discovery metadata. This may be a CORS restriction, not a provider fault. Open the discovery URL directly or inspect public JSON locally.';}
};
const probeOutput=$('probeResults');
const microLaunch=document.getElementById('microLaunch');
let microscopeEntries=[],microscopeIndex=0,microscopeReturn=null;
let microData=null,microVisible=[],microSelected="$",microExpanded=new Set(["$"]),microFilter="",microPendingG=false;
const microscope=$('probeMicroscope');
function microRender(){
 const e=microscopeEntries[microscopeIndex];if(!e)return;
 const tabs=$('microTabs');tabs.replaceChildren();microscopeEntries.forEach((item,i)=>{const b=document.createElement('button');b.type='button';b.className='micro-tab'+(i===microscopeIndex?' selected':'');b.textContent=(i+1).toString().padStart(2,'0')+' / '+item.name;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(i===microscopeIndex));b.onclick=()=>{microscopeIndex=i;microRender();};tabs.append(b);});
 $('microSubtitle').textContent=e.name+' · '+(e.evidence?.status===null?'No readable HTTP response':'HTTP '+e.evidence?.status)+' · '+e.status;
 const lane=$('microLane');lane.replaceChildren();const steps=[['01','REQUEST','GET',e.evidence?.url||'Endpoint not advertised'],['02','BROWSER',e.evidence?.readable?'Response received':'Response not observable',e.evidence?.readable?'A readable response reached the browser.':'CORS, redirects or network restrictions can hide the result.'],['03','REVIEW',e.level==='review'?'Needs a closer look':e.level==='observed'?'Observed':'No conclusion',e.message]];for(const [num,title,headline,desc] of steps){const el=document.createElement('div');el.className='micro-step';const n=document.createElement('span');n.className='micro-number';n.textContent=num;const content=document.createElement('div');const strong=document.createElement('strong');strong.textContent=title+' / '+headline;const p=document.createElement('p');p.textContent=desc;content.append(strong,p);el.append(n,content);lane.append(el);}
 const facts=$('microFacts');facts.replaceChildren();const ev=e.evidence||{};const rows=[['Method',ev.method||'Not sent'],['HTTP status',ev.status===null?'Not observable':String(ev.status)],['Content type',ev.contentType||'Not available'],['Auth challenge header',ev.authChallenge===null?'Not observable':ev.authChallenge?'Present':'Not exposed to browser'],['JWKS entries',ev.keyCount===null?'Not applicable':String(ev.keyCount)]];for(const [k,v] of rows){const d=document.createElement('div');d.className='micro-fact';const label=document.createElement('span');label.textContent=k;const val=document.createElement('strong');val.textContent=v;d.append(label,val);facts.append(d);}
 const raw=$('microRaw'),hint=$('microRawHint');const publicBody=ev.rawPublicJWKS;const payload=publicBody?(()=>{try{return JSON.stringify(JSON.parse(publicBody),null,2);}catch{return publicBody;}})():JSON.stringify({request:{method:ev.method||'GET',url:ev.url||null,credentials:'omit'},response:{status:ev.status,content_type:ev.contentType||null,www_authenticate:ev.authChallenge===null?null:ev.authChallenge?'present':'not exposed',readable:ev.readable},review:{level:e.level,status:e.status,message:e.message}},null,2);raw.textContent=payload;try{microData=JSON.parse(payload);}catch{microData={raw:payload};}microSelected='$';microExpanded=microExpandPaths(microData);microFilter='';$('microSearch').value='';microDrawTree();hint.textContent=publicBody?'Public JWKS JSON returned by the provider (maximum 128 KB). No secrets or tokens are requested.':'Sanitized observation record. UserInfo response bodies are deliberately not retained; inaccessible headers are not reconstructed.';
 $('microNote').textContent='Evidence boundary: '+(ev.note||'No request made.')+' Browser security rules may hide headers even when a response is received. This view deliberately does not retain or display response bodies, bearer tokens, or private data.';
}
function microPath(parts){return '$'+parts.map(k=>typeof k==='number'?`[${k}]`:`.${k}`).join('');}
function microExpandPaths(data){
 const expanded=new Set();
 function visit(value,path){if(value===null||typeof value!=='object')return;expanded.add(microPath(path));for(const [key,child] of Object.entries(value))visit(child,[...path,Array.isArray(value)?Number(key):key]);}
 visit(data,[]);return expanded;
}
function microExpandBranch(){
 const item=microVisible.find(x=>x.path===microSelected);if(!item)return;
 function visit(value,parts){if(value===null||typeof value!=='object')return;microExpanded.add(microPath(parts));for(const [key,child] of Object.entries(value))visit(child,[...parts,Array.isArray(value)?Number(key):key]);}
 visit(item.value,item.parts);microDrawTree();
}
function microValue(v){if(v===null)return 'null';if(Array.isArray(v))return `Array · ${v.length} items`;if(typeof v==='object')return `Object · ${Object.keys(v).length} fields`;return typeof v==='string'?JSON.stringify(v).slice(0,110):String(v);}
function microDrawTree(){
 const tree=$('microTree');tree.replaceChildren();microVisible=[];const filter=microFilter.toLowerCase();
 function matches(v,k){if(!filter)return true;if(String(k).toLowerCase().includes(filter))return true;if(v&&typeof v==='object')return Object.entries(v).some(([key,x])=>matches(x,key));return String(v).toLowerCase().includes(filter);}
 function add(v,key,parts,depth){if(!matches(v,key))return;const path=microPath(parts),complex=v!==null&&typeof v==='object';const b=document.createElement('button');b.type='button';b.className='micro-json-node';b.style.paddingLeft=(10+Math.min(depth,14)*15)+'px';b.setAttribute('role','treeitem');b.setAttribute('aria-selected',String(microSelected===path));const caret=document.createElement('span');caret.textContent=complex?(filter||microExpanded.has(path)?'▾':'▸'):'·';caret.className='micro-json-caret';const name=document.createElement('span');name.className='micro-json-key';name.textContent=String(key);const preview=document.createElement('span');preview.className='micro-json-preview';preview.textContent=': '+microValue(v);b.append(caret,name,preview);b.onclick=()=>{microSelected=path;if(complex){if(microExpanded.has(path))microExpanded.delete(path);else microExpanded.add(path);}microDrawTree();};tree.append(b);microVisible.push({path,parts,key,value:v});if(complex&&(filter||microExpanded.has(path))){(Array.isArray(v)?v.map((x,i)=>[i,x]):Object.entries(v)).forEach(([k,x])=>add(x,k,[...parts,k],depth+1));}}
 add(microData,'response',[],0);if(!microVisible.some(x=>x.path===microSelected))microSelected=microVisible[0]?.path||'$';microShowField();}
function microShowField(){const item=microVisible.find(x=>x.path===microSelected);$('microTree').querySelectorAll('.micro-json-node').forEach((b,i)=>{const selected=microVisible[i]?.path===microSelected;b.classList.toggle('selected',selected);b.setAttribute('aria-selected',String(selected));});}
function microMove(delta){const i=microVisible.findIndex(x=>x.path===microSelected);const item=microVisible[Math.max(0,Math.min(microVisible.length-1,i+delta))];if(!item)return;microSelected=item.path;microShowField();const b=[...$('microTree').querySelectorAll('.micro-json-node')].find(x=>x.classList.contains('selected'));b?.scrollIntoView({block:'nearest'});}
function microFold(open){const item=microVisible.find(x=>x.path===microSelected);if(!item||!item.value||typeof item.value!=='object')return;if(open)microExpanded.add(item.path);else microExpanded.delete(item.path);microDrawTree();}
$('microSearch').addEventListener('input',e=>{microFilter=e.target.value;microDrawTree();});
$('microExpand').onclick=()=>{function walk(v,p){if(v&&typeof v==='object'){microExpanded.add(microPath(p));Object.entries(v).forEach(([k,x])=>walk(x,[...p,k]));}}walk(microData,[]);microDrawTree();};
$('microCollapse').onclick=()=>{microExpanded=new Set();microDrawTree();};
$('microCopy').onclick=()=>{const item=microVisible.find(x=>x.path===microSelected);if(item)copyJSON(typeof item.value==='string'?item.value:JSON.stringify(item.value,null,2));};
const microRawDialog=$('microRawDialog');
$('microRawToggle').onclick=()=>{microRawDialog.showModal();$('microRawClose').focus();};
$('microRawClose').onclick=()=>microRawDialog.close();
$('microCopyAll').onclick=()=>copyJSON($('microRaw').textContent);
$('microRawCopy').onclick=()=>copyJSON($('microRaw').textContent);
microRawDialog.addEventListener('click',e=>{if(e.target===microRawDialog)microRawDialog.close();});
function microOpen(index){if(!microscopeEntries.length)return;microscopeReturn=document.activeElement;microscopeIndex=index;microRender();microscope.showModal();$('microClose').focus();}
microLaunch.onclick=()=>microOpen(0);
$('microClose').onclick=()=>microscope.close();microscope.addEventListener('close',()=>{if(microscopeReturn?.isConnected)microscopeReturn.focus({preventScroll:true});});microscope.addEventListener('click',e=>{if(e.target===microscope)microscope.close();});
document.addEventListener('keydown',e=>{
 if(!microscope.open||microRawDialog.open||e.ctrlKey||e.altKey||e.metaKey)return;
 if(e.target.closest('input,textarea,select,[contenteditable]')){if(e.key==='Escape'&&e.target===$('microSearch')){$('microSearch').blur();$('microTree').focus();e.preventDefault();e.stopImmediatePropagation();}return;}
 if(['[',']','ArrowLeft','ArrowRight'].includes(e.key)){microscopeIndex=(microscopeIndex+(['[','ArrowLeft'].includes(e.key)?-1:1)+microscopeEntries.length)%microscopeEntries.length;microRender();e.preventDefault();e.stopImmediatePropagation();return;}
 if(e.key==='/'){$('microSearch').focus();e.preventDefault();e.stopImmediatePropagation();return;}
 if(e.key==='g'){if(microPendingG){microPendingG=false;microMove(-microVisible.length);}else microPendingG=true;e.preventDefault();e.stopImmediatePropagation();return;}
 microPendingG=false;
 if(e.key==='G')microMove(microVisible.length);
 else if(e.key==='o')microExpandBranch();
 else if(e.key==='O'){microExpanded=microExpandPaths(microData);microDrawTree();}
 else if(e.key==='j'||e.key==='k')microMove(e.key==='j'?1:-1);
 else if(e.key==='h'||e.key==='l')microFold(e.key==='l');
 else if(e.key==='y')$('microCopy').click();
 else return;
 e.preventDefault();e.stopImmediatePropagation();
},true);

$('showJsonUtility').onclick=()=>{const d=$('providerPaste');d.hidden=!d.hidden;if(!d.hidden){d.open=true;d.scrollIntoView({behavior:'smooth',block:'nearest'});} $('showJsonUtility').setAttribute('aria-expanded',String(!d.hidden));};
$('clearProbe').onclick=()=>{probeOutput.replaceChildren();microscopeEntries=[];microLaunch.hidden=true;$('clearProbe').hidden=true;$('probeStatus').textContent='Results cleared. Ready for another quick check.';};
$('runProbe').onclick=async()=>{
 const metadata=window.jwtProbeMetadata;
 probeOutput.replaceChildren();microscopeEntries=[];microLaunch.hidden=true;
 if(!metadata){$('probeStatus').textContent='Nothing to check yet. Discover a provider first; the endpoint check needs its public metadata.';return;}
 if(!window.OidcQuickProbe?.scan){$('probeStatus').textContent='Probe module unavailable. Reload this page and check that assets/oidc-probe.js loaded.';return;}
 const button=$('runProbe');button.disabled=true;button.textContent='Checking public endpoints…';$('probeStatus').textContent='Sending up to two bounded requests. This may take a few seconds…';
 try{
  const report=await window.OidcQuickProbe.scan(metadata,{timeoutMs:6500});microscopeEntries=report.entries;microLaunch.hidden=!microscopeEntries.length;
  $('probeStatus').textContent='Endpoint checks complete · '+report.summary;$('clearProbe').hidden=false;const heading=document.createElement('p');heading.className='provider-source';const prefix=document.createElement('span');prefix.textContent='CHECKED / ';const host=document.createElement('strong');host.className='provider-host';host.textContent=String(metadata.issuer||'Issuer not declared');const suffix=document.createElement('span');suffix.textContent=' · '+(window.jwtProbeSource==='paste'?'pasted metadata, origin unverified':'live discovery metadata');heading.append(prefix,host,suffix);probeOutput.append(heading);
  for(const [entryIndex,entry] of report.entries.entries()){
   const card=document.createElement('details');card.className='probe-entry '+entry.level;
   const summary=document.createElement('summary');summary.textContent=(entry.level==='review'?'◇ REVIEW':entry.level==='unknown'?'○ NOT CHECKED':'✓ OBSERVED')+' / '+entry.name+' · '+entry.status;
   const detail=document.createElement('p');detail.textContent=entry.message;card.append(summary,detail);
   if(entry.facts&&entry.facts.length){const ul=document.createElement('ul');for(const fact of entry.facts){const li=document.createElement('li');li.textContent=fact;ul.append(li);}card.append(ul);}
   const inspect=document.createElement('button');inspect.type='button';inspect.className='micro-open';inspect.innerHTML='<svg class="microscope-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m6 18 3-3"/><path d="m9 15-2-2 5-5 2 2-5 5Z"/><path d="m12 8 2-2 4 4-2 2"/><path d="M7 21h13"/><path d="M17 14a5 5 0 0 1-5 5H8"/><path d="M18 4l2 2"/></svg> Inspect exchange';inspect.setAttribute('aria-label','Inspect '+entry.name+' request and response');inspect.onclick=()=>microOpen(entryIndex);card.append(inspect);probeOutput.append(card);
  }
 }catch(e){$('probeStatus').textContent='Quick checks stopped: '+e.message;}
 finally{button.disabled=!window.jwtProbeMetadata;button.textContent='Check public endpoints →';}
};
const concepts=[['JWT','A format for carrying claims. It is not itself a login protocol.'],['ID Token','An OIDC JWT that communicates an authentication result to a client.'],['Access Token','A credential for accessing an API; it may be opaque rather than a JWT.'],['OIDC','An identity layer on OAuth 2.0 that lets applications authenticate users.'],['PKCE','Protects authorization code exchange against interception and substitution.'],['JWKS','Public keys used to check signed tokens.'],['CIBA','A backchannel authentication journey that may be asynchronous.']];$('concepts').innerHTML=concepts.map(c=>`<div class="refitem"><strong>${safe(c[0])}</strong><p>${safe(c[1])}</p></div>`).join('');$('officialRefs').innerHTML=Object.entries({ 'JWT · RFC 7519':specs.jwt,'JWT Security · RFC 8725':specs.security,'JWS · RFC 7515':specs.jws,'OIDC Core':specs.oidc,'OIDC Discovery':specs.discovery,'OAuth 2.0 · RFC 6749':specs.oauth,'PKCE · RFC 7636':specs.pkce,'WebAuthn · W3C':specs.webauthn,'OIDC CIBA':specs.ciba}).map(([label,url])=>`<div class="refitem"><a href="${safe(url)}" target="_blank" rel="noopener noreferrer">${safe(label)} ↗</a></div>`).join('');
$('shortcuts').onclick=()=>openShortcutHelp();document.addEventListener('keydown',e=>{const typing=e.target.matches('input,textarea,select,[contenteditable]');if(e.key==='Escape'&&typing){e.target.blur();return;}if(microscope.open||microRawDialog.open||shortcutHelpOpen()||typing||e.ctrlKey||e.metaKey||e.altKey)return;if((e.key==='['||e.key===']')&&!isDetailActive()){
 const tabs=['inspect','diagnose','journeys','provider','reference'];
 const current=tabs.findIndex(id=>$(id).classList.contains('active'));
 page(tabs[(current+(e.key==='['?-1:1)+tabs.length)%tabs.length]);
 e.preventDefault();
 }else if(e.key==='?'){openShortcutHelp();e.preventDefault();}else if(e.key==='/'){page('inspect');$('tokenInput').focus();e.preventDefault();}else if(/^[1-5]$/.test(e.key)&&!$('journeys').classList.contains('active')){page(['inspect','diagnose','journeys','provider','reference'][Number(e.key)-1]);}else if($('journeys').classList.contains('active')&&['j','k'].includes(e.key)){activeStep=Math.min(journeys[activeJourney].steps.length-1,Math.max(0,activeStep+(e.key==='j'?1:-1)));drawJourney();e.preventDefault();}});

// Linked JSON navigator: values are rendered with textContent, never injected as HTML.
let jsonData=null,jsonRoot='payload',jsonExpanded=new Set(['$']),jsonSelected=null,jsonQuery='',jsonVisible=[];
let jsonVimPendingG=false;
const jEl=id=>document.getElementById(id);
function setJSONData(token,response){jsonData={header:token?.header||null,payload:token?.payload||null,response:response||null};jsonRoot=token?'payload':response?'response':'payload';jsonExpanded=jsonDefaultExpanded(jsonRoot);jsonSelected=null;jsonQuery='';jEl('jsonSearch').value='';renderJSON();}
function jsonAt(root,path){let o=jsonData?.[root];for(const k of path)o=o?.[k];return o;}
function jsonLabel(v){if(v===null)return 'null';if(Array.isArray(v))return `Array · ${v.length} items`;if(typeof v==='object')return `Object · ${Object.keys(v).length} fields`;if(typeof v==='string')return JSON.stringify(v).slice(0,100);return String(v);}
function jsonPath(path){return '$'+path.map(k=>typeof k==='number'?`[${k}]`:`.${k}`).join('');}
function jsonDefaultExpanded(root){
 const expanded=new Set();
 function visit(value,path){if(value===null||typeof value!=='object')return;expanded.add(jsonPath(path));for(const [key,child] of Object.entries(value))visit(child,[...path,Array.isArray(value)?Number(key):key]);}
 visit(jsonData?.[root],[]);return expanded;
}
function jsonExpandBranch(){
 const item=jsonSelectedItem();if(!item)return;
 function visit(value,parts){if(value===null||typeof value!=='object')return;jsonExpanded.add(jsonPath(parts));for(const [key,child] of Object.entries(value))visit(child,[...parts,Array.isArray(value)?Number(key):key]);}
 visit(item.value,item.parts);renderJSON();
}

function jsonCopyText(v){return typeof v==='string'?v:JSON.stringify(v,null,2);}
function renderJSON(){if(!jEl('jsonTree'))return;document.querySelectorAll('[data-json-root]').forEach(b=>{b.classList.toggle('active',b.dataset.jsonRoot===jsonRoot);b.disabled=!jsonData?.[b.dataset.jsonRoot]});const container=jEl('jsonTree');container.replaceChildren();jsonVisible=[];const value=jsonData?.[jsonRoot];if(value===null||value===undefined){container.textContent='No '+jsonRoot+' data available for this input.';showJSONField(null);return;}
const filter=jsonQuery.toLowerCase();function matches(v,key){if(!filter)return true;if(String(key).toLowerCase().includes(filter))return true;if(v&&typeof v==='object')return Object.entries(v).some(([k,x])=>matches(x,k));return String(v).toLowerCase().includes(filter);}
function add(v,key,path,parent,depth){if(!matches(v,key))return;const full=jsonPath(path),complex=v!==null&&typeof v==='object';const row=document.createElement('button');row.type='button';row.className='json-node'+(jsonSelected===full?' selected':'');row.style.paddingLeft=(8+Math.min(depth,12)*11)+'px';row.setAttribute('role','treeitem');row.setAttribute('aria-selected',String(jsonSelected===full));const tog=document.createElement('span');tog.className='json-toggle';tog.textContent=complex?(filter||jsonExpanded.has(full)?'▾':'▸'):'·';const label=document.createElement('span');label.className='json-key';label.textContent=key;const preview=document.createElement('span');preview.className='json-preview';preview.textContent=': '+jsonLabel(v);row.append(tog,label,preview);row.onclick=()=>{jsonVimPendingG=false;if(complex){if(jsonExpanded.has(full))jsonExpanded.delete(full);else jsonExpanded.add(full);}jsonSelected=full;showJSONField({key,path,value:v});renderJSON();};parent.append(row);jsonVisible.push({path:full,parts:path,key,value:v});if(complex&&(filter||jsonExpanded.has(full))){const entries=Array.isArray(v)?v.map((x,i)=>[i,x]):Object.entries(v);for(const [k,x] of entries)add(x,String(k),[...path,k],parent,depth+1);}}
add(value,jsonRoot,[],container,0);if(jsonSelected&&!jsonVisible.some(x=>x.path===jsonSelected))jsonSelected=null;if(!jsonSelected&&jsonVisible.length){const f=jsonVisible.find(x=>x.path!=='$')||jsonVisible[0];jsonSelected=f.path;showJSONField({key:f.key,path:f.parts,value:f.value});}container.querySelectorAll('.json-node').forEach((e,i)=>e.classList.toggle('selected',jsonVisible[i]?.path===jsonSelected));}
function showJSONField(item){const title=jEl('jsonFieldTitle'),path=jEl('jsonFieldPath'),value=jEl('jsonFieldValue'),explain=jEl('jsonFieldExplain'),spec=jEl('jsonFieldSpec');if(!item){title.textContent='No field selected';path.textContent='—';value.textContent='Select a field to inspect.';explain.textContent='';spec.replaceChildren();return;}title.textContent=item.key;path.textContent=jsonRoot+': '+jsonPath(item.path);value.textContent=jsonCopyText(item.value);const info=typeof explanations!=='undefined'?explanations[item.key]:null;explain.textContent=info?(info[0]+' — '+info[1]):'This field is part of the '+jsonRoot+' JSON. Inspect its value and compare it with the expected application or protocol behavior.';if(['exp','iat','nbf','auth_time'].includes(item.key)&&typeof item.value==='number')explain.textContent+=' Human time: '+new Date(item.value*1000).toLocaleString();spec.replaceChildren();if(info){const a=document.createElement('a');a.href='https://www.rfc-editor.org/rfc/rfc7519#section-4.1';a.target='_blank';a.rel='noopener noreferrer';a.textContent='JWT registered claims reference ↗';spec.append(a);}}
document.querySelectorAll('[data-json-root]').forEach(b=>b.addEventListener('click',()=>{jsonRoot=b.dataset.jsonRoot;jsonSelected=null;jsonExpanded=jsonDefaultExpanded(jsonRoot);renderJSON();}));
jEl('jsonSearch').addEventListener('input',e=>{jsonQuery=e.target.value;renderJSON();});jEl('jsonExpand').onclick=()=>{jsonExpanded=new Set(['$']);function walk(v,path){if(v&&typeof v==='object'){jsonExpanded.add(jsonPath(path));Object.entries(v).forEach(([k,x])=>walk(x,[...path,k]));}}walk(jsonData?.[jsonRoot],[]);renderJSON();};jEl('jsonCollapse').onclick=()=>{jsonExpanded=new Set();renderJSON();};
async function copyJSON(value){try{await navigator.clipboard.writeText(value);showToast('Copied to clipboard.');}catch{showToast('Clipboard access unavailable.');}}
jEl('jsonCopy').onclick=()=>{if(jsonData?.[jsonRoot])copyJSON(JSON.stringify(jsonData[jsonRoot],null,2));};jEl('jsonCopyValue').onclick=()=>{const x=jsonVisible.find(v=>v.path===jsonSelected);if(x)copyJSON(jsonCopyText(x.value));};
jEl('formatInput').onclick=()=>{const t=jEl('tokenInput');try{t.value=JSON.stringify(JSON.parse(t.value),null,2);jEl('inputHint').textContent='JSON formatted successfully';}catch{jEl('inputHint').textContent='JWT text is already compact; formatting applies to JSON responses.';}};
jEl('pasteInput').onclick=async()=>{try{jEl('tokenInput').value=await navigator.clipboard.readText();jEl('inputHint').textContent='Pasted locally. Select Analyze token.';}catch{showToast('Clipboard permission unavailable. Use Ctrl/Cmd+V.');}};

// Terminal First: scoped, optional Vim bindings for the visual JSON navigator.
// Capture phase allows Navigator-specific ? and / to take precedence over global shortcuts.
function jsonNavigatorActive(){return !!(jEl('raw')?.classList.contains('active') && jEl('result') && !jEl('result').classList.contains('hidden') && jEl('inspect')?.classList.contains('active'));}
function jsonSelectAt(index){if(!jsonVisible.length)return;const item=jsonVisible[Math.max(0,Math.min(index,jsonVisible.length-1))];jsonSelected=item.path;showJSONField({key:item.key,path:item.parts,value:item.value});renderJSON();const rows=[...jEl('jsonTree').querySelectorAll('.json-node')];const selected=rows.find(x=>x.classList.contains('selected'));selected?.scrollIntoView({block:'nearest'});jEl('jsonTree').focus({preventScroll:true});}
function jsonSelectedItem(){return jsonVisible.find(x=>x.path===jsonSelected)||jsonVisible[0];}
function jsonToggleSelected(open){const item=jsonSelectedItem();if(!item||!item.value||typeof item.value!=='object')return false;if(open)jsonExpanded.add(item.path);else jsonExpanded.delete(item.path);renderJSON();return true;}
function jsonCopySelected(){const item=jsonSelectedItem();if(!item){showToast('Select a field first.');return;}copyJSON(jsonCopyText(item.value));}
document.addEventListener('keydown',e=>{
  if(shortcutHelpOpen()||!jsonNavigatorActive()||e.ctrlKey||e.metaKey||e.altKey)return;
  const target=e.target;
  if(target.closest('input,textarea,select,[contenteditable="true"]'))return;
  // Active JSON Navigator owns its Vim shortcuts, even when focus remains on the tab or document.
  // Inputs, textareas, and selects are excluded above so normal typing always wins.
  if(e.key==='Escape'){jsonVimPendingG=false;jEl('jsonTree').focus({preventScroll:true});e.preventDefault();e.stopImmediatePropagation();return;}
  if(e.key==='/'){jsonVimPendingG=false;jEl('jsonSearch').focus();e.preventDefault();e.stopImmediatePropagation();return;}
  if(e.key==='?'){jsonVimPendingG=false;openShortcutHelp();e.preventDefault();e.stopImmediatePropagation();return;}
  if(e.key==='g'){if(jsonVimPendingG){jsonVimPendingG=false;jsonSelectAt(0);}else jsonVimPendingG=true;e.preventDefault();e.stopImmediatePropagation();return;}
  jsonVimPendingG=false;
  if(e.key==='G'){jsonSelectAt(jsonVisible.length-1);}
  else if(e.key==='o'){jsonExpandBranch();}
  else if(e.key==='O'){jsonExpanded=jsonDefaultExpanded(jsonRoot);renderJSON();}
  else if(e.key==='j'||e.key==='k'){const i=jsonVisible.findIndex(x=>x.path===jsonSelected);jsonSelectAt(i+(e.key==='j'?1:-1));}
  else if(e.key==='l'||e.key==='ArrowRight'){jsonToggleSelected(true);}
  else if(e.key==='h'||e.key==='ArrowLeft'){jsonToggleSelected(false);}
  else if(e.key==='y'){jsonCopySelected();}
  else return;
  e.preventDefault();e.stopImmediatePropagation();
},true);
// A mouse selection or tab switch still works without activating Vim shortcuts globally.

// Contextual keyboard help: native modal dialog preserves page, selection and scroll.
let shortcutReturnFocus=null;
function shortcutHelpOpen(){return !!document.getElementById('shortcutHelpDialog')?.open;}
function openShortcutHelp(){
 const d=document.getElementById('shortcutHelpDialog');if(!d||d.open)return;
 shortcutReturnFocus=document.activeElement;d.showModal();
}
const shortcutDialog=document.getElementById('shortcutHelpDialog');
shortcutDialog?.addEventListener('close',()=>{if(shortcutReturnFocus?.isConnected)shortcutReturnFocus.focus({preventScroll:true});shortcutReturnFocus=null;});
document.getElementById('closeShortcutHelp')?.addEventListener('click',()=>shortcutDialog.close());
shortcutDialog?.addEventListener('click',e=>{if(e.target===shortcutDialog)shortcutDialog.close();});

// Readline-inspired editing, scoped to text inputs and textareas only.
// Alt+F / Alt+B move by word; Ctrl+W removes the previous word (Readline semantics).
// Browser/OS shortcuts Ctrl+A/E/F/B remain native.
function editableWordBoundary(text, pos, direction) {
  let i=pos;
  if(direction<0){while(i>0 && /\s/u.test(text[i-1]))i--;while(i>0 && !/\s/u.test(text[i-1]) && /[\p{L}\p{N}_]/u.test(text[i-1]))i--;if(i===pos&&i>0)i--;}
  else{while(i<text.length && /[\p{L}\p{N}_]/u.test(text[i]))i++;while(i<text.length && /\s/u.test(text[i]))i++;if(i===pos&&i<text.length)i++;}
  return i;
}
document.addEventListener('keydown', e=>{
  const el=e.target;
  if(!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement))return;
  if(el instanceof HTMLInputElement && !['text','search','url','email',''].includes(el.type))return;
  if(el.readOnly||el.disabled||e.isComposing||e.metaKey)return;
  const key=e.key.toLowerCase();
  const forward=e.altKey&&!e.ctrlKey&&key==='f';
  const backward=e.altKey&&!e.ctrlKey&&key==='b';
  const killWord=e.ctrlKey&&!e.altKey&&!e.shiftKey&&key==='w';
  if(!forward&&!backward&&!killWord)return;
  if(el.selectionStart===null)return;
  e.preventDefault();e.stopImmediatePropagation();
  const start=el.selectionStart,end=el.selectionEnd;
  if(killWord){
    const from=start===end?editableWordBoundary(el.value,start,-1):start;
    el.setRangeText('',from,end,'start');
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }else{
    const at=editableWordBoundary(el.value,backward?start:end,backward?-1:1);
    el.setSelectionRange(at,at);
  }
},true);

// Confirm that the complete application module initialized.
document.documentElement.dataset.workbenchReady="true";
const appHealth=document.getElementById("appHealth");if(appHealth){appHealth.textContent="Workbench ready";appHealth.dataset.status="ready";}
