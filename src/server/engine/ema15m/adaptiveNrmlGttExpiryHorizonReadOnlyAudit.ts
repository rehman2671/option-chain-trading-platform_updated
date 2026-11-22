/**
 * Phase121: deterministic read-only expiry/horizon comparison for an
 * already-filled NRML F&O option and a broker-reported SINGLE GTT SELL.
 *
 * Official Upstox GTT created_at/expires_at examples are microseconds,
 * NOT Unix milliseconds or seconds. A 1/2/4/8-week intended holding
 * window never certifies actual exchange sessions, options data,
 * GTT continuity, protective stop ACK or a guaranteed exit.
 *
 * No Date.now, broker calls, filesystem, database, writes or order APIs.
 */
type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const firstUs=946684800000000; // 2000-01-01T00:00:00Z
const lastUs=4102444800000000; // 2100-01-01T00:00:00Z
const microseconds=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&
  x>=firstUs&&x<lastUs;
const utc=(s:unknown):number|null=>{
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s))
    return null;
  const ms=Date.parse(s);
  return Number.isSafeInteger(ms)&&new Date(ms).toISOString()===s&&
    ms>=firstUs/1000&&ms<lastUs/1000?ms:null;
};
const validGttId=(x:unknown):x is string=>
  typeof x==='string'&&/^GTT-[A-Za-z0-9-]{1,124}$/.test(x);
const validOption=(x:unknown):x is string=>
  typeof x==='string'&&x.length>7&&x.length<=256&&
  (x.startsWith('NSE_FO|')||x.startsWith('BSE_FO|'));
export function validUpstoxGttTimeFieldsIfPresent(p:unknown):boolean{
  if(!obj(p))return false;
  const c=Object.hasOwn(p,'created_at'),e=Object.hasOwn(p,'expires_at');
  if(!c&&!e)return true; // old broker fixture: source is NOT certified
  return c&&e&&microseconds(p.created_at)&&
    microseconds(p.expires_at)&&p.created_at<p.expires_at;
}
export type GttHorizonAuditState=
  'INVALID_OPTION_HORIZON_OR_SCOPE'|
  'GTT_PARENT_ABSENT_OR_WRONG_IDENTITY'|
  'MICROSECOND_GTT_CREATED_EXPIRES_EVIDENCE_MISSING_OR_INVALID'|
  'CONTRACT_EXPIRY_CALENDAR_INPUT_MISSING_OR_INVALID'|
  'REVIEW_CLOCK_INVALID_OR_BEFORE_BROKER_CREATION'|
  'BROKER_GTT_ALREADY_EXPIRED_AT_REVIEW'|
  'ASSERTED_FO_CONTRACT_EXPIRES_BEFORE_HOLD_END'|
  'BROKER_GTT_EXPIRES_BEFORE_HOLD_END'|
  'BROKER_GTT_EXPIRES_AFTER_ASSERTED_CONTRACT_EXPIRY'|
  'BROKER_REPORTED_GTT_HORIZON_OVERLAP_NOT_PROTECTIVE_STOP';
export interface GttHorizonAuditScope{
  instrumentKey:string;
  gttOrderId:string;
  product:'NRML';
  selectedWeeks:1|2|4|8;
  // Date strings are externally supplied and must remain UNVERIFIED;
  // a raw input is NOT a signed effective-dated exchange calendar.
  expectedContractExpiryUtc:string;
  reviewedAtUtc:string;
}
export interface GttHorizonAuditReport{
  state:GttHorizonAuditState;
  reasonCodes:readonly string[];
  selectedWeeks:1|2|4|8|null;
  brokerReportedGttCreatedAtMs:number|null;
  brokerReportedGttExpiresAtMs:number|null;
  assertedContractExpiryAtMs:number|null;
  nominalHoldingEndAtMs:number|null;
  gttTimestampUnitsVerifiedAsMicroseconds:boolean;
  brokerTimestampIsNotExchangeCalendar:true;
  nominalWeeksAreNotExchangeSessions:true;
  assertedContractExpiryIndependentlyVerified:false;
  clockSourceIndependentlyAttested:false;
  actualOptionsContractMasterAndLotVerified:false;
  exchangeNativeStopAckVerified:false;
  noShortCloseOnlyBrokerPermissionVerified:false;
  persistentOvernightStopCoverageCertified:false;
  futureGapExitExecutionGuaranteed:false;
  independentlySignedOptionTradesVerified:false;
  realisedPnlWriteAuthorized:false;
  automaticPositionClosureAuthorized:false;
  duplicateSellRetryAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}
