import assert from 'node:assert/strict';
import { createDeferredModelField } from '../dist/deferred-model-field.js';

let active=0,peak=0,loaded=[];
const field=createDeferredModelField([1,2,3,4,5],async entry=>{
  peak=Math.max(peak,++active);
  await new Promise(resolve=>setTimeout(resolve,2));
  loaded.push(entry);--active;
});
assert.equal(field.started,false);assert.deepEqual(loaded,[]);
const first=field.load();assert.equal(field.started,true);assert.equal(field.load(),first);
await first;assert.equal(field.ready,true);assert.equal(peak,2);
assert.deepEqual(loaded.sort(),[1,2,3,4,5]);await field.load();assert.equal(loaded.length,5);
const failed=[];
const broken=createDeferredModelField([1,2,3],async entry=>{failed.push(entry);if(entry===2)throw new Error('asset unavailable');});
await assert.rejects(broken.load(),/asset unavailable/);
assert.deepEqual(failed.sort(),[1,2,3]);assert.equal(broken.ready,false);
console.log('Deferred models: lazy, two decoders maximum, idempotent, errors propagated after queue completion.');
