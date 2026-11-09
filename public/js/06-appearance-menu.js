/**
 * 06-appearance-menu.js
 * Business name/logo/tagline (brand), colour themes and dark mode, the slide-in menu (settings,
 * workspaces, AI choice, profile, account), the left rail and the logo upload.
 */

/* ---------- appearance ---------- */
const PALS={
orange:{name:'Orange',sw:'#F36B21'},
blue:{name:'Ocean blue',L:{or:'#2563EB',or2:'#93B4F5',bg:'#F3F6FC',panel:'#FFFFFF',ink:'#0F172A',muted:'#5A6780',line:'#DAE2F0',blue:'#1E3A8A',onblue:'#FFFFFF',onor:'#FFFFFF',side:'#0F1B33',sideor:'#7FA8FF'},D:{or:'#6EA2FF',or2:'#2C4F9E',bg:'#0C1322',panel:'#141E33',ink:'#EAF0FA',muted:'#93A1B8',line:'#25314A',blue:'#9DBBFF',onblue:'#0C1322',onor:'#0C1322',side:'#080D18',sideor:'#8DB4FF'}},
green:{name:'Forest green',L:{or:'#15803D',or2:'#8FD6A8',bg:'#F3F8F4',panel:'#FFFFFF',ink:'#10201A',muted:'#58695F',line:'#D9E5DC',blue:'#14532D',onblue:'#FFFFFF',onor:'#FFFFFF',side:'#0E2118',sideor:'#5FD98A'},D:{or:'#4ADE80',or2:'#1F6B3F',bg:'#0D1511',panel:'#15211A',ink:'#E8F3EC',muted:'#8FA698',line:'#233229',blue:'#86EFAC',onblue:'#0D1511',onor:'#0D1511',side:'#08100C',sideor:'#4ADE80'}},
purple:{name:'Royal purple',L:{or:'#7C3AED',or2:'#C4B0F7',bg:'#F7F4FC',panel:'#FFFFFF',ink:'#1B1330',muted:'#6A6080',line:'#E3DCF2',blue:'#4C1D95',onblue:'#FFFFFF',onor:'#FFFFFF',side:'#1B1230',sideor:'#B197FC'},D:{or:'#A78BFA',or2:'#4C3A8A',bg:'#120E1F',panel:'#1B1530',ink:'#EFEAFB',muted:'#A196BC',line:'#2C2445',blue:'#C4B5FD',onblue:'#120E1F',onor:'#120E1F',side:'#0C0916',sideor:'#B8A3FF'}},
rose:{name:'Rose',L:{or:'#E11D48',or2:'#F9A8B8',bg:'#FCF4F5',panel:'#FFFFFF',ink:'#2A1015',muted:'#76606A',line:'#F0DADF',blue:'#9F1239',onblue:'#FFFFFF',onor:'#FFFFFF',side:'#2A0F17',sideor:'#FF7A93'},D:{or:'#FB7185',or2:'#7F1D33',bg:'#170C10',panel:'#22141A',ink:'#FBECEF',muted:'#B39AA2',line:'#38222A',blue:'#FDA4AF',onblue:'#170C10',onor:'#170C10',side:'#0F070A',sideor:'#FB7185'}},
teal:{name:'Teal',L:{or:'#0F766E',or2:'#8ED9D1',bg:'#F2F8F8',panel:'#FFFFFF',ink:'#0F2422',muted:'#587270',line:'#D6E6E5',blue:'#134E4A',onblue:'#FFFFFF',onor:'#FFFFFF',side:'#0B2321',sideor:'#4FE0D0'},D:{or:'#2DD4BF',or2:'#145C55',bg:'#0A1514',panel:'#112221',ink:'#E6F4F2',muted:'#8DA9A6',line:'#1F3433',blue:'#99F6E4',onblue:'#0A1514',onor:'#0A1514',side:'#060E0D',sideor:'#2DD4BF'}},
gold:{name:'Gold',L:{or:'#B7791F',or2:'#EBC987',bg:'#FAF7F0',panel:'#FFFDF8',ink:'#241C0C',muted:'#75694E',line:'#E8DFC8',blue:'#7C4A03',onblue:'#FFFFFF',onor:'#FFFFFF',side:'#241B09',sideor:'#F2C14E'},D:{or:'#F2C14E',or2:'#6B4E10',bg:'#14100A',panel:'#1F1A0F',ink:'#F8F1E0',muted:'#B1A585',line:'#352D1B',blue:'#FCD34D',onblue:'#14100A',onor:'#14100A',side:'#0D0A05',sideor:'#F2C14E'}},
mono:{name:'Black and white',L:{or:'#111111',or2:'#9A9A9A',bg:'#FFFFFF',panel:'#FFFFFF',ink:'#111111',muted:'#666666',line:'#E4E4E4',blue:'#333333',onblue:'#FFFFFF',onor:'#FFFFFF',side:'#111111',sideor:'#FFFFFF'},D:{or:'#FFFFFF',or2:'#6B6B6B',bg:'#000000',panel:'#0E0E0E',ink:'#FFFFFF',muted:'#A0A0A0',line:'#262626',blue:'#D0D0D0',onblue:'#000000',onor:'#000000',side:'#000000',sideor:'#FFFFFF'}}
};
const TV=['bg','panel','ink','muted','line','or','or2','blue','onblue','onor','side','sideor'];
const zigU=(a,b)=>`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='24' viewBox='0 0 80 24' fill='none' stroke-width='3'%3E%3Cpath d='M0 18L20 4L40 18L60 4L80 18' stroke='%23${a.slice(1)}'/%3E%3Cpath d='M0 4L20 18L40 4L60 18L80 4' stroke='%23${b.slice(1)}'/%3E%3C/svg%3E")`;
const RT=document.documentElement;let hostTheme=RT.getAttribute('data-theme'),selfSet=false;
new MutationObserver(()=>{if(selfSet)return;const v=RT.getAttribute('data-theme');if(PREF.mode==='auto'&&v!==hostTheme){hostTheme=v;applyPrefs()}}).observe(RT,{attributes:true,attributeFilter:['data-theme']});
const PREF={mode:'auto',pat:false,pal:'mono',nav:'side'};
function theme(r){const P=PALS[PREF.pal],keys=[...TV.map(k=>'--'+k),'--zig','--zigs'];
if(!P||!P.L){keys.forEach(k=>r.style.removeProperty(k));return}
const dark=PREF.mode==='dark'||(PREF.mode==='auto'&&(hostTheme==='dark'||(hostTheme!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches))),V=dark?P.D:P.L;
TV.forEach(k=>r.style.setProperty('--'+k,V[k]));r.style.setProperty('--zig',zigU(V.ink,V.or));r.style.setProperty('--zigs',zigU('#F7F4EE',V.sideor))}

