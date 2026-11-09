/**
 * 05-send-helpers.js
 * Sending and handing work off: ad-platform links, "email / WhatsApp / copy" text for campaigns,
 * ads and audits, and printing. (Ads are published inside each platform; this app prepares the hand-off.)
 */

/* ---------- send and publish helpers ---------- */
function adURL(p){p=p||'';if(/^(Meta|Facebook|Instagram|WhatsApp|Threads)/.test(p))return'https://adsmanager.facebook.com';if(p==='Google Business Profile')return'https://business.google.com';if(/^(Google|YouTube)/.test(p))return'https://ads.google.com';
const m={'TikTok':'https://ads.tiktok.com','Snapchat':'https://ads.snapchat.com','X (Twitter)':'https://ads.x.com','LinkedIn':'https://www.linkedin.com/campaignmanager','Pinterest':'https://ads.pinterest.com','Reddit':'https://ads.reddit.com','Quora':'https://www.quora.com/ads','Telegram Ads':'https://ads.telegram.org','Microsoft Advertising (Bing)':'https://ads.microsoft.com','Amazon Ads':'https://advertising.amazon.com','Spotify':'https://ads.spotify.com','Apple Search Ads':'https://searchads.apple.com','Taboola':'https://backstage.taboola.com','Outbrain':'https://my.outbrain.com'};return m[p]||''}
function xbtn(l,i,it){const B=(a,t,c)=>`<button class="sm${c||''}" data-act="${a}" data-l="${l}" data-i="${i}">${t}</button>`;
if(l==='campaigns')return `<span class="xb">${B('x-email','Email brief',' send')}${B('x-wa','WhatsApp')}${B('x-copy','Copy brief')}${B('x-live','Mark live')}${cmtBtn(l,i)}</span>`;
if(l==='ads')return `<span class="xb">${B('x-copy','Copy ad details')}${adURL(it.platform)?B('x-open','Open ads manager'):''}${B('x-live','Mark live',' send')}${cmtBtn(l,i)}</span>`;
if(l==='tasks')return `<span class="xb">${B('x-dm','Message assignee',' send')}${B('x-done','Mark done')}${cmtBtn(l,i)}</span>`;
if(l==='audit')return `<span class="xb">${B('x-email','Email audit',' send')}${B('x-wa','WhatsApp')}${B('x-copy','Copy')}${B('x-print','Print')}${cmtBtn(l,i)}</span>`;
return chatOK()?`<span class="xb">${cmtBtn(l,i)}</span>`:'<span></span>'}
function campText(c){const A=W().lists.ads.filter(a=>a.campaign===c.id);return `Campaign: ${c.name||'Untitled'}\nClient: ${c.client||'-'}\nStatus: ${c.status}\nDates: ${c.start||'TBC'} to ${c.end||'TBC'}\nGoal: ${c.goal||'-'}\n\nAds:\n${A.length?A.map(a=>`- ${a.name||'Untitled'} | ${a.platform} | budget ${a.budget||'TBC'} | ${a.status}`).join('\n'):'- none yet'}\n\nPlan and notes:\n${c.notes||'-'}\n\n${brand().name}: ${brand().tag}`}
function adText(a){const c=W().lists.campaigns.find(x=>x.id===a.campaign);return `Ad: ${a.name||'Untitled'}\nCampaign: ${c?c.name:'-'}\nPlatform: ${a.platform}\nObjective: ${a.objective}\nFormat: ${a.format}\nBudget: ${a.budget||'-'}\nDates: ${a.start||'TBC'} to ${a.end||'TBC'}\nAudience: ${a.audience||'-'}\n\nHeadline and ad text:\n${a.copy||'-'}`}
function auditText(a){return `${a.kind||'Audit'} for ${a.site||'you'}\nStatus: ${a.status}\n\nFindings and recommendations:\n${a.findings||'To follow.'}\n${a.notes?'\nNotes:\n'+a.notes+'\n':''}\n${brand().name}: ${brand().tag}`}
function auditSheet(a){return `${logoSrc('l')?`<img src="${logoSrc('l')}" alt="" style="height:48px;vertical-align:middle;margin-right:.6rem">`:''}<b class="sw">${esc(brand().name)}</b>${brandLine()}<h2>${esc(a.kind||'Audit')}</h2><p><b>For:</b> ${esc(a.site||'')} · <b>Status:</b> ${esc(a.status)}</p><h3>Findings and recommendations</h3><p style="white-space:pre-wrap">${esc(a.findings||'To follow.')}</p>${a.notes?`<h3>Notes</h3><p style="white-space:pre-wrap">${esc(a.notes)}</p>`:''}`}
document.addEventListener('click',e=>{const b=e.target.closest('button[data-act^="x-"]');if(!b)return;const a=b.dataset.act,l=b.dataset.l,i=+b.dataset.i,it=W().lists[l]&&W().lists[l][i];if(!it)return;
const txt=l==='campaigns'?campText(it):l==='ads'?adText(it):auditText(it),subj=l==='campaigns'?'Campaign brief: '+(it.name||''):l==='audit'?(it.kind||'Audit')+' for '+(it.site||'you'):'Ad details';
const done=()=>{if(l==='audit'&&it.status!=='Delivered'){it.status='Delivered';const s=document.getElementById('audit-'+i+'-status');if(s)s.value='Delivered';save()}};
if(a==='x-email'){go(`mailto:${encodeURIComponent(it.email||'').replace('%40','@')}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(txt)}`);done()}
else if(a==='x-wa'){go(`https://wa.me/${waNum(it.phone)}?text=${encodeURIComponent(txt)}`);done()}
else if(a==='x-copy'){(navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>{status('Copied.');done()}).catch(()=>status('Couldn’t copy. Select the text and copy it.',true))}
else if(a==='x-print'){$('#sheet').innerHTML=auditSheet(it);window.print();done()}
else if(a==='x-open'){go(adURL(it.platform))}
else if(a==='x-done'){it.status='Done';save();view();status('Marked done.')}
else if(a==='x-dm'){taskDM(it)}
else if(a==='x-live'){it.status='Live';if(l==='ads'&&!it.start)it.start=day(0);save();view();status(l==='ads'?'Marked live. Make sure it is also running on '+(it.platform||'the platform')+'.':'Marked live.')}});
