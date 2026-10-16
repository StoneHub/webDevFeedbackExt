const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const shared = require('../shared.js');
globalThis.DevFeedbackShared = shared;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const element = (id, note = 'Change spacing') => ({ id, type:'element', selector:'#button', pageUrl:'https://site.test/page', note, timestamp:'2026-09-05T00:00:00Z' });
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('redacted legacy regions remove every DOM anchor and source context from saved records', () => {
  const item = shared.normalizeFeedbackItem({ id:'masked', type:'region', pageUrl:'https://site.test/PRIVATE_PATH?token=PRIVATE_TOKEN', pageTitle:'PRIVATE_TITLE', note:'User request', screenshot:{ dataUrl:PNG }, annotations:[
    { type:'blur', rect:{x:0,y:0,width:10,height:10}, target:{text:'PRIVATE_TEXT'} },
    { type:'pin', point:{x:20,y:20}, target:{surroundingText:'PRIVATE_NEIGHBOR',selectors:['#PRIVATE_SELECTOR']} }
  ]});
  assert.equal(item.pageUrl,'https://site.test/');
  assert.equal(item.annotations.every(a=>a.target===null),true);
  assert.equal(item.note,'User request');
  assert.doesNotMatch(JSON.stringify(item),/PRIVATE_/);
});

test('sharing removes URL credentials and local directories and preserves group identity across selection changes', async () => {
  const group = {storageKey:'dev-feedback-file-file%3A%2F%2F%2FPRIVATE_DIR%2Fbrief.pdf',items:[{...element('a'),pageUrl:'file:///PRIVATE_DIR/brief.pdf'},element('b')]};
  const result = await shared.prepareExportHistories([group]);
  const otherSelection = await shared.prepareExportHistories([{...group,items:[element('b')]}]);
  assert.equal(result[0].storageKey, otherSelection[0].storageKey);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_DIR/);
  assert.equal(shared.safeShareUrl('https://name:pass@site.test/page?token=secret#private'),'https://site.test/page');
  assert.match(shared.buildAiPromptExport('https://site.test', [element('a')]),/untrusted observations/);
});

test('clipboard text names each element, keeps notes, and strips URL secrets', () => {
  const text = shared.buildClipboardText([
    {...element('a','Make it bigger'),pageUrl:'https://user:pw@site.test/page?token=SECRET#frag',elementInfo:{tag:'button',text:'Save'}},
    {...element('b',''),selector:'#other'}
  ]);
  assert.match(text,/^Page feedback: https:\/\/site\.test\/page\n/);
  assert.match(text,/1\. `#button` \(button "Save"\)\n   Make it bigger\n/);
  assert.match(text,/2\. `#other` \(\w+\)\n\n/,'a blank note saves just the element reference');
  assert.doesNotMatch(text,/SECRET|pw@/);
  assert.match(text,/references, not instructions/);
});

