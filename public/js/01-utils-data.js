/**
 * 01-utils-data.js
 * Small helpers (escaping, dates, ids), the starter data (rate card, starter policies) and the
 * "defaults" a brand-new workspace starts from (everything at zero), plus fix() which repairs
 * old data so missing lists never crash the app.
 */

const logoPair=c=>`<img class="${c} lg-l" src="${LOGO_L}" alt="Logo"><img class="${c} lg-d" src="${LOGO_D}" alt="">`;
const $=s=>document.querySelector(s);
const uid=()=>Math.random().toString(36).slice(2,9);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const day=n=>{const t=new Date();t.setDate(t.getDate()+n);return iso(t)};
const addDays=(s,n)=>{const t=new Date(s+'T12:00:00');t.setDate(t.getDate()+n);return iso(t)};
const N=(a,b)=>b?`₦${a}–₦${b}`:`₦${a}`;
const POLS=[
{title:'Data protection and privacy',category:'Privacy and data',status:'Draft',reviewed:'',body:'We handle personal data in line with the Nigeria Data Protection Act 2023 and good international practice such as the GDPR.\n- We collect only what we need, for a stated purpose, and tell people what we do with it.\n- We keep client and customer data inside this workspace, not in personal chats or loose files.\n- People can ask to see, correct or delete their data, and we answer within 30 days.\n- We never sell personal data.'},
{title:'Access and accounts',category:'Security',status:'Draft',reviewed:'',body:'- Everyone signs in with their own account. No shared logins.\n- Use a strong, unique password and turn on two-step verification.\n- Admins invite people from the People page and remove access the same day someone leaves.\n- Private workspaces stay private. Never ask for, or share, someone else’s.'},
{title:'Client confidentiality',category:'Client and confidentiality',status:'Draft',reviewed:'',body:'- Client information, quotations, audits and results are confidential.\n- Share them only with the client and the team members who need them.\n- Do not post client work or results publicly without written permission.\n- Confidentiality continues after a project or contract ends.'},
{title:'Devices and files',category:'Security',status:'Draft',reviewed:'',body:'- Lock your phone and laptop with a passcode and set them to auto-lock.\n- Log out on shared or public computers.\n- Do not save client files in personal accounts or send them through unapproved apps.\n- Report a lost or stolen device to the owner straight away.'},
{title:'Incidents and data breaches',category:'Security',status:'Draft',reviewed:'',body:'- If you suspect a leak, wrong access or a lost device, tell the owner immediately.\n- The owner removes access, checks what was affected and decides who must be told.\n- Where the law requires it, the regulator and the people affected are told within 72 hours.\n- We write down what happened and what we changed.'},
{title:'Content and advertising standards',category:'Content and ads',status:'Draft',reviewed:'',body:'- Claims in our content and ads must be true and backed up.\n- Follow Nigerian advertising rules and each platform’s ad policies.\n- Get the client’s approval before publishing in their name.\n- Use only images, music and text we have the right to use.'},
{title:'Data retention and deletion',category:'Privacy and data',status:'Draft',reviewed:'',body:'- Keep client data only as long as the project and legal duties need it.\n- When a client leaves, export what they need, then delete their data from this workspace.\n- Review and clear old audits, quotations and posts at least once a year.'}
];
function defaults(){const d=starter(),w=d.ws.default;Object.keys(w.lists).forEach(k=>{w.lists[k]=[]});w.gen=Object.assign({},w.gen,{client:'',industry:''});return d}
function starter(){
const O=(g,name,price,scope)=>({group:g,name,price,scope});
const posts=[['LinkedIn','Conversation','What are people seeing when they first find your business?'],['Instagram','Insight','Visibility, positioning, marketing: three questions, one idea'],['LinkedIn','Case','Where a client started and where they got to'],['LinkedIn','Offer','Book a free Clarity Session'],['Instagram','Conversation','Where are you now, and where do you want to be?'],['LinkedIn','Insight','Being noticed isn’t the same as being understood'],['Instagram','Case','Before and after: a positioning shift'],['LinkedIn','Offer','The Complete Brand Growth Audit']];
return{ws:{default:{
home:{t1:'Move from where you are',t2:'to where you want to be.',intro:'Your team’s working space for offers, quotations, content, campaigns and audits. Click any text to change it.'},
gen:{client:'My workspace',industry:'Marketing and brand consulting',brief:'',platforms:['LinkedIn','Instagram'],length:'1 month',perWeek:'3',start:''},
lists:{
offers:[
O('Entry','Clarity Session','Free initially','20–30 minutes; application required; identify the main challenge and recommend a next step.'),
O('Entry','Extended Strategy Session',N('25,000','50,000'),'60–90 minutes with written recommendations.'),
O('Entry','Visibility Audit',N('75,000','125,000'),'Review of agreed brand assets, creative quality, content and selected visual channels.'),
O('Entry','Positioning Audit',N('100,000','175,000'),'Audience, differentiation, messaging, competitor position and brand presence.'),
O('Entry','Marketing Audit',N('125,000','200,000'),'Selected campaigns, channels, tracking, funnel and conversion journey.'),
O('Entry','Complete Brand Growth Audit',N('225,000','350,000'),'Integrated review across all three pillars with one prioritized action plan.'),
O('Visibility','Basic logo design',N('100,000','200,000'),'Logo design for a growing business.'),
O('Visibility','Brand identity system',N('300,000','650,000'),'Brand identity project.'),
O('Visibility','Comprehensive identity + guidelines',N('650,000','1,200,000'),'Full identity system with brand guidelines.'),
O('Visibility','10-graphic social design batch',N('100,000','200,000'),'Ten designed social graphics.'),
O('Visibility','Presentation / pitch deck',N('100,000','300,000'),'Designed presentation or pitch deck.'),
O('Visibility','Visibility Starter',N('150,000','250,000')+' / project','6–10 static designs; basic creative direction; one revision round; final exports.'),
O('Visibility','Visibility Growth',N('300,000','500,000')+' / project','Graphics and short-form editing; content concepts; two revision rounds; organized delivery.'),
O('Visibility','Creative Partner',N('250,000','500,000')+' / month','Recurring creative assets, agreed monthly quota, creative direction and delivery review.'),
O('Positioning','Positioning Blueprint',N('250,000','450,000')+' / project','Audience definition, differentiation, messaging framework and recommendations.'),
O('Positioning','SEO audit',N('100,000','250,000'),'Search audit with recommendations.'),
O('Positioning','Authority Builder',N('250,000','500,000')+' / month','Content strategy, articles, profile optimization and authority building.'),
O('Positioning','Brand Presence Management',N('250,000','500,000')+' / month','Organic social management, publishing and brand-consistent communication on agreed platforms.'),
O('Marketing','Campaign Launch',N('150,000','300,000')+' / campaign','Strategy, setup, agreed creatives, tracking and launch reporting.'),
O('Marketing','Social media management, 2 platforms',N('200,000','350,000')+' / month','Management of two agreed platforms.'),
O('Marketing','Performance Marketing',N('200,000','400,000')+' / month','Paid campaign management, testing, optimization and reporting for agreed channels.'),
O('Marketing','Growth Marketing',N('350,000','600,000')+' / month','Paid campaigns, lead generation, email and conversion improvement.'),
O('Partnership','Core Partner (12 months)',N('450,000')+' / month','30–40 delivery hours: monthly strategy, agreed creative quota, positioning support, one marketing workstream, monthly report.'),
O('Partnership','Growth Partner (12 months)',N('750,000')+' / month','50–65 delivery hours: cross-pillar planning, creative assets, positioning, organic management on up to 2 platforms, one paid workstream, reporting.'),
O('Partnership','Embedded Partner (12 months)',N('1,200,000')+' / month','80–100 delivery hours: leadership sessions, greater production capacity, cross-pillar coordination, expanded organic and paid support.')],
custom:[{title:'Custom offer for a client',client:'',amount:'',note:'Upload the PDF for this client, then add notes.',file:null}],
quotes:[],
calendar:posts.map((p,i)=>({date:day(i*7+1),client:'My workspace',platform:p[0],type:p[1],topic:p[2],status:i<2?'Drafted':'Idea'})),
campaigns:[],ads:[],audit:[],policies:POLS.map(x=>({...x})),tasks:[]}}}}}
function fix(o){const d=defaults().ws.default,w=o.ws.default;w.lists=w.lists||{};if(!Array.isArray(w.lists.policies))w.lists.policies=d.lists.policies;for(const k in d.lists)if(!Array.isArray(w.lists[k]))w.lists[k]=[];w.lists.campaigns.forEach(c=>{if(!c.id)c.id=uid()});w.home=Object.assign({},d.home,w.home||{});w.gen=Object.assign({},d.gen||{},w.gen||{});return o}