type Fields=Pick<GttHorizonAuditReport,
  'selectedWeeks'|'brokerReportedGttCreatedAtMs'|
  'brokerReportedGttExpiresAtMs'|'assertedContractExpiryAtMs'|
  'nominalHoldingEndAtMs'|'gttTimestampUnitsVerifiedAsMicroseconds'>;
const result=(state:GttHorizonAuditState,reasons:string[],
  f:Partial<Fields>={}):GttHorizonAuditReport=>({
  state,reasonCodes:[...new Set(reasons)].sort(),
  selectedWeeks:f.selectedWeeks??null,
  brokerReportedGttCreatedAtMs:f.brokerReportedGttCreatedAtMs??null,
  brokerReportedGttExpiresAtMs:f.brokerReportedGttExpiresAtMs??null,
  assertedContractExpiryAtMs:f.assertedContractExpiryAtMs??null,
  nominalHoldingEndAtMs:f.nominalHoldingEndAtMs??null,
  gttTimestampUnitsVerifiedAsMicroseconds:
    f.gttTimestampUnitsVerifiedAsMicroseconds===true,
  brokerTimestampIsNotExchangeCalendar:true,
  nominalWeeksAreNotExchangeSessions:true,
  assertedContractExpiryIndependentlyVerified:false,
  clockSourceIndependentlyAttested:false,
  actualOptionsContractMasterAndLotVerified:false,
  exchangeNativeStopAckVerified:false,
  noShortCloseOnlyBrokerPermissionVerified:false,
  persistentOvernightStopCoverageCertified:false,
  futureGapExitExecutionGuaranteed:false,
  independentlySignedOptionTradesVerified:false,
  realisedPnlWriteAuthorized:false,
  automaticPositionClosureAuthorized:false,
  duplicateSellRetryAuthorized:false,
  liveNrmlBuyAuthorized:false,brokerWrites:0,localWrites:0
});
/**
 * This result can NEVER authorize any trading/write. A passing horizon
 * overlap means only that the caller's unverified expiry clock and
 * broker-reported microsecond fields are temporally consistent.
 * It does NOT establish the GTT will still exist or execute.
 */
