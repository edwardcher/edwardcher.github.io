/* JWT++ OIDC Quick Probe · standalone browser module · no dependencies.
   Three stages: scanner -> normalized observations -> conservative reviewer.
   Passive public JWKS GET plus one unauthenticated UserInfo GET. No credentialed requests.
   Never treat a blocked CORS response as a vulnerability. */
(function(root){'use strict';
 const MAX_BYTES=131072;
 function safeUrl(value){
  if(typeof value!=='string')return null;
  let u;try{u=new URL(value);}catch{return null;}
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hash)return null;
  const host=u.hostname.toLowerCase();
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||host==='[::1]'||host.startsWith('127.')||host.startsWith('10.')||host.startsWith('192.168.')||host.startsWith('169.254.')||host.startsWith('172.')&&Number(host.split('.')[1])>=16&&Number(host.split('.')[1])<=31||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.startsWith('['))return null;
  return u.href;
 }
 function bytes64(s){if(typeof s!=='string'||s.length>12000||!/^[A-Za-z0-9_-]+$/.test(s))return 0;return Math.floor(s.length*3/4)-(s.endsWith('==')?2:s.endsWith('=')?1:0);}
 async function request(url,timeoutMs){const c=new AbortController();const timer=setTimeout(()=>c.abort(),timeoutMs);try{
  const r=await fetch(url,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:c.signal,headers:{Accept:'application/json'}});
  const ct=r.headers.get('content-type')||'';const auth=r.headers.get('www-authenticate')||'';
  let body='';if(r.status===200){const reader=r.body?.getReader();if(reader){const decoder=new TextDecoder();let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES){await reader.cancel();throw Error('Response exceeded 128 KB');}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}else{body=await r.text();if(body.length>MAX_BYTES)throw Error('Response exceeded 128 KB');}}
  return {kind:'http',status:r.status,contentType:ct,authHeader:auth,body};
 }catch(e){return {kind:'unobservable',reason:e.name==='AbortError'?'Timeout or aborted request':'Your browser could not read the response. The provider may restrict cross-origin requests (CORS), or a network or redirect issue may have interrupted the check.'};}finally{clearTimeout(timer);}}
 function normalize(metadata,timeoutMs){const jobs=[];for(const [name,field] of [['JWKS','jwks_uri'],['UserInfo','userinfo_endpoint']]){if(!metadata[field]){jobs.push({name,field,missing:true});continue;}const url=safeUrl(metadata[field]);jobs.push({name,field,url,invalid:!url});}return jobs;}
 function reviewJWKS(response){const facts=[];if(response.kind!=='http')return {level:'unknown',status:'Could not check',message:response.reason+' No conclusion about the provider can be drawn from this browser check.',facts};if(response.status!==200)return {level:'unknown',status:'HTTP '+response.status,message:'Public key endpoint did not return a readable JWKS. Not enough evidence to assign a security finding.',facts};let obj;try{obj=JSON.parse(response.body);}catch{return {level:'review',status:'Invalid JSON',message:'The public JWKS response is not valid JSON.',facts};}
 if(!obj||!Array.isArray(obj.keys))return {level:'review',status:'Invalid JWKS',message:'Expected a JSON object with a keys array.',facts};
 const keys=obj.keys.slice(0,128);let review=false;const seen=new Set();let duplicates=0,privateFields=0,weakRSA=0,unknownCurve=0;const privateNames=['d','p','q','dp','dq','qi','oth','k'];
 for(const k of keys){if(!k||typeof k!=='object'){review=true;continue;}if(typeof k.kid==='string'){if(seen.has(k.kid))duplicates++;seen.add(k.kid);}if(privateNames.some(x=>Object.hasOwn(k,x)))privateFields++;
  if(k.kty==='RSA'&&typeof k.n==='string'&&bytes64(k.n)*8<2048)weakRSA++;
  if(k.kty==='EC'&&k.crv&&!['P-256','P-384','P-521'].includes(k.crv))unknownCurve++;
 }
 if(obj.keys.length>128){review=true;facts.push('More than 128 keys; inspection limited to first 128.');}
 facts.push(keys.length+' public key entries inspected');if(duplicates){review=true;facts.push(duplicates+' duplicate kid value(s)');}if(privateFields){review=true;facts.push(privateFields+' key(s) include private or symmetric secret parameters');}if(weakRSA){review=true;facts.push(weakRSA+' RSA key(s) below 2048-bit estimated modulus length');}if(unknownCurve){review=true;facts.push(unknownCurve+' non-standard or unexpected EC curve(s)');}
 if(!keys.length)facts.push('No keys advertised; confirm expected key publishing and rotation');
 return {level:review?'review':'observed',status:'HTTP 200',message:review?'Review the key hygiene observations. Metadata alone does not establish exploitability.':'Public key structure inspected. Key age, active use, and rotation history cannot be established from a single snapshot.',facts};}
 function reviewUserInfo(response){if(response.kind!=='http')return {level:'unknown',status:'Could not check',message:response.reason+' This is not a security finding. To verify the endpoint, inspect the HTTP status and WWW-Authenticate header with an authorized HTTP client such as curl.',facts:[]};const facts=[];if(response.authHeader)facts.push('WWW-Authenticate header present');
 if(response.status===401)return {level:'observed',status:'HTTP 401',message:'Unauthenticated UserInfo request was rejected. This single response does not prove access-control enforcement for every path.',facts};
 if(response.status===200)return {level:'review',status:'HTTP 200',message:'UserInfo returned success without an access token. Verify whether it exposes user data; the tool intentionally does not display the response body.',facts};
 return {level:'unknown',status:'HTTP '+response.status,message:'Unexpected response to unauthenticated UserInfo GET. Check provider behavior; this alone is not evidence of a vulnerability.',facts};}
 async function scan(metadata,options={}){if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))throw Error('Valid discovery metadata is required.');const timeoutMs=Math.max(1000,Math.min(10000,Number(options.timeoutMs)||6500));const jobs=normalize(metadata,timeoutMs);
  const entries=await Promise.all(jobs.map(async job=>{if(job.missing)return {name:job.name,level:'unknown',status:'Not advertised',message:'No '+job.field+' in discovery metadata.',facts:[]};if(job.invalid)return {name:job.name,level:'unknown',status:'Skipped unsafe URL',message:'Only public HTTPS URLs on standard port 443 are eligible. No request sent.',facts:[]};const observation=await request(job.url,timeoutMs);const reviewed=(job.name==='JWKS'?reviewJWKS(observation):reviewUserInfo(observation));return {name:job.name,...reviewed,evidence:{url:job.url,method:'GET',status:observation.kind==='http'?observation.status:null,contentType:observation.kind==='http'?observation.contentType:'',authChallenge:observation.kind==='http'?Boolean(observation.authHeader):null,readable:observation.kind==='http',note:observation.kind==='http'?'Browser-readable HTTP response':'Browser could not observe the response; no HTTP status or headers are available.',rawPublicJWKS:job.name==='JWKS'&&observation.kind==='http'&&observation.status===200?observation.body:null,keyCount:job.name==='JWKS'&&observation.kind==='http'&&observation.status===200?(()=>{try{const k=JSON.parse(observation.body).keys;return Array.isArray(k)?k.length:null;}catch{return null;}})():null}};}));
  return {entries,summary:entries.filter(x=>x.level==='review').length+' review · '+entries.filter(x=>x.level==='observed').length+' observed · '+entries.filter(x=>x.level==='unknown').length+' not checked'};
 }
 root.OidcQuickProbe=Object.freeze({scan,reviewJWKS,reviewUserInfo,safeUrl});
})(window);
