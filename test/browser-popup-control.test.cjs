const assert = require('node:assert/strict');
const test = require('node:test');
const { popupControlPoint } = require('./browser/popup-control-point.cjs');

function control(rect, options={}) {
  const child={};
  const element={
    disabled:Boolean(options.disabled),
    getBoundingClientRect:()=>({x:20,y:40,...rect}),
    contains:target=>target===child,
    ownerDocument:{elementFromPoint:()=>options.covered ? {} : options.child ? child : element}
  };
  return element;
}

test('native popup input waits for missing, disabled, or hidden controls',()=>{
  assert.equal(popupControlPoint(null),null);
  assert.equal(popupControlPoint(control({width:100,height:40},{disabled:true})),null);
  for(const rect of [{width:0,height:0},{width:100,height:0},{width:0,height:40},{width:-1,height:40}])assert.equal(popupControlPoint(control(rect)),null);
});

test('a popup control becomes clickable only after its async list is rendered',()=>{
  const rect={x:0,y:0,width:0,height:0};const element=control(rect);
  element.getBoundingClientRect=()=>({x:20,y:40,...rect});
  assert.equal(popupControlPoint(element),null,'the old helper would click (0,0) here');
  Object.assign(rect,{x:20,y:40,width:100,height:40});
  assert.deepEqual(popupControlPoint(element),{x:70,y:60});
});

test('native popup input waits when another element covers the control',()=>{
  assert.equal(popupControlPoint(control({width:100,height:40},{covered:true})),null);
});

test('native popup input can target a rendered button or its child',()=>{
  for(const child of [false,true])assert.deepEqual(popupControlPoint(control({width:100,height:40},{child})),{x:70,y:60});
});
