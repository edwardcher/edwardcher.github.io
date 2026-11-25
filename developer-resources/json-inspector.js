/* Edwardcher.online — read-only JSON Inspector, adapted from FIDO MDS Explorer. */
(() => {
  'use strict';
  const stylesheet = new URL('json-inspector.css', document.currentScript.src).href;
  let instance;
  function create() {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({mode:'open'});
    const link = document.createElement('link'); link.rel='stylesheet'; link.href=stylesheet;
    root.append(link);
    const template = document.createElement('template');
    template.innerHTML = `<dialog id="raw-dialog" class="ec-json-inspector" aria-label="JSON Inspector"><div class="dialog-head"><h2 id="json-title">JSON Inspector</h2><div class="json-view-switch" role="group" aria-label="JSON display mode"><button id="json-view-tree" class="active" aria-pressed="true">Explorer</button><button id="json-view-raw" aria-pressed="false">Raw JSON</button></div><button id="close-raw" aria-label="Close">✕</button></div><div class="json-toolbar" id="json-toolbar"><input id="json-search" type="search" placeholder="Search keys, values or paths… (/)" aria-label="Search JSON fields"><span id="json-count" aria-live="polite"></span><button id="json-prev" title="Previous match (N)">↑</button><button id="json-next" title="Next match (n)">↓</button><button id="json-expand" title="Expand all nodes">Expand</button><button id="json-collapse" title="Collapse to top level">Collapse</button></div><div id="json-tree" role="tree" aria-label="Navigable JSON tree" tabindex="0"></div><pre id="json-raw" tabindex="0" aria-label="Read-only raw JSON" hidden></pre><div class="json-footer"><span id="json-path">$</span><button id="copy-path">Copy path</button><button id="copy-value">Copy value</button><button id="copy-raw">Copy full JSON</button></div><p class="json-help" id="json-help"><kbd>j</kbd>/<kbd>k</kbd> move · <kbd>h</kbd>/<kbd>l</kbd> collapse/expand · <kbd>Enter</kbd> toggle · <kbd>/</kbd> search · <kbd>n</kbd>/<kbd>N</kbd> matches · <kbd>g</kbd>/<kbd>G</kbd> first/last · <kbd>Esc</kbd> close</p><span id="json-status" role="status"></span></dialog>`;
    root.append(template.content.cloneNode(true));
    const $ = id => root.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    async function copy(text) {
      try { await navigator.clipboard.writeText(text); $('json-status').textContent='Copied'; }
      catch { $('json-status').textContent='Clipboard unavailable. Use Raw JSON to select text.'; }
    }
    $('close-raw').onclick=()=>$('raw-dialog').close();
    $('copy-raw').onclick=()=>copy(JSON.stringify(jsonData,null,2));
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
 
 jsonVisible=[];function walk(id){jsonVisible.push(id);if(!jsonCollapsed.has(id))jsonNodes[id].children.forEach(walk)}walk(0);
 if(!jsonVisible.includes(jsonActive))jsonActive=jsonVisible[0];
 $('json-tree').innerHTML=jsonVisible.map(id=>{const n=jsonNodes[id],branch=n.children.length>0,active=id===jsonActive,matched=q&&jsonMatches.includes(id);return `<div class="json-row${active?' json-active':''}${matched?' json-match':''}" role="treeitem" aria-level="${n.depth+1}" aria-selected="${active}" ${branch?`aria-expanded="${!jsonCollapsed.has(id)}"`:''} data-node="${id}" style="--indent:${n.depth}"><span class="json-toggle">${branch?(jsonCollapsed.has(id)?'▸':'▾'):'·'}</span><span class="json-key">${esc(n.key)}</span><span class="json-colon">:</span><span class="json-value json-${n.kind}">${esc(jsonLabel(n))}</span></div>`}).join('');
 $('json-count').textContent=q?`${jsonMatches.length} match${jsonMatches.length===1?'':'es'}`:`${jsonNodes.length} fields/nodes`;
 const current=jsonNodes[jsonActive];$('json-path').textContent=current.path;
 $('json-tree').querySelectorAll('.json-row').forEach(row=>row.onclick=()=>{const id=Number(row.dataset.node);if(jsonActive===id&&jsonNodes[id].children.length)jsonCollapsed.has(id)?jsonCollapsed.delete(id):jsonCollapsed.add(id);jsonActive=id;jsonRender()});
}
function jsonFocus(id){if(id===undefined||id===null)return;jsonReveal(id);jsonActive=id;jsonRender();$('json-tree').querySelector('.json-active')?.scrollIntoView({block:'nearest'})}
function jsonStepMatch(step){if(!jsonMatches.length)return;let at=jsonMatches.indexOf(jsonActive);jsonMatchIndex=at>=0?at:jsonMatchIndex;jsonMatchIndex=(at<0&&jsonMatchIndex<0?(step>0?0:jsonMatches.length-1):(jsonMatchIndex+step+jsonMatches.length)%jsonMatches.length);jsonFocus(jsonMatches[jsonMatchIndex])}
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
function openJsonExplorer(data){jsonData=data;jsonNodes=[];jsonCollapsed=new Set();jsonBuild(data); if(jsonNodes.length>1500)jsonCollapsed=new Set(jsonNodes.filter(n=>n.children.length&&n.id!==0).map(n=>n.id));jsonActive=0;jsonMatchIndex=-1;$('json-search').value='';$('json-raw').textContent=JSON.stringify(data,null,2);jsonRender();if(!$('raw-dialog').open)$('raw-dialog').showModal();setJsonMode('tree')}
$('json-search').addEventListener('input',()=>{jsonMatchIndex=-1;jsonRender();if(jsonMatches.length)jsonFocus(jsonMatches[0])});
$('json-next').onclick=()=>jsonStepMatch(1);$('json-prev').onclick=()=>jsonStepMatch(-1);
$('json-expand').onclick=()=>{jsonCollapsed.clear();jsonRender()};
$('json-collapse').onclick=()=>{jsonCollapsed=new Set(jsonNodes.filter(n=>n.children.length&&n.id!==0).map(n=>n.id));jsonActive=0;jsonRender()};
$('copy-path').onclick=()=>copy(jsonNodes[jsonActive]?.path||'$');
$('copy-value').onclick=()=>copy(JSON.stringify(jsonNodes[jsonActive]?.value,null,2));
$('raw-dialog').addEventListener('keydown',e=>{
 e.stopPropagation(); if(e.key==='Escape'||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
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


    return {open(data,title){
      const snapshot=JSON.parse(JSON.stringify(data));
      $('json-title').textContent=title || 'JSON Inspector';
      $('json-status').textContent='';
      openJsonExplorer(snapshot);
    }};
  }
  window.EdwardcherJSONInspector = Object.freeze({open(data,title){
    instance ||= create(); instance.open(data,title);
  }});
})();