export function auditGttNrmlSelectedHorizonExpiry(
  scope:GttHorizonAuditScope,
  brokerGtt:unknown
):GttHorizonAuditReport{
  if(!scope||!validOption(scope.instrumentKey)||
     !validGttId(scope.gttOrderId)||scope.product!=='NRML'||
     ![1,2,4,8].includes(scope.selectedWeeks))
    return result('INVALID_OPTION_HORIZON_OR_SCOPE',
      ['NRML_FO_OPTION_OR_GTT_SCOPE_NOT_BOUND']);
  const fields:Partial<Fields>={selectedWeeks:scope.selectedWeeks};
  if(!obj(brokerGtt)||brokerGtt.gtt_order_id!==scope.gttOrderId||
     brokerGtt.instrument_token!==scope.instrumentKey||
     brokerGtt.product!=='D'||brokerGtt.type!=='SINGLE'||
     brokerGtt.quantity===undefined||
     !Number.isSafeInteger(brokerGtt.quantity)||
     (brokerGtt.quantity as number)<=0||
     !Array.isArray(brokerGtt.rules)||
     brokerGtt.rules.length!==1||!obj(brokerGtt.rules[0])||
     brokerGtt.rules[0].strategy!=='ENTRY'||
     brokerGtt.rules[0].transaction_type!=='SELL'||
     brokerGtt.rules[0].trigger_type!=='BELOW')
    return result('GTT_PARENT_ABSENT_OR_WRONG_IDENTITY',
      ['EXACT_OPTION_SINGLE_ENTRY_SELL_BELOW_GTT_PARENT_REQUIRED'],fields);
  if(!microseconds(brokerGtt.created_at)||
     !microseconds(brokerGtt.expires_at)||
     brokerGtt.created_at>=brokerGtt.expires_at)
    return result('MICROSECOND_GTT_CREATED_EXPIRES_EVIDENCE_MISSING_OR_INVALID',
      ['BROKER_GTT_MICROSECONDS_MISSING_SECONDS_MS_OR_REVERSED'],fields);
  fields.gttTimestampUnitsVerifiedAsMicroseconds=true;
  const created=Math.floor(brokerGtt.created_at/1000);
  const expires=Math.floor(brokerGtt.expires_at/1000);
  fields.brokerReportedGttCreatedAtMs=created;
  fields.brokerReportedGttExpiresAtMs=expires;
  const contract=utc(scope.expectedContractExpiryUtc);
  if(contract===null)
    return result('CONTRACT_EXPIRY_CALENDAR_INPUT_MISSING_OR_INVALID',
      ['CALLER_EXPIRY_INPUT_INVALID_OR_EXCHANGE_CALENDAR_NOT_PROVIDED'],fields);
  fields.assertedContractExpiryAtMs=contract;
  const now=utc(scope.reviewedAtUtc);
  if(now===null||now<created)
    return result('REVIEW_CLOCK_INVALID_OR_BEFORE_BROKER_CREATION',
      ['REVIEW_UTC_CLOCK_INVALID_OR_PRECEDES_GTT_CREATION'],fields);
  const horizonEnd=now+scope.selectedWeeks*7*24*60*60*1000;
  if(!Number.isSafeInteger(horizonEnd)||horizonEnd>=lastUs/1000)
    return result('INVALID_OPTION_HORIZON_OR_SCOPE',
      ['NOMINAL_HOLDING_WINDOW_OVERFLOWS_SUPPORTED_CLOCK'],fields);
  fields.nominalHoldingEndAtMs=horizonEnd;
  if(now>=expires)
    return result('BROKER_GTT_ALREADY_EXPIRED_AT_REVIEW',
      ['BROKER_REPORTED_GTT_EXPIRED_NO_CURRENT_TRIGGER_PROTECTION'],fields);
  if(contract<=now||contract<horizonEnd)
    return result('ASSERTED_FO_CONTRACT_EXPIRES_BEFORE_HOLD_END',
      ['SELECTED_WEEKS_OUTRUN_ASSERTED_OPTION_EXPIRY'],fields);
  if(expires<horizonEnd)
    return result('BROKER_GTT_EXPIRES_BEFORE_HOLD_END',
      ['BROKER_GTT_HORIZON_UNDERCOVERS_SELECTED_HOLD'],fields);
  if(expires>contract)
    return result('BROKER_GTT_EXPIRES_AFTER_ASSERTED_CONTRACT_EXPIRY',
      ['GTT_EXPIRY_DISAGREES_WITH_SUPPLIED_OPTION_EXPIRY'],fields);
  return result('BROKER_REPORTED_GTT_HORIZON_OVERLAP_NOT_PROTECTIVE_STOP',[
    'BROKER_GTT_MICROSECOND_EXPIRY_NOT_EXCHANGE_NATIVE_STOP',
    'UNATTESTED_EXCHANGE_CALENDAR_AND_REVIEW_CLOCK',
    'NOMINAL_CALENDAR_WEEKS_DO_NOT_CERTIFY_FO_SESSIONS',
    'LIMIT_SELL_AT_TRIGGER_CAN_REJECT_GAP_OR_REMAIN_UNFILLED'
  ],fields);
}
