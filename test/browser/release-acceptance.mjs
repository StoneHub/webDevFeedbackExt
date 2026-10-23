// Exercise files extracted from the release ZIP, never a patched extension copy.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
const root=resolve(import.meta.dirname,'../..');
const version=JSON.parse(readFileSync(join(root,'package.json'))).version;
const zip=resolve(process.argv[2]||join(root,`dist/dev-feedback-capture-v${version}.zip`));
const out=resolve(process.env.ACCEPTANCE_OUTPUT||join(root,'output/browser-acceptance'));
mkdirSync(out,{recursive:true});
rmSync(join(out,'acceptance.json'),{force:true});
const temp=mkdtempSync(join(tmpdir(),'dfc-acceptance-'));
const extension=join(temp,'extension');mkdirSync(extension);
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const zipHash=hash(zip);
execFileSync('unzip',['-q',zip,'-d',extension]);
const files=()=>Object.fromEntries(readdirSync(extension).sort().map(name=>[name,hash(join(extension,name))]));
const originalFiles=files();
const manifest=JSON.parse(readFileSync(join(extension,'manifest.json')));
assert.deepEqual([...manifest.permissions].sort(),['activeTab','scripting','storage']);
assert.equal(manifest.host_permissions,undefined);assert.equal(manifest.content_scripts,undefined);
assert.equal(manifest.version,version);
const report={status:'running',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),zip:zip.split('/').at(-1),sha256:zipHash,version,files:originalFiles,checks:[],limitations:[
 'Isolated Chrome for Testing via CDP; does not certify every Chrome/Edge version or Chrome Web Store approval.',
 'Toolbar action uses the browser Extensions.triggerAction API. Keyboard selection/cancel uses trusted browser input; OS-global shortcut dispatch is covered by manifest and command-registration checks, not the host OS hotkey dispatcher.',
 'Synthetic legacy and capacity fixtures are seeded through the browser storage debugging API. No real user history or extension code is changed.',
 'The copy-failure check makes one note frame refuse both clipboard paths at runtime; no page in this browser was found that refuses the fallback copy.'
]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+15000;let last;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){last=e;}await delay(50);}throw new Error(`Timed out: ${label}${last?' — '+last.message:''}`);}
const html='<!doctype html><html><head><title>Release acceptance fixture</title><link rel="icon" href="data:,"></head><body style="font:20px system-ui;padding:60px"><h1>Checkout</h1><button id="save-button">Save changes</button><button id="second">Second action</button><input type="password" value="SECRET_INPUT_SENTINEL"><p id="parent-secret">PARENT_SECRET_SENTINEL</p><script>window.siteClicks=0;document.querySelector("#save-button").onclick=()=>window.siteClicks++;</script></body></html>';
const server=createServer((req,res)=>{if(req.url==='/sample.pdf'){res.setHeader('Content-Type','application/pdf');res.end(readFileSync(join(root,'test/fixtures/sample.pdf')));return;}res.setHeader('Content-Type','text/html');
 // A page that forbids the Clipboard API in every frame, as some sites do.
 if(req.url==='/blocked')res.setHeader('Permissions-Policy','clipboard-read=(), clipboard-write=()');
 res.end(req.url==='/reader'?'<title>Clipboard reader</title>':html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/fixture`;
const storageKey=`dev-feedback-${new URL(url).origin}`;
// localhost is a different origin from 127.0.0.1, so its clipboard grant reaches neither the fixture nor the extension.
const readerURL=`http://localhost:${server.address().port}/reader`;
let ctx;
try{
 ctx=await chromium.launchPersistentContext(join(temp,'profile'),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],viewport:{width:1280,height:900},acceptDownloads:true});
 ctx.setDefaultTimeout(15000);
 report.browser=ctx.browser().version();
 await ctx.tracing.start({screenshots:true,snapshots:true,sources:true});
 const cdp=await ctx.browser().newBrowserCDPSession();
 const {id}=await cdp.send('Extensions.loadUnpacked',{path:extension});
 const extURL=`chrome-extension://${id}`;
 let page=ctx.pages()[0];await page.goto(url);let pageCDP=await ctx.newCDPSession(page);
 const worker=await until(()=>ctx.serviceWorkers().find(w=>w.url().startsWith(extURL)),'extension worker');
 const commands=await worker.evaluate(()=>chrome.commands.getAll());assert.ok(commands.some(c=>c.name==='toggle-feedback-mode'));report.registeredCommands=commands;
 const state=()=>worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return chrome.tabs.sendMessage(tab.id,{action:'get-state'});});
 const getStorage=async(area='local')=>(await pageCDP.send('Extensions.getStorageItems',{id,storageArea:area})).data;
 const seed=values=>pageCDP.send('Extensions.setStorageItems',{id,storageArea:'local',values});
 // Native extension action popups are CDP page targets, not Playwright tab Pages.
 async function popup(){
  await page.bringToFront();
  const tabs=(await cdp.send('Target.getTargets',{filter:[{type:'tab'}]})).targetInfos;
  const tab=tabs.find(t=>t.url===page.url());assert.ok(tab);
  await cdp.send('Extensions.triggerAction',{id,targetId:tab.targetId});
  const target=await until(async()=>(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url===extURL+'/popup.html'),'native popup');
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});let seq=0;
  function send(method,params={}){const commandId=++seq;return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{cdp.off('Target.receivedMessageFromTarget',cb);reject(new Error(`Popup command timeout: ${method}`));},10000);
   const cb=e=>{if(e.sessionId!==sessionId)return;const m=JSON.parse(e.message);if(m.id!==commandId)return;clearTimeout(timer);cdp.off('Target.receivedMessageFromTarget',cb);m.error?reject(new Error(m.error.message)):resolve(m.result);};
   cdp.on('Target.receivedMessageFromTarget',cb);cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:commandId,method,params})}).catch(reject);
  });}
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  async function click(selector){const box=await until(()=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`),'popup control '+selector);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box});}
  return {evaluate,click,send};
 }
 async function start(){const p=await popup();await until(()=>p.evaluate("!document.querySelector('#primary-action-btn').disabled"),'enabled pick');await p.click('#primary-action-btn');await until(async()=>(await state()).feedbackMode,'picker active');}
 const frame=name=>until(()=>page.frames().find(f=>f.url().startsWith(extURL+'/'+name+'.html')),'frame '+name);
 const check=(name)=>{report.checks.push({name,status:'passed'});console.log('PASS '+name);};
 const badge=()=>worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return chrome.action.getBadgeText({tabId:tab.id});});
 // The toast lives in a closed shadow root; CDP's pierced DOM still reads it.
 async function overlayText(){const {root}=await pageCDP.send('DOM.getDocument',{depth:-1,pierce:true});const text=[];(function walk(node){if(node.nodeType===3)text.push(node.nodeValue);for(const child of [...(node.children||[]),...(node.shadowRoots||[])])walk(child);})(root);return text.join(' ');}
 await start();
 assert.equal(await badge(),'ON');assert.equal(await page.locator('[data-dev-feedback-picker]').isHidden(),true,'no in-page panel while picking');
 await page.keyboard.press('Escape');await until(async()=>!(await state()).feedbackMode,'Escape cancels picker');assert.equal(await badge(),'');
 check('toolbar activation, ON badge, no page panel, and trusted keyboard cancel');
 // Only a separate reader origin may touch the clipboard, so every copy below runs with the browser's default permissions.
 await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(readerURL).origin});
 const clipboardReader=await ctx.newPage();await clipboardReader.goto(readerURL);
 const originalClipboard=await clipboardReader.evaluate(()=>navigator.clipboard.readText());
 const clipboard=async()=>{await clipboardReader.bringToFront();const text=await clipboardReader.evaluate(()=>navigator.clipboard.readText());await page.bringToFront();return text;};
 try{
  await start();await page.locator('#save-button').focus();await page.keyboard.press('Alt+Enter');
  let editor=await frame('element');
  const placed=await (await editor.frameElement()).boundingBox();const picked=await page.locator('#save-button').boundingBox();
  assert.ok(placed.y>=picked.y+picked.height&&Math.abs(placed.x-picked.x)<2,'note opens just below the picked element');
  assert.equal(await editor.locator('textarea').count(),1);assert.equal(await editor.locator('button').count(),2,'only Save and close');
  await editor.locator('#note').fill('SELECTED element spacing');
  assert.equal(await page.evaluate(()=>window.siteClicks),0);
  assert.doesNotMatch(await page.locator('body').innerText(),/SELECTED element spacing/);
  await page.screenshot({path:join(out,'element-editor.png')});
  const p=await popup();await until(()=>p.evaluate("document.querySelector('#primary-action-btn').textContent==='Return to open note'"),'draft return action');
  await p.click('#primary-action-btn');assert.equal(await editor.locator('#note').inputValue(),'SELECTED element spacing');
  check('keyboard pick opens a one-field private note beside the element');
  const base={type:'element',selector:'#save-button',pageUrl:url,timestamp:'2026-09-09T00:00:00Z'};
  await seed({[storageKey]:Array.from({length:500},(_,i)=>({...base,id:`capacity-${i}`,note:`Synthetic capacity ${i}`}))});
  await editor.locator('#note').press('Enter');await until(async()=>(await editor.locator('#status').textContent()).includes('500 captures'),'capacity rejection');
  assert.equal(await editor.locator('#note').inputValue(),'SELECTED element spacing');assert.equal((await getStorage())[storageKey].length,500);
  await seed({[storageKey]:[]});await editor.locator('#note').press('Enter');await until(async()=>(await state()).feedbackMode,'save resumes picking');
  await until(async()=>(await overlayText()).includes("Copied this page's feedback · 1 item"),'clipboard toast');
  await page.screenshot({path:join(out,'saved-toast.png')});
  const saved=(await getStorage())[storageKey];assert.equal(saved.length,1);assert.equal(saved[0].note,'SELECTED element spacing');
  assert.match(await clipboard(),/^Page feedback: [^\n]+\n\n1\. `#save-button` \(button "Save changes"\)\n   SELECTED element spacing\n/);
  check('capacity failure keeps the draft; Enter saves, copies, toasts, and keeps picking');
  await page.locator('#second').click();editor=await frame('element');await editor.locator('#note').press('Enter');
  await until(async()=>(await overlayText()).includes("Copied this page's feedback · 2 items"),'page toast');
  assert.equal((await getStorage())[storageKey].length,2);assert.equal(await page.evaluate(()=>window.siteClicks),0);
  const run=await clipboard();assert.match(run,/1\. `#save-button`[\s\S]*2\. `#second` \(button "Second action"\)\n\n/);assert.doesNotMatch(run,/SECRET_INPUT_SENTINEL|PARENT_SECRET_SENTINEL/);
  check('pointer pick with a blank note appends the element to the page clipboard');
  await page.locator('h1').click();editor=await frame('element');await editor.locator('#note').fill('Discard me');await editor.locator('#cancel').click();
  await until(async()=>{const s=await state();return !s.editorOpen&&s.feedbackMode;},'close keeps picking');assert.equal((await getStorage())[storageKey].length,2);
  await page.keyboard.press('Escape');await until(async()=>!(await state()).feedbackMode,'stop after close');
  check('closing a note discards it and keeps picking');
  const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  await seed({[storageKey]:[...(await getStorage())[storageKey],
   {...base,id:'legacy-region',type:'region',note:'SELECTED legacy region',pageUrl:url+'?secret=PRIVATE_QUERY',screenshot:{dataUrl:PNG},annotations:[]},
   {...base,id:'other-page',pageUrl:new URL('/other',url).href,note:'OTHER_PAGE_SENTINEL'}]});
  let menu=await popup();
  await until(()=>menu.evaluate("document.querySelectorAll('#capture-list li').length===3"),'page list');
  const listed=await menu.evaluate("document.querySelector('#captures').innerText");
  for(const text of ['SELECTED element spacing','No note','SELECTED legacy region'])assert.ok(listed.includes(text),text);assert.doesNotMatch(listed,/OTHER_PAGE_SENTINEL/);
  writeFileSync(join(out,'popup-list.png'),Buffer.from((await menu.send('Page.captureScreenshot')).data,'base64'));
  await menu.click('#copy-btn');await until(async()=>(await menu.evaluate("document.querySelector('#copy-btn').textContent"))==='Copied','popup copy');
  const copied=await clipboard();assert.match(copied,/3\. Region capture\n   SELECTED legacy region/);assert.doesNotMatch(copied,/PRIVATE_QUERY|OTHER_PAGE_SENTINEL/);
  const downloads=new Map();
  cdp.on('Browser.downloadWillBegin',e=>downloads.set(e.guid,{name:e.suggestedFilename}));
  cdp.on('Browser.downloadProgress',e=>{if(e.state==='completed'&&downloads.has(e.guid))downloads.get(e.guid).done=true;});
  await cdp.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:out,eventsEnabled:true});
  menu=await popup();
  async function download(selector){const before=downloads.size;await menu.click(selector);const [guid,entry]=await until(()=>[...downloads.entries()].slice(before).find(([,d])=>d.done),'download '+selector);return {name:entry.name,text:readFileSync(join(out,guid),'utf8')};}
  const md=await download('#markdown-btn');assert.match(md.name,/^dev-feedback-127\.0\.0\.1-.*\.md$/);assert.equal(md.text,copied);
  const json=await download('#json-btn');assert.match(json.name,/\.json$/);const payload=JSON.parse(json.text);
  assert.equal(payload.schemaVersion,1);assert.equal(payload.histories[0].items.length,3);assert.doesNotMatch(json.text,/PRIVATE_QUERY|OTHER_PAGE_SENTINEL/);
  writeFileSync(join(out,'selected-handoff.json'),JSON.stringify(payload,null,2));
  await menu.click('#capture-list li:last-child button');await until(async()=>!(await getStorage())[storageKey].some(i=>i.id==='legacy-region'),'delete one');
  assert.ok((await getStorage())[storageKey].some(i=>i.id==='other-page'));await until(()=>menu.evaluate("document.querySelectorAll('#capture-list li').length===2"),'list refresh');
  check('extension menu lists this page, copies, downloads Markdown and MCP JSON, and deletes one capture');
  const savedOn=path=>(async()=>(await getStorage())[storageKey].filter(i=>new URL(i.pageUrl).pathname===path))();
  await start();await page.locator('h1').click();editor=await frame('element');await editor.locator('#note').fill('AFTER RESTART');await editor.locator('#note').press('Enter');
  await until(async()=>(await overlayText()).includes("Copied this page's feedback · 3 items"),'restart toast');
  const restarted=await clipboard();assert.match(restarted,/1\. `#save-button`[\s\S]*2\. `#second`[\s\S]*3\. `h1`[^\n]*\n   AFTER RESTART\n/);assert.doesNotMatch(restarted,/OTHER_PAGE_SENTINEL/);
  await page.keyboard.press('Escape');await until(async()=>!(await state()).feedbackMode,'stop after restart');
  check('after Stop and Start, a save copies the whole page, not just the new run');
  const firstTab=page;page=await ctx.newPage();await page.goto(url);pageCDP=await ctx.newCDPSession(page);
  await start();await page.locator('#second').click();editor=await frame('element');await editor.locator('#note').fill('SECOND TAB');await editor.locator('#note').press('Enter');
  await until(async()=>(await overlayText()).includes("Copied this page's feedback · 4 items"),'second tab toast');
  assert.match(await clipboard(),/3\. `h1`[\s\S]*4\. `#second`[^\n]*\n   SECOND TAB\n/);
  await page.keyboard.press('Escape');await until(async()=>!(await state()).feedbackMode,'stop in second tab');
  await page.close();page=firstTab;pageCDP=await ctx.newCDPSession(page);
  check('a save in another tab on the same page copies that page\'s earlier notes too');
  await page.goto(new URL('/blocked',url).href);
  await start();await page.locator('#save-button').click();editor=await frame('element');
  assert.equal(await editor.evaluate(()=>navigator.clipboard.writeText('').then(()=>'written',e=>e.name)),'NotAllowedError','the page policy refuses the Clipboard API in the note');
  await editor.locator('#note').fill('BLOCKED PAGE');await editor.locator('#note').press('Enter');
  await until(async()=>(await overlayText()).includes("Copied this page's feedback · 1 item"),'blocked page toast');
  const blocked=await clipboard();assert.match(blocked,/^Page feedback: [^\n]*\/blocked\n\n1\. `#save-button`[^\n]*\n   BLOCKED PAGE\n/);assert.doesNotMatch(blocked,/SECOND TAB|AFTER RESTART/);
  check('a page that blocks the Clipboard API still gets its feedback copied, and only its own');
  // No real page refuses both copy paths in this browser, so make this one note frame refuse them; the shipped files are untouched.
  await page.locator('#second').click();editor=await frame('element');await editor.locator('#note').fill('RETRY ME');
  await editor.evaluate(()=>{const {writeText}=navigator.clipboard,{execCommand}=document;navigator.clipboard.writeText=()=>Promise.reject(new DOMException('refused','NotAllowedError'));document.execCommand=()=>false;
   globalThis.restoreCopy=()=>{navigator.clipboard.writeText=writeText;document.execCommand=execCommand;};});
  await editor.locator('#note').press('Enter');
  await until(async()=>(await editor.locator('#status').textContent()).includes('clipboard was blocked'),'copy failure shown');
  assert.equal(await editor.locator('#save').textContent(),'Copy again');assert.equal(await editor.locator('#note').inputValue(),'RETRY ME');
  assert.equal((await savedOn('/blocked')).length,2,'saved before the copy failed');assert.equal(await clipboard(),blocked,'a failed copy leaves the clipboard alone');
  await page.screenshot({path:join(out,'copy-failed.png')});
  await editor.evaluate(()=>globalThis.restoreCopy());await editor.locator('#save').click();
  await until(async()=>(await overlayText()).includes("Copied this page's feedback · 2 items"),'retry toast');
  assert.match(await clipboard(),/1\. `#save-button`[\s\S]*2\. `#second`[^\n]*\n   RETRY ME\n/);assert.equal((await savedOn('/blocked')).length,2,'retry stores nothing twice');
  await page.locator('h1').click();editor=await frame('element');await editor.locator('#note').fill('CLOSE UNCOPIED');
  await editor.evaluate(()=>{navigator.clipboard.writeText=()=>Promise.reject(new DOMException('refused','NotAllowedError'));document.execCommand=()=>false;});
  await editor.locator('#note').press('Enter');await until(async()=>(await editor.locator('#save').textContent())==='Copy again','second copy failure');
  await editor.locator('#cancel').click();await until(async()=>(await overlayText()).includes('Saved. Copy it from the extension menu.'),'saved-not-copied toast');
  assert.ok((await savedOn('/blocked')).some(i=>i.note==='CLOSE UNCOPIED'),'× after a failed copy keeps the saved note');
  assert.equal((await state()).feedbackMode,true);await page.keyboard.press('Escape');await until(async()=>!(await state()).feedbackMode,'stop after retry');
  check('a failed copy keeps the saved note open with Copy again; the retry copies without duplicating; × keeps it saved');
 }finally{await clipboardReader.bringToFront();await clipboardReader.evaluate(text=>navigator.clipboard.writeText(text),originalClipboard);await clipboardReader.close();await page.bringToFront();}
 const replacement=await ctx.newPage();await replacement.goto('chrome://version/');await page.close();page=replacement;pageCDP=await ctx.newCDPSession(page);
 let menu=await popup();await until(()=>menu.evaluate("document.querySelector('#warning').textContent.length>0"),'restricted-page warning');assert.equal(await menu.evaluate("document.querySelector('#primary-action-btn').disabled"),true);
 check('restricted page disables picking');
 await page.goto(new URL('/sample.pdf',url).href);
 menu=await popup();await until(()=>menu.evaluate("document.querySelector('#warning').textContent.length>0"),'PDF warning');assert.equal(await menu.evaluate("document.querySelector('#primary-action-btn').disabled"),true);
 check('real PDF viewer disables picking');
 assert.equal(hash(zip),zipHash);assert.deepEqual(files(),originalFiles);check('exact ZIP and extracted bytes unchanged after acceptance');
 report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;throw error;
}finally{
 if(ctx){await ctx.tracing.stop({path:join(out,'trace.zip')}).catch(()=>{});await ctx.close();}
 await new Promise(r=>server.close(r));
 try{assert.equal(hash(zip),zipHash,'ZIP changed during acceptance');assert.deepEqual(files(),originalFiles,'extracted extension changed during acceptance');}
 catch(error){report.status='failed';report.error=error.stack;throw error;}
 finally{writeFileSync(join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n');rmSync(temp,{recursive:true,force:true});}
}
