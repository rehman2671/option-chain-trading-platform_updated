/** Phase45 test-only SYNTHETIC fixture; never real broker data. */
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {
  phase44ArchiveChainTip,phase44ReviewerMessage,
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
export function makePhase45SyntheticPhase44Fixture(variant:Variant='modify'){
  const p=predecessor();
  // Archive snapshots must not alias independently captured Phase43 rows.
  const initial=structuredClone(p.rows);
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
