/**
 * 07-chat.js
 * Chat: channels (General + groups), direct messages, comment threads on items, unread dots.
 * Messages live in the workspace store under channels/<id>/msgs. The SERVER decides who may read
 * a conversation (direct messages are private to the two people, even from admins).
 */

/* ---------- chat and comments ---------- */
const NAVP=['home','offers','quotes','calendar','campaigns','ads','audit'];
const chatOK=()=>!!(CLOUD&&UID);
const cmtBtn=(l,i)=>chatOK()?`<button class="sm" data-act="cmt" data-l="${l}" data-i="${i}">Comments</button>`:'';
const CH={cid:null,thread:null,chans:[],msgs:[],tmsgs:[],members:[],names:{},unsubL:null,unsubM:null,unsubT:null,newOpen:false,edit:false,delArm:false,read:{},dmPeer:{},ngName:'',ngOff:new Set()};
const chRef=id=>CLOUD.root.collection('channels').doc(id),tRef=k=>CLOUD.root.collection('comments').doc(k).collection('msgs'),nm=id=>id===UID?'You':(CH.names[id]||'Someone'),dmId=o=>'dm_'+[UID,o].sort().join('.');
const saveRead=()=>{try{localStorage.setItem('hub:chatread:'+UID,JSON.stringify(CH.read))}catch(e){}};
const visible=c=>c.kind==='dm'?(c.members||[]).includes(UID):(!c.members||c.members.includes(UID)||OWNER);
function badge(){const b=$('#sbtn');if(!b)return;const n=CH.chans.filter(c=>visible(c)&&c.lastAt>(CH.read[c.id]||0)&&c.lastBy!==UID).length;if(n)b.setAttribute('data-badge',n);else b.removeAttribute('data-badge')}
/** Who is in this workspace (names and photos come from the server). */
async function loadMembers(){try{const r=await HUB.api('GET','/api/workspaces/'+HUB.wid+'/members');CH.members=r.members.map(m=>m.id);if(!CH.members.includes(UID))CH.members.push(UID);CH.names={};r.members.forEach(m=>{CH.names[m.id]=m.name;if(m.avatar)AV[m.id]=m.avatar;else delete AV[m.id]});renderSide();if(page==='chat')renderHead()}catch(e){}}
function startChat(){if(!chatOK()||CH.unsubL)return;try{CH.read=JSON.parse(localStorage.getItem('hub:chatread:'+UID)||'{}')}catch(e){}
loadMembers();setInterval(loadMembers,20000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadMembers()});let seeded=false;
CH.unsubL=CLOUD.root.collection('channels').onSnapshot(s=>{CH.chans=s.docs.map(d=>({id:d.id,...d.data()}));if(!seeded){seeded=true;if(!CH.chans.some(c=>c.id==='general'))chRef('general').set({name:'General',kind:'group',members:null,at:Date.now(),lastAt:0})}badge();renderSide();if(page==='chat')renderHead()},()=>{});renderSide()}
function renderSide(){const el=$('#chatside');if(!el)return;if(!chatOK()||GATE){el.innerHTML='';return}
const groups=CH.chans.filter(c=>c.kind!=='dm'&&visible(c)).sort((a,b)=>a.id==='general'?-1:b.id==='general'?1:(a.name||'').localeCompare(b.name||''));
const item=(id,label,c,pre)=>{const un=c&&c.lastAt>(CH.read[id]||0)&&c.lastBy!==UID&&!(page==='chat'&&CH.cid===id);return `<button class="chi" data-chat="sel" data-id="${esc(id)}"${page==='chat'&&CH.cid===id?' aria-current="true"':''}>${pre||''}<span class="lb">${esc(label)}</span>${un?'<i class="dotu"></i>':''}</button>`};
const others=CH.members.filter(i=>i!==UID);others.forEach(i=>{CH.dmPeer[dmId(i)]=i});const mine=W().lists.tasks.filter(x=>x.assignee===UID&&x.status!=='Done').length;
const form=CH.newOpen?`<div class="ngf"><input id="ng-name" maxlength="40" placeholder="Group name" value="${esc(CH.ngName)}">${others.map(i=>`<label class="chk"><input type="checkbox" data-ngm="${esc(i)}"${CH.ngOff.has(i)?'':' checked'}> ${esc(nm(i))}</label>`).join('')}<button class="sm send" data-chat="mkg">Create group</button></div>`:'';
el.innerHTML=`<h4>Channels</h4>${groups.length?groups.map(c=>item(c.id,'# '+(c.name||'Group'),c)).join(''):item('general','# General',null)}<button class="chi add" data-chat="newg">＋ New group</button>${form}<button class="chi" data-go="tasks"${page==='tasks'?' aria-current="true"':''}>Tasks${mine?`<i class="cnt">${mine}</i>`:''}</button><h4>Direct messages</h4>${others.length?others.map(i=>item(dmId(i),nm(i),CH.chans.find(x=>x.id===dmId(i)),av(i,20))).join(''):'<p class="sub" style="padding:0 .6rem;color:#9A958A">Invite people to message them one to one.</p>'}`}
function chatMain(){return `<section class="chatmain"><header class="cm-h"><h1 id="ch-title">Chat</h1><div id="ch-sub"></div></header><div class="ch-m" id="ch-m" aria-live="polite"></div><div class="ch-i"><textarea id="chat-in" rows="1" maxlength="1000" placeholder="Write a message…" aria-label="Message"></textarea><button class="sm send" data-chat="send">Send</button></div></section>`}
function selectChan(cid){CH.cid=cid;CH.edit=false;CH.delArm=false;CH.read[cid]=Date.now();saveRead();badge();subMsgs();page='chat';try{history.replaceState(null,'','#chat')}catch(e){}closeSB();view()}
function subMsgs(){if(CH.unsubM){try{CH.unsubM()}catch(e){}CH.unsubM=null}CH.msgs=[];if(!CH.cid||!CLOUD)return;
CH.unsubM=chRef(CH.cid).collection('msgs').orderBy('at','desc').limit(100).onSnapshot(s=>{CH.msgs=s.docs.map(d=>({id:d.id,...d.data()})).reverse();if(CH.msgs.some(m=>m.by!==UID&&!CH.names[m.by])&&!CH._lm){CH._lm=1;loadMembers().finally(()=>setTimeout(()=>{CH._lm=0},5000))}if(page==='chat'){renderMsgs();CH.read[CH.cid]=Date.now();saveRead();badge();renderSide()}},()=>{})}
function renderHead(){const t=$('#ch-title'),sub=$('#ch-sub');if(!t)return;
if(CH.cid&&CH.cid.startsWith('dm_')){t.textContent=nm(CH.dmPeer[CH.cid]);sub.innerHTML='';return}
const c=CH.chans.find(x=>x.id===CH.cid);t.textContent=c?'# '+(c.name||'Group'):'# General';
const mine=c&&CH.cid!=='general'&&(OWNER||c.by===UID);
sub.innerHTML=mine?(CH.edit?`<div class="act"><input id="ch-rn" maxlength="40" value="${esc(c.name||'')}"><button class="sm send" data-chat="rensave">Save</button><button class="sm" data-chat="rencancel">Cancel</button></div>`:`<div class="act"><button class="sm" data-chat="ren">Rename</button><button class="sm rm" data-chat="delg">${CH.delArm?'Tap again to delete':'Delete group'}</button></div>`):''}
const msgHtml=(m,x)=>`<div class="msg${m.by===UID?' me':''}"><span class="mav">${av(m.by,30)}</span><div class="mb"><b>${esc(nm(m.by))}</b><small>${esc(new Date(m.at).toLocaleString([],{hour:'2-digit',minute:'2-digit',month:'short',day:'numeric'}))}</small>${OWNER||m.by===UID?`<button class="x" data-chat="${x}" data-id="${esc(m.id)}" aria-label="Delete message">Delete</button>`:''}<p>${esc(m.text)}</p></div></div>`;
function paint(id,list,x){const el=$(id);if(!el)return;const near=el.scrollHeight-el.scrollTop-el.clientHeight<80||!el.children.length;el.innerHTML=list.length?list.map(m=>msgHtml(m,x)).join(''):'<p class="empty">No messages yet. Say hello.</p>';if(near)el.scrollTop=el.scrollHeight}
const renderMsgs=()=>paint('#ch-m',CH.msgs,'del'),renderT=()=>paint('#th-m',CH.tmsgs,'tdel');
async function chatSend(kind){const ta=$(kind==='th'?'#th-in':'#chat-in');if(!ta)return;const text=(ta.value||'').trim().slice(0,1000);if(!text)return;ta.value='';const at=Date.now();
try{if(kind==='th'&&CH.thread)await tRef(CH.thread.key).add({by:UID,text,at});
else if(CH.cid){const cid=CH.cid;await chRef(cid).collection('msgs').add({by:UID,text,at});const ex=CH.chans.find(x=>x.id===cid);if(ex)await chRef(cid).update({lastAt:at,lastBy:UID});else await chRef(cid).set({kind:'dm',members:[UID,CH.dmPeer[cid]],at,lastAt:at,lastBy:UID})}}
catch(e){ta.value=text;status('Couldn’t send. Try again.',true)}}
function openThread(o){if(!chatOK())return;closeMenu();CH.thread=o;CH.tmsgs=[];const d=$('#chat');d.innerHTML=`<div class="ch-h"><b>Comments: ${esc(o.title)}</b><span class="gap"></span><button class="sm" data-chat="tclose" aria-label="Close comments">Close</button></div><p class="sub" style="padding:.5rem 1rem 0;margin:0">Everyone in this workspace can read and answer.</p><div class="ch-m" id="th-m" aria-live="polite"></div><div class="ch-i"><textarea id="th-in" rows="1" maxlength="1000" placeholder="Write a comment…" aria-label="Comment"></textarea><button class="sm send" data-chat="tsend">Send</button></div>`;d.hidden=false;$('#scrim').hidden=false;
if(CH.unsubT){try{CH.unsubT()}catch(e){}}CH.unsubT=tRef(o.key).orderBy('at','desc').limit(100).onSnapshot(s=>{CH.tmsgs=s.docs.map(x=>({id:x.id,...x.data()})).reverse();renderT()},()=>{});renderT();setTimeout(()=>{const t=$('#th-in');if(t)t.focus()},50)}
function closeChat(){const c=$('#chat');if(c)c.hidden=true;if(CH.unsubT){try{CH.unsubT()}catch(e){}CH.unsubT=null}CH.thread=null;const sc=$('#scrim');if(sc&&$('#menu').hidden&&!document.body.classList.contains('sb'))sc.hidden=true}
document.addEventListener('click',e=>{const t=e.target;
const cm=t.closest('button[data-act="cmt"]');if(cm){const l=cm.dataset.l,it=W().lists[l]&&W().lists[l][+cm.dataset.i];if(!it)return;if(!it.id){it.id=uid();save()}openThread({key:l+'-'+it.id,title:String(it.title||it.name||it.client||it.topic||it.site||'this item').slice(0,40)});return}
const b=t.closest('button[data-chat]');if(!b)return;const a=b.dataset.chat;
if(a==='tclose')closeChat();
else if(a==='sel')selectChan(b.dataset.id);
else if(a==='send')chatSend('ch');
else if(a==='tsend')chatSend('th');
else if(a==='newg'){CH.newOpen=!CH.newOpen;renderSide()}
else if(a==='mkg'){const name=($('#ng-name').value||'').trim().slice(0,40);if(!name){status('Give the group a name.',true);return}
const off=[...document.querySelectorAll('[data-ngm]')].filter(x=>!x.checked).map(x=>x.dataset.ngm),on=[...document.querySelectorAll('[data-ngm]')].filter(x=>x.checked).map(x=>x.dataset.ngm),id=uid();
chRef(id).set({name,kind:'group',members:off.length?[UID,...on]:null,by:UID,at:Date.now(),lastAt:0}).then(()=>{CH.newOpen=false;CH.ngName='';CH.ngOff=new Set();selectChan(id)}).catch(()=>status('Couldn’t create the group.',true))}
else if(a==='ren'){CH.edit=true;renderHead()}
else if(a==='rencancel'){CH.edit=false;renderHead()}
else if(a==='rensave'){const v=($('#ch-rn').value||'').trim().slice(0,40);if(v)chRef(CH.cid).update({name:v});CH.edit=false;renderHead()}
else if(a==='delg'){if(!CH.delArm){CH.delArm=true;renderHead();return}const id=CH.cid;CH.delArm=false;chRef(id).collection('msgs').get().then(async s=>{for(const d of s.docs){try{await chRef(id).collection('msgs').doc(d.id).delete()}catch(x){}}await chRef(id).delete();selectChan('general')}).catch(()=>status('Couldn’t delete the group.',true))}
else if(a==='del')chRef(CH.cid).collection('msgs').doc(b.dataset.id).delete().catch(()=>status('Couldn’t delete that message.',true));
else if(a==='tdel'&&CH.thread)tRef(CH.thread.key).doc(b.dataset.id).delete().catch(()=>status('Couldn’t delete that message.',true))});
document.addEventListener('input',e=>{const t=e.target;if(t.id==='ng-name')CH.ngName=t.value;if(t.dataset&&t.dataset.h&&t.dataset.h.startsWith('nav_'))setTimeout(()=>{renderNav();applyBrand()},0)});
document.addEventListener('change',e=>{const t=e.target;if(t.dataset&&t.dataset.ngm!==undefined){if(t.checked)CH.ngOff.delete(t.dataset.ngm);else CH.ngOff.add(t.dataset.ngm)}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&(e.target.id==='chat-in'||e.target.id==='th-in')){e.preventDefault();chatSend(e.target.id==='th-in'?'th':'ch')}if(e.key==='Escape'){if(CH.thread)closeChat();if(document.body.classList.contains('sb'))closeSB()}});
