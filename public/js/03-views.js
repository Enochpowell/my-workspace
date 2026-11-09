/**
 * 03-views.js
 * Drawing the pages: form fields (ctl), cards, quotations, banners, the Ads page, the
 * "Ask AI" panel. Pages are drawn as HTML strings and put into #main by view().
 */

function ctl(l,i,f,it){
const [k,label,type,opts]=f,id=`${l}-${i}-${k}`,d=`data-l="${l}" data-i="${i}" data-f="${k}"`;let c;
if(type==='long')c=`<textarea id="${id}" ${d} rows="2">${esc(it[k])}</textarea>`;
else if(type==='select')c=`<select id="${id}" ${d}>${opts.map(o=>`<option${o===it[k]?' selected':''}>${o}</option>`).join('')}</select>`;
else if(type==='camp'){const cs=W().lists.campaigns;c=`<select id="${id}" ${d}><option value="">No campaign</option>${cs.map(x=>`<option value="${esc(x.id)}"${x.id===it[k]?' selected':''}>${esc(x.name||'Untitled campaign')}</option>`).join('')}</select>`}
else if(type==='member'){const ids=chatOK()?CH.members.slice():[UID];if(UID&&!ids.includes(UID))ids.push(UID);if(it[k]&&!ids.includes(it[k]))ids.push(it[k]);c=`<select id="${id}" ${d}><option value="">Unassigned</option>${ids.map(i=>`<option value="${esc(i)}"${it[k]===i?' selected':''}>${esc(i===UID?'Me':nm(i))}</option>`).join('')}</select>`}
else if(type==='file'){const fl=it.file;
c=`<div class="pdf">${fl?`<span>${esc(fl.name)}</span><button class="sm" data-act="view" data-l="${l}" data-i="${i}">View here</button><button class="sm" data-act="open" data-l="${l}" data-i="${i}">Open in new tab</button><button class="sm" data-act="drop" data-l="${l}" data-i="${i}">Remove PDF</button>`:`<input id="${id}" type="file" accept="application/pdf" ${d}>`}</div>`}
else c=`<input id="${id}" type="${['date','email','tel'].includes(type)?type:'text'}" value="${esc(it[k])}" ${d}>`;
return `<div class="f f-${k}"><label for="${id}">${label}</label>${c}</div>`}
function card(l,i,it){
const sc=SCH[l],k=l+':'+i,on=sel.has(k);
return `<article class="item${on?' sel':''}${l===newList&&i===newIdx?' new':''}">${sc.f.map(f=>ctl(l,i,f,it)).join('')}${l==='campaigns'?campRuns(it,i)+campKit(it,i):l==='ads'?adCalc(it)+adCreative(it,i)+adGal(it,i)+adReady(it,i):''}<div class="act">${sc.pick?`<label class="pick"><input type="checkbox" data-pick="${k}"${on?' checked':''}> Add to quotation</label>${l==='custom'?`<button class="sm" data-act="offprint" data-i="${i}">Print or save as PDF</button>`:''}`:xbtn(l,i,it)}<button class="rm" data-act="rm" data-l="${l}" data-i="${i}">Remove</button></div></article>`}
const sumN=(a,k)=>a.reduce((t,x)=>{const n=num(x[k]);return t+(isNaN(n)?0:n)},0),naira=n=>'₦'+Math.round(n).toLocaleString('en-NG');
const num=s=>{const t=String(s||'').trim();return /^[₦N\s]*[\d,]+(\.\d+)?$/.test(t)?parseFloat(t.replace(/[^\d.]/g,'')):NaN};
function totalOf(q){const v=q.items.map(x=>num(x.amount));return q.items.length&&v.every(n=>!isNaN(n))?'₦'+v.reduce((a,b)=>a+b,0).toLocaleString('en-NG'):'Set one amount per line'}
function quoteCard(i,q){
const sc=SCH.quotes;
return `<article class="item${i===newIdx&&newList==='quotes'?' new':''}">${sc.f.map(f=>ctl('quotes',i,f,q)).join('')}
<div class="lines">${q.items.map((x,j)=>`<div class="ln"><input data-l="quotes" data-i="${i}" data-j="${j}" data-f="desc" value="${esc(x.desc)}" placeholder="What’s being quoted" aria-label="Item"><input data-l="quotes" data-i="${i}" data-j="${j}" data-f="amount" value="${esc(x.amount)}" placeholder="Amount" aria-label="Amount"><button class="rm" data-act="rmline" data-i="${i}" data-j="${j}" aria-label="Remove line">×</button></div>`).join('')}
<div class="tot"><span>Total</span><span id="tot-${i}">${esc(totalOf(q))}</span></div></div>
${ctl('quotes',i,['note','Note to the client','long'],q)}
<div class="sendrow"><small>Send or print</small>${cmtBtn('quotes',i)}<button class="sm send" data-act="email" data-i="${i}">Email</button><button class="sm send" data-act="wa" data-i="${i}">WhatsApp</button><button class="sm send" data-act="sms" data-i="${i}">SMS</button><button class="sm send" data-act="copy" data-i="${i}">Copy message</button><button class="sm" data-act="print" data-i="${i}">Print</button><button class="sm" data-act="msent" data-i="${i}">Mark as sent</button><button class="sm" data-act="mpaid" data-i="${i}">Mark as paid</button>${DL?`<button class="sm" data-act="save" data-i="${i}">Save file</button>`:''}</div>
<div class="act"><button class="sm" data-act="addline" data-i="${i}">Add line</button><button class="rm" data-act="rm" data-l="quotes" data-i="${i}">Remove</button></div></article>`}
function stats(p){const L=W().lists,c=(l,f,v)=>L[l].filter(x=>x[f]===v).length;
return{offers:[[L.offers.length,'rate card offers'],[L.custom.length,'custom offers']],
quotes:[[L.quotes.length,'quotations'],[c('quotes','status','Draft'),'drafts'],[c('quotes','status','Sent'),'sent'],[c('quotes','status','Accepted'),'accepted'],[c('quotes','status','Paid'),'paid']],
budget:budgetStats(),website:[[WS().length,'pages built']],calls:[[CL().numbers.length,'numbers'],[CL().triggers.length,'call rules'],[CL().voice.engine==='browser'?'Browser':'Other','voice']],images:[[GAL().filter(x=>x.kind==='Image').length,'pictures in the gallery']],video:[[GAL().filter(x=>x.kind==='Video'||x.kind==='GIF').length,'videos and GIFs in the gallery']],seo:[[W().lists.audit.length,'audits']],gallery:[[GAL().length,'files'],[GAL().filter(x=>x.kind==='Image').length,'pictures'],[GAL().filter(x=>x.kind!=='Image').length,'GIFs and videos']],calendar:[[PL().length,'calendars'],[PL().reduce((t,x)=>t+x.rows.length,0),'days planned'],[PL().reduce((t,x)=>t+x.rows.filter(r=>r.status==='Posted').length,0),'posted']],
campaigns:[[L.campaigns.length,'campaigns'],[c('campaigns','status','Live'),'live'],[c('campaigns','status','Planning'),'planning']],
ads:[[L.ads.length,'ads'],[c('ads','status','Live'),'live'],[new Set(L.ads.map(a=>a.platform)).size,'platforms'],[naira(sumN(L.ads,'budget')),'budget'],[naira(sumN(L.ads,'spend')),'spent']],
people:peopleCounts(),
tasks:[[L.tasks.length,'tasks'],[L.tasks.filter(x=>x.status!=='Done').length,'open'],[L.tasks.filter(x=>x.assignee===UID&&x.status!=='Done').length,'mine']],
policies:[[L.policies.length,'policies'],[c('policies','status','In force'),'in force'],[c('policies','status','Draft'),'drafts']],
audit:[[L.audit.length,'audits'],[c('audit','status','In progress'),'in progress'],[c('audit','status','Delivered'),'delivered']]}[p]}
const pname=p=>{const v=W().home['nav_'+p];return v!=null&&v!==''?v:PAGES.find(x=>x[0]===p)[1]};
function banner(p){const t=pname(p);
return `<header class="banner"><div><h1><textarea class="bt" data-h="ttl_${p}" rows="1" aria-label="Page title">${esc(W().home['ttl_'+p]!=null?W().home['ttl_'+p]:t)}</textarea></h1><p><textarea class="bs" data-h="dsc_${p}" rows="2" aria-label="Page description">${esc(W().home['dsc_'+p]!=null?W().home['dsc_'+p]:HELP[p])}</textarea></p><div class="chips2">${stats(p).map(s=>`<span><b>${s[0]}</b>${s[1]}</span>`).join('')}</div></div></header>`}
function plain(p){
const L=W().lists[p];let rows=L.map((it,i)=>[it,i]);
if(p==='calendar'&&calFilter)rows=rows.filter(r=>(r[0].client||'No client')===calFilter);
if(p==='tasks')rows=rows.filter(r=>tF==='all'||(tF==='mine'?r[0].assignee===UID:r[0].status!=='Done'));
if(p==='ads')rows=rows.filter(r=>(!adF.plat||r[0].platform===adF.plat)&&(!adF.camp||r[0].campaign===adF.camp));
const em=`<p class="empty">No ${SCH[p].plural} yet. Use the + button to add your first one${p==='quotes'?', or tick offers on the Offers page and build one':''}.</p>`;
return banner(p)+aiPanel(p)+(p==='calendar'?genPanel():'')+(p==='ads'?adsTop()+adConnect()+adsTracker():'')+(p==='calendar'?filterBar():'')+(p==='ads'?adFilterBar():'')+(p==='tasks'?taskBar():'')+`<div class="list l-${p}">${rows.length?rows.map(r=>p==='quotes'?quoteCard(r[1],r[0]):card(p,r[1],r[0])).join(''):em}</div>`}
function filterBar(){const cl=[...new Set(W().lists.calendar.map(x=>x.client||'No client'))];
return `<div class="filter"><label for="cf">Show plan</label><select id="cf" data-cf="1"><option value="">All plans</option>${cl.map(c=>`<option${c===calFilter?' selected':''}>${esc(c)}</option>`).join('')}</select></div>`}
function gf(k,label,type,opts){const v=W().gen[k];let c;
if(type==='long')c=`<textarea id="g-${k}" data-g="${k}" rows="3" placeholder="Who they are, what they want, tone, things to avoid…">${esc(v)}</textarea>`;
else if(type==='select')c=`<select id="g-${k}" data-g="${k}">${opts.map(o=>`<option${o==v?' selected':''}>${o}</option>`).join('')}</select>`;
else c=`<input id="g-${k}" data-g="${k}" type="${type}" value="${esc(v)}">`;
return `<div class="f f-${k}"><label for="g-${k}">${label}</label>${c}</div>`}
function genPanel(){const g=W().gen;
return `<section class="gen"><h2>Generate a calendar</h2><p class="sub">Tell the AI who it’s for, what the client told you, and where to post. Each month of calendar is one request on your own Claude usage.</p><div class="gg">${gf('client','Client or brand','text')}${gf('industry','Industry','text')}${gf('length','How long','select',Object.keys(LEN))}${gf('perWeek','Posts per week','select',['1','2','3','4','5','6','7'])}${gf('start','Start date (optional)','date')}${gf('brief','Brief and client details','long')}
<fieldset><legend>Where to post</legend>${PLAT.map(p=>`<label class="chip"><input type="checkbox" data-gp="${p}"${g.platforms.includes(p)?' checked':''}><span>${p}</span></label>`).join('')}</fieldset></div></section>`}
let adF={plat:'',camp:''},aiLast='';
function adsTop(){const cnt={};W().lists.ads.forEach(a=>cnt[a.platform]=(cnt[a.platform]||0)+1);
return `<details class="gen dd"><summary>How publishing works</summary><p class="sub">Ads go live inside each platform. Create the ad here, tap <b>Copy ad details</b>, tap <b>Open ads manager</b> and paste it in. Then come back and tap <b>Mark live</b> so your team can see it is running.</p></details><details class="gen dd"><summary>Ad platforms <small>${adF.plat?esc(adF.plat):'All platforms'}</small></summary><div class="ddl"><button class="pl${adF.plat?'':' on'}" data-act="adplat" data-v="">All platforms</button>${PLATS.map(p=>`<button class="pl${cnt[p]?' used':''}${adF.plat===p?' on':''}" data-act="adplat" data-v="${esc(p)}">${esc(p)}${cnt[p]?`<b>${cnt[p]}</b>`:''}</button>`).join('')}</div></details>`}
function adFilterBar(){const cs=W().lists.campaigns;
return `<div class="filter"><label for="af-p">Platform</label><select id="af-p" data-af="plat"><option value="">All platforms</option>${PLATS.map(p=>`<option${p===adF.plat?' selected':''}>${esc(p)}</option>`).join('')}</select><label for="af-c">Campaign</label><select id="af-c" data-af="camp"><option value="">All campaigns</option>${cs.map(c=>`<option value="${esc(c.id)}"${c.id===adF.camp?' selected':''}>${esc(c.name||'Untitled campaign')}</option>`).join('')}</select></div>`}
function campRuns(c,i){const A=W().lists.ads.filter(a=>a.campaign===c.id),pl=[...new Set(A.map(a=>a.platform))];
return `<div class="runs"><span><b>${A.length}</b> ad${A.length===1?'':'s'}</span><span>${pl.length?esc(pl.join(', ')):'No ads running yet'}</span><span>Spent ${naira(sumN(A,'spend'))}</span><button class="sm" data-act="campads" data-i="${i}">View ads</button><button class="sm send" data-act="adfor" data-i="${i}">Run an ad</button></div>`}
function adCalc(a){const im=num(a.impressions),cl=num(a.clicks),ld=num(a.leads),sp=num(a.spend),bu=num(a.budget),b=[];
if(!isNaN(im)&&im>0&&!isNaN(cl))b.push(`Click rate ${(cl/im*100).toFixed(2)}%`);
if(!isNaN(sp)&&!isNaN(cl)&&cl>0)b.push(`Cost per click ${naira(sp/cl)}`);
if(!isNaN(sp)&&!isNaN(ld)&&ld>0)b.push(`Cost per lead ${naira(sp/ld)}`);
if(!isNaN(bu)&&bu>0&&!isNaN(sp))b.push(`${Math.round(sp/bu*100)}% of budget used`);
return b.length?`<p class="calc">${b.join(' · ')}</p>`:''}
const AIQ={
offers:['Which offers suit a business that wants more leads?','Write a short pitch for the offers I have ticked','Suggest a custom offer for a client who wants a rebrand'],
quotes:['Write a friendly cover note to send with a quotation','Which quotations need a follow-up?','How do I explain the price to a hesitant client?'],
calendar:['Give me 5 fresh post ideas that fit my plans','Make my post topics sound more human','What is missing in this content mix?'],
campaigns:['Suggest a campaign idea for a small Nigerian business','Which ad platforms should my campaigns use, and why?','Write a one-page plan for my first campaign'],
ads:['Write ad copy for a Meta ad, 3 variations','Recommend a budget split across platforms','What should I change based on these results?'],
tasks:['Break my project into tasks for the team','Write a friendly message that assigns a task','What should my team do first this week?'],
policies:['Draft a short data-protection policy for our team','Which policies are missing for a marketing consultancy?','Rewrite a policy in plain, friendly language'],
calls:['Write a friendly greeting for calling back someone who filled in my landing page form','What should the call agent never promise?','Write a short script to book a free client session'],
home:['What should I work on first this week?','Summarise where my offers, quotations and campaigns stand','Write a short plan for today'],
budget:['Which platform should get more of my budget, and why?','Am I on track to stay inside my monthly budget?','Suggest a daily budget for a new campaign'],
gallery:['Suggest tags for the files I have','What pictures and videos am I missing for a campaign?','Write captions for my latest pictures'],
images:['Write a prompt for a product photo with a clean background','Suggest a picture for a post about a new offer','What size should a picture be for each social platform?'],
video:['Write a 30 second script for a product launch','Give me a hook for the first 3 seconds','Plan a short video from the clips I have'],
seo:['Which keywords should a small Nigerian business target first?','Rewrite my page title and description','How do I get an AI assistant to quote my page?'],
audit:['List questions to ask the client in a visibility audit','Draft findings headings for a positioning audit','How do I present audit findings on a call?']};
function aiPanel(p){return `<details class="gen ai" id="aip"><summary>Ask AI about this page</summary><div class="in"><p class="sub">The AI sees what is on this page and answers in plain, direct language. You can switch the AI provider in Settings.</p><div class="aq">${AIQ[p].map(q=>`<button class="sm" data-act="aiq" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div><textarea id="ai-q" rows="2" placeholder="Ask anything about this page…" aria-label="Ask AI"></textarea><div class="act"><button class="sm send" id="ai-go" data-act="aigo">Ask</button><button class="sm" data-act="aimic" id="ai-mic" aria-pressed="false">Speak</button><button class="sm" data-act="aicopy">Copy answer</button><button class="sm" data-act="aispeak">Read the answer aloud</button></div><div id="ai-out" class="aiout" aria-live="polite"></div></div></details>`}
function ctxFor(p){const L=W().lists,pk=(a,ks)=>a.slice(0,30).map(x=>Object.fromEntries(ks.map(k=>[k,x[k]])));
const cn=id=>{const c=L.campaigns.find(x=>x.id===id);return c?c.name:''};
const m={offers:()=>pk(L.offers.concat(L.custom),['name','title','price','group','scope','client','amount']),quotes:()=>L.quotes.slice(0,20).map(q=>({client:q.client,status:q.status,items:q.items,total:totalOf(q)})),calendar:()=>({calendars:PL().slice(0,8).map(p=>({client:p.name,days:p.rows.length,platforms:p.platforms,start:p.start})),posts:PL2().slice(0,30).map(x=>({platform:x.platform,when:x.when,status:x.status,text:(x.text||'').slice(0,80),reach:(x.res||{}).reach}))}),calls:()=>({numbers:CL().numbers.length,rules:CL().triggers.map(x=>x.when),voice:CL().voice.engine,agent:CL().agent.name}),budget:()=>{const c=budgetCalc();return{monthlyBudget:c.total,spent:c.spent,adSpend:c.adSp,otherSpend:c.other,platforms:c.rows.map(r=>({platform:r.k,ads:r.n,spent:r.sp,leads:r.ld,monthly:r.m,daily:r.d}))}},gallery:()=>GAL().slice(0,40).map(g=>({name:g.name,kind:g.kind,tag:g.tag})),images:()=>GAL().filter(g=>g.kind==='Image').slice(0,30).map(g=>g.name),video:()=>GAL().filter(g=>g.kind!=='Image').slice(0,30).map(g=>g.name),seo:()=>({audits:L.audit.slice(0,10).map(a=>a.site)}),home:()=>({offers:L.offers.length+L.custom.length,quotations:L.quotes.length,campaigns:L.campaigns.map(c=>c.name),ads:L.ads.length,tasks:L.tasks.length}),campaigns:()=>pk(L.campaigns,['name','client','pillar','status','start','end','goal','notes']),ads:()=>L.ads.slice(0,30).map(a=>({...a,campaign:cn(a.campaign)})),audit:()=>pk(L.audit,['site','kind','status','findings']),policies:()=>pk(L.policies,['title','category','status','reviewed']),tasks:()=>pk(L.tasks,['title','assignee','due','priority','status'])};
return JSON.stringify((m[p]||(()=>[]))(),(k,v)=>typeof v==='string'&&v.length>140?v.slice(0,140)+'…':v).slice(0,7000)}
async function askAI(){const ta=$('#ai-q'),q=(ta&&ta.value||'').trim();
if(!q){status('Type a question, or tap one of the ideas.',true);return}
let sample=null;try{sample=window.claude?await claude.use('sample'):null}catch(e){}
if(!sample){status('The AI isn’t set up yet. Add an API key in Settings, AI, or ask your admin (see docs/AI-PROVIDERS.md).',true);return}
const go=$('#ai-go');if(go)go.disabled=true;
const set=t=>{const o=$('#ai-out');if(o)o.textContent=t};set('Thinking…');
const label=PAGES.find(x=>x[0]===page)[1],tk=page==='offers'?[...sel].map(k=>{const [l,j]=k.split(':'),it=W().lists[l][+j];return it&&(it.name||it.title)}).filter(Boolean):[];
const prompt=`You are the in-house assistant for ${brand().name}, a Nigerian marketing and positioning consultancy. Its three pillars are visibility, positioning and marketing. Tone: plain, direct, human. No hype and no jargon. Money is in naira (₦). The team is on the "${label}" page.\nData on this page (JSON): ${ctxFor(page)}\n${tk.length?'Offers currently ticked: '+tk.join(', ')+'\n':''}Request: ${q}\nAnswer in plain text with short paragraphs. Use "- " for lists. Do not use markdown symbols such as ** or #.`;
try{const r=await sample(prompt,{onText:({text})=>{aiLast=text;set(text)}});aiLast=(r&&r.text)||aiLast;set(aiLast||'No answer came back. Try rephrasing.');status('Done.')}
catch(e){set('');status(({not_granted:'AI access was refused.',rate_limited:'Too many requests. Wait a moment, then try again.'})[e&&e.code]||'Couldn’t get an answer. Try again.',true)}
const g2=$('#ai-go');if(g2)g2.disabled=false}


