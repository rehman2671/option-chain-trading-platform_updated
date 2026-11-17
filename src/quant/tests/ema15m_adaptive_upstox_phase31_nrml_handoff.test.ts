import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  assessPhase31ManualNrmlHandoff,
  type Phase31SessionHandoffInput
} from '../../server/engine/ema15m/adaptiveUpstoxPhase31ManualHandoff.js';
import type {
  Phase30ShadowReview
} from '../../server/engine/ema15m/adaptiveUpstoxPhase30ShadowDossier.js';
import type {
  OfflineHistoricalFoAuditReport
} from '../../server/engine/ema15m/adaptiveUpstoxPhase31HistoricalFoFills.js';

const shadow={
  status:'SHADOW_REVIEW_ONLY_UNVERIFIED',
  brokerAuthenticated:false,executionAuthorized:false,
  brokerStopInstalled:false,protectedOvernight:false,
  productionSafe:false,nativeOrderInstruction:null
} as Phase30ShadowReview;
const historicalFills={
  status:'HISTORICAL_FILLS_RECONCILED_UNVERIFIED',
  paginationComplete:true,closingNetQuantity:130,
  rangeSpansMultipleIndiaDates:false
} as OfflineHistoricalFoAuditReport;
function packet():Phase31SessionHandoffInput{
  return {
    schemaVersion:'ADAPTIVE_V2_PHASE31_NRML_MANUAL_HANDOFF_V1',
    expected:{accountScopeId:'SYNTHETIC_31_ONLY',
      instrumentKey:'NSE_FO|SYNTHETIC_31',productType:'NRML',
      lotSize:65,expectedNetLongQuantity:130,expiry:'2026-12-24'},
    shadow:{...shadow},historicalFills:{...historicalFills},
    asOf:'2026-11-17T10:00:00.000Z',
    session:'OPEN',assertedEffectiveExpiry:'2026-12-24',
    minCalendarDaysBeforeExpiry:2
  };
}
const audit=(x=packet())=>assessPhase31ManualNrmlHandoff(x);
const safety=(r:ReturnType<typeof audit>)=>{
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.auto1515PositionalExit,false);
  assert.equal(r.manualExitRequiredToBeDecidedByHuman,true);
};
function escalates(p:Phase31SessionHandoffInput,reason:string){
  const r=audit(p);
  safety(r);
  assert.equal(r.status,'HUMAN_ESCALATION_REQUIRED');
  assert.ok(r.reasons.includes(reason),JSON.stringify(r.reasons));
  assert.ok(r.requiredOperatorReviews.includes(
    'ESCALATE_TO_HUMAN_RISK_OWNER_AND_FREEZE_NEW_NRML_ENTRIES'));
  return r;
}
describe('Phase31 NRML manual shadow handoff without MIS 15:15 semantics',()=>{
  it('positive shadow and historical fill consistency are only unverified review',()=>{
    const r=audit();
    safety(r);
    assert.equal(r.status,'SHADOW_OBSERVATION_ONLY_UNVERIFIED');
    assert.deepEqual(r.reasons,[]);
    assert.ok(r.calendarDaysUntilAssertedExpiry!>2);
    assert.ok(r.requiredOperatorReviews.includes(
      'NO_AUTOMATED_NRML_SQUARE_OFF_AT_15_15'));
    assert.equal(JSON.stringify(r).includes('SYNTHETIC_31'),false);
  });
  it('near expiry triggers explicit manual cutoff and settlement review',()=>{
    const p=packet();
    p.assertedEffectiveExpiry='2026-11-19';
    p.expected.expiry='2026-11-19';
    const r=escalates(p,'EXPIRY_WITHIN_LOCKED_MANUAL_REVIEW_BUFFER');
    assert.ok(r.requiredOperatorReviews.includes(
      'CHECK_EXCHANGE_CONTRACT_SETTLEMENT_AND_TRADING_CUTOFF'));
  });
  it('expiry reached never fabricates an automatic liquidation order',()=>{
    const p=packet();
    p.assertedEffectiveExpiry='2026-11-17';
    p.expected.expiry='2026-11-17';
    const r=escalates(p,'EXPIRY_DATE_REACHED_OR_PASSED');
    assert.equal(r.nativeOrderInstruction,null);
  });
  it('effective-dated exchange expiry mismatch blocks even open market',()=>{
    const p=packet();p.assertedEffectiveExpiry='2026-12-23';
    const r=escalates(p,
      'EXPECTED_OPTION_EXPIRY_DISAGREES_WITH_ASSERTED_CALENDAR');
    assert.ok(r.requiredOperatorReviews.includes(
      'OBTAIN_INDEPENDENT_EFFECTIVE_DATED_EXCHANGE_EXPIRY_NOTICE'));
  });
  it('closed market with NRML long is risk escalation, not MIS square-off',()=>{
    const p=packet();p.session='CLOSED';
    const r=escalates(p,
      'OVERNIGHT_OPEN_NRML_LONG_POSITION_REQUIRES_HUMAN_REVIEW');
    assert.ok(r.reasons.includes(
      'SESSION_NOT_CONFIRMED_OPEN_FOR_NRML_POSITION'));
    assert.equal(r.auto1515PositionalExit,false);
  });
  it('unknown/preopen source cannot be assumed market open',()=>{
    for(const s of ['UNKNOWN','PREOPEN'] as const){
      const p=packet();p.session=s;
      escalates(p,'SESSION_NOT_CONFIRMED_OPEN_FOR_NRML_POSITION');
    }
  });
  it('even both signed shadow books must not override historical fills gap',()=>{
    const p=packet();
    p.historicalFills.rangeSpansMultipleIndiaDates=true;
    const r=escalates(p,
      'MULTI_DAY_FILLS_DO_NOT_ESTABLISH_NATIVE_STOP_SURVIVAL');
    assert.ok(r.requiredOperatorReviews.includes(
      'OBTAIN_BROKER_NATIVE_STOP_CANCEL_REPLACE_AND_SESSION_LOGS'));
  });
  it('quantity mismatch or incomplete FO pagination freezes new entries',()=>{
    const p=packet();p.historicalFills.closingNetQuantity=65;
    escalates(p,'FILL_HISTORY_OR_END_POSITION_NOT_RECONCILED');
    const q=packet();q.historicalFills.paginationComplete=false;
    escalates(q,'FILL_HISTORY_OR_END_POSITION_NOT_RECONCILED');
  });
  it('shadow failed/native-ACK-forged report cannot be promoted',()=>{
    const p=packet();
    p.shadow.brokerStopInstalled=true as false;
    escalates(p,'SHADOW_CAPTURE_OR_PROTECTION_EVIDENCE_NOT_ACCEPTABLE');
    const q=packet();q.shadow.status='BLOCKED_OR_UNKNOWN';
    escalates(q,'SHADOW_CAPTURE_OR_PROTECTION_EVIDENCE_NOT_ACCEPTABLE');
  });
  it('flat NRML position still requires orphan SELL/GTT manual review',()=>{
    const p=packet();
    p.expected.expectedNetLongQuantity=0;
    p.historicalFills.closingNetQuantity=0;
    const r=audit(p);
    safety(r);
    assert.ok(r.requiredOperatorReviews.includes(
      'VERIFY_NO_ORPHAN_PROTECTIVE_SELL_OR_GTT_REMAINS'));
  });
  it('invalid lot, date, or invalid scope fail closed',()=>{
    const p=packet();p.expected.lotSize=0;
    const r=audit(p);
    safety(r);
    assert.equal(r.status,'INVALID_INPUT');
    const q=packet();q.assertedEffectiveExpiry='2026-02-30';
    assert.equal(audit(q).status,'INVALID_INPUT');
    const x=packet();x.expected.instrumentKey='NSE_EQ|NO';
    assert.equal(audit(x).status,'INVALID_INPUT');
  });
});
