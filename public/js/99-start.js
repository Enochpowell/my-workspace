/** 99-start.js: runs last. Draws the first screen, then boot() (04-people-workspaces.js) opens the workspace. */

sortCal();view();boot();
(window.claude?claude.use('sample'):Promise.resolve(null)).then(s=>{AI=!!s;fabs()}).catch(()=>{});
(window.claude?claude.use('downloads'):Promise.resolve(null)).then(d=>{DL=d;if(page==='quotes')view()}).catch(()=>{});