function background(options={}) {
  const local = structuredClone(options.local || {}), sessions = structuredClone(options.sessions || {});
  let listener; let commandListener; let failWrite = false; let access; const windowTypes=[]; const badges=[]; const tabMessages=[]; const injections=[];
  const initialTab={id:1,windowId:1,url:options.url || 'https://site.test/page',title:'Page',width:800,height:600};
  const fileAccessSequence=[...(options.fileAccessSequence || [])];
  const tabs=new Map([[1, initialTab]]); let activeId=1;
  const area=data=>({
    async get(keys){ return keys===null ? structuredClone(data) : Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in data).map(k=>[k,structuredClone(data[k])])); },
    async set(value){ if(failWrite&&data===local)throw new Error('QUOTA_BYTES');Object.assign(data,structuredClone(value)); },
    async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];},
    async getBytesInUse(key){return options.usedBytes && key===null ? options.usedBytes : Buffer.byteLength(JSON.stringify(key===null?data:data[key]||[]));},
    async setAccessLevel(value){access=value;if(options.denyAccess)throw new Error('Cannot restrict storage');}
  });
  const chrome={
    runtime:{id:'unit',onMessage:{addListener(fn){listener=fn;}},getURL:value=>'chrome-extension://unit/'+value},
    extension:{async isAllowedFileSchemeAccess(){if(options.failFileAccess)throw new Error('File access query failed');return fileAccessSequence.length ? fileAccessSequence.shift() : options.fileAccess !== false;}},
    storage:{local:area(local),session:area(sessions)},
    scripting:{async insertCSS(details){injections.push(details);},async executeScript(details){injections.push(details);if(details.files){if(options.denyInjection)throw new Error('Injection is blocked');return [];}if(!details.args)return [{result:options.contentType || 'text/html'}];return [{result:details.args[0]==='getViewportMetrics'?{width:800,height:600,scrollX:0,scrollY:0,devicePixelRatio:1}:{url:initialTab.url,viewport:{width:800,height:600}}}];}},
    tabs:{async sendMessage(tabId,message,options){tabMessages.push({tabId,message,options});return {ok:true};},onRemoved:{addListener(){}},async get(id){return {...tabs.get(id)};},async query(){return [{...tabs.get(activeId)}];},async getZoom(){return 1;},async captureVisibleTab(){if(options.switchDuringCapture){activeId=2;tabs.set(2,{...initialTab,id:2,url:'https://other.test/'});}return PNG;},async create(details){const tab={id:10,windowId:1,url:details.url};tabs.set(10,tab);return tab;},async update(id,details){Object.assign(tabs.get(id),details);return tabs.get(id);},async remove(id){tabs.delete(id);}},
    windows:{async create(details){windowTypes.push(details.type);const tab=await chrome.tabs.create(details);return {tabs:[tab]};}},
    action:{async setBadgeText(details){badges.push(details);},async setBadgeBackgroundColor(){}},
    permissions:{onAdded:{addListener(){}}},
    commands:{onCommand:{addListener(fn){commandListener=fn;}}}
  };
  const context={chrome,DevFeedbackShared:shared,importScripts(){},console:{debug(){},error(){}},navigator:{userAgent:'test',language:'en'},URL,Date,Map,Promise,TextEncoder};
  vm.runInNewContext(source('background.js'),context);
  const page=(name, session)=>({id:'unit',frameId:session?2:0,documentId:'editor-document',url:chrome.runtime.getURL(name+(session?'?session='+session:'')),tab:{id:session?1:10}});
  const content={id:'unit',frameId:0,url:initialTab.url,tab:initialTab};
  return {local,sessions,content,page,windowTypes,badges,tabMessages,injections,command:()=>commandListener('toggle-feedback-mode'),get tabCount(){return tabs.size;},get access(){return access;},set failWrite(value){failWrite=value;},send:(request,sender=page('popup.html'))=>new Promise(resolve=>listener(request,sender,resolve))};
}

test('file access is checked before injection, run creation, or badge activation',async()=>{
  for(const options of [{fileAccess:false},{failFileAccess:true}]) {
    const app=background({url:'file:///PRIVATE_DIR/plan.html',...options});
    const result=await app.send({action:'set-picking',tabId:1,enabled:true});
    assert.equal(result.ok,false);assert.equal(result.needsFileAccess,true);
    assert.match(result.reason,/Allow access to file URLs/);assert.doesNotMatch(result.reason,/PRIVATE_DIR/);
    assert.equal(app.injections.length,0);assert.equal(app.badges.length,0);assert.equal(Object.keys(app.sessions).length,0);
    app.command();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(app.injections.length,0,'the shortcut uses the same preflight');assert.equal(app.badges.length,0);
  }
});

test('allowed local HTML picks normally, while local and MIME-detected PDFs stay unsupported',async()=>{
  const app=background({url:'file:///PRIVATE_DIR/plan.html'});
  assert.equal((await app.send({action:'set-picking',tabId:1,enabled:true})).ok,true);
  assert.equal(app.badges.at(-1).text,'ON');assert.ok(app.injections.length);
  for(const options of [{url:'file:///PRIVATE_DIR/plan.pdf'},{url:'file:///PRIVATE_DIR/document',contentType:'application/pdf'}]) {
    const pdf=background(options);const result=await pdf.send({action:'set-picking',tabId:1,enabled:true});
    assert.equal(result.ok,false);assert.match(result.reason,/PDF/);assert.equal(pdf.badges.length,0);
  }
});

