import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAdaptiveHysteresisObservation,
  emptyAdaptiveHysteresisState,replayAdaptiveRegimeHysteresis,
  validateAdaptiveHysteresisPolicy,type HysteresisHorizonRule,
  type HysteresisObservation,type HysteresisResearchPolicy
} from '../../server/engine/ema15m/adaptiveRegimeHysteresis.js';
import type {HistoricalComparisonInput} from
  '../../server/engine/ema15m/historicalAdaptiveComparison.js';
import type {DeclaredTradingSession} from
  '../../server/engine/ema15m/adaptiveSessionIntegrity.js';
import type {ClosedIndexCandle} from
  '../../server/engine/ema15m/adaptiveMarketRegime.js';
const DAY=86_400_000,MIN=60_000;
const at=(v:number)=>new Date(v).toISOString();
const t0=Date.UTC(2026,9,1);
const rule:HysteresisHorizonRule={
  initialConfirmations:2,oppositeConfirmations:3,
  minimumDwellObservedDecisions:4,freezeObservedDecisionsAfterShock:1,
  cooldownObservedDecisionsAfterReversal:1
};
const policy=():HysteresisResearchPolicy=>({
  schemaVersion:'ADAPTIVE_REGIME_HYSTERESIS_V1',
  maximumClosedCandleAgeMinutes:30,
  horizonRules:{
    '1W':{...rule},
    '2W':{...rule,initialConfirmations:3,oppositeConfirmations:4},
    '4W':{...rule,initialConfirmations:4,oppositeConfirmations:5},
    '8W':{...rule,initialConfirmations:5,oppositeConfirmations:6}
  }
});
function obs(i:number,signal:'CE'|'PE'|'NO_TRADE',
  regime?:HysteresisObservation['regime'],ordinal=i):HysteresisObservation{
  const day=t0+i*DAY;
  return{
    decisionAt:at(day+390*MIN),
    latestClosedCandleEndAt:at(day+375*MIN),
    declaredSessionOrdinal:ordinal,
    rawSignal:signal,
    regime:regime??(signal==='CE'?'TREND_UP':
      signal==='PE'?'TREND_DOWN':'SIDEWAYS')
  };
}
function runSequence(rows:ReturnType<typeof obs>[],r=rule){
  let state=emptyAdaptiveHysteresisState();
  const out=[] as ReturnType<typeof applyAdaptiveHysteresisObservation>[];
  for(const row of rows){
    const result=applyAdaptiveHysteresisObservation(state,row,r,30);
    out.push(result);
    state=result.state;
  }
  return out;
}
const fixedSignal=obs(0,'CE');

