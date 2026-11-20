/**
 * Phase78 — PRIVATE, OFFLINE, point-in-time original decoded HTTP JSON body
 * crosscheck against Phase77 operator-claimed NRML lifecycle.
 *
 * Pure function: NO fetch, broker SDK, credentials, order or GTT mutation.
 * A pinned body and matching operator claims are NOT broker signatures,
 * guaranteed market fills, real exchange order ACK or overnight protection.
 */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual,TextDecoder} from 'node:util';
import {
  auditPhase77OfflineNrmlStopLifecycle,
  type Phase77Input,type Phase77Report
} from './adaptivePhase77OfflineNrmlStopLifecycleAudit.js';
import type {SensitiveReadOnlyCaptureArchive}
  from './adaptiveUpstoxAuthorizedGetCapture.js';

const SOURCE='OPERATOR_PRIVATE_PHASE29_CAPTURE_NOT_BROKER_ATTESTED' as const;
const SHA=/^[a-f0-9]{64}$/;
const BOOKS=['positions','orders','gtts','trades'] as const;
type Book=typeof BOOKS[number];
type BodyName=Book|'profile';
type Obj=Record<string,unknown>;
const URLs={
  positions:'/v2/portfolio/short-term-positions',
  orders:'/v2/order/retrieve-all',
  gtts:'/v3/order/gtt',
  trades:'/v2/order/trades/get-trades-for-day'
} as const;
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export const hashPhase78Object=(v:unknown)=>sha(JSON.stringify(v));
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&
  v.length<=256&&/^[A-Za-z0-9_:./|-]+$/.test(v);
const qty=(v:unknown):v is number=>typeof v==='number'&&
  Number.isSafeInteger(v)&&v>=0&&v<=10_000_000;
