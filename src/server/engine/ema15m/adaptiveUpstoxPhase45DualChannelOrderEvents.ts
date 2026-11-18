/**
 * Phase45 — strictly OFFLINE parity test of operator-archived Upstox
 * portfolio order WebSocket updates vs public webhook postbacks against
 * Phase44 same-day broker-reported order history.
 *
 * These channels share the SAME UPSTOX SOURCE. They are NOT independent
 * exchange-native ACKs. Webhook POST is publicly reachable / spoofable;
 * a claimed WebSocket TLS session cannot be replay-verified from JSON.
 *
 * No broker credential, network activity, WebSocket, webhook server,
 * order writes, background jobs, GTT changes or production integration.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {
  auditPhase44StopMutationLedger,
  type Phase44StopMutationArchive,type Phase44IndependentPins
} from './adaptiveUpstoxPhase44StopMutationLedger.js';
import {
  hashPhase40OfflineArchive,type Phase40OrderEvent
} from './adaptiveUpstoxPhase40OvernightStopAudit.js';

const SHA=/^[a-f0-9]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const IST=/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/;
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b)
  .digest('hex');
const at=(s:unknown):number=>typeof s==='string'&&ISO.test(s)?
  Date.parse(s):NaN;
const historicAt=(s:unknown):number=>typeof s==='string'&&IST.test(s)?
  Date.parse(s.replace(' ','T')+'+05:30'):NaN;
const istDate=(t:number)=>Number.isFinite(t)?
  new Date(t+19800000).toISOString().slice(0,10):null;
function strictBase64(s:unknown,max:number):Buffer|null{
  if(typeof s!=='string'||s.length<4||s.length>max*2||
    s.length%4!==0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  const b=Buffer.from(s,'base64');
  return b.length<=max&&b.toString('base64')===s?b:null;
}
type Channel='PORTFOLIO_ORDER_WEBSOCKET'|'PUBLIC_ORDER_WEBHOOK';
type WitnessRole='WS_CAPTURE_WITNESS'|'WEBHOOK_CAPTURE_WITNESS';
export interface Phase45ArchivedMessage{
  source:'OPERATOR_CAPTURED_UNVERIFIED';
  rawUtf8Base64:string;
  capturedAt:string;
}
export interface Phase45ChannelWitness{
  role:WitnessRole;
  publicKeySpkiDerBase64:string;
  signatureBase64:string;
  signedAt:string;
}
export interface Phase45ChannelArchive{
  channel:Channel;
  claimedOrigin:'UPSTOX_BROKER_UPDATE_UNVERIFIED';
  transportClaim:'OPERATOR_CLAIMS_TLS_WEBSOCKET'|
    'PUBLIC_UNAUTHENTICATED_WEBHOOK_POST';
  orderMessages:Phase45ArchivedMessage[];
  witness:Phase45ChannelWitness;
}
export interface Phase45DualChannelArchive{
  schemaVersion:'ADAPTIVE_PHASE45_BROKER_ORDER_UPDATE_PARITY_V1';
  source:'PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED';
  phase44Archive:Phase44StopMutationArchive;
  phase44IndependentPins:Phase44IndependentPins;
  channels:[Phase45ChannelArchive,Phase45ChannelArchive];
}
export interface Phase45IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE45_ORDER_UPDATE_PARITY_PINS_V1';
  expectedPhase44ArchiveSha256:string;
  expectedPhase44PinsSha256:string;
  expectedAccountScopeId:string;
  expectedSessionDate:string;
  expectedWsRawBodySha256:string[];
  expectedWebhookRawBodySha256:string[];
  expectedWsWitnessSpkiSha256:string;
  expectedWebhookWitnessSpkiSha256:string;
  expectedFinalEvidenceChainTipSha256:string;
  expectedChallengeSha256:string;
  maxCaptureDelaySeconds:number;
  maxReviewDelayMinutes:number;
}
export interface Phase45AuditReport{
  mode:'OFFLINE_UPSTOX_WS_PUBLIC_WEBHOOK_PHASE44_ORDER_EVENT_PARITY';
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'|
    'TWO_BROKER_REPORTED_CHANNELS_MATCH_UNVERIFIED';
  reasonCodes:string[];
  expectedHistoryEvents:number;
  websocketMessagesMatched:number;
  webhookMessagesMatched:number;
  signedChannelClaimsVerified:number;
  observedStopMutationEvents:number;
  unobservedInterEventWindows:number;
  brokerReportCrossChannelParityOnly:true;
  independentTransportOriginsProven:false;
  publicWebhookSpoofingExcluded:false;
  websocketHandshakeIndependentlyAuthenticated:false;
  exchangeSignedOrderAcknowledgementVerified:false;
  independentNseNotisMemberTradeVerification:false;
  completeBrokerEventHistoryProven:false;
  nativeProtectiveStopContinuityVerified:false;
  overnightGapFillGuaranteed:false;
  brokerStopInstalled:false;
  brokerAuthenticated:false;
  protectedOvernight:false;
  productionSafe:false;
  executionAuthorized:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const warnings=[
  'UPSTOX_WEBSOCKET_AND_PUBLIC_WEBHOOK_CARRY_SAME_BROKER_EVENT_SOURCE',
  'DUPLICATE_BROKER_FEEDS_ARE_NOT_INDEPENDENT_EXCHANGE_ACK_EVIDENCE',
  'PUBLIC_WEBHOOK_POSTS_MAY_BE_SPOOFED_WITHOUT_AUTHENTICATED_ORIGIN',
  'ARCHIVED_WEBSOCKET_JSON_CANNOT_REPLAY_VERIFY_TLS_HANDSHAKE',
  'TWO_OPERATOR_WITNESS_KEYS_DO_NOT_AUTHENTICATE_THE_UPSTOX_SERVER',
  'ORDER_STATUS_EVENTS_MAY_BE_MISSING_OR_LATE_DESPITE_LOCAL_PARITY',
  'NSE_NOTIS_MEMBER_TRADE_REPORT_IS_NOT_A_CLIENT_ORDER_ACK',
  'EXCHANGE_ORDER_ID_IS_BROKER_REPORTED_NOT_AN_EXCHANGE_SIGNED_ACK',
  'HISTORY_IS_SAME_DAY_ONLY_AND_GTT_STOP_MAY_FAIL_ON_GAP',
  'NO_LIVE_NRML_ORDERS_GTT_WRITES_OR_POSITIONAL_15_15_FORCED_EXIT'
];
const blank=():Phase45AuditReport=>({
  mode:'OFFLINE_UPSTOX_WS_PUBLIC_WEBHOOK_PHASE44_ORDER_EVENT_PARITY',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  expectedHistoryEvents:0,websocketMessagesMatched:0,
  webhookMessagesMatched:0,signedChannelClaimsVerified:0,
  observedStopMutationEvents:0,unobservedInterEventWindows:0,
  brokerReportCrossChannelParityOnly:true,
  independentTransportOriginsProven:false,
  publicWebhookSpoofingExcluded:false,
  websocketHandshakeIndependentlyAuthenticated:false,
  exchangeSignedOrderAcknowledgementVerified:false,
  independentNseNotisMemberTradeVerification:false,
  completeBrokerEventHistoryProven:false,
  nativeProtectiveStopContinuityVerified:false,
  overnightGapFillGuaranteed:false,brokerStopInstalled:false,
  brokerAuthenticated:false,protectedOvernight:false,
  productionSafe:false,executionAuthorized:false,
  nativeOrderInstruction:null,warnings
});
const reject=(status:Phase45AuditReport['status'],code:string,
  partial?:Partial<Phase45AuditReport>):Phase45AuditReport=>({
  ...blank(),...partial,status,reasonCodes:[code]
});
type ExpectedEvent=Phase40OrderEvent;
function flatHistory(archive:Phase44StopMutationArchive):ExpectedEvent[]{
  return archive.orderSnapshots.flatMap(s=>s.history.response.data);
}
function digestSequence(
  input:Phase45DualChannelArchive,pins:Phase45IndependentPins
):string{
  let previous=hash('ADAPTIVE_PHASE45_ORDER_UPDATE_GENESIS_V1|'+
    pins.expectedPhase44ArchiveSha256+'|'+pins.expectedPhase44PinsSha256);
  input.channels.forEach((channel,channelIndex)=>{
    const hashes=channelIndex===0?pins.expectedWsRawBodySha256:
      pins.expectedWebhookRawBodySha256;
    channel.orderMessages.forEach((message,eventIndex)=>{
      previous=hash(JSON.stringify({
        domain:'ADAPTIVE_PHASE45_ORDER_UPDATE_EVENT_LINK_V1',
        channel:channel.channel,channelIndex,eventIndex,
        responseBodySha256:hashes[eventIndex],
        capturedAt:message.capturedAt,previous
      }));
    });
  });
  return previous;
}
export function phase45EventChainTip(
  input:Phase45DualChannelArchive,pins:Phase45IndependentPins
):string{return digestSequence(input,pins);}
export function phase45WitnessMessage(
  input:Phase45DualChannelArchive,pins:Phase45IndependentPins,
  channelIndex:number
):Buffer{
  const channel=input.channels[channelIndex];
  const bodyHashes=channelIndex===0?pins.expectedWsRawBodySha256:
    pins.expectedWebhookRawBodySha256;
  return Buffer.from(JSON.stringify({
    domain:'ADAPTIVE_PHASE45_ORDER_EVENT_CAPTURE_WITNESS_V1',
    challenge:pins.expectedChallengeSha256,
    phase44ArchiveSha256:pins.expectedPhase44ArchiveSha256,
    phase44PinsSha256:pins.expectedPhase44PinsSha256,
    accountScopeId:pins.expectedAccountScopeId,
    sessionDate:pins.expectedSessionDate,
    channel:channel.channel,transportClaim:channel.transportClaim,
    bodyHashes,captureTimes:channel.orderMessages.map(x=>x.capturedAt),
    chainTipSha256:pins.expectedFinalEvidenceChainTipSha256,
    claimedWitnessAt:channel.witness.signedAt
  }),'utf8');
}
function verifyWitness(
  input:Phase45DualChannelArchive,pins:Phase45IndependentPins,
  channelIndex:number,lastCapture:number
):boolean{
  const c=input.channels[channelIndex];
  const witness=c.witness;
  const role:WitnessRole=channelIndex===0?
    'WS_CAPTURE_WITNESS':'WEBHOOK_CAPTURE_WITNESS';
  const pinned=channelIndex===0?pins.expectedWsWitnessSpkiSha256:
    pins.expectedWebhookWitnessSpkiSha256;
  if(!witness||witness.role!==role||
    !Number.isFinite(at(witness.signedAt))||
    at(witness.signedAt)<lastCapture||
    at(witness.signedAt)-lastCapture>
      pins.maxReviewDelayMinutes*60000)return false;
  const spki=strictBase64(witness.publicKeySpkiDerBase64,4096),
    signature=strictBase64(witness.signatureBase64,128);
  if(!spki||!signature||signature.length!==64||
    hash(spki)!==pinned)return false;
  try{
    const key=createPublicKey({key:spki,format:'der',type:'spki'});
    return key.asymmetricKeyType==='ed25519'&&
      verify(null,phase45WitnessMessage(input,pins,channelIndex),
        key,signature);
  }catch{return false;}
}
function countTopLevelToken(json:string,key:string):number{
  // Defense-in-depth: reject duplicate exact critical JSON keys even if
  // JSON.parse would silently keep the last one; may conservatively reject
  // a legitimate string containing the same escaped key token.
  const literal='"'+key+'"';
  let count=0,at=0;
  while((at=json.indexOf(literal,at))>=0){
    let i=at+literal.length;
    while(i<json.length&&/\s/.test(json[i]))i++;
    if(json[i]===':')count++;
    at+=literal.length;
  }
  return count;
}
function matchesOrderEvent(raw:Buffer,row:ExpectedEvent,
  scope:string,expectedDate:string):boolean{
  let obj:Record<string,unknown>;
  let json:string;
  try{
    json=new TextDecoder('utf-8',{fatal:true}).decode(raw);
    const parsed:unknown=JSON.parse(json);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
      return false;
    obj=parsed as Record<string,unknown>;
  }catch{return false;}
  const critical=[
    'update_type','placed_by','order_id','exchange_order_id',
    'instrument_token','trading_symbol','product','order_type',
    'transaction_type','quantity','filled_quantity','status',
    'order_request_id','order_timestamp','exchange_timestamp'
  ];
  if(critical.some(k=>countTopLevelToken(json,k)!==1))return false;
  const exchangeId=row.exchange_order_id;
  const upstoxExchangeId=obj.exchange_order_id;
  const exchangeMatches=exchangeId===null?
    (upstoxExchangeId===''||upstoxExchangeId===null):
    upstoxExchangeId===exchangeId;
  if(!exchangeMatches||obj.update_type!=='order'||
    obj.placed_by!==scope||
    obj.order_id!==row.order_id||
    obj.instrument_token!==row.instrument_token||
    obj.trading_symbol!==row.trading_symbol||
    obj.product!=='D'||obj.order_type!==row.order_type||
    obj.transaction_type!=='SELL'||obj.quantity!==row.quantity||
    obj.filled_quantity!==row.filled_quantity||
    obj.status!==row.status||
    obj.order_request_id!==row.order_request_id||
    obj.order_timestamp!==row.order_timestamp||
    obj.exchange_timestamp!==row.exchange_timestamp||
    istDate(historicAt(row.order_timestamp))!==expectedDate)
    return false;
  return true;
}
export function auditPhase45DualChannelOrderEvents(
  input:Phase45DualChannelArchive,
  pins:Phase45IndependentPins
):Phase45AuditReport{
  if(!input||!pins||
    input.schemaVersion!=='ADAPTIVE_PHASE45_BROKER_ORDER_UPDATE_PARITY_V1'||
    input.source!=='PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED'||
    pins.schemaVersion!=='INDEPENDENT_PHASE45_ORDER_UPDATE_PARITY_PINS_V1'||
    !SHA.test(pins.expectedPhase44ArchiveSha256)||
    !SHA.test(pins.expectedPhase44PinsSha256)||
    !SHA.test(pins.expectedWsWitnessSpkiSha256)||
    !SHA.test(pins.expectedWebhookWitnessSpkiSha256)||
    !SHA.test(pins.expectedFinalEvidenceChainTipSha256)||
    !SHA.test(pins.expectedChallengeSha256)||
    pins.expectedWsWitnessSpkiSha256===
      pins.expectedWebhookWitnessSpkiSha256||
    typeof pins.expectedAccountScopeId!=='string'||
    pins.expectedAccountScopeId.length<1||
    !/^\d{4}-\d\d-\d\d$/.test(pins.expectedSessionDate)||
    !Number.isSafeInteger(pins.maxCaptureDelaySeconds)||
    pins.maxCaptureDelaySeconds<1||pins.maxCaptureDelaySeconds>1800||
    !Number.isSafeInteger(pins.maxReviewDelayMinutes)||
    pins.maxReviewDelayMinutes<1||pins.maxReviewDelayMinutes>1440||
    !Array.isArray(input.channels)||input.channels.length!==2||
    !Array.isArray(pins.expectedWsRawBodySha256)||
    !Array.isArray(pins.expectedWebhookRawBodySha256)||
    hashPhase40OfflineArchive(input.phase44Archive)!==
      pins.expectedPhase44ArchiveSha256||
    hashPhase40OfflineArchive(input.phase44IndependentPins)!==
      pins.expectedPhase44PinsSha256)
    return reject('INVALID_EVIDENCE','PHASE44_ARCHIVE_OR_INDEPENDENT_PIN_SCOPE_INVALID');
  const p44=input.phase44IndependentPins;
  if(!p44||p44.expectedAccountScopeId!==pins.expectedAccountScopeId||
    p44.expectedSessionDate!==pins.expectedSessionDate)
    return reject('INVALID_EVIDENCE','PHASE44_ACCOUNT_OR_SESSION_SCOPE_MISMATCH');
  const review=auditPhase44StopMutationLedger(
    input.phase44Archive,input.phase44IndependentPins);
  if(![
    'BROKER_REPORTED_MODIFIED_ORDER_OPEN_UNVERIFIED',
    'BROKER_REPORTED_REPLACEMENT_ORDER_OPEN_UNVERIFIED',
    'BROKER_REPORTED_EXIT_COMPLETE_UNVERIFIED'
  ].includes(review.status)||
    review.productionSafe!==false||
    review.brokerStopInstalled!==false||
    review.independentExchangeOrderAcknowledgementVerified!==false)
    return reject('BLOCKED_OR_UNKNOWN','PHASE44_ORDER_MUTATION_REAUDIT_REJECTED');
  const rows=flatHistory(input.phase44Archive);
  if(rows.length<3||rows.length>320)return reject(
    'BLOCKED_OR_UNKNOWN','UNBOUNDED_OR_MISSING_ORDER_HISTORY_EVENT_ROWS');
  const channels=input.channels;
  const roles:Channel[]=[
    'PORTFOLIO_ORDER_WEBSOCKET','PUBLIC_ORDER_WEBHOOK'
  ];
  const claims:Phase45ChannelArchive['transportClaim'][]=[
    'OPERATOR_CLAIMS_TLS_WEBSOCKET',
    'PUBLIC_UNAUTHENTICATED_WEBHOOK_POST'
  ];
  for(let c=0;c<channels.length;c++){
    const ch=channels[c],hashes=c===0?
      pins.expectedWsRawBodySha256:pins.expectedWebhookRawBodySha256;
    if(!ch||ch.channel!==roles[c]||
      ch.claimedOrigin!=='UPSTOX_BROKER_UPDATE_UNVERIFIED'||
      ch.transportClaim!==claims[c]||
      !Array.isArray(ch.orderMessages)||
      ch.orderMessages.length!==rows.length||
      hashes.length!==rows.length||
      hashes.some(x=>typeof x!=='string'||!SHA.test(x)))
      return reject('INVALID_EVIDENCE',
        'MISSING_REORDERED_OR_UNPINNED_CHANNEL_EVENTS');
  }
  if(digestSequence(input,pins)!==
    pins.expectedFinalEvidenceChainTipSha256)
    return reject('INVALID_EVIDENCE','EXTERNAL_EVENT_SEQUENCE_CHAIN_TIP_MISMATCH');
  let ws=0,hook=0,signed=0,mutations=0;
  for(const [index,record] of rows.entries()){
    if(['modify pending','modified','cancel pending','cancelled']
      .includes(record.status))mutations++;
    for(let channelIndex=0;channelIndex<2;channelIndex++){
      const message=channels[channelIndex].orderMessages[index],
        expectedHash=channelIndex===0?
          pins.expectedWsRawBodySha256[index]:
          pins.expectedWebhookRawBodySha256[index];
      const capture=at(message?.capturedAt),
        sourceTime=historicAt(record.order_timestamp),
        partial={expectedHistoryEvents:rows.length,
          websocketMessagesMatched:ws,webhookMessagesMatched:hook,
          observedStopMutationEvents:mutations};
      if(!message||
        message.source!=='OPERATOR_CAPTURED_UNVERIFIED'||
        !Number.isFinite(capture)||!Number.isFinite(sourceTime)||
        istDate(capture)!==pins.expectedSessionDate||
        capture<sourceTime||
        capture-sourceTime>pins.maxCaptureDelaySeconds*1000)
        return reject('BLOCKED_OR_UNKNOWN',
          'CHANNEL_CAPTURE_OR_ORDER_EVENT_TIME_DISAGREES',partial);
      const raw=strictBase64(message.rawUtf8Base64,12000);
      if(!raw||hash(raw)!==expectedHash)
        return reject('BLOCKED_OR_UNKNOWN',
          'ORIGINAL_CHANNEL_MESSAGE_BYTES_HASH_MISMATCH',partial);
      if(!matchesOrderEvent(raw,record,pins.expectedAccountScopeId,
        pins.expectedSessionDate))
        return reject('BLOCKED_OR_UNKNOWN',
          'CHANNEL_ORDER_ID_STATUS_REQUEST_FILL_OR_EXCHANGE_REF_DISAGREES',
          partial);
      if(channelIndex===0)ws++;
      else hook++;
    }
  }
  for(let i=0;i<2;i++){
    const last=channels[i].orderMessages.at(-1);
    if(!last||!verifyWitness(input,pins,i,at(last.capturedAt)))
      return reject('BLOCKED_OR_UNKNOWN',
        'CHANNEL_WITNESS_SIGNATURE_OR_CAPTURE_WINDOW_INVALID',
        {expectedHistoryEvents:rows.length,
          websocketMessagesMatched:ws,webhookMessagesMatched:hook,
          signedChannelClaimsVerified:signed,
          observedStopMutationEvents:mutations});
    signed++;
  }
  return {...blank(),
    status:'TWO_BROKER_REPORTED_CHANNELS_MATCH_UNVERIFIED',
    expectedHistoryEvents:rows.length,
    websocketMessagesMatched:ws,webhookMessagesMatched:hook,
    signedChannelClaimsVerified:signed,
    observedStopMutationEvents:mutations,
    unobservedInterEventWindows:rows.length-
      input.phase44Archive.orderSnapshots.length};
}
