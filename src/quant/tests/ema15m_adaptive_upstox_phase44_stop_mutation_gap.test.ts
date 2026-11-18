import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {
  auditPhase44StopMutationLedger,phase44ArchiveChainTip,
  phase44ReviewerMessage,
  type Phase44StopMutationArchive,type Phase44IndependentPins,
  type Phase44OrderSnapshot
} from '../../server/engine/ema15m/adaptiveUpstoxPhase44StopMutationLedger.js';
import {
  hashPhase40OfflineArchive,type Phase40OrderEvent
} from '../../server/engine/ema15m/adaptiveUpstoxPhase40OvernightStopAudit.js';
import {
  phase43ReviewerMessage,
  type Phase43TriggerChainInput,type Phase43ExternalSourcePins
} from '../../server/engine/ema15m/adaptiveUpstoxPhase43TriggeredGttChildChain.js';

const ucc='SYNTHETIC_PRIVATE_ACCOUNT_PHASE44';
const instrument='NSE_FO|SYNTH_25000_CE';
const gtt='GTT-SYNTHETIC-PHASE44';
const firstId='CHILD44_OLD';
const oldExchange='EXCHANGE_ID_44_OLD';
const newId='CHILD44_REPLACEMENT';
const newExchange='EXCHANGE_ID_44_NEW';
const reviewKey=generateKeyPairSync('ed25519');
const preKey=generateKeyPairSync('ed25519');
const reviewSpki=reviewKey.publicKey.export({
  format:'der',type:'spki'}) as Buffer;
const preSpki=preKey.publicKey.export({
  format:'der',type:'spki'}) as Buffer;
const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');

