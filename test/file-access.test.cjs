const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const shared = require('../shared.js');

test('file preflight reads the real browser toggle and leaves web/invalid URLs alone',async()=>{
  let reads=0;
  const api={async isAllowedFileSchemeAccess(){reads++;return false;}};
  for(const url of ['https://site.test','http://localhost:5173','chrome://version','invalid',undefined])assert.equal(await shared.checkFileAccess(url,api),null);
  assert.equal(reads,0);
  for(const url of ['file:///home/private/plan.html','file:///C:/Private/plan.html']) {
    const result=await shared.checkFileAccess(url,api);
    assert.equal(result.needsFileAccess,true);assert.match(result.reason,/Details[\s\S]*Allow access to file URLs[\s\S]*reopen/);
    assert.doesNotMatch(result.reason,/home\/private|C:\/Private/);
  }
  assert.equal(reads,2);
  assert.equal(await shared.checkFileAccess('file:///plan.html',{async isAllowedFileSchemeAccess(){return true;}}),null);
  assert.match((await shared.checkFileAccess('file:///plan.html',{})).reason,/Could not check/);
});

async function popup(options={}) {
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{id,hidden:true,disabled:id==='primary-action-btn',textContent:'',listeners:{},children:[],addEventListener(name,fn){this.listeners[name]=fn;},replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},setAttribute(){}});
    return elements.get(id);
  };
  let created=0;let closed=false;let reads=0;let fileChecks=0;let messages=0;let destination;
  const url=options.url || 'file:///PRIVATE_DIR/plan.html';
  const item={id:'saved',type:'element',selector:'#saved',pageUrl:url,note:'Existing local note',timestamp:'2026-10-02T00:00:00Z'};
  const chrome={
    runtime:{id:'unit',async sendMessage(){messages++;return options.startResult || {ok:true};}},
    tabs:{async query(){return [{id:1,url}];},async sendMessage(){reads++;return {};},async create(value){created++;destination=value.url;}},
    extension:{async isAllowedFileSchemeAccess(){fileChecks++;if(options.failAccess)throw new Error('query failed');return options.fileAccess !== false;}},
    storage:{local:{async get(key){return options.saved ? {[key]:[item]} : {};}}},
    scripting:{async executeScript(){reads++;return [];}},
    permissions:{async contains(){throw new Error('no embedded site should be checked');},async request(){throw new Error('no host grant should be requested');}}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../popup.js'),'utf8'),{DevFeedbackShared:shared,chrome,URL,Blob,Date,setTimeout,navigator:{platform:'Linux',userAgent:options.edge?'Edg/153':'Chrome/153'},window:{close(){closed=true;}},document:{getElementById:element,createElement:tag=>element('generated-'+tag+'-'+elements.size)}});
  await new Promise(resolve=>setImmediate(resolve));
  return {element,get reads(){return reads;},get fileChecks(){return fileChecks;},get messages(){return messages;},get created(){return created;},get closed(){return closed;},get destination(){return destination;},click:id=>element(id).listeners.click({currentTarget:element(id)})};
}

test('blocked popup explains file access, keeps saved captures usable, and opens only its own settings',async()=>{
  for(const edge of [false,true]) {
    const app=await popup({fileAccess:false,saved:true,edge});
    assert.equal(app.element('primary-action-btn').disabled,true);assert.equal(app.element('file-access-settings-btn').hidden,false);
    assert.match(app.element('warning').textContent,/Allow access to file URLs/);assert.equal(app.element('captures').hidden,false);
    assert.equal(app.element('capture-list').children.length,1);assert.equal(app.reads,0,'no content probing before permission');assert.equal(app.messages,0);
    await app.click('file-access-settings-btn');
    assert.equal(app.destination,`${edge?'edge':'chrome'}://extensions/?id=unit`);assert.equal(app.closed,true);assert.equal(app.created,1);
  }
});

test('allowed local HTML and ordinary web popup retain the normal picker',async()=>{
  for(const options of [{},{url:'https://site.test/page',fileAccess:false}]) {
    const app=await popup(options);assert.equal(app.element('primary-action-btn').disabled,false);
    assert.equal(app.element('file-access-settings-btn').hidden,true);assert.equal(app.fileChecks,options.url?0:1);
    await app.click('primary-action-btn');assert.equal(app.messages,1);assert.equal(app.closed,true);
  }
});

test('popup fails closed on an unreadable toggle or access revoked after preflight',async()=>{
  const unreadable=await popup({failAccess:true});assert.equal(unreadable.element('primary-action-btn').disabled,true);assert.match(unreadable.element('warning').textContent,/Could not check/);
  const revoked=await popup({startResult:{ok:false,needsFileAccess:true,reason:'Enable Allow access to file URLs'}});
  await revoked.click('primary-action-btn');assert.equal(revoked.closed,false);assert.equal(revoked.element('primary-action-btn').disabled,true);assert.equal(revoked.element('file-access-settings-btn').hidden,false);
});

test('local PDFs are rejected before querying file access and internal pages stay unsupported',async()=>{
  for(const url of ['file:///PRIVATE_DIR/plan.pdf','chrome://version/']) {
    const app=await popup({url,fileAccess:false});assert.equal(app.element('primary-action-btn').disabled,true);
    assert.equal(app.fileChecks,0);assert.equal(app.element('file-access-settings-btn').hidden,true);assert.match(app.element('warning').textContent,/PDF and browser-internal/);
  }
});