describe('Phase 12 offline regime hysteresis state machine',()=>{
  it('rejects invalid horizon policy, including instant-on 1-bar trading signals',()=>{
    const p=policy();
    assert.deepEqual(validateAdaptiveHysteresisPolicy(p),[]);
    p.horizonRules['1W'].initialConfirmations=1;
    assert.ok(validateAdaptiveHysteresisPolicy(p).length>0);
    p.horizonRules['1W'].initialConfirmations=2;
    p.horizonRules['8W'].oppositeConfirmations=0;
    assert.ok(validateAdaptiveHysteresisPolicy(p).length>0);
  });
  it('requires consecutive actual decisions before first bullish advisory',()=>{
    const rows=runSequence([obs(0,'CE'),obs(1,'CE')]);
    assert.equal(rows[0].confirmedSide,'NO_TRADE');
    assert.equal(rows[0].newEntryAdvisory,'NO_TRADE');
    assert.equal(rows[0].reason,'INITIAL_CONFIRMATION_PENDING');
    assert.equal(rows[1].reason,'INITIAL_CONFIRMATION');
    assert.equal(rows[1].confirmedSide,'CE');
    assert.equal(rows[1].newEntryAdvisory,'CE');
    assert.equal(rows[1].confirmedOppositeFlip,false);
    assert.equal(rows[1].state.decisionsSinceConfirmation,0);
  });
  it('does not reverse CE on isolated red bars and intermittent market noise',()=>{
    const rows=runSequence([
      obs(0,'CE'),obs(1,'CE'),
      obs(2,'PE'),obs(3,'CE'),
      obs(4,'PE'),obs(5,'NO_TRADE'),
      obs(6,'CE'),obs(7,'CE')
    ]);
    assert.equal(rows[2].reason,'OPPOSITE_CONFIRMATION_PENDING');
    assert.equal(rows[2].confirmedSide,'CE');
    assert.equal(rows[2].newEntryAdvisory,'NO_TRADE');
    assert.equal(rows[3].reason,'CONFIRMED_DIRECTION_REVALIDATION_PENDING');
    assert.equal(rows[3].newEntryAdvisory,'NO_TRADE');
    assert.equal(rows[4].newEntryAdvisory,'NO_TRADE');
    assert.equal(rows[5].reason,'NO_TREND_OR_TRANSITION');
    assert.equal(rows[5].confirmedSide,'CE'); // research only; not a held position
    assert.equal(rows[6].newEntryAdvisory,'NO_TRADE');
    assert.equal(rows[6].reason,'CONFIRMED_DIRECTION_REVALIDATION_PENDING');
    assert.equal(rows[7].newEntryAdvisory,'CE');
    assert.ok(rows.every(x=>!x.confirmedOppositeFlip));
  });
  it('opposite confirmation respects dwell and separate post-reversal cooldown',()=>{
    const rows=runSequence([
      obs(0,'CE'),obs(1,'CE'),
      obs(2,'PE'),obs(3,'PE'),obs(4,'PE'),
      obs(5,'PE'),obs(6,'PE')
    ],{...rule,minimumDwellObservedDecisions:5});
    assert.equal(rows[4].reason,'REVERSAL_DWELL_NOT_SATISFIED');
    assert.equal(rows[4].newEntryAdvisory,'NO_TRADE');
    assert.equal(rows[5].reason,'REVERSAL_DWELL_NOT_SATISFIED');
    assert.equal(rows[6].reason,'OPPOSITE_DIRECTION_CONFIRMED');
    assert.equal(rows[6].confirmedOppositeFlip,true);
    assert.equal(rows[6].confirmedSide,'PE');
    assert.equal(rows[6].newEntryAdvisory,'NO_TRADE');
    const after=applyAdaptiveHysteresisObservation(rows[6].state,obs(7,'PE'),rule,30);
    assert.equal(after.reason,'POST_REVERSAL_COOLDOWN');
    assert.equal(after.newEntryAdvisory,'NO_TRADE');
    const resumed=applyAdaptiveHysteresisObservation(after.state,obs(8,'PE'),rule,30);
    assert.equal(resumed.reason,'CONFIRMED_DIRECTION_REVALIDATION_PENDING');
    assert.equal(resumed.newEntryAdvisory,'NO_TRADE');
    const reaffirmed=applyAdaptiveHysteresisObservation(resumed.state,obs(9,'PE'),rule,30);
    assert.equal(reaffirmed.reason,'CONFIRMED_DIRECTION_REVALIDATED');
    assert.equal(reaffirmed.newEntryAdvisory,'PE');
    assert.equal(reaffirmed.confirmedOppositeFlip,false);
  });
  it('longer 8W bucket needs more sequential evidence than the 1W bucket',()=>{
    const input=[0,1,2,3].map(i=>obs(i,'CE'));
    assert.equal(runSequence(input,policy().horizonRules['1W'])[1].
      newEntryAdvisory,'CE');
    const slow=runSequence(input,policy().horizonRules['8W']);
    assert.ok(slow.every(x=>x.newEntryAdvisory==='NO_TRADE'));
    assert.equal(slow[3].state.pendingCount,4);
  });
  it('a volatility shock freezes new entries WITHOUT automatically closing any position',()=>{
    const rows=runSequence([
      obs(0,'CE'),obs(1,'CE'),
      obs(2,'NO_TRADE','VOLATILE'),
      obs(3,'CE'),obs(4,'CE'),obs(5,'CE')
    ]);
    assert.equal(rows[2].reason,'VOLATILITY_SHOCK_FREEZE');
    assert.equal(rows[2].confirmedSide,'CE');
    assert.equal(rows[2].newEntryAdvisory,'NO_TRADE');
    assert.equal(rows[3].reason,'AFTER_SHOCK_FREEZE');
    assert.equal(rows[3].newEntryAdvisory,'NO_TRADE');
    assert.equal(rows[4].reason,'CONFIRMED_DIRECTION_REVALIDATION_PENDING');
    assert.equal(rows[4].newEntryAdvisory,'NO_TRADE');
    assert.equal(rows[5].newEntryAdvisory,'CE');
  });
  it('missing declared exchange session breaks pending confirmation',()=>{
    const rows=runSequence([
      obs(0,'CE',undefined,0),
      obs(1,'CE',undefined,2),
      obs(2,'CE',undefined,3)
    ]);
    assert.equal(rows[1].reason,'MISSING_DECLARED_SESSION_RESET');
    assert.equal(rows[1].confirmedSide,'NO_TRADE');
    assert.equal(rows[1].newEntryAdvisory,'NO_TRADE');
    assert.equal(rows[2].reason,'INITIAL_CONFIRMATION_PENDING');
  });
  it('stale, future and reused completed candle evidence fail closed',()=>{
    const ready=runSequence([obs(0,'CE'),obs(1,'CE')])[1];
    const future={
      ...obs(2,'CE'),
      latestClosedCandleEndAt:at(Date.parse(obs(2,'CE').decisionAt)+MIN)
    };
    const bad=applyAdaptiveHysteresisObservation(ready.state,future,rule,30);
    assert.equal(bad.reason,'CLOSED_CANDLE_EVIDENCE_STALE');
    assert.equal(bad.newEntryAdvisory,'NO_TRADE');
    assert.equal(bad.confirmedSide,'NO_TRADE');
    const repeated=applyAdaptiveHysteresisObservation(ready.state,obs(1,'CE'),rule,30);
    assert.equal(repeated.reason,'NONMONOTONIC_OR_INCONSISTENT_OBSERVATION');
    assert.equal(repeated.state.confirmedSide,'NO_TRADE');
    const inconsistent=applyAdaptiveHysteresisObservation(
      emptyAdaptiveHysteresisState(),
      {...fixedSignal,rawSignal:'PE'},rule,30);
    assert.equal(inconsistent.reason,'NONMONOTONIC_OR_INCONSISTENT_OBSERVATION');
  });
});