function event(
  orderId:string,exchangeId:string|null,
  timestamp:string,status:string,request:string,
  quantity=65,filled=0
):Phase40OrderEvent{
  return {
    order_id:orderId,order_request_id:request,
    instrument_token:instrument,trading_symbol:'SYNTH_CE',
    product:'D',transaction_type:'SELL',order_type:'SL-M',
    quantity,filled_quantity:filled,status,
    exchange_order_id:exchangeId,
    order_timestamp:timestamp,
    exchange_timestamp:exchangeId?timestamp:null
  };
}
const t=(clock:string)=>'2026-11-18 '+clock;
const z=(clock:string)=>'2026-11-18T'+clock+'+05:30';
function predecessor(){
  const rows=[
    event(firstId,null,t('10:02:00'),'put order req received','1'),
    event(firstId,oldExchange,t('10:04:00'),'open','1')
  ];
  const input:Phase43TriggerChainInput={
    schemaVersion:'ADAPTIVE_V2_PHASE43_GTT_CHILD_ORDER_CHAIN_V1',
    source:'OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED',
    accountScopeId:ucc,gttOrderId:gtt,
    positionInstrumentKey:instrument,expectedLongQuantity:65,
    gttAfterTrigger:{
      origin:'OPERATOR_ARCHIVED_UNVERIFIED',method:'GET',
      path:'/v3/order/gtt',query:{gtt_order_id:gtt},
      capturedAt:z('10:10:00'),httpStatus:200,
      response:{status:'success',data:[{
        gtt_order_id:gtt,type:'SINGLE',product:'D',
        exchange:'NFO',instrument_token:instrument,
        trading_symbol:'SYNTH_CE',quantity:65,
        created_at:Date.parse(z('09:00:00'))*1000,
        expires_at:Date.parse('2026-12-20T15:30:00+05:30')*1000,
        rules:[{strategy:'STOPLOSS',status:'TRIGGERED',
          trigger_type:'BELOW',trigger_price:215,
          transaction_type:'SELL',order_id:firstId,message:null}]
      }]}
    },
    childHistory:{
      schemaVersion:'ADAPTIVE_V2_PHASE40_NATIVE_CHILD_ORDER_V1',
      source:'OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED',
      expected:{
        accountScopeId:ucc,instrumentKey:instrument,
        tradingSymbol:'SYNTH_CE',productType:'NRML',
        childOrderId:firstId,side:'SELL',
        quantity:65,lotSize:5
      },
      history:{
        origin:'OPERATOR_ARCHIVED_UNVERIFIED',method:'GET',
        path:'/v2/order/history',query:{order_id:firstId},
        capturedAt:z('10:15:00'),httpStatus:200,
        response:{status:'success',data:rows}
      }
    },
    childTrades:{
      origin:'OPERATOR_ARCHIVED_UNVERIFIED',method:'GET',
      path:'/v2/order/trades',query:{order_id:firstId},
      capturedAt:z('10:20:00'),httpStatus:200,
      response:{status:'success',data:[]}
    },
    externalReviewer:{
      schemaVersion:'EXTERNAL_PHASE43_ORDER_ACK_REVIEWER_CLAIM_V1',
      issuer:'EXTERNAL_REVIEWER_NOT_EXCHANGE_OR_BROKER',
      accountScopeId:ucc,gttOrderId:gtt,
      childOrderId:firstId,claimedExchangeOrderId:oldExchange,
      instrumentKey:instrument,transactionType:'SELL',
      quantity:65,
      claimedStatus:'BROKER_ORDER_ID_PRESENT_NOT_NATIVE_ACK',
      claimedAt:z('10:25:00'),
      reviewerSpkiDerBase64:preSpki.toString('base64'),
      signatureBase64:''
    }
  };
  const pins:Phase43ExternalSourcePins={
    schemaVersion:'INDEPENDENT_PHASE43_TRIGGER_CHILD_TRADE_CLAIM_PINS_V1',
    expectedAccountScopeId:ucc,expectedGttOrderId:gtt,
    expectedChildOrderId:firstId,expectedExchangeOrderId:oldExchange,
    expectedGttSha256:hashPhase40OfflineArchive(input.gttAfterTrigger),
    expectedHistorySha256:hashPhase40OfflineArchive(
      input.childHistory.history),
    expectedTradesSha256:hashPhase40OfflineArchive(input.childTrades),
    expectedTradeIds:[],expectedReviewerSpkiSha256:hash(preSpki),
    expectedReviewChallengeSha256:'bb'.repeat(32),
    expectedSessionDate:'2026-11-18',maxReviewDelayMinutes:30
  };
  input.externalReviewer.signatureBase64=sign(
    null,phase43ReviewerMessage(input,pins),preKey.privateKey)
      .toString('base64');
  return {input,pins,rows};
}
function snapshot(
  orderId:string,exchangeId:string,qty:number,
  rows:Phase40OrderEvent[],capture:string
):Phase44OrderSnapshot{
  return {
    source:'OPERATOR_SAME_SESSION_GET_UNVERIFIED',
    expectedOrderId:orderId,
    expectedExchangeOrderId:exchangeId,
    expectedQuantity:qty,
    history:{
      origin:'OPERATOR_ARCHIVED_UNVERIFIED',method:'GET',
      path:'/v2/order/history',query:{order_id:orderId},
      capturedAt:z(capture),httpStatus:200,
      response:{status:'success',data:rows}
    }
  };
}
type Variant='modify'|'replace'|'partial_replace'|'complete'|'cancel_only';
function fixture(variant:Variant='modify'){
  const p=predecessor();
  const initial=[...p.rows];
  let snapshots:Phase44OrderSnapshot[];
  if(variant==='replace'||variant==='partial_replace'||
    variant==='cancel_only'){
    const filled=variant==='partial_replace'?10:0;
    initial.push(
      event(firstId,oldExchange,t('10:30:00'),
        'cancel pending','2',65,filled),
      event(firstId,oldExchange,t('10:31:00'),
        'cancelled','2',65,filled)
    );
    snapshots=[snapshot(firstId,oldExchange,65,initial,'10:34:00')];
    if(variant!=='cancel_only'){
      const qty=65-filled;
      snapshots.push(snapshot(newId,newExchange,qty,[
        event(newId,null,t('10:35:00'),
          'put order req received','1',qty),
        event(newId,null,t('10:36:00'),'validation pending','1',qty),
        event(newId,newExchange,t('10:40:00'),'open','1',qty)
      ],'10:45:00'));
    }
  }else{
    initial.push(
      event(firstId,oldExchange,t('10:30:00'),'modify pending','2'),
      event(firstId,oldExchange,t('10:31:00'),'modified','2'),
      event(firstId,oldExchange,t('10:32:00'),'open','2')
    );
    if(variant==='complete'){
      initial.push(event(firstId,oldExchange,t('10:33:00'),
        'complete','2',65,65));
    }
    snapshots=[snapshot(firstId,oldExchange,65,initial,'10:40:00')];
  }
  const archive:Phase44StopMutationArchive={
    schemaVersion:'ADAPTIVE_V2_PHASE44_STOP_MUTATION_GAP_LEDGER_V1',
    source:'PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED',
    predecessorPhase43:p.input,predecessorPins:p.pins,
    sessionDate:'2026-11-18',orderSnapshots:snapshots,
    signedReview:{
      schemaVersion:'ADAPTIVE_PHASE44_EXTERNAL_LIFECYCLE_REVIEW_V1',
      role:'INDEPENDENT_REVIEWER_NOT_EXCHANGE',
      claim:'OFFLINE_ORDER_MUTATIONS_RECONCILED_NOT_NATIVE_STOP',
      signedAt:z('10:52:00'),
      reviewerSpkiDerBase64:reviewSpki.toString('base64'),
      signatureBase64:''
    }
  };
  const pins:Phase44IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE44_STOP_MUTATION_AUDIT_PINS_V1',
    expectedAccountScopeId:ucc,expectedInstrumentKey:instrument,
    expectedGttOrderId:gtt,expectedSessionDate:'2026-11-18',
    expectedLongQuantity:65,
    expectedOrderIds:[],
    expectedExchangeOrderIds:[],
    expectedOrderHistorySha256:[],
    expectedPredecessorArchiveSha256:hashPhase40OfflineArchive(p.input),
    expectedPredecessorPinsSha256:hashPhase40OfflineArchive(p.pins),
    expectedLedgerChainTipSha256:'00'.repeat(32),
    expectedReviewerSpkiSha256:hash(reviewSpki),
    expectedReviewChallengeSha256:'aa'.repeat(32),
    maximumReviewerLagMinutes:20
  };
  const resign=()=>{
    pins.expectedOrderIds=archive.orderSnapshots
      .map(x=>x.expectedOrderId);
    pins.expectedExchangeOrderIds=archive.orderSnapshots
      .map(x=>x.expectedExchangeOrderId);
    pins.expectedOrderHistorySha256=archive.orderSnapshots
      .map(x=>hashPhase40OfflineArchive(x.history));
    pins.expectedLedgerChainTipSha256=phase44ArchiveChainTip(
      firstId,archive.orderSnapshots,pins.expectedOrderHistorySha256);
    pins.expectedPredecessorArchiveSha256=
      hashPhase40OfflineArchive(archive.predecessorPhase43);
    pins.expectedPredecessorPinsSha256=
      hashPhase40OfflineArchive(archive.predecessorPins);
    archive.signedReview.signatureBase64=sign(
      null,phase44ReviewerMessage(archive,pins),reviewKey.privateKey)
        .toString('base64');
  };
  resign();
  return {archive,pins,resign};
}
function safety(r:ReturnType<typeof auditPhase44StopMutationLedger>){
  assert.equal(r.productionSafe,false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.independentExchangeOrderAcknowledgementVerified,false);
  assert.equal(r.independentlyAuthenticatedBrokerOrderEvents,false);
  assert.equal(r.completeDayEventProvenanceVerified,false);
  assert.equal(r.continuousIntradayStopCoverageVerified,false);
  assert.equal(r.continuousOvernightProtectionVerified,false);
  assert.equal(r.guaranteedStopFillPrice,false);
  for(const confidential of [ucc,gtt,instrument,firstId,newId,
    oldExchange,newExchange])
    assert.ok(!JSON.stringify(r).includes(confidential));
}
const audit=(f:ReturnType<typeof fixture>)=>
  auditPhase44StopMutationLedger(f.archive,f.pins);