/* Voice: speak a question (voice to text) and listen to the answer (text to voice). Uses the browser's own speech tools. */
let REC=null;
document.addEventListener('click',e=>{const b=e.target.closest('button[data-act="aimic"],button[data-act="aispeak"]');if(!b)return;
if(b.dataset.act==='aispeak'){if(!window.speechSynthesis){status('Reading aloud is not supported in this browser.',true);return}if(speechSynthesis.speaking){speechSynthesis.cancel();return}const t=(aiLast||($('#ai-out')||{}).textContent||'').trim();if(!t){status('There is no answer to read yet.',true);return}const u=new SpeechSynthesisUtterance(t);u.lang=localStorage.getItem('hub:vlang')||'en-NG';speechSynthesis.speak(u);return}
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){status('Speaking to the app is not supported in this browser. Use Chrome, Edge or Safari, and open the app over https or localhost.',true);return}
if(REC){REC.stop();return}const ta=$('#ai-q');if(!ta)return;const base=ta.value?ta.value.trim()+' ':'';REC=new SR();REC.lang=localStorage.getItem('hub:vlang')||'en-NG';REC.interimResults=true;REC.continuous=false;
b.setAttribute('aria-pressed','true');b.textContent='Listening… tap to stop';
REC.onresult=ev=>{let t='';for(const r of ev.results)t+=r[0].transcript;ta.value=base+t};
REC.onerror=ev=>{status(ev.error==='not-allowed'?'The microphone is blocked. Allow it in the browser address bar.':'Could not hear that. Try again.',true)};
REC.onend=()=>{REC=null;const m=$('#ai-mic');if(m){m.setAttribute('aria-pressed','false');m.textContent='Speak'}};
try{REC.start()}catch(err){REC=null;b.textContent='Speak'}});