function sampleDataset():{
  input:HistoricalComparisonInput;sessions:DeclaredTradingSession[]
}{
  const candles:ClosedIndexCandle[]=[];
  const decisions:HistoricalComparisonInput['decisions']=[];
  const windows:DeclaredTradingSession[]=[];
  let prev=25000;
  for(let day=0;day<20;day++){
    const start=t0+day*DAY;
    const d=at(start).slice(0,10);
    windows.push({
      sessionDate:d,openAt:at(start+225*MIN),
      closeAt:at(start+600*MIN),
      sourceRecordId:'SYNTHETIC_OFFICIAL_WINDOW_'+day
    });
    for(let n=0;n<25;n++){
      const close=prev+7;
      candles.push({
        timestamp:at(start+(225+n*15)*MIN),open:prev,
        high:close+3,low:prev-3,close,isClosed:true
      });
      prev=close;
    }
    if(day<7)continue;
    const decisionAt=at(start+390*MIN);
    decisions.push({
      sessionDate:d,decisionAt,
      candles:candles.filter(c=>Date.parse(c.timestamp)+15*MIN<=Date.parse(decisionAt)),
      contractsCapturedAt:at(start+385*MIN),
      listedContracts:[],chains:[]
    });
  }
  const expectedSessions=decisions.map(d=>d.sessionDate);
  return{
    input:{
      provenance:{
        datasetId:'PHASE12_SYNTHETIC_ONLY',
        source:'SYNTHETIC_FIXTURE',
        calendarSource:'SYNTHETIC_FIXTURE',
        expectedSessions,synthetic:true
      },
      instrument:'NIFTY',underlyingKey:'NSE_INDEX|Nifty 50',
      decisions,executionQuotes:[],
      policy:{
        holdCalendarDays:{'1W':1,'2W':1,'4W':1,'8W':1},
        slippageBpsPerSide:0,feesAndTaxesINRPerSide:0,
        maxSnapshotAgeMinutes:5,maxEntryDelayMinutes:10,
        maxExitDelayDays:1,minCalendarDaysBeforeExpiry:2,
        folds:[{
          trainStart:expectedSessions[0],trainEnd:expectedSessions[0],
          testStart:expectedSessions[4],testEnd:expectedSessions[12]
        }]
      }
    },sessions:windows
  };
}