test('revoked file access during injection returns setting guidance without starting a run',async()=>{
  const app=background({url:'file:///PRIVATE_DIR/plan.html',denyInjection:true,fileAccessSequence:[true,false]});
  const result=await app.send({action:'set-picking',tabId:1,enabled:true});
  assert.equal(result.needsFileAccess,true);assert.match(result.reason,/Allow access to file URLs/);
  assert.doesNotMatch(result.reason,/Injection is blocked/);assert.equal(app.badges.length,0);assert.equal(Object.keys(app.sessions).length,0);
});

test('broker denies content-script deletes and adds, forged extension URLs, popup subframes, and wrong editor ownership', async () => {
  const app=background({local:{'dev-feedback-https://private.test':[element('private')]}});
  const del={action:'delete-feedback-items',storageKey:'dev-feedback-https://private.test',itemIds:['private']};
  for(const request of [del,{action:'add-feedback-item',item:element('evil')}])assert.equal((await app.send(request,app.content)).ok,false);
  assert.equal((await app.send(del,{...app.content,url:'file:///popup.html'})).ok,false);
  assert.equal((await app.send(del,{...app.page('popup.html'),frameId:1})).ok,false);
  assert.equal((await app.send({action:'get-capture-session'},app.page('element.html','not-owned'))).ok,false);
  assert.equal(app.local['dev-feedback-https://private.test'].length,1);
  assert.equal(app.access.accessLevel,'TRUSTED_CONTEXTS');
});

// Background objects come from another vm realm; compare their JSON shape.
const plain=value=>JSON.parse(JSON.stringify(value));

test('embedded frames can pick and stop picking but cannot reach saved captures',async()=>{
  const app=background({local:{'dev-feedback-https://private.test':[element('private')]}});
  const frame={...app.content,frameId:3,url:'https://abc123.frame.usercontent.test/'};
  assert.equal((await app.send({action:'delete-feedback-items',storageKey:'dev-feedback-https://private.test',itemIds:['private']},frame)).ok,false);
  assert.equal(app.local['dev-feedback-https://private.test'].length,1);
  assert.equal((await app.send({action:'start-element-capture',snapshot:{selector:'#inner'}},{...frame,url:'chrome-extension://evil/'})).ok,false);
  const started=await app.send({action:'start-element-capture',snapshot:{selector:'#inner',tag:'button'},rect:{left:10,top:20,right:110,bottom:50},frame:{url:'https://forged.test/',width:800,height:600}},frame);
  assert.equal(started.ok,true);
  const shown=app.tabMessages.find(m=>m.message.action==='show-capture-overlay');
  assert.deepEqual(plain(shown.message.anchor),{frameId:3,rect:{left:10,top:20,right:110,bottom:50},frame:{url:frame.url,width:800,height:600}},'the top page places the note beside the element inside the frame, using the frame URL Chrome reports');
  assert.equal(shown.options.frameId,0);
  assert.deepEqual(plain(app.tabMessages.at(-1)),{tabId:1,message:{action:'set-feedback-mode',enabled:false}},'picking stops in every frame once the editor opens');
  assert.equal((await app.send({action:'stop-picking'},frame)).ok,true);
  assert.deepEqual(plain(app.badges.at(-1)),{tabId:1,text:''});
});

test('popup turns picking on in every frame and shows it on the toolbar badge',async()=>{
  const app=background();
  assert.equal((await app.send({action:'set-picking',tabId:1,enabled:true},app.page('popup.html'))).ok,true);
  assert.deepEqual(plain(app.tabMessages.at(-1).message),{action:'set-feedback-mode',enabled:true});
  assert.equal(app.tabMessages.at(-1).options,undefined,'no frameId: the message reaches every frame');
  assert.deepEqual(plain(app.badges.at(-1)),{tabId:1,text:'ON'});
  assert.equal((await app.send({action:'set-picking',tabId:1,enabled:true},app.content)).ok,false,'pages cannot turn picking on');
});

