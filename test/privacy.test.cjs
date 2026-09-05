const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const shared = require('../shared.js');
globalThis.DevFeedbackShared = shared;
const bundle = require('../ai-bundle.js');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const element = (id, note = 'Change spacing') => ({ id, type:'element', selector:'#button', pageUrl:'https://site.test/page', note, timestamp:'2026-09-05T00:00:00Z' });
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('redacted legacy regions remove every DOM anchor and source context from saved and bundled records', () => {
  const item = shared.normalizeFeedbackItem({ id:'masked', type:'region', pageUrl:'https://site.test/PRIVATE_PATH?token=PRIVATE_TOKEN', pageTitle:'PRIVATE_TITLE', note:'User request', screenshot:{ dataUrl:PNG }, annotations:[
    { type:'blur', rect:{x:0,y:0,width:10,height:10}, target:{text:'PRIVATE_TEXT'} },
    { type:'pin', point:{x:20,y:20}, target:{surroundingText:'PRIVATE_NEIGHBOR',selectors:['#PRIVATE_SELECTOR']} }
  ]});
  assert.equal(item.pageUrl,'https://site.test/');
  assert.equal(item.annotations.every(a=>a.target===null),true);
  assert.equal(item.note,'User request');
  assert.doesNotMatch(JSON.stringify(item),/PRIVATE_/);
  const bytes = Buffer.from(bundle.buildAiBundle([{storageKey:'site',items:[item]}]).bytes);
  assert.equal(bytes.includes(Buffer.from('PRIVATE_')),false);
  assert.equal(bytes.includes(Buffer.from('Security boundary:')),true);
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

function background(options={}) {
  const local = structuredClone(options.local || {}), sessions = structuredClone(options.sessions || {});
  let listener; let failWrite = false; let access; const windowTypes=[];
  const initialTab={id:1,windowId:1,url:'https://site.test/page',title:'Page',width:800,height:600};
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
    storage:{local:area(local),session:area(sessions)},
    scripting:{async insertCSS(){},async executeScript(details){ if(details.files){if(options.denyInjection)throw new Error('Injection is blocked');return [];}return [{result:details.args[0]==='getViewportMetrics'?{width:800,height:600,scrollX:0,scrollY:0,devicePixelRatio:1}:{url:initialTab.url,viewport:{width:800,height:600}}}];}},
    tabs:{async sendMessage(){return {ok:true};},onRemoved:{addListener(){}},async get(id){return {...tabs.get(id)};},async query(){return [{...tabs.get(activeId)}];},async getZoom(){return 1;},async captureVisibleTab(){if(options.switchDuringCapture){activeId=2;tabs.set(2,{...initialTab,id:2,url:'https://other.test/'});}return PNG;},async create(details){const tab={id:10,windowId:1,url:details.url};tabs.set(10,tab);return tab;},async update(id,details){Object.assign(tabs.get(id),details);return tabs.get(id);},async remove(id){tabs.delete(id);}},
    windows:{async create(details){windowTypes.push(details.type);const tab=await chrome.tabs.create(details);return {tabs:[tab]};}},
    commands:{onCommand:{addListener(){}}}
  };
  const context={chrome,DevFeedbackShared:shared,importScripts(){},console:{debug(){},error(){}},navigator:{userAgent:'test',language:'en'},URL,Date,Map,Promise,TextEncoder};
  vm.runInNewContext(source('background.js'),context);
  const page=(name, session)=>({id:'unit',frameId:session?2:0,documentId:'editor-document',url:chrome.runtime.getURL(name+(session?'?session='+session:'')),tab:{id:session?1:10}});
  const content={id:'unit',frameId:0,url:initialTab.url,tab:initialTab};
  return {local,sessions,content,page,windowTypes,get access(){return access;},set failWrite(value){failWrite=value;},send:(request,sender=page('history.html'))=>new Promise(resolve=>listener(request,sender,resolve))};
}

test('broker denies content-script History reads/writes, forged extension URLs, subframes, and wrong editor ownership', async () => {
  const app=background({local:{'dev-feedback-https://private.test':[element('private')]}});
  for(const request of [{action:'list-feedback-history'},{action:'get-feedback-items',storageKey:'dev-feedback-https://private.test'},{action:'delete-feedback-items',storageKey:'dev-feedback-https://private.test',itemIds:['private']},{action:'add-feedback-item',item:element('evil') }])assert.equal((await app.send(request,app.content)).ok,false);
  assert.equal((await app.send({action:'list-feedback-history'},{...app.content,url:'file:///history.html'})).ok,false);
  assert.equal((await app.send({action:'list-feedback-history'},{...app.page('history.html'),frameId:1})).ok,false);
  assert.equal((await app.send({action:'get-capture-session'},app.page('element.html','not-owned'))).ok,false);
  assert.equal((await app.send({action:'list-feedback-history'})).histories.length,1);
  assert.equal(app.access.accessLevel,'TRUSTED_CONTEXTS');
});

test('broker fails closed when storage access cannot be restricted',async()=>{
  const app=background({denyAccess:true});assert.equal((await app.send({action:'list-feedback-history'})).ok,false);
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

test('storage capacity rejection preserves the editor session and existing history',async()=>{
  const app=background({usedBytes:9*1024*1024});
  const result=await app.send({action:'start-element-capture',snapshot:{selector:'#button'}},app.content);
  const save=await app.send({action:'add-feedback-item',item:{note:'Draft'}},app.page('element.html',result.sessionId));
  assert.equal(save.ok,false);assert.match(save.reason,/nearly full/);assert.equal(Object.keys(app.sessions).length,1);
});

test('Region capture rejects a tab switch instead of saving mismatched evidence',async()=>{
  const app=background({switchDuringCapture:true});
  const result=await app.send({action:'start-region-capture',tab:{id:1}},app.page('popup.html'));
  assert.equal(result.ok,false);assert.match(result.reason,/source tab changed/);assert.equal(Object.keys(app.sessions).length,0);
});

test('History filter and selection exclude hidden items from export and deletion',async()=>{
  const controls=new Map();const control=id=>{if(!controls.has(id))controls.set(id,{addEventListener(){},setAttribute(){},style:{}});return controls.get(id);};
  const context={DevFeedbackShared:shared,document:{getElementById:control},chrome:{storage:{onChanged:{addListener(){}}}},Set,JSON};
  let script=source('history.js').replace('\n  loadHistory();','\n  // Suppress initial rendering in this contract test.');
  script=script.replace(/\}\)\(\);\s*$/,`globalThis.audit={seed(h,q){histories=h;searchQuery=q;h.forEach(group=>group.items.forEach(item=>selected.add(identity(group,item))));},getSelectedHistories,getFilteredHistories,clearHistoryGroup};})();`);
  vm.runInNewContext(script,context);
  context.audit.seed([{storageKey:'site',items:[element('a','VISIBLE'),element('b','HIDDEN')]}],'visible');
  assert.equal(context.audit.getSelectedHistories()[0].items.length,1);
  let request,confirmation;
  context.window={confirm(value){confirmation=value;return true;}};
  context.chrome.runtime={async sendMessage(value){request=value;return {ok:false,reason:'stop after observing request'};}};
  await context.audit.clearHistoryGroup(context.audit.getFilteredHistories()[0]);
  assert.match(confirmation,/1 shown/);assert.deepEqual(Array.from(request.itemIds),['a']);
});

test('private editor rejects another document and keeps global History unavailable', async()=>{
  const app=background();
  const started=await app.send({action:'start-element-capture',snapshot:{selector:'#button'}},app.content);
  const sender=app.page('element.html',started.sessionId);
  assert.equal((await app.send({action:'get-capture-session'},sender)).ok,true);
  assert.equal(Object.values(app.sessions)[0].editorTabId,app.content.tab.id);
  assert.equal((await app.send({action:'get-capture-session'},{...sender,documentId:'other-document'})).ok,false);
  assert.equal((await app.send({action:'get-capture-session'},{...sender,tab:{id:99}})).ok,false);
  assert.equal((await app.send({action:'list-feedback-history'},sender)).ok,false);
});

test('legacy histories above the item budget can still be cleaned up',async()=>{
  const key='dev-feedback-https://site.test';
  const app=background({local:{[key]:Array.from({length:502},(_,i)=>element(String(i)))}});
  assert.equal((await app.send({action:'delete-feedback-items',storageKey:key,itemIds:['0']})).ok,true);
  assert.equal(app.local[key].length,501);
});

test('the first crop gesture works before any selection exists',async()=>{
  const controls=new Map();
  const control=id=>{
    if(!controls.has(id)) controls.set(id,{value:'',style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},replaceChildren(){},setAttribute(){},getBoundingClientRect(){return {left:0,top:0,width:800,height:600};}});
    return controls.get(id);
  };
  const context={DevFeedbackShared:shared,document:{getElementById:control,querySelectorAll(){return [];}},window:{addEventListener(){}},Set,Map,JSON,Math};
  let script=source('capture.js').replace(/  init\(\)\.catch\(\(error\) => \{[\s\S]*?\n  \}\);/,'');
  script=script.replace(/\}\)\(\);\s*$/,`globalThis.cropTest={seed(){session={viewportMetrics:{width:800,height:600}};},startGesture,updateGesture,finishGesture,getSelection(){return selection;}};})();`);
  vm.runInNewContext(script,context);
  context.cropTest.seed();
  const event=(x,y)=>({button:0,pointerId:1,clientX:x,clientY:y,preventDefault(){}});
  await context.cropTest.startGesture(event(100,100));
  context.cropTest.updateGesture(event(400,350));
  context.cropTest.finishGesture(event(400,350));
  assert.equal(context.cropTest.getSelection().width,300);
  assert.equal(context.cropTest.getSelection().height,250);
});


test('restricted surfaces use a capture popup window with session ownership',async()=>{
  const app=background({denyInjection:true});
  const started=await app.send({action:'start-region-capture',tab:{id:1}},app.page('popup.html'));
  assert.equal(started.ok,true);
  assert.deepEqual(app.windowTypes,['popup']);
  const sender={...app.page('capture.html',started.sessionId),frameId:0,tab:{id:10}};
  assert.equal((await app.send({action:'get-capture-session'},sender)).ok,true);
  assert.equal((await app.send({action:'get-capture-session'},{...sender,tab:{id:1}})).ok,false);
});
