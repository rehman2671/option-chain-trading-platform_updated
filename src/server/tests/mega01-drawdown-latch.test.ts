import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DrawdownController} from '../../quant/risk/drawdownController.js';
test('invalid drawdown inputs halt only the affected account and retain prior observations',()=>{
  const d=new DrawdownController();
  d.evaluateDrawdown(100000,100000,'a');d.evaluateDrawdown(100000,100000,'b');
  const r=d.evaluateDrawdown(NaN,100000,'a');
  assert.equal(r.isHalted,true);assert.equal(r.currentCapital,100000);
  assert.equal(r.sizingMultiplier,0);assert.equal(r.requiresManualReset,true);
  assert.equal(d.isHalted('b'),false);assert.equal(d.readStatus('a').isHalted,true);
  assert.equal(d.evaluateDrawdown(100000,Infinity,'b').isHalted,true);
});
test('recovered equity does not clear a latched halt or restore order sizing',()=>{
  const d=new DrawdownController();
  const critical=d.evaluateDrawdown(0,100000,'a');
  assert.equal(critical.currentCapital,0);assert.equal(critical.currentDrawdownPct,100);
  const recovered=d.evaluateDrawdown(100000,100000,'a');
  assert.equal(recovered.isHalted,true);assert.equal(recovered.sizingMultiplier,0);
  assert.equal(recovered.requiresManualReset,true);
  d.evaluateDrawdown(80000,100000,'GLOBAL');
  const other=d.readStatus('other');assert.equal(other.isHalted,true);
  assert.equal(other.sizingMultiplier,0);assert.equal(other.requiresManualReset,true);
});