test('embedded frame access asks for the frame site, never the parent or non-web frames',()=>{
  const parent='https://claude.ai/artifact/abc';
  assert.equal(shared.frameAccessPattern('https://6401ba16-3e8e.frame.claudeusercontent.com/x?y',parent),'https://*.frame.claudeusercontent.com/*');
  assert.equal(shared.frameAccessPattern('https://www.youtube.com/embed/1',parent),'https://www.youtube.com/*');
  assert.equal(shared.frameAccessPattern('http://localhost:5173/',parent),'http://localhost/*');
  assert.equal(shared.frameAccessPattern('http://10.0.0.12:3000/',parent),'http://10.0.0.12/*');
  assert.equal(shared.frameAccessPattern('https://claude.ai/other',parent),'');
  assert.equal(shared.frameAccessPattern('about:blank',parent),'');
  assert.equal(shared.frameAccessPattern('javascript:alert(1)',parent),'');
  assert.equal(shared.frameAccessPattern('not a url',parent),'');
});

test('broker fails closed when storage access cannot be restricted',async()=>{
  const app=background({denyAccess:true});assert.equal((await app.send({action:'delete-feedback-items',storageKey:'dev-feedback-https://site.test',itemIds:[]})).ok,false);
});

test('selected deletion preserves hidden items and serializes simultaneous operations',async()=>{
  const key='dev-feedback-https://site.test';const app=background({local:{[key]:[element('a'),element('b'),element('c')]}});
  await Promise.all(['a','b'].map(id=>app.send({action:'delete-feedback-items',storageKey:key,itemIds:[id]})));
  assert.deepEqual(app.local[key].map(item=>item.id),['c']);
});

test('Element editor session saves are retryable and idempotent without disclosing History to the caller',async()=>{
  const app=background();const started=await app.send({action:'start-element-capture',snapshot:{selector:'#button',tag:'button',text:'Save'}},app.content);
  assert.equal(started.ok,true);
  const sender=app.page('element.html',started.sessionId);
  app.failWrite=true;
  assert.equal((await app.send({action:'add-feedback-item',item:{note:'Keep this draft'}},sender)).ok,false);
  assert.equal(Object.keys(app.local).length,0);
  assert.equal((await app.send({action:'get-capture-session'},sender)).ok,true);
  app.failWrite=false;
  const result=await app.send({action:'add-feedback-item',item:{note:'Keep this draft'}},sender);
  assert.equal(result.ok,true);assert.equal(result.items,undefined);
  await app.send({action:'add-feedback-item',item:{note:'Keep this draft'}},sender);
  assert.equal(app.local['dev-feedback-https://site.test'].length,1);
});