try{const t=localStorage.getItem('hub:theme');if(t==='light'||t==='dark')PREF.mode=t;PREF.pat=localStorage.getItem('hub:pat')==='1';const pl=localStorage.getItem('hub:pal');if(PALS[pl])PREF.pal=pl;}catch(e){}
function applyPrefs(){const r=document.documentElement;selfSet=true;if(PREF.mode==='auto'){if(hostTheme)r.setAttribute('data-theme',hostTheme);else r.removeAttribute('data-theme')}else r.setAttribute('data-theme',PREF.mode);selfSet=false;r.dataset.pat=PREF.pat?'on':'off';theme(r);
try{localStorage.setItem('hub:theme',PREF.mode);localStorage.setItem('hub:pat',PREF.pat?'1':'0');localStorage.setItem('hub:pal',PREF.pal);localStorage.setItem('hub:nav',PREF.nav)}catch(e){}
document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===PREF.mode)));document.querySelectorAll('[data-pal]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pal===PREF.pal)));const cb=$('#pat');if(cb)cb.checked=PREF.pat}
matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>applyPrefs());
const brand=()=>Object.assign({name:(window.HUB&&HUB.ws&&HUB.ws.name)||'My workspace',tag:'',email:'',phone:'',web:''},(W().home&&W().home.brand)||{});
const logoSrc=k=>{const b=(W().home&&W().home.brand)||{};return b.logo===''?'':(b.logo||(k==='d'?LOGO_D:LOGO_L))};
const brandLine=()=>{const b=brand(),t=[b.email,b.phone,b.web].filter(Boolean).join(' · ');return t?`<div class="bl">${esc(t)}</div>`:''};
function applyBrand(){const bl=$('#bl'),ls=logoSrc('d');if(bl){if(ls){bl.src=ls;bl.hidden=false}else bl.hidden=true}
const b=brand(),n=$('#wsname'),t=$('#wstag'),sn=$('#sbname');if(n&&document.activeElement!==n)n.value=b.name||'';if(t&&document.activeElement!==t)t.value=b.tag||'';if(sn)sn.textContent=b.name||'Workspace';renderRail();document.title=pname(PAGES.some(x=>x[0]===page)?page:'home')+' · '+(b.name||'My workspace')}
let ME={name:'',avatar:'',email:''},WSK='',wsArm=false,PIN=false,tF='all';
try{PIN=localStorage.getItem('hub:pin')==='1'}catch(e){}
function renderMenu(){
  const b=brand(),busy=!!GATE;
  const mi=(pg,l)=>`<button class="mi" data-go="${pg}">${l}</button>`;
  $('#menu').innerHTML=`<div class="mh"><div class="mt"><span>${esc(b.name)}</span></div><div class="act"><button class="sm" data-act="pin" aria-pressed="${PIN}" title="Keep this menu open while you work">Keep open</button><button class="sm" data-close="1" aria-label="Close menu">Close</button></div></div>`+
  (busy?'':`<h3>Go to</h3>${mi('settings','Settings')}${mi('policies','Policies')}${OWNER?mi('people','Invites'):''}<p class="sub">Theme, names, contact details, profile, workspaces and AI are all in Settings.</p>`)+
  (busy||!UID?'':`<h3>Account</h3><p class="sub">${esc(ME.email)}</p><button class="mi out" data-act="logout">Sign out</button>`);
  applyPrefs()}
