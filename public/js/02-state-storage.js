/**
 * 02-state-storage.js
 * The app's state (S = the open workspace's data) and how it is saved.
 * Data is stored on the server as "blobs": each list (offers, quotes, ...) is one JSON string
 * split into chunks, so any size fits. pull() refreshes when someone else changed something.
 */

let GATE={state:'loading'},CLOUD=null,DB=null,UM=null,UID=null,OWNER=false,PEOPLE=null,saving=false,dirty=false;
let S=defaults(),page=(location.hash||'#home').slice(1),newIdx=-1,newList='',undo=null,tm,AI=false,DL=null,genBusy=false,genStop=false,calFilter='';
const sel=new Set();
const W=()=>S.ws.default;
function status(t,err,html){const s=$('#status');s.className=err?'err':'';if(html)s.innerHTML=t;else s.textContent=t}
function save(){if(CLOUD){status('Saving…');cloudSave()}}
function queue(){status('Saving…');clearTimeout(tm);tm=setTimeout(()=>{tm=0;save()},300)}
function sortCal(){W().lists.calendar.sort((a,b)=>(a.date||'9').localeCompare(b.date||'9'))}
function grow(t){t.style.height='auto';t.style.height=t.scrollHeight+'px'}
const KEYS=['home','offers','custom','quotes','calendar','campaigns','ads','audit','policies','tasks'];
const bref=n=>CLOUD.root.collection('blobs').doc(n);
async function putBlob(n,str,sz){const parts=[];for(let i=0;i<str.length;i+=sz)parts.push(str.slice(i,i+sz));if(!parts.length)parts.push('');
let old=0;try{const m=await bref(n+'_meta').get();if(m.exists)old=m.data().n||0}catch(e){}
for(let i=0;i<parts.length;i++)await bref(n+'_'+i).set({s:parts[i]});
const rev=uid();await bref(n+'_meta').set({n:parts.length,rev});
for(let i=parts.length;i<old;i++){try{await bref(n+'_'+i).delete()}catch(e){}}
return rev}
async function getBlob(n){const m=await bref(n+'_meta').get();if(!m.exists)return null;const c=m.data().n||0,rev=m.data().rev;let t='';for(let i=0;i<c;i++){const d=await bref(n+'_'+i).get();t+=d.exists?d.data().s:''}return{s:t,rev}}
async function delBlob(n){try{const m=await bref(n+'_meta').get();if(m.exists){for(let i=0;i<(m.data().n||0);i++)await bref(n+'_'+i).delete();await bref(n+'_meta').delete()}}catch(e){}}
async function ensureFile(it){const f=it.file;if(!f)return null;if(f.data)return f.data;if(CLOUD&&f.fid){const b=await getBlob('pdf-'+f.fid);if(b){f.data=b.s;return b.s}}return null}
function parts(){const w=W(),L=w.lists;return{home:{home:w.home,gen:w.gen},offers:{v:L.offers},custom:{v:L.custom.map(c=>c.file?{...c,file:{name:c.file.name,fid:c.file.fid}}:c)},quotes:{v:L.quotes},calendar:{v:L.calendar},campaigns:{v:L.campaigns},ads:{v:L.ads},audit:{v:L.audit},policies:{v:L.policies},tasks:{v:L.tasks}}}
function assemble(p){const d=defaults().ws.default,h=p.home||{},w={home:Object.assign({},d.home,h.home),gen:Object.assign({},d.gen,h.gen),lists:{}};for(const k of KEYS.slice(1))w.lists[k]=p[k]&&Array.isArray(p[k].v)?p[k].v:d.lists[k];return fix({ws:{default:w}})}
async function cloudLoad(){const p={};CLOUD.rev={};CLOUD.last={};
for(const k of KEYS){const b=await getBlob('ws-'+k);if(b){try{p[k]=JSON.parse(b.s);CLOUD.rev[k]=b.rev;CLOUD.last[k]=b.s}catch(e){}}}
return p}
async function cloudSave(){if(saving){dirty=true;return}saving=true;
try{do{dirty=false;const pt=parts();for(const k of KEYS){const j=JSON.stringify(pt[k]);if(j!==CLOUD.last[k]){CLOUD.rev[k]=await putBlob('ws-'+k,j,60000);CLOUD.last[k]=j}}}while(dirty);status('All changes saved')}
catch(e){status('Couldn’t save to your workspace. Check your connection, then change something to try again.',true)}
saving=false}
async function pull(){if(!CLOUD||tm||saving||dirty)return;
try{let ch=false;for(const k of KEYS){const m=await bref('ws-'+k+'_meta').get();const r=m.exists?m.data().rev:null;if(r&&r!==CLOUD.rev[k]){ch=true;break}}
if(!ch)return;const ae=document.activeElement;if(ae&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName)&&$('#main').contains(ae))return;
const p=await cloudLoad();S=assemble(p);sel.clear();view();status('Updated with the latest changes.')}catch(e){}}
/** Open one workspace: read its saved data from the server, then show it. */
async function openWs(root){
  CLOUD={root:DB.doc(root),rev:{},last:{}};
  S=assemble(await cloudLoad());GATE=null;view();status('Changes save to this workspace.');
  startChat();renderNav();
  // Live refresh: when anyone saves workspace data, pull() re-reads what changed (it never interrupts typing).
  const blobs=CLOUD.root.collection('blobs');if(blobs.onChange)blobs.onChange(()=>pull());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pull()});setInterval(pull,45000)}