test('each save copies the whole picking run, and a new run starts fresh',async()=>{
  const app=background();
  const popup=app.page('popup.html');
  const save=async(selector,note)=>{
    const started=await app.send({action:'start-element-capture',snapshot:{selector,tag:'button',text:selector}},app.content);
    return app.send({action:'add-feedback-item',item:{note}},app.page('element.html',started.sessionId));
  };
  await app.send({action:'set-picking',tabId:1,enabled:true},popup);
  const first=await save('#one','Bigger');
  assert.equal(first.count,1);assert.match(first.clipboard,/`#one`[\s\S]*Bigger/);
  const second=await save('#two','');
  assert.equal(second.count,2);assert.match(second.clipboard,/1\. `#one`[\s\S]*2\. `#two`/);
  await app.send({action:'set-picking',tabId:1,enabled:true},popup);
  const third=await save('#three','Next run');
  assert.equal(third.count,1);assert.doesNotMatch(third.clipboard,/#one|#two/);
  assert.equal(app.local['dev-feedback-https://site.test'].length,3,'every save still lands in the page list');
});

test('closing a note keeps picking; a save shows the clipboard toast',async()=>{
  const app=background();
  const open=async()=>app.page('element.html',(await app.send({action:'start-element-capture',snapshot:{selector:'#a'}},app.content)).sessionId);
  const lastToast=()=>app.tabMessages.filter(m=>m.message.action==='close-capture-overlay').at(-1).message.toast;
  await app.send({action:'clear-capture-session',saved:true,copied:true,count:2},await open());
  assert.equal(lastToast(),'Copied to clipboard · 2 selections');
  assert.deepEqual(plain(app.tabMessages.at(-1).message),{action:'set-feedback-mode',enabled:true});
  assert.deepEqual(plain(app.badges.at(-1)),{tabId:1,text:'ON'});
  await app.send({action:'clear-capture-session',saved:true,copied:false,count:1},await open());
  assert.equal(lastToast(),'Saved. Copy it from the extension menu.');
  await app.send({action:'clear-capture-session'},await open());
  assert.equal(lastToast(),'','closing without saving shows nothing');
  assert.deepEqual(plain(app.tabMessages.at(-1).message),{action:'set-feedback-mode',enabled:true});
});

test('storage capacity rejection preserves the editor session and existing history',async()=>{
  const app=background({usedBytes:9*1024*1024});
  const result=await app.send({action:'start-element-capture',snapshot:{selector:'#button'}},app.content);
  const save=await app.send({action:'add-feedback-item',item:{note:'Draft'}},app.page('element.html',result.sessionId));
  assert.equal(save.ok,false);assert.match(save.reason,/nearly full/);assert.equal(Object.keys(app.sessions).length,1);
});


test('private editor rejects another document and cannot delete saved captures', async()=>{
  const app=background();
  const started=await app.send({action:'start-element-capture',snapshot:{selector:'#button'}},app.content);
  const sender=app.page('element.html',started.sessionId);
  assert.equal((await app.send({action:'get-capture-session'},sender)).ok,true);
  assert.equal(Object.values(app.sessions)[0].editorTabId,app.content.tab.id);
  assert.equal((await app.send({action:'get-capture-session'},{...sender,documentId:'other-document'})).ok,false);
  assert.equal((await app.send({action:'get-capture-session'},{...sender,tab:{id:99}})).ok,false);
  assert.equal((await app.send({action:'delete-feedback-items',storageKey:'dev-feedback-https://site.test',itemIds:[]},sender)).ok,false);
});

test('legacy histories above the item budget can still be cleaned up',async()=>{
  const key='dev-feedback-https://site.test';
  const app=background({local:{[key]:Array.from({length:502},(_,i)=>element(String(i)))}});
  assert.equal((await app.send({action:'delete-feedback-items',storageKey:key,itemIds:['0']})).ok,true);
  assert.equal(app.local[key].length,501);
});




test('Region creation, History, and retired editor routes are unavailable',async()=>{
  const app=background();
  assert.equal((await app.send({action:'start-region-capture',tab:{id:1}},app.page('popup.html'))).ok,false);
  assert.equal((await app.send({action:'start-region-capture'},app.content)).ok,false);
  assert.equal((await app.send({action:'get-capture-session'},app.page('capture.html','old'))).ok,false);
  for(const action of ['open-history','list-feedback-history','edit-feedback-note'])assert.equal((await app.send({action})).ok,false,action);
  assert.equal(Object.keys(app.sessions).length,0);
});

test('Element saving cannot smuggle a screenshot into a new Region record',async()=>{
  const app=background();
  const start=await app.send({action:'start-element-capture',snapshot:{selector:'#button'}},app.content);
  const result=await app.send({action:'add-feedback-item',item:{note:'Change label',screenshot:{dataUrl:PNG},type:'region'}},app.page('element.html',start.sessionId));
  assert.equal(result.ok,true);
  const item=Object.values(app.local).flat()[0];
  assert.equal(item.type,'element');assert.equal(item.screenshot,undefined);
});