function openMenu(){closeChat();renderMenu();$('#menu').hidden=false;$('#scrim').hidden=PIN;document.body.classList.toggle('pinned',PIN);$('#menubtn').setAttribute('aria-expanded','true');const f=$('#menu button');if(f)f.focus()}
function closeMenu(){$('#menu').hidden=true;document.body.classList.remove('pinned');if(!document.body.classList.contains('sb')&&!CH.thread)$('#scrim').hidden=true;$('#menubtn').setAttribute('aria-expanded','false');wsArm=false}
async function doLogout(){try{await HUB.api('POST','/api/auth/logout')}catch(e){}location.reload()}
document.addEventListener('click',e=>{const t=e.target;
if(t.closest('#menubtn')){$('#menu').hidden?openMenu():closeMenu();return}
if(t.closest('#scrim')||t.closest('[data-close]')){closeMenu();closeChat();closeSB();return}
const pn=t.closest('[data-act="pin"]');if(pn){PIN=!PIN;try{localStorage.setItem('hub:pin',PIN?'1':'0')}catch(x){}pn.setAttribute('aria-pressed',String(PIN));$('#scrim').hidden=PIN||$('#menu').hidden;document.body.classList.toggle('pinned',PIN&&!$('#menu').hidden);return}
if(t.closest('#mechip')){openMenu();return}
const g=t.closest('[data-go]');if(g){closeSB();goPage(g.dataset.go);return}
const m=t.closest('[data-mode]');if(m){PREF.mode=m.dataset.mode;applyPrefs();return}
const pl=t.closest('[data-pal]');if(pl){PREF.pal=pl.dataset.pal;applyPrefs();return}
const lo=t.closest('[data-act="logout"]');if(lo){doLogout();return}
});
document.addEventListener('change',e=>{if(e.target.id==='pat'){PREF.pat=e.target.checked;applyPrefs()}});
document.addEventListener('input',e=>{const t=e.target;if(!t.dataset||!t.dataset.brand)return;const w=W();w.home=w.home||{};w.home.brand=Object.assign({},brand(),{[t.dataset.brand]:t.value});if(t.dataset.brand==='name')syncWsName(t.value);applyBrand();queue()});
document.addEventListener('click',e=>{if(e.target.closest('#logobtn'))$('#logo-file2').click();const sb=e.target.closest('#sbtn');if(sb)document.body.classList.contains('sb')?closeSB():openSB()});
function openSB(){document.body.classList.add('sb');$('#scrim').hidden=false}
function closeSB(){document.body.classList.remove('sb');if($('#menu').hidden&&!CH.thread)$('#scrim').hidden=true}
/** The far-left strip: one tile per workspace you belong to, plus a "+" to create or join one. */
function renderRail(){const el=$('#rail');if(!el)return;const list=(window.HUB&&HUB.workspaces)||[];
el.innerHTML=list.map(w=>{const cur=w.id===HUB.wid,nm=cur?brand().name:w.name,ls=cur?logoSrc('d'):'';return `<button class="tile${cur?' on':''}" data-ws="${esc(w.id)}" title="${esc(nm)}" aria-label="Open ${esc(nm)}">${ls?`<img src="${ls}" alt="">`:esc((nm||'W').trim().charAt(0).toUpperCase())}</button>`}).join('')+`<button class="tile add" data-act="wsmenu" title="Create or join a workspace" aria-label="Create or join a workspace">＋</button>`}
function setLogo(v){const w=W();w.home=w.home||{};const b=Object.assign({},brand(),w.home.brand||{});if(v===undefined)delete b.logo;else b.logo=v;w.home.brand=b;applyBrand();renderMenu();queue();status('Logo updated.')}
document.addEventListener('change',e=>{const t=e.target;if((t.id!=='logo-file'&&t.id!=='logo-file2')||!t.files||!t.files[0])return;const f=t.files[0];if(f.size>2e6){status('That picture is too big. Pick one under 2 MB.',true);return}
const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const sc=Math.min(1,320/(Math.max(im.width,im.height)||1)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*sc));c.height=Math.max(1,Math.round(im.height*sc));c.getContext('2d').drawImage(im,0,0,c.width,c.height);setLogo(c.toDataURL('image/png'))};im.onerror=()=>status('Couldn’t read that picture.',true);im.src=r.result};r.readAsDataURL(f)});
document.addEventListener('click',e=>{const b=e.target.closest('button[data-act^="logo-"],button[data-act^="ws-"]');if(!b)return;const a=b.dataset.act,L=W().lists;
if(a==='logo-default')setLogo(undefined);else if(a==='logo-none')setLogo('');
else if(a==='ws-offers'){const have=new Set(L.offers.map(o=>o.name)),add=starter().ws.default.lists.offers.filter(o=>!have.has(o.name));L.offers.push(...add);save();view();renderMenu();status(add.length?add.length+' offers added.':'Those offers are already here.')}
else if(a==='ws-pols'){const have=new Set(L.policies.map(o=>o.title)),add=POLS.filter(o=>!have.has(o.title)).map(o=>({...o}));L.policies.push(...add);save();view();renderMenu();status(add.length?add.length+' policies added.':'Those policies are already here.')}
else if(a==='ws-reset'){if(!wsArm){wsArm=true;b.textContent='Tap again to erase everything';return}Object.keys(L).forEach(k=>{L[k]=[]});sel.clear();wsArm=false;save();view();closeMenu();status('Workspace reset to zero.')}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#menu').hidden){closeMenu();$('#menubtn').focus()}});
applyPrefs();