const stamp=(v:unknown):number|null=>{
  if(typeof v!=='string'||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v))return null;
  const t=Date.parse(v);
  return Number.isFinite(t)?t:null;
};
function decodeBase64(raw:unknown):Buffer|null {
  if(typeof raw!=='string'||raw.length<4||raw.length>125000||
    raw.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw))
    return null;
  const bytes=Buffer.from(raw,'base64');
  return bytes.length>=2&&bytes.length<=90000&&
    bytes.toString('base64')===raw?bytes:null;
}
function readJson(bytes:Buffer):Obj|null{
  try{
    const v=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
    return obj(v)?v:null;
  }catch{return null;}
}
function rows(v:Obj|null):Obj[]|null{
  if(!v||v.status!=='success'||!Array.isArray(v.data)||
    !v.data.every(obj))return null;
  return v.data as Obj[];
}
export interface Phase78Policy{
  schemaVersion:'PHASE78_OFFLINE_GET_BODY_ASOF_POLICY_V1';
  source:'PREDECLARED_OPERATOR_REVIEW_NOT_BROKER_TRUST';
  maxGetBodyAgeSeconds:number;
  maxBetweenBookCaptureSeconds:number;
  requireEveryRawBookAndProfile:true;
  rejectUnmatchedOpenSellsAndActiveGtts:true;
  neverTreatTlsOrHashAsBrokerSignature:true;
}
export interface Phase78IndependentPins{
  schemaVersion:'PHASE78_SEPARATE_PRIVATE_SOURCE_PINS_V1';
  expectedPhase77InputSha256:string;
  expectedPhase29FrameSha256:string;
  expectedPhase78PolicySha256:string;
  expectedCaptureSequence:number;
  expectedRawBodySha256:Record<BodyName,string>;
}
export interface Phase78Input{
  schemaVersion:'PHASE78_PRIVATE_OFFLINE_ORIGINAL_GET_BODY_JOIN_V1';
  source:typeof SOURCE;
  phase77:Phase77Input;
  /** Keep original full archive outside public GitHub, logs and UI. */
  privatePhase29Archive:SensitiveReadOnlyCaptureArchive;
  policy:Phase78Policy;
}
export interface Phase78Report {
  mode:'PHASE78_OFFLINE_PHASE29_RAW_GET_TO_PHASE77_NRML_CROSSCHECK';
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'DESCRIPTIVE_BYTES_AND_CLAIMS_CONSISTENT_NOT_AUTHENTICATED';
  reasonCodes:string[];
  phase77Status:Phase77Report['status']|null;
  rawBodyHashMatchedCount:number;
  sameScopePositionQuantityUnits:number|null;
  matchedCurrentClaimedNativeStopCount:number;
  candidateDaySellTradeQuantityUnits:number;
  originalBrokerResponseOriginAuthenticated:false;
  localHashPinIsNotIndependentBrokerAuthentication:true;
  readOnlyGetCaptureOwnerAuthorizationVerified:false;
  genuineBrokerAccountAndOpenBookAuthenticated:false;
  exchangeNativeStopAckOrOvernightProtectionVerified:false;
  verifiedActualFillOrStrategyProfitability:false;
  separateBookSnapshotsAreNotAtomic:true;
  officialExchangeContractExpiryVerified:false;
  existingMis1515Unchanged:true;
  forced1515NrmlExit:false;
  networkOrBrokerCallsMade:false;
  nrmlOrderOrGttWritesEnabled:false;
  nativeOrderInstruction:null;
  executionAuthorized:false;
  productionSafe:false;
}
const empty=():Phase78Report=>({
  mode:'PHASE78_OFFLINE_PHASE29_RAW_GET_TO_PHASE77_NRML_CROSSCHECK',
  status:'INVALID_EVIDENCE',reasonCodes:[],phase77Status:null,
  rawBodyHashMatchedCount:0,sameScopePositionQuantityUnits:null,
  matchedCurrentClaimedNativeStopCount:0,candidateDaySellTradeQuantityUnits:0,
  originalBrokerResponseOriginAuthenticated:false,
  localHashPinIsNotIndependentBrokerAuthentication:true,
  readOnlyGetCaptureOwnerAuthorizationVerified:false,
  genuineBrokerAccountAndOpenBookAuthenticated:false,
  exchangeNativeStopAckOrOvernightProtectionVerified:false,
  verifiedActualFillOrStrategyProfitability:false,
  separateBookSnapshotsAreNotAtomic:true,
  officialExchangeContractExpiryVerified:false,
  existingMis1515Unchanged:true,forced1515NrmlExit:false,
  networkOrBrokerCallsMade:false,nrmlOrderOrGttWritesEnabled:false,
  nativeOrderInstruction:null,executionAuthorized:false,productionSafe:false
});
function fail(code:string,status:Phase78Report['status']='INVALID_EVIDENCE',
  extra:Partial<Phase78Report>={}):Phase78Report{
  return {...empty(),...extra,status,reasonCodes:[code]};
}
/** Pure PRIVATE review. Caller must enforce OS/container no-network-egress. */
export function auditPhase78RawBrokerReadOnlyJoin(
  input:Phase78Input,pins:Phase78IndependentPins
):Phase78Report{
  if(!input||input.schemaVersion!==
    'PHASE78_PRIVATE_OFFLINE_ORIGINAL_GET_BODY_JOIN_V1'||
    input.source!==SOURCE||!input.phase77||!input.privatePhase29Archive||
    !input.policy||!pins||pins.schemaVersion!==
    'PHASE78_SEPARATE_PRIVATE_SOURCE_PINS_V1')
    return fail('PHASE78_INVALID_SOURCE_OR_ENVELOPE');
  const policy=input.policy,archive=input.privatePhase29Archive,frame=archive.frame;
  if(policy.schemaVersion!=='PHASE78_OFFLINE_GET_BODY_ASOF_POLICY_V1'||
    policy.source!=='PREDECLARED_OPERATOR_REVIEW_NOT_BROKER_TRUST'||
    !qty(policy.maxGetBodyAgeSeconds)||
    policy.maxGetBodyAgeSeconds<1||policy.maxGetBodyAgeSeconds>900||
    !qty(policy.maxBetweenBookCaptureSeconds)||
    policy.maxBetweenBookCaptureSeconds>120||
    policy.requireEveryRawBookAndProfile!==true||
    policy.rejectUnmatchedOpenSellsAndActiveGtts!==true||
    policy.neverTreatTlsOrHashAsBrokerSignature!==true||
    !frame||!frame.expected||!frame.capture||!frame.trades||
    !Array.isArray(archive.byteWitnesses)||
    archive.byteWitnesses.length!==BOOKS.length||
    !qty(pins.expectedCaptureSequence)||pins.expectedCaptureSequence<1||
    pins.expectedCaptureSequence>64||
    !obj(pins.expectedRawBodySha256)||
    !Object.keys(pins.expectedRawBodySha256).every(k=>
      ['profile',...BOOKS].includes(k))||
    Object.keys(pins.expectedRawBodySha256).length!==5||
    ![pins.expectedPhase77InputSha256,pins.expectedPhase29FrameSha256,
      pins.expectedPhase78PolicySha256,
      ...Object.values(pins.expectedRawBodySha256)].every(x=>
        typeof x==='string'&&SHA.test(x))||
    !Number.isSafeInteger(frame.sequence)||
    frame.sequence!==pins.expectedCaptureSequence||
    hashPhase78Object(input.phase77)!==pins.expectedPhase77InputSha256||
    hashPhase78Object(frame)!==pins.expectedPhase29FrameSha256||
    hashPhase78Object(policy)!==pins.expectedPhase78PolicySha256)
    return fail('PHASE78_PINNED_POLICY_FRAME_OR_LIFECYCLE_CHANGED');
  const encoded:Partial<Record<BodyName,string>>={
    profile:archive.profileResponseUtf8Base64};
  for(const w of archive.byteWitnesses){
    if(!w||!BOOKS.includes(w.book)||w.sequence!==frame.sequence||
      encoded[w.book]!==undefined)
      return fail('PHASE78_DUPLICATE_MISSING_OR_WRONG_SEQUENCE_RAW_BOOK');
    encoded[w.book]=w.responseUtf8Base64;
  }
  const parsed:Partial<Record<BodyName,Obj>>={};
  for(const name of ['profile',...BOOKS] as BodyName[]){
    const bytes=decodeBase64(encoded[name]);
    if(!bytes||sha(bytes)!==pins.expectedRawBodySha256[name])
      return fail('PHASE78_ORIGINAL_PRIVATE_GET_BODY_BYTES_NOT_PINNED');
    const data=readJson(bytes);
    if(!data)return fail('PHASE78_ORIGINAL_RAW_GET_BODY_NOT_VALID_JSON_OBJECT');
    parsed[name]=data;
  }
  const capture=frame.capture;
  if(capture.schemaVersion!=='ADAPTIVE_UPSTOX_OFFLINE_READ_ONLY_V1'||
    capture.origin!=='OPERATOR_SUPPLIED_UNVERIFIED'||
    !id(capture.accountScopeId)||
    !BOOKS.every(name=>{
      const c=name==='trades'?frame.trades:capture[name];
      return !!c&&c.method==='GET'&&c.path===URLs[name]&&
        c.unfiltered===true&&c.httpStatus===200&&
        isDeepStrictEqual(c.response,parsed[name]);
    }))return fail('PHASE78_FRAME_DIFFERS_FROM_ORIGINAL_RAW_BOOK_BYTES');
  const profile=parsed.profile;
  if(!profile||profile.status!=='success'||!obj(profile.data)||
    profile.data.user_id!==capture.accountScopeId||
    profile.data.broker!=='UPSTOX'||profile.data.is_active!==true||
    !Array.isArray(profile.data.products)||
    !profile.data.products.includes('D')||
    !Array.isArray(profile.data.order_types)||
    !profile.data.order_types.some(x=>x==='SL'||x==='SL-M'))
    return fail('PHASE78_PROFILE_SNAPSHOT_OR_DECLARED_ENTITLEMENT_MISMATCH');
  const parent=auditPhase77OfflineNrmlStopLifecycle(input.phase77);
  const partial:Partial<Phase78Report>={
    phase77Status:parent.status,rawBodyHashMatchedCount:5};
  if(parent.status!=='DESCRIPTIVE_CLAIMED_STOP_INTERNALLY_CONSISTENT_ONLY')
    return fail('PHASE78_PHASE77_OPERATOR_RECONCILIATION_BLOCKED',
      parent.status==='INVALID_EVIDENCE'?'INVALID_EVIDENCE':
        'BLOCKED_OR_UNKNOWN',partial);
  const claimed=input.phase77.positionClaim,position=input.phase77.paper.position;
  if(!/^(NSE_FO|BSE_FO)\|[A-Za-z0-9_:./-]{1,150}$/.test(position.instrumentKey)||
    capture.accountScopeId!==claimed.accountScopeKey||
    frame.expected.accountScopeId!==claimed.accountScopeKey||
    frame.expected.instrumentKey!==claimed.instrumentKey||
    frame.expected.productType!=='NRML'||
    frame.expected.lotSize!==position.lotSize||
    frame.expected.expiry!==position.assumedExchangeExpiryDateIST||
    frame.expected.expectedNetLongQuantity!==
      claimed.netLongLots*position.lotSize)
    return fail('PHASE78_RAW_GET_FRAME_POSITION_SCOPE_OR_LOT_MISMATCH',
      'BLOCKED_OR_UNKNOWN',partial);
  const now=stamp(input.phase77.evaluationAt),asOf=stamp(frame.asOf),
    claimedAt=stamp(claimed.claimedAsOf),recv=stamp(claimed.receivedAt);
  const captureTimes=BOOKS.map(name=>stamp(
    name==='trades'?frame.trades.capturedAt:capture[name].capturedAt));
  const bookTimes=captureTimes.filter((x):x is number=>x!==null);
  if(now===null||asOf===null||claimedAt===null||recv===null||
    bookTimes.length!==4||asOf!==claimedAt||recv<asOf||recv>now||
    bookTimes.some(t=>t>asOf||t>now||
      now-t>policy.maxGetBodyAgeSeconds*1000)||
    Math.max(...bookTimes)-Math.min(...bookTimes)>
      policy.maxBetweenBookCaptureSeconds*1000||
    (frame.recoveryStartedAt!==undefined&&(
      stamp(frame.recoveryStartedAt)===null||
      bookTimes.some(t=>t<=stamp(frame.recoveryStartedAt)!))))
    return fail('PHASE78_ASOF_CAPTURE_FRESHNESS_SKEW_OR_RESTART_UNPROVEN',
      'BLOCKED_OR_UNKNOWN',partial);
  const p=rows(parsed.positions!),o=rows(parsed.orders!),
    g=rows(parsed.gtts!),tr=rows(parsed.trades!);
  if(!p||!o||!g||!tr)return fail('PHASE78_INCOMPLETE_OR_MALFORMED_RAW_GET_BOOK',
    'INVALID_EVIDENCE',partial);
  const matches=p.filter(r=>r.instrument_token===claimed.instrumentKey);
  if(matches.length!==1||matches[0].product!=='D'||
    !Number.isSafeInteger(matches[0].quantity)||
    matches[0].quantity!==claimed.netLongLots*position.lotSize)
    return fail('PHASE78_RAW_BROKER_POSITION_NOT_MATCHED_TO_PAPER_LOTS',
      'BLOCKED_OR_UNKNOWN',partial);
  const quantityUnits=matches[0].quantity as number;
  const part:Partial<Phase78Report>={...partial,
    sameScopePositionQuantityUnits:quantityUnits};
  const orders=new Map<string,Obj>(),active=new Map<string,Obj>();
  for(const r of o){
    if(!id(r.order_id)||!id(r.instrument_token)||
      !['BUY','SELL'].includes(String(r.transaction_type))||
      !['D','I'].includes(String(r.product))||!qty(r.quantity)||
      r.quantity===0||!qty(r.filled_quantity)||!qty(r.pending_quantity)||
      (r.filled_quantity as number)>(r.quantity as number)||
      typeof r.order_type!=='string'||typeof r.status!=='string'||
      typeof r.trigger_price!=='number'||
      !Number.isFinite(r.trigger_price)||r.trigger_price<0)
      return fail('PHASE78_MALFORMED_UNFILTERED_RAW_ORDER_ROW',
        'INVALID_EVIDENCE',part);
    if(orders.has(r.order_id as string))
      return fail('PHASE78_DUPLICATED_RAW_ORDER_ID', 'INVALID_EVIDENCE',part);
    orders.set(r.order_id as string,r);
    if(r.instrument_token===claimed.instrumentKey&&
      r.transaction_type==='SELL'){
      if(r.product!=='D')
        return fail('PHASE78_OTHER_PRODUCT_SELL_ON_SAME_CONTRACT',
          'BLOCKED_OR_UNKNOWN',part);
      if(!['complete','cancelled','cancelled after market order','rejected']
        .includes(r.status as string))active.set(r.order_id as string,r);
    }
  }
  const expected=claimed.claimedOutstandingSellOrders;
  if(expected.length!==1||expected[0].kind!=='SELL_STOP'||
    expected[0].claimedState!=='EXCHANGE_OPEN'||
    active.size!==expected.length)
    return fail('PHASE78_ADDITIONAL_UNACKED_OR_MISSING_RAW_SELL_ORDER',
      'BLOCKED_OR_UNKNOWN',part);
  const stop=active.get(expected[0].orderId);
  if(!stop||stop.status!=='trigger pending'||
    !['SL','SL-M'].includes(stop.order_type as string)||
    !((stop.trigger_price as number)>0)||
    stop.pending_quantity!==expected[0].remainingLots*position.lotSize||
    stop.quantity!==(stop.pending_quantity as number)+(stop.filled_quantity as number))
    return fail('PHASE78_CURRENT_NATIVE_STOP_ID_STATE_OR_LEAVES_MISMATCH',
      'BLOCKED_OR_UNKNOWN',part);
  const reportedFills=new Map<string,number>();
  for(const e of input.phase77.events){
    if(e.kind==='SELL_STOP'&&e.cumulativeFilledLots!==undefined)
      reportedFills.set(e.orderId,e.cumulativeFilledLots);
  }
  if(stop.filled_quantity!==
    (reportedFills.get(expected[0].orderId)??0)*position.lotSize)
    return fail('PHASE78_BROKER_FILLED_UNITS_DIFFER_FROM_EVENT_LEDGER',
      'BLOCKED_OR_UNKNOWN',part);
  for(const r of g){
    if(!id(r.instrument_token)||!id(r.gtt_order_id)||
      typeof r.product!=='string'||!Array.isArray(r.rules)||
      !r.rules.every(obj))
      return fail('PHASE78_MALFORMED_RAW_GTT_ROW','INVALID_EVIDENCE',part);
    if(r.instrument_token===claimed.instrumentKey&&r.product==='D'&&
      (r.rules as Obj[]).some(rule=>
        !['COMPLETED','CANCELLED','EXPIRED','FAILED'].includes(
          String(rule.status))))
      return fail('PHASE78_ACTIVE_OR_UNKNOWN_BROKER_GTT_AMBIGUITY',
        'BLOCKED_OR_UNKNOWN',part);
  }
  const seenTrade=new Set<string>();
  const dailyByOrder=new Map<string,number>();
  let sellUnits=0;
  for(const row of tr){
    if(!id(row.trade_id)||!id(row.order_id)||
      !id(row.instrument_token)||!qty(row.quantity)||row.quantity===0||
      !['BUY','SELL'].includes(String(row.transaction_type))||
      typeof row.product!=='string'||seenTrade.has(row.trade_id as string))
      return fail('PHASE78_MALFORMED_OR_DUPLICATED_DAY_TRADE',
        'INVALID_EVIDENCE',part);
    seenTrade.add(row.trade_id as string);
    if(row.instrument_token!==claimed.instrumentKey||
      row.transaction_type!=='SELL')continue;
    if(row.product!=='D'||!orders.has(row.order_id as string))
      return fail('PHASE78_UNRECONCILED_INTRADAY_SELL_TRADE',
        'BLOCKED_OR_UNKNOWN',part);
    const orderId=row.order_id as string,units=row.quantity as number;
    dailyByOrder.set(orderId,(dailyByOrder.get(orderId)??0)+units);
    sellUnits+=units;
  }
  for(const [orderId,count] of dailyByOrder){
    const r=orders.get(orderId)!;
    const known=reportedFills.get(orderId);
    if(known===undefined||count>(r.filled_quantity as number)||
      count>known*position.lotSize)
      return fail('PHASE78_TRADE_BOOK_SELL_EXCEEDS_REPLAYED_FILLED',
        'BLOCKED_OR_UNKNOWN',part);
  }
  return {...empty(),...part,
    status:'DESCRIPTIVE_BYTES_AND_CLAIMS_CONSISTENT_NOT_AUTHENTICATED',
    reasonCodes:[
      'PRIVATE_ORIGINAL_GET_BODY_BYTES_MATCH_OPERATOR_COPIED_BOOKS_ONLY',
      'SINGLE_NRML_CLAIMED_STOP_AND_POSITION_HAVE_MATCHING_RAW_JSON_FIELDS',
      'RAW_TLS_RESPONSE_BODY_HASHES_CANNOT_PROVE_GENUINE_BROKER_OR_EXCHANGE_ACK',
      'NON_ATOMIC_DAY_SCOPED_BOOKS_CANNOT_PROVE_OVERNIGHT_STOP_SURVIVAL'
    ],
    matchedCurrentClaimedNativeStopCount:1,
    candidateDaySellTradeQuantityUnits:sellUnits
  };
}
