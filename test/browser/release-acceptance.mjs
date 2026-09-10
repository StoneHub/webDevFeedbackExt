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
 'Synthetic legacy and capacity fixtures are seeded through the browser storage debugging API. No real user history or extension code is changed.'
]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+15000;let last;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){last=e;}await delay(50);}throw new Error(`Timed out: ${label}${last?' — '+last.message:''}`);}
const html='<!doctype html><html><head><title>Release acceptance fixture</title><link rel="icon" href="data:,"></head><body style="font:20px system-ui;padding:60px"><h1>Checkout</h1><button id="save-button">Save changes</button><button id="second">Second action</button><input type="password" value="SECRET_INPUT_SENTINEL"><p id="parent-secret">PARENT_SECRET_SENTINEL</p><script>window.siteClicks=0;document.querySelector("#save-button").onclick=()=>window.siteClicks++;</script></body></html>';
const server=createServer((req,res)=>{if(req.url==='/sample.pdf'){res.setHeader('Content-Type','application/pdf');res.end(readFileSync(join(root,'test/fixtures/sample.pdf')));return;}res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/fixture`;
const storageKey=`dev-feedback-${new URL(url).origin}`;
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
 await start();await page.keyboard.press('Escape');await until(async()=>!(await state()).feedbackMode,'Escape cancels picker');check('toolbar activation and trusted keyboard cancel');
 await start();await page.locator('#save-button').focus();await page.keyboard.press('Alt+Enter');
 let editor=await frame('element');await editor.locator('#note').fill('SELECTED element spacing');
 await editor.locator('summary').filter({hasText:'Acceptance checks'}).click();await editor.locator('#acceptance').fill('Button remains keyboard accessible');
 assert.equal(await page.evaluate(()=>window.siteClicks),0);
 const targetText=await editor.locator('#target').textContent();assert.match(targetText,/#save-button/);assert.doesNotMatch(targetText,/SECRET_INPUT_SENTINEL|PARENT_SECRET_SENTINEL/);
 assert.doesNotMatch(await page.locator('body').innerText(),/SELECTED element spacing/);
 await page.screenshot({path:join(out,'element-editor.png')});
 const sessionBefore=Object.keys(await getStorage('session'));
 const p=await popup();await until(()=>p.evaluate("document.querySelector('#primary-action-btn').textContent==='Return to open panel'"),'draft return action');
 await p.click('#history-btn');
 await until(()=>p.evaluate("document.querySelector('#warning').textContent.includes('Save or cancel')"),'draft replacement refused');
 assert.equal(await editor.locator('#note').inputValue(),'SELECTED element spacing');assert.deepEqual(Object.keys(await getStorage('session')),sessionBefore);
 await p.click('#primary-action-btn');
 await editor.locator('#note').press('Escape');await editor.getByRole('button',{name:'Keep editing',exact:true}).click();
 assert.equal(await editor.locator('#note').inputValue(),'SELECTED element spacing');check('keyboard pick, private context, and draft replacement protection');
 const base={type:'element',selector:'#save-button',pageUrl:url,timestamp:'2026-09-09T00:00:00Z'};
 await seed({[storageKey]:Array.from({length:500},(_,i)=>({...base,id:`capacity-${i}`,note:`Synthetic capacity ${i}`}))});
 await editor.locator('#save').click();await until(async()=>(await editor.locator('#status').textContent()).includes('500 captures'),'capacity rejection');
 assert.equal(await editor.locator('#note').inputValue(),'SELECTED element spacing');assert.equal((await getStorage())[storageKey].length,500);
 await seed({[storageKey]:[]});await editor.locator('#save-next').click();await until(async()=>(await state()).feedbackMode,'save and pick next');
 const saved=(await getStorage())[storageKey];assert.equal(saved.length,1);assert.equal(saved[0].note,'SELECTED element spacing');assert.deepEqual(saved[0].acceptance,['Button remains keyboard accessible']);check('real capacity failure preserves draft; retry saves once and resumes picking');
 await page.locator('#second').click();editor=await frame('element');await editor.locator('#note').fill('Discard me');await editor.locator('#cancel').click();await editor.getByRole('button',{name:'Discard',exact:true}).click();await until(async()=>!(await state()).editorOpen,'discard closes editor');assert.equal((await getStorage())[storageKey].length,1);check('pointer picking and explicit discard');
 const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const legacy=[
  {...base,id:'legacy-region',type:'region',note:'SELECTED legacy redacted region',pageUrl:'https://legacy.test/PRIVATE_PATH?secret=PRIVATE_QUERY',screenshot:{dataUrl:PNG,annotatedDataUrl:PNG},annotations:[{type:'blur',rect:{x:0,y:0,width:1,height:1},target:{text:'PRIVATE_TARGET'}}]},
  {...base,id:'legacy-pdf',type:'region',sourceKind:'pdf',pageUrl:'file:///PRIVATE_DIRECTORY/brief.pdf',note:'SELECTED legacy PDF',screenshot:{dataUrl:PNG},annotations:[]},
  {...base,id:'legacy-visual',note:'SELECTED legacy Visual',evidence:{before:{dataUrl:PNG},proposed:{dataUrl:PNG}},changeRequest:{kind:'requested-mutation',summary:'SELECTED legacy Visual',requestedMutations:[{action:'restyle',target:{selectors:['#save-button'],tag:'button'},parameters:{styles:{color:'#111111'}}}]}},
  {...base,id:'legacy-add',note:'SELECTED legacy Add',changeRequest:{kind:'requested-mutation',summary:'SELECTED legacy Add',requestedMutations:[{action:'insert',target:{selectors:['#save-button'],tag:'button'},parameters:{placement:'inside-end',content:{type:'text',title:'Notice',body:'Synthetic notice'}}}]}},
  {...base,id:'hidden',note:'UNSELECTED_SENTINEL'}
 ];
 await seed({[storageKey]:[...saved,...legacy]});
 let menu=await popup();await menu.click('#history-btn');let history=await frame('history');
 await until(async()=>(await history.locator('article.item').count())===6,'six historical records');
 assert.equal(ctx.pages().length,1,'History created a tab');
 for(const note of legacy.map(i=>i.note))assert.ok(await history.getByText(note,{exact:true}).count(),note);
 assert.match(await history.locator('body').innerText(),/Restyle|restyle/);assert.match(await history.locator('body').innerText(),/Insert|insert/);
 const evidenceImages=history.locator('img');for(let i=0;i<await evidenceImages.count();i++){await until(async()=>{await evidenceImages.nth(i).scrollIntoViewIfNeeded();return evidenceImages.nth(i).evaluate(im=>im.complete&&im.naturalWidth>0);},'legacy evidence decoded');}
 await history.getByRole('button',{name:'Edit feedback: SELECTED element spacing',exact:true}).click();
 await history.locator('#edit-note').fill('SELECTED revised element');await history.locator('#edit-acceptance').fill('Updated acceptance check');await history.locator('#edit-save').click();
 await until(async()=>(await getStorage())[storageKey][0].note==='SELECTED revised element','saved edit');
 const edited=(await getStorage())[storageKey][0];for(const key of ['id','selector','pageUrl','timestamp'])assert.deepEqual(edited[key],saved[0][key]);assert.deepEqual(edited.acceptance,['Updated acceptance check']);
 await history.locator('#history-search').fill('legacy');await history.locator('#select-shown').click();
 assert.equal(await history.locator('article.item').count(),4);
 await history.locator('h1').scrollIntoViewIfNeeded();
 await page.screenshot({path:join(out,'legacy-history.png')});check('native on-page History, decoded legacy Region/PDF/Visual/Add, and evidence-preserving edits');
 const expectedNotes=legacy.slice(0,4).map(i=>i.note);
 const assertExport=text=>{for(const note of expectedNotes)assert.ok(text.includes(note),`missing ${note}`);assert.doesNotMatch(text,/UNSELECTED_SENTINEL|SELECTED revised element|PRIVATE_PATH|PRIVATE_QUERY|PRIVATE_TARGET|PRIVATE_DIRECTORY/);};
 async function preview(button){
  if((await history.locator('details.share-menu').getAttribute('open'))===null)await history.locator('details.share-menu > summary').click();
  await history.locator('#'+button).click();await history.locator('#export-preview[open]').waitFor();
  assert.match(await history.locator('#export-preview-count').innerText(),/^4 items/);assertExport(await history.locator('#export-preview-content').textContent());
 }
 for(const button of ['download-json','download-html','download-ai-bundle']){
  await preview(button);const downloaded=page.waitForEvent('download');await history.getByRole('button',{name:'Share these records',exact:true}).click();const download=await downloaded;const path=join(out,download.suggestedFilename());await download.saveAs(path);
  const data=button==='download-ai-bundle'?execFileSync('unzip',['-p',path],{maxBuffer:10*1024*1024}).toString():readFileSync(path,'utf8');assertExport(data);
  if(button==='download-json'){const payload=JSON.parse(data);writeFileSync(join(out,'selected-handoff.json'),JSON.stringify(payload,null,2));}
  if(button==='download-html'){const rendered=await ctx.newPage();await rendered.goto('file://'+path);assert.equal(await rendered.locator('article').count(),4);for(const image of await rendered.locator('img').all())assert.ok(await image.evaluate(im=>im.complete&&im.naturalWidth>0));await rendered.screenshot({path:join(out,'exported-report.png'),fullPage:true});await rendered.close();await page.bringToFront();}
 }
 // Use a separate extension-origin top-level document for clipboard reads: embedded frames
 // intentionally do not receive clipboard-read permission. The extension files stay unchanged.
 await ctx.grantPermissions(['clipboard-read','clipboard-write']);
 const clipboardReader=await ctx.newPage();await clipboardReader.goto(extURL+'/history.html');
 await clipboardReader.evaluate(async()=>{window.__acceptanceClipboard=await navigator.clipboard.readText();});
 try{
  for(const button of ['copy-markdown','copy-ai']){
   await page.bringToFront();await preview(button);await history.getByRole('button',{name:'Share these records',exact:true}).click();
   await until(async()=>(await history.locator('#status').textContent()).startsWith(button==='copy-markdown'?'Markdown copied.':'AI prompt copied.'),'clipboard export status');
   await clipboardReader.bringToFront();const copied=await clipboardReader.evaluate(()=>navigator.clipboard.readText());assertExport(copied);if(button==='copy-ai')assert.match(copied,/untrusted observations/);writeFileSync(join(out,button+'.txt'),copied);
  }
 }finally{await clipboardReader.bringToFront();await clipboardReader.evaluate(()=>navigator.clipboard.writeText(window.__acceptanceClipboard));await clipboardReader.close();await page.bringToFront();}
 check('all five reviewed selected exports, downloaded bytes, rendered HTML, and clipboard readback');
 // Exact selected deletion must preserve hidden records.
 await history.locator('#select-none').click();await history.getByRole('checkbox',{name:'Select SELECTED legacy Add',exact:true}).check();
 page.once('dialog',d=>d.accept());await history.locator('#clear-all').click();await until(async()=>(await getStorage())[storageKey].length===5,'selected deletion');
 assert.ok((await getStorage())[storageKey].some(i=>i.id==='hidden'));assert.ok(!(await getStorage())[storageKey].some(i=>i.id==='legacy-add'));check('selected deletion preserves hidden records');
 await history.locator('#close-history').click();
 // Close the original source tab, then use the actual native popup on a restricted page.
 const replacement=await ctx.newPage();await replacement.goto('chrome://version/');await page.close();page=replacement;pageCDP=await ctx.newCDPSession(page);
 menu=await popup();await until(()=>menu.evaluate("document.querySelector('#warning').textContent.length>0"),'restricted-page warning');assert.equal(await menu.evaluate("document.querySelector('#primary-action-btn').disabled"),true);
 await menu.click('#history-btn');await until(()=>menu.evaluate("location.pathname==='/history.html'&&document.querySelectorAll('article.item').length===5"),'native popup fallback History');
 assert.equal(ctx.pages().length,1);assert.ok((await menu.evaluate('document.body.innerText')).includes('UNSELECTED_SENTINEL'));
 const shot=await menu.send('Page.captureScreenshot');writeFileSync(join(out,'restricted-popup-history.png'),Buffer.from(shot.data,'base64'));
 check('closed-source persistence and native restricted-page popup fallback without extra tabs');
 await menu.click('#close-history');await page.goto(new URL('/sample.pdf',url).href);
 menu=await popup();await until(()=>menu.evaluate("document.querySelector('#warning').textContent.length>0"),'PDF warning');assert.equal(await menu.evaluate("document.querySelector('#primary-action-btn').disabled"),true);
 await menu.click('#history-btn');await until(()=>menu.evaluate("location.pathname==='/history.html'&&document.querySelectorAll('article.item').length===5"),'PDF popup History');check('real PDF viewer disables capture and opens native History fallback');
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
