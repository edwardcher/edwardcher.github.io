const app=document.getElementById('app');
const fallback=document.getElementById('app-fallback');
const loading=document.getElementById('app-loading');
try {
 await import('./executive.mjs?v=review-progress-1');
 if (!app.hasChildNodes()) throw new Error('Empty application');
 fallback.hidden=true;
} catch(error) {
 console.error('Briefcase initialisation failed',error);
 app.replaceChildren();
 fallback.hidden=false;
} finally { loading.hidden=true; }
