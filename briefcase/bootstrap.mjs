const app=document.getElementById('app');
const fallback=document.getElementById('app-fallback');
try {
 await import('/briefcase/executive.mjs');
 if (!app.hasChildNodes()) throw new Error('Empty application');
 fallback.hidden=true;
} catch(error) {
 console.error('Briefcase initialisation failed',error);
 app.replaceChildren();
 fallback.hidden=false;
}
