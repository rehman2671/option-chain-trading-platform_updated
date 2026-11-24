import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregatePortfolioGreekEvidence,type PortfolioGreekInput,type GreekMark} from '../release/portfolioGreekEvidence.js';
const now=Date.parse('2026-11-24T05:00:00Z');
const mark:GreekMark={instrumentKey:'NSE_FO|1',underlying:'NIFTY',observedAt:now,sessionEpoch:'epoch',convention:'PER_UNIT_PER_POINT_PER_DAY_PER_IV_POINT',delta:.5,gamma:.01,theta:-2,vega:1};
const fixture:PortfolioGreekInput={accountScope:'account-a',sessionEpoch:'epoch',positionsObservedAt:now,completePositionSet:true,
  positions:[{instrumentKey:mark.instrumentKey,product:'I',netQuantity:65},{instrumentKey:mark.instrumentKey,product:'D',netQuantity:-25}],
  marks:[mark]};
const assess=(v:PortfolioGreekInput)=>aggregatePortfolioGreekEvidence(v,'account-a','epoch',now);
test('signed units, gross exposure and separate underlying buckets',()=>{
  const result=assess({...fixture,positions:[...fixture.positions,{instrumentKey:'BSE_FO|2',product:'D',netQuantity:20}],
    marks:[mark,{...mark,instrumentKey:'BSE_FO|2',underlying:'SENSEX',delta:-.5}]});
  assert.equal(result.status,'COMPLETE_INPUT_AGGREGATE');
  if(result.status!=='COMPLETE_INPUT_AGGREGATE')throw Error('fixture failed');
  assert.equal(result.byUnderlying.NIFTY.netDelta,20);
  assert.equal(result.byUnderlying.NIFTY.grossDelta,45);
  assert.equal(result.byUnderlying.NIFTY.netTheta,-80);
  assert.equal(result.byUnderlying.SENSEX.netDelta,-10);
  assert.equal(result.activePositions,3);assert.equal(result.orderAuthorized,false);
});
test('missing, stale, duplicate, mixed session, wrong account, invalid units and incomplete portfolio remain unknown',()=>{
  for(const x of [
    {...fixture,accountScope:'account-b'},{...fixture,completePositionSet:false},
    {...fixture,positionsObservedAt:now-15001},{...fixture,marks:[]},
    {...fixture,marks:[mark,mark]},{...fixture,marks:[{...mark,sessionEpoch:'other'}]},
    {...fixture,marks:[{...mark,observedAt:now+1}]},{...fixture,marks:[{...mark,delta:NaN}]},
    {...fixture,positions:[...fixture.positions,fixture.positions[0]]},
    {...fixture,positions:[{...fixture.positions[0],netQuantity:1.5}]},
    {...fixture,marks:[mark,{...mark,instrumentKey:'NSE_FO|999'}]}
  ])assert.equal(assess(x).status,'UNKNOWN');
});
test('empty complete position set differs from missing evidence',()=>{
  assert.equal(assess({...fixture,positions:[],marks:[]}).status,'COMPLETE_INPUT_AGGREGATE');
  assert.equal(assess({...fixture,positions:[],marks:[],completePositionSet:false}).status,'UNKNOWN');
});
