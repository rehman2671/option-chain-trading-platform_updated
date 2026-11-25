import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  auditPhase78RawBrokerReadOnlyJoin,hashPhase78Object,
  type Phase78Input,type Phase78IndependentPins,type Phase78Report
} from '../../server/engine/ema15m/adaptivePhase78RawBrokerReadOnlyJoin.js';
import type {Phase77Input}
  from '../../server/engine/ema15m/adaptivePhase77OfflineNrmlStopLifecycleAudit.js';

const key='NSE_FO|SYNTHETIC_1W_CE', account='PRIVATE_ACCOUNT_ALIAS';
const time=(h:number,m:number,s=0)=>
  `2026-11-20T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}+05:30`;
const hash=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');
function make(){
  const phase77:Phase77Input={
    mode:'OFFLINE_NRML_STOP_LIFECYCLE_CLAIMS_V1',evaluationAt:time(11,4),
    paper:{mode:'OFFLINE_NRML_PAPER_RISK_REVIEW_V1',evaluationAt:time(11,4),
      position:{source:'HYPOTHETICAL_LONG_OPTION_NOT_BROKER_POSITION',
        instrumentKey:key,horizon:'1W',optionType:'CE',enteredAt:time(10,0),
        assumedExchangeExpiryDateIST:'2026-11-27',lotSize:50,lots:1,
        assumedEntryAskPremiumPoints:100,assumedNonRecoverableFeesINR:50},
      policy:{source:'PREREGISTERED_PAPER_ALERT_POLICY_NOT_EXECUTABLE_STOP',
        armGainPremiumPoints:50,givebackAlertPremiumPoints:20,
        targetAlertPremiumPoints:100,minimumConfirmGapSeconds:60,
        minimumBidDepthLotsForIndicativeMark:1,maximumQuoteAgeSeconds:300,
        maximumPaidDebitPlusFeesINR:100000,
        maximumIndicativeLossINR:100000,expiryReviewCalendarDays:2},
      quotes:[{source:'MANUAL_OR_SYNTHETIC_PAPER_MARK_NOT_VERIFIED_L1',
        observedAt:time(11,4),receivedAt:time(11,4),
        bestBidPremiumPoints:120,displayedBestBidDepthLots:2}]},
    positionClaim:{
      source:'OPERATOR_TRANSCRIBED_BROKER_READONLY_SNAPSHOT_NOT_ATTESTED',
      accountScopeKey:account,instrumentKey:key,product:'NRML',
      claimedAsOf:time(11,3),receivedAt:time(11,3),netLongLots:1,
      claimedOutstandingSellOrders:[{orderId:'SL-1',kind:'SELL_STOP',
        claimedState:'EXCHANGE_OPEN',remainingLots:1}]},
    maxSnapshotAgeSeconds:300,
    events:[
      {sequence:1,eventId:'EV-1',orderId:'SL-1',at:time(10,1),
        kind:'SELL_STOP',transition:'SUBMITTED',accountScopeKey:account,
        instrumentKey:key,product:'NRML',direction:'SELL',totalLots:1},
      {sequence:2,eventId:'EV-2',orderId:'SL-1',at:time(10,2),
        kind:'SELL_STOP',transition:'BROKER_ACK',accountScopeKey:account,
        instrumentKey:key,product:'NRML',direction:'SELL'},
      {sequence:3,eventId:'EV-3',orderId:'SL-1',at:time(10,3),
        kind:'SELL_STOP',transition:'EXCHANGE_ACK',accountScopeKey:account,
        instrumentKey:key,product:'NRML',direction:'SELL'}
    ]};
  const raw={
    profile:{status:'success',data:{user_id:account,broker:'UPSTOX',
      is_active:true,products:['D'],order_types:['SL','SL-M']}},
    positions:{status:'success',data:[{instrument_token:key,product:'D',quantity:50}]},
    orders:{status:'success',data:[{instrument_token:key,product:'D',
      order_id:'SL-1',transaction_type:'SELL',order_type:'SL',
      status:'trigger pending',quantity:50,filled_quantity:0,pending_quantity:50,
      trigger_price:95}]},
    gtts:{status:'success',data:[] as Record<string,unknown>[]},
    trades:{status:'success',data:[] as Record<string,unknown>[]}
  };
  const book=<K extends 'positions'|'orders'|'gtts'|'trades'>(which:K,capturedAt:string)=>({
    method:'GET' as const,
    path:({positions:'/v2/portfolio/short-term-positions',
      orders:'/v2/order/retrieve-all',gtts:'/v3/order/gtt',
      trades:'/v2/order/trades/get-trades-for-day'} as const)[which],
    unfiltered:true as const,httpStatus:200 as const,capturedAt,
    response:structuredClone(raw[which])
  });
  const frame={sequence:1,asOf:time(11,3),
    expected:{accountScopeId:account,instrumentKey:key,productType:'NRML' as const,
      expiry:'2026-11-27',lotSize:50,expectedNetLongQuantity:50},
    capture:{schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_READ_ONLY_V1' as const,
      origin:'OPERATOR_SUPPLIED_UNVERIFIED' as const,accountScopeId:account,
      positions:book('positions',time(11,2,50)),
      orders:book('orders',time(11,2,51)),
      gtts:book('gtts',time(11,2,52))},
    trades:book('trades',time(11,2,53))};
  const encoded=(which:keyof typeof raw)=>Buffer.from(JSON.stringify(raw[which]))
    .toString('base64');
  const input:Phase78Input={
    schemaVersion:'PHASE78_PRIVATE_OFFLINE_ORIGINAL_GET_BODY_JOIN_V1',
    source:'OPERATOR_PRIVATE_PHASE29_CAPTURE_NOT_BROKER_ATTESTED',phase77,
    privatePhase29Archive:{
      profileResponseUtf8Base64:encoded('profile'),frame,
      byteWitnesses:(['positions','orders','gtts','trades'] as const)
        .map(book=>({sequence:1,book,responseUtf8Base64:encoded(book)}))},
    policy:{schemaVersion:'PHASE78_OFFLINE_GET_BODY_ASOF_POLICY_V1',
      source:'PREDECLARED_OPERATOR_REVIEW_NOT_BROKER_TRUST',
      maxGetBodyAgeSeconds:300,maxBetweenBookCaptureSeconds:30,
      requireEveryRawBookAndProfile:true,
      rejectUnmatchedOpenSellsAndActiveGtts:true,
      neverTreatTlsOrHashAsBrokerSignature:true}
  };
  const pins:Phase78IndependentPins={
    schemaVersion:'PHASE78_SEPARATE_PRIVATE_SOURCE_PINS_V1',
    expectedPhase77InputSha256:'',expectedPhase29FrameSha256:'',
    expectedPhase78PolicySha256:'',expectedCaptureSequence:1,
    expectedRawBodySha256:{profile:'',positions:'',orders:'',gtts:'',trades:''}
  };
  const archive=input.privatePhase29Archive;
  const rawUpdate=()=>{
    archive.profileResponseUtf8Base64=encoded('profile');
    for(const witness of archive.byteWitnesses)
      witness.responseUtf8Base64=encoded(witness.book);
  };
  const frameUpdate=()=>{
    archive.frame.capture.positions.response=structuredClone(raw.positions);
    archive.frame.capture.orders.response=structuredClone(raw.orders);
    archive.frame.capture.gtts.response=structuredClone(raw.gtts);
    archive.frame.trades.response=structuredClone(raw.trades);
  };
  const repin=()=>{
    pins.expectedPhase77InputSha256=hashPhase78Object(input.phase77);
    pins.expectedPhase29FrameSha256=hashPhase78Object(archive.frame);
    pins.expectedPhase78PolicySha256=hashPhase78Object(input.policy);
    pins.expectedRawBodySha256.profile=hash(Buffer.from(archive.profileResponseUtf8Base64,'base64'));
    for(const x of archive.byteWitnesses)
      pins.expectedRawBodySha256[x.book]=hash(Buffer.from(x.responseUtf8Base64,'base64'));
  };
  rawUpdate();repin();
  return {input,pins,raw,repin,rawUpdate,frameUpdate};
}