describe('Phase12 offline OOS decision-time replay',()=>{
  it('recomputes closed-candle regime at each original decision; no PnL or orders',()=>{
    const f=sampleDataset();
    const r=replayAdaptiveRegimeHysteresis(f.input,f.sessions,policy());
    assert.equal(r.errors.length,0);
    assert.equal(r.status,'DESCRIPTIVE_ONLY');
    assert.equal(r.synthetic,true);
    assert.equal(r.foldCells.length,4);
    assert.equal(r.observations.length,9*4);
    assert.ok(r.observations.every(o=>
      o.regime==='TREND_UP'&&o.rawSignal==='CE'));
    assert.ok(r.foldCells.some(c=>
      c.newEntryAdvisories>0));
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.productionSafe,false);
    assert.equal(r.brokerProtectionInstalled,false);
    assert.equal(r.empiricalProfitabilityProven,false);
    assert.equal(r.sourceAuthenticityIndependentlyVerified,false);
    assert.equal(r.calendarIndependentlyAuthenticated,false);
  });
  it('omitted declared trading session blocks direct continuation',()=>{
    const f=sampleDataset();
    const missing=f.sessions.filter(s=>
      s.sessionDate!==f.input.decisions[8].sessionDate);
    const r=replayAdaptiveRegimeHysteresis(f.input,missing,policy());
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('INVALID_OR_MISSING_SOURCE_DECISION_CLOSED_CANDLE_WINDOW'));
  });
  it('extra declared exchange session with no decision resets signal confirmation',()=>{
    const f=sampleDataset();
    const removed=f.input.decisions[6];
    f.input.decisions=f.input.decisions.filter(d=>d!==removed);
    f.input.provenance.expectedSessions=f.input.decisions.map(d=>d.sessionDate);
    const r=replayAdaptiveRegimeHysteresis(f.input,f.sessions,policy());
    assert.equal(r.status,'INCOMPLETE_EVIDENCE');
    const originalDate=f.input.decisions[6].sessionDate;
    assert.ok(r.observations.some(o=>
      o.decisionAt.startsWith(originalDate)&&
      o.reason==='MISSING_DECLARED_SESSION_RESET'));
  });
  it('refuses in-session future or unclosed underlying bar',()=>{
    const f=sampleDataset();
    const last=f.input.decisions[2];
    last.candles[last.candles.length-1].timestamp=
      new Date(Date.parse(last.decisionAt)+MIN).toISOString();
    const r=replayAdaptiveRegimeHysteresis(f.input,f.sessions,policy());
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('INCOMPLETE_OR_LOOKAHEAD_DECISION_HISTORY')||
      r.errors.includes('INVALID_OR_MISSING_SOURCE_DECISION_CLOSED_CANDLE_WINDOW'));
  });
  it('regime study cannot bypass malformed policy',()=>{
    const f=sampleDataset(),bad=policy();
    bad.horizonRules['4W'].cooldownObservedDecisionsAfterReversal=0;
    const r=replayAdaptiveRegimeHysteresis(f.input,f.sessions,bad);
    assert.equal(r.status,'REJECTED');
    assert.ok(r.errors.includes('INVALID_HYSTERESIS_HORIZON_RULE_4W'));
  });
});
