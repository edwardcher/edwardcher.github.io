// Review snapshots are local planning records, not approvals.
export function fingerprint(s,i){const {reviews,baseline,...inputs}=s;return JSON.stringify(inputs)}
export function status(s,i){const r=s.reviews?.[i];return !r?'Draft':r.fingerprint===fingerprint(s,i)?'Reviewed':'Reassess'}
export function commit(s,i){s.reviews??={};s.reviews[i]={fingerprint:fingerprint(s,i),at:new Date().toISOString()};}
export function validateJourney(s){if(s.reviews!==undefined){if(!s.reviews||typeof s.reviews!=='object'||Array.isArray(s.reviews))throw Error('Invalid reviews');for(const [k,v] of Object.entries(s.reviews)){if(!/^[0-4]$/.test(k)||!v||typeof v.fingerprint!=='string'||v.fingerprint.length>50000||typeof v.at!=='string')throw Error('Invalid review')}}return s}