type Fixture=ReturnType<typeof make>;
const audit=(f:Fixture)=>auditPhase78RawBrokerReadOnlyJoin(f.input,f.pins);
function neverLive(r:Phase78Report){
  assert.equal(r.originalBrokerResponseOriginAuthenticated,false);
  assert.equal(r.localHashPinIsNotIndependentBrokerAuthentication,true);
  assert.equal(r.readOnlyGetCaptureOwnerAuthorizationVerified,false);
  assert.equal(r.genuineBrokerAccountAndOpenBookAuthenticated,false);
  assert.equal(r.exchangeNativeStopAckOrOvernightProtectionVerified,false);
  assert.equal(r.verifiedActualFillOrStrategyProfitability,false);
  assert.equal(r.separateBookSnapshotsAreNotAtomic,true);
  assert.equal(r.officialExchangeContractExpiryVerified,false);
  assert.equal(r.existingMis1515Unchanged,true);
  assert.equal(r.forced1515NrmlExit,false);
  assert.equal(r.networkOrBrokerCallsMade,false);
  assert.equal(r.nrmlOrderOrGttWritesEnabled,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.ok(!JSON.stringify(r).includes(account));
  assert.ok(!JSON.stringify(r).includes(key));
  assert.ok(!JSON.stringify(r).includes('SL-1'));
}
function rejects(f:Fixture,reason:string,
  status:Phase78Report['status']='BLOCKED_OR_UNKNOWN'){
  const r=audit(f);neverLive(r);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
}
describe('Phase78 offline raw GET body ↔ claimed NRML stop, no broker trust promotion',()=>{
  it('five original synthetic byte bodies + single matching native stop remain descriptive only',()=>{
    const r=audit(make());neverLive(r);
    assert.equal(r.status,'DESCRIPTIVE_BYTES_AND_CLAIMS_CONSISTENT_NOT_AUTHENTICATED',JSON.stringify(r));
    assert.equal(r.rawBodyHashMatchedCount,5);
    assert.equal(r.sameScopePositionQuantityUnits,50);
    assert.equal(r.matchedCurrentClaimedNativeStopCount,1);
    assert.equal(r.candidateDaySellTradeQuantityUnits,0);
    assert.equal(r.phase77Status,'DESCRIPTIVE_CLAIMED_STOP_INTERNALLY_CONSISTENT_ONLY');
  });
  it('changing raw original response bytes without separate pins fails',()=>{
    const f=make();f.raw.orders.data[0].trigger_price=105;f.rawUpdate();
    rejects(f,'PHASE78_ORIGINAL_PRIVATE_GET_BODY_BYTES_NOT_PINNED','INVALID_EVIDENCE');
  });
  it('copying altered raw JSON while recomputing raw hashes cannot impersonate unmodified frame',()=>{
    const f=make();f.raw.orders.data[0].trigger_price=105;f.rawUpdate();f.repin();
    rejects(f,'PHASE78_FRAME_DIFFERS_FROM_ORIGINAL_RAW_BOOK_BYTES','INVALID_EVIDENCE');
  });
  it('after re-pinning BOTH copies, mismatched stop ID still fails against Phase77',()=>{
    const f=make();f.raw.orders.data[0].order_id='OTHER';
    f.rawUpdate();f.frameUpdate();f.repin();
    rejects(f,'PHASE78_CURRENT_NATIVE_STOP_ID_STATE_OR_LEAVES_MISMATCH');
  });
  it('raw NRML net quantity must match EXACT phase77 long lots times lot size',()=>{
    const f=make();f.raw.positions.data[0].quantity=100;
    f.rawUpdate();f.frameUpdate();f.repin();
    rejects(f,'PHASE78_RAW_BROKER_POSITION_NOT_MATCHED_TO_PAPER_LOTS');
  });
  it('MIS position must never substitute as NRML long',()=>{
    const f=make();f.raw.positions.data[0].product='I';
    f.rawUpdate();f.frameUpdate();f.repin();
    rejects(f,'PHASE78_RAW_BROKER_POSITION_NOT_MATCHED_TO_PAPER_LOTS');
  });
  it('broker open and market orders do not count as native exchange stop',()=>{
    for(const value of [{status:'open'},{order_type:'LIMIT'}]){
      const f=make();Object.assign(f.raw.orders.data[0],value);
      f.rawUpdate();f.frameUpdate();f.repin();
      rejects(f,'PHASE78_CURRENT_NATIVE_STOP_ID_STATE_OR_LEAVES_MISMATCH');
    }
  });
  it('additional unknown SELL order creates duplicate exit exposure',()=>{
    const f=make();f.raw.orders.data.push({...f.raw.orders.data[0],order_id:'SL-2'});
    f.rawUpdate();f.frameUpdate();f.repin();
    rejects(f,'PHASE78_ADDITIONAL_UNACKED_OR_MISSING_RAW_SELL_ORDER');
  });
  it('current stop has to cover exact remaining LOT × lotSize',()=>{
    const f=make();f.raw.orders.data[0].pending_quantity=40;
    f.rawUpdate();f.frameUpdate();f.repin();
    rejects(f,'PHASE78_CURRENT_NATIVE_STOP_ID_STATE_OR_LEAVES_MISMATCH');
  });
  it('registered active GTT remains duplicate/uncertain, not protective exchange ACK',()=>{
    const f=make();f.raw.gtts.data.push({instrument_token:key,
      gtt_order_id:'GTT-1',product:'D',rules:[{strategy:'STOPLOSS',
        transaction_type:'SELL',status:'SCHEDULED',trigger_price:95}]});
    f.rawUpdate();f.frameUpdate();f.repin();
    rejects(f,'PHASE78_ACTIVE_OR_UNKNOWN_BROKER_GTT_AMBIGUITY');
  });
  it('orphan day sell trade must not be counted as original lifecycle fill',()=>{
    const f=make();f.raw.trades.data.push({trade_id:'T-1',order_id:'OTHER',
      instrument_token:key,product:'D',transaction_type:'SELL',quantity:50});
    f.rawUpdate();f.frameUpdate();f.repin();
    rejects(f,'PHASE78_UNRECONCILED_INTRADAY_SELL_TRADE');
  });
  it('same-day trade on an order without recorded cumulative fill fails',()=>{
    const f=make();f.raw.trades.data.push({trade_id:'T-1',order_id:'SL-1',
      instrument_token:key,product:'D',transaction_type:'SELL',quantity:50});
    f.rawUpdate();f.frameUpdate();f.repin();
    rejects(f,'PHASE78_TRADE_BOOK_SELL_EXCEEDS_REPLAYED_FILLED');
  });
  it('a partial sell fill reconciles only with net reduced, leaves and trade quantity',()=>{
    const f=make(),p=f.input.phase77;
    p.paper.position.lots=3;p.positionClaim.netLongLots=2;
    p.paper.quotes[0].displayedBestBidDepthLots=3;
    p.positionClaim.claimedOutstandingSellOrders[0].remainingLots=2;
    p.events[0].totalLots=3;
    p.events.push({sequence:4,eventId:'EV-4',orderId:'SL-1',at:time(10,4),
      kind:'SELL_STOP',transition:'PARTIAL_FILL',accountScopeKey:account,
      instrumentKey:key,product:'NRML',direction:'SELL',cumulativeFilledLots:1});
    f.input.privatePhase29Archive.frame.expected.expectedNetLongQuantity=100;
    f.raw.positions.data[0].quantity=100;
    f.raw.orders.data[0].quantity=150;
    f.raw.orders.data[0].filled_quantity=50;
    f.raw.orders.data[0].pending_quantity=100;
    f.raw.trades.data.push({trade_id:'T-1',order_id:'SL-1',
      instrument_token:key,product:'D',transaction_type:'SELL',quantity:50});
    f.rawUpdate();f.frameUpdate();f.repin();
    const r=audit(f);neverLive(r);
    assert.equal(r.status,'DESCRIPTIVE_BYTES_AND_CLAIMS_CONSISTENT_NOT_AUTHENTICATED',JSON.stringify(r));
    assert.equal(r.candidateDaySellTradeQuantityUnits,50);
    assert.equal(r.sameScopePositionQuantityUnits,100);
  });
  it('inconsistent phase77 paper and current order snapshot never bypass upstream gate',()=>{
    const f=make();f.input.phase77.positionClaim.claimedOutstandingSellOrders=[];
    f.repin();rejects(f,'PHASE78_PHASE77_OPERATOR_RECONCILIATION_BLOCKED');
  });
  it('profile account mismatch cannot be passed using a correctly rehashed source',()=>{
    const f=make();f.raw.profile.data.user_id='OTHER_ACCOUNT';
    f.rawUpdate();f.repin();
    rejects(f,'PHASE78_PROFILE_SNAPSHOT_OR_DECLARED_ENTITLEMENT_MISMATCH','INVALID_EVIDENCE');
  });
  it('time-incoherent supposedly complete GET response set is blocked',()=>{
    const f=make();f.input.privatePhase29Archive.frame.capture.orders.capturedAt=time(11,1,0);
    f.repin();
    rejects(f,'PHASE78_ASOF_CAPTURE_FRESHNESS_SKEW_OR_RESTART_UNPROVEN');
  });
  it('future GET time and old before-restart snapshot cannot become current stop proof',()=>{
    const f=make();f.input.privatePhase29Archive.frame.capture.orders.capturedAt=time(11,10,0);
    f.repin();
    rejects(f,'PHASE78_ASOF_CAPTURE_FRESHNESS_SKEW_OR_RESTART_UNPROVEN');
    const g=make();g.input.privatePhase29Archive.frame.recoveryStartedAt=time(11,2,52);
    g.repin();
    rejects(g,'PHASE78_ASOF_CAPTURE_FRESHNESS_SKEW_OR_RESTART_UNPROVEN');
  });
  it('mutating risk policy or original frame without independent pins fails closed',()=>{
    const f=make();f.input.policy.maxGetBodyAgeSeconds=899;
    rejects(f,'PHASE78_PINNED_POLICY_FRAME_OR_LIFECYCLE_CHANGED','INVALID_EVIDENCE');
    const g=make();g.input.privatePhase29Archive.frame.asOf=time(11,2);
    rejects(g,'PHASE78_PINNED_POLICY_FRAME_OR_LIFECYCLE_CHANGED','INVALID_EVIDENCE');
  });
  it('a missing original profile or duplicated GET book is rejected',()=>{
    const f=make();f.input.privatePhase29Archive.profileResponseUtf8Base64='';
    rejects(f,'PHASE78_ORIGINAL_PRIVATE_GET_BODY_BYTES_NOT_PINNED','INVALID_EVIDENCE');
    const g=make();g.input.privatePhase29Archive.byteWitnesses[1].book='positions';
    rejects(g,'PHASE78_DUPLICATE_MISSING_OR_WRONG_SEQUENCE_RAW_BOOK','INVALID_EVIDENCE');
  });
  it('filtered GET is forbidden even if raw body stays unchanged',()=>{
    const f=make();(f.input.privatePhase29Archive.frame.capture.orders as {unfiltered:boolean}).unfiltered=false;
    f.repin();rejects(f,'PHASE78_FRAME_DIFFERS_FROM_ORIGINAL_RAW_BOOK_BYTES','INVALID_EVIDENCE');
  });
  it('one false STOP ledger with correct source bytes never manufactures a broker fill',()=>{
    const f=make();f.input.phase77.events[2].transition='BROKER_ACK';f.repin();
    rejects(f,'PHASE78_PHASE77_OPERATOR_RECONCILIATION_BLOCKED','INVALID_EVIDENCE');
  });
  it('deterministic outputs never contain account, contract, order IDs or auto 15:15 NRML exit',()=>{
    const f=make();const a=audit(f),b=audit(make());
    neverLive(a);assert.deepEqual(a,b);
    assert.equal(a.forced1515NrmlExit,false);
  });
});