function denied(f:ReturnType<typeof fixture>,reason:string){
  const r=audit(f);safety(r);
  assert.deepEqual(r.reasons,[reason],JSON.stringify(r));
  assert.ok(r.status==='BLOCKED_OR_UNKNOWN'||r.status==='INVALID_EVIDENCE');
}
describe('Phase44 broker-reported stop order modification/cancel-replace',()=>{
  it('modified order requires pending → modified → fresh open reconfirmation',()=>{
    const r=audit(fixture('modify'));safety(r);
    assert.equal(r.status,'BROKER_REPORTED_MODIFIED_ORDER_OPEN_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.observedModifyRequests,1);
    assert.equal(r.observedModifyAcknowledgements,1);
    assert.equal(r.observedReplacementAcknowledgements,0);
    assert.equal(r.remainingPositionQuantity,65);
    assert.equal(r.reviewerClaimCryptographicallySigned,true);
  });
  it('cancelled order then new ACK leaves explicit nonzero 9 minute gap',()=>{
    const r=audit(fixture('replace'));safety(r);
    assert.equal(r.status,
      'BROKER_REPORTED_REPLACEMENT_ORDER_OPEN_UNVERIFIED',JSON.stringify(r));
    assert.equal(r.observedCancellationRequests,1);
    assert.equal(r.observedCancellationAcknowledgements,1);
    assert.equal(r.observedReplacementAcknowledgements,1);
    assert.equal(r.observedCancelToReplacementGapMs,9*60000);
    assert.equal(r.openReportedQuantity,65);
  });
  it('partially filled cancelled order must replace only remaining 55 quantity',()=>{
    const r=audit(fixture('partial_replace'));safety(r);
    assert.equal(r.status,'BROKER_REPORTED_REPLACEMENT_ORDER_OPEN_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.totalReportedFilledQuantity,10);
    assert.equal(r.remainingPositionQuantity,55);
    assert.equal(r.openReportedQuantity,55);
    assert.equal(r.continuousIntradayStopCoverageVerified,false);
  });
  it('complete after modification means filled historical exit, not standing stop',()=>{
    const r=audit(fixture('complete'));safety(r);
    assert.equal(r.status,'BROKER_REPORTED_EXIT_COMPLETE_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.totalReportedFilledQuantity,65);
    assert.equal(r.remainingPositionQuantity,0);
    assert.equal(r.openReportedQuantity,0);
    assert.equal(r.brokerStopInstalled,false);
  });
  it('cancellation without a replacement is blocked',()=>{
    denied(fixture('cancel_only'),'CANCELLED_STOP_WITHOUT_LATER_REPLACEMENT');
  });
  it('missing modify confirmation blocks even after valid re-signing',()=>{
    const f=fixture();
    const rows=f.archive.orderSnapshots[0].history.response.data;
    rows.splice(3,1);
    f.resign();
    denied(f,'MODIFICATION_NOT_CONFIRMED');
  });
  it('modified event without later OPEN confirmation blocks',()=>{
    const f=fixture();
    f.archive.orderSnapshots[0].history.response.data.pop();
    f.resign();
    denied(f,'PENDING_OR_UNRESOLVED_LAST_MUTATION');
  });
  it('not modified and not cancelled never silently restore protection',()=>{
    const variants:Variant[]=['modify','replace'];
    for(const variant of variants){
      const f=fixture(variant);
      const row=f.archive.orderSnapshots[0].history.response.data;
      row[3].status=variant==='modify'?'not modified':'not cancelled';
      f.resign();
      denied(f,'REQUEST_REJECTED_OR_RESULT_UNRESOLVED');
    }
  });
  it('replacement without actual prior cancelled final state is rejected',()=>{
    const f=fixture('replace');
    f.archive.orderSnapshots[0].history.response.data[3].status='open';
    f.resign();
    denied(f,'CANCELLATION_NOT_CONFIRMED');
  });
  it('missing new order broker-reported ACK cannot count as new protection',()=>{
    const f=fixture('replace');
    f.archive.orderSnapshots[1].history.response.data.pop();
    f.resign();
    denied(f,'NO_BROKER_REPORTED_ORDER_OPEN_ACK');
  });
  it('replacement order before old cancellation is blocked',()=>{
    const f=fixture('replace');
    const rows=f.archive.orderSnapshots[1].history.response.data;
    rows[0].order_timestamp=t('10:29:00');
    f.resign();
    denied(f,'REPLACEMENT_LACKS_PRIOR_FINAL_CANCEL_OR_POSITIVE_GAP');
  });
  it('duplicate order ID in replacements cannot bypass separate pin',()=>{
    const f=fixture('replace');
    f.archive.orderSnapshots[1].expectedOrderId=firstId;
    f.resign();
    denied(f,'MISSING_OR_INCONSISTENT_INDEPENDENT_SOURCE_PINS');
  });
  it('overhedging replacement quantity 65 after partial fill 10 blocked',()=>{
    const f=fixture('partial_replace');
    const replacement=f.archive.orderSnapshots[1];
    replacement.expectedQuantity=65;
    replacement.history.response.data.forEach(x=>{x.quantity=65;});
    f.resign();
    denied(f,'REPLACEMENT_ORDER_QUANTITY_NOT_EQUAL_UNFILLED_POSITION');
  });
  it('wrong instrument, side and broker exchange order ID fail even if signed',()=>{
    const mutations=[
      (r:Phase40OrderEvent)=>{r.instrument_token='OTHER';},
      (r:Phase40OrderEvent)=>{r.transaction_type='BUY';},
      (r:Phase40OrderEvent)=>{r.exchange_order_id='OTHER_ACK';}
    ];
    for(const mutate of mutations){
      const f=fixture('modify');
      mutate(f.archive.orderSnapshots[0].history.response.data[3]);
      f.resign();
      denied(f,'ORDER_FIELD_TIMESTAMP_QUANTITY_OR_EXCHANGE_REFERENCE_MISMATCH');
    }
  });
  it('order status timestamp cannot be before previous event',()=>{
    const f=fixture('modify');
    f.archive.orderSnapshots[0].history.response.data[3]
      .order_timestamp=t('10:03:00');
    f.resign();
    denied(f,'ORDER_FIELD_TIMESTAMP_QUANTITY_OR_EXCHANGE_REFERENCE_MISMATCH');
  });
  it('order request sequence cannot move backwards',()=>{
    const f=fixture('modify');
    f.archive.orderSnapshots[0].history.response.data[4].order_request_id='1';
    f.resign();
    denied(f,'MODIFICATION_NOT_CONFIRMED');
  });
  it('pending modifications cannot reuse same old request number',()=>{
    const f=fixture('modify');
    f.archive.orderSnapshots[0].history.response.data[2].order_request_id='1';
    f.resign();
    denied(f,'MODIFY_WITHOUT_NEW_ORDER_REQUEST_NUMBER');
  });
  it('missing or edited Phase43 original child order history prefix rejects',()=>{
    const f=fixture('modify');
    f.archive.orderSnapshots[0].history.response.data[1].filled_quantity=5;
    f.resign();
    denied(f,'ORIGINAL_CHILD_HISTORY_PREFIX_MUTATED_OR_MISSING');
  });
  it('tampered original Phase43 pins and forged predecessor success block',()=>{
    const f=fixture('modify');
    f.archive.predecessorPins.expectedHistorySha256='22'.repeat(32);
    f.resign();
    denied(f,'PHASE43_TRIGGERED_CHILD_PREREQUISITE_UNVERIFIED_OR_FILLED');
  });
  it('original Phase43 fully filled is not eligible for new protective replacement',()=>{
    const f=fixture('modify');
    f.archive.predecessorPhase43.childHistory.history.response
      .data[1].status='complete';
    f.resign();
    denied(f,'PHASE43_TRIGGERED_CHILD_PREREQUISITE_UNVERIFIED_OR_FILLED');
  });
  it('stale/inaccurate independent history hash rejects before lifecycle',()=>{
    const f=fixture('modify');
    f.pins.expectedOrderHistorySha256[0]='dd'.repeat(32);
    denied(f,'ARCHIVED_HISTORY_HASH_SCOPE_OR_POSITION_MISMATCH');
  });
  it('forged final chain hash or substituted reviewer key rejects',()=>{
    const f=fixture('replace');
    f.pins.expectedLedgerChainTipSha256='00'.repeat(32);
    denied(f,'EXTERNALLY_PINNED_FINAL_EVENT_CHAIN_TIP_MISMATCH');
    const g=fixture('modify');
    g.pins.expectedReviewerSpkiSha256='cc'.repeat(32);
    denied(g,'EXTERNAL_SIGNED_LIFECYCLE_REVIEW_NOT_VALID');
  });
  it('fake external exchange ACK issuer fails explicit reviewer-only contract',()=>{
    const f=fixture('modify');
    f.archive.signedReview.role=
      'EXCHANGE_ACK' as 'INDEPENDENT_REVIEWER_NOT_EXCHANGE';
    f.resign();
    denied(f,'EXTERNAL_SIGNED_LIFECYCLE_REVIEW_NOT_VALID');
  });
  it('review signature tampering and stale review times reject',()=>{
    const f=fixture('modify');
    f.archive.signedReview.signatureBase64=Buffer.alloc(64,1)
      .toString('base64');
    denied(f,'EXTERNAL_SIGNED_LIFECYCLE_REVIEW_NOT_VALID');
    const g=fixture('replace');
    g.archive.signedReview.signedAt=z('12:30:00');
    g.resign();
    denied(g,'EXTERNAL_SIGNED_LIFECYCLE_REVIEW_NOT_VALID');
  });
  it('same-day records cannot be substituted from another session',()=>{
    const f=fixture('modify');
    f.archive.orderSnapshots[0].history.capturedAt=
      '2026-11-19T10:40:00+05:30';
    f.resign();
    denied(f,'INVALID_ARCHIVED_SAME_DAY_ORDER_HISTORY');
  });
  it('no modification or cancellation cannot upgrade old open to Phase44',()=>{
    const f=fixture('modify');
    f.archive.orderSnapshots[0].history.response.data.splice(2);
    f.resign();
    denied(f,'NO_MODIFICATION_OR_CANCELLATION_REPLACEMENT_EVIDENCE');
  });
});
