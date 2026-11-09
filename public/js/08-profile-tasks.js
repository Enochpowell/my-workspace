/**
 * 08-profile-tasks.js
 * Profile photos (avatars), the small "you" card in the sidebar, and Tasks: assign work to people
 * and send it to them as a direct message.
 */

/* ---------- profile, avatars, tasks ---------- */
const AV={};
const av=(id,sz)=>{const src=id===UID?(ME.avatar||AV[id]):AV[id];if(src)return `<img class="av" style="width:${sz}px;height:${sz}px" src="${src}" alt="">`;const n=(id===UID?ME.name:CH.names[id])||'?';return `<span class="av" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz*.45)}px">${esc(n.trim().charAt(0).toUpperCase()||'?')}</span>`};
function shrink(file,px,cb){const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const m=Math.min(im.width,im.height),c=document.createElement('canvas');c.width=c.height=px;c.getContext('2d').drawImage(im,(im.width-m)/2,(im.height-m)/2,m,m,0,0,px,px);cb(c.toDataURL('image/jpeg',.85))};im.onerror=()=>status('Couldn’t read that picture.',true);im.src=r.result};r.readAsDataURL(file)}
function renderMe(){const el=$('#mechip');if(!el)return;if(!UID||GATE){el.hidden=true;return}el.hidden=false;el.innerHTML=`${av(UID,32)}<span><b>${esc(ME.name||'You')}</b><small>${OWNER?'Admin':'Member'}</small></span>`}
/** Save your name and/or photo on the server. */
async function saveProfile(patch){try{const r=await HUB.api('PATCH','/api/me',{name:ME.name,avatar:ME.avatar||'',...patch});ME.name=r.user.name;ME.avatar=r.user.avatar||'';AV[UID]=ME.avatar;CH.names[UID]=ME.name;HUB.me=r.user;renderMe();renderSide();const w=$('#pf-menu-av');if(w)w.innerHTML=av(UID,48);status('Profile saved.')}catch(e){status(e.message||'Could not save your profile.',true)}}
document.addEventListener('change',e=>{const t=e.target;if(t.id==='pf-file2'&&t.files[0])shrink(t.files[0],128,d=>saveProfile({avatar:d}));else if(t.id==='pf-n'){const v=t.value.trim().slice(0,40);if(v)saveProfile({name:v})}});
document.addEventListener('click',e=>{const b=e.target.closest('button[data-act^="pf-"]');if(!b)return;const a=b.dataset.act;if(a==='pf-pick')$('#pf-file2').click();else if(a==='pf-clear2')saveProfile({avatar:''})});
document.addEventListener('change',e=>{const t=e.target;if(t.id==='tf'){tF=t.value;view()}});
function taskBar(){return `<div class="filter"><label for="tf">Show</label><select id="tf"><option value="all"${tF==='all'?' selected':''}>All tasks</option><option value="mine"${tF==='mine'?' selected':''}>My tasks</option><option value="open"${tF==='open'?' selected':''}>Not done</option></select></div>`}
async function sendTo(cid,peer,text){const at=Date.now();CH.dmPeer[cid]=peer;await chRef(cid).collection('msgs').add({by:UID,text,at});const ex=CH.chans.find(x=>x.id===cid);if(ex)await chRef(cid).update({lastAt:at,lastBy:UID});else await chRef(cid).set({kind:'dm',members:[UID,peer],at,lastAt:at,lastBy:UID})}
function taskDM(it){if(!chatOK()){status('Messaging needs a shared workspace.',true);return}if(!it.assignee){status('Choose who this task is for first.',true);return}if(it.assignee===UID){status('That task is assigned to you.',true);return}
const txt=`New task for you: ${it.title||'Untitled'}${it.due?' (due '+it.due+')':''}${it.priority&&it.priority!=='Normal'?' · '+it.priority+' priority':''}${it.details?'\n'+it.details:''}`;
sendTo(dmId(it.assignee),it.assignee,txt).then(()=>status('Sent to '+nm(it.assignee)+' as a direct message.')).catch(()=>status('Couldn’t send. Try again.',true))}
