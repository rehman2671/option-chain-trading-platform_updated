/**
 * Phase122: pure, read-only reconciliation of a caller-asserted SINGLE
 * original NRML option BUY execution instant against the selected 1/2/4/8
 * calendar-week holding deadline, exact GTT microseconds and an
 * UNATTESTED option contract-expiry timestamp.
 *
 * Phase121 intentionally plans from REVIEW time. Do NOT use that rolling
 * window as the original option entry's fixed holding end on restart.
 *
 * All source timestamps, the exact original BUY identity and current net
 * are supplied by a caller: this audit does not attest them, validate a
 * broker's complete executions, or authorize an order / auto exit / P&L.
 * This is deliberately for ONE asserted original BUY fill only. More
 * fills/averaging in require a separate exact fill-cohort review.
 *
 * No wall-clock reads, broker HTTP, storage, public routes, or mutations.
 */
import {validUpstoxGttTimeFieldsIfPresent} from
  './adaptiveNrmlGttExpiryHorizonReadOnlyAudit.js';

type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>
  !!x&&typeof x==='object'&&!Array.isArray(x);
const firstMs=946684800000; // 2000-01-01T00:00:00.000Z
const lastMs=4102444800000; // 2100-01-01T00:00:00.000Z
const weekMs=7*86_400_000;
const isoUtc=(x:unknown):number|null=>{
  if(typeof x!=='string'||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x))
    return null;
  const ms=Date.parse(x);
  return Number.isSafeInteger(ms)&&ms>=firstMs&&ms<lastMs&&
    new Date(ms).toISOString()===x?ms:null;
};
const option=(x:unknown):x is string=>
  typeof x==='string'&&/^(?:NSE_FO|BSE_FO)\|[A-Za-z0-9_-]{1,240}$/.test(x);
const gttId=(x:unknown):x is string=>
  typeof x==='string'&&/^GTT-[A-Za-z0-9-]{1,124}$/.test(x);
const orderId=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const positiveInt=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const us=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&
  x>=firstMs*1000&&x<lastMs*1000;

export interface OriginalBuyAnchoredGttScope{
  instrumentKey:string;
  gttOrderId:string;
  originalBuyOrderId:string;
  product:'NRML';
  selectedWeeks:1|2|4|8;
  /** Only ONE asserted original BUY fill; subsequent fills need a new cohort. */
  assertedOriginalBuyFillCount:1;
  assertedOriginalBuyQuantity:number;
  assertedLotSize:number;
  assertedCurrentNetLongQuantity:number;
  /** Explicitly unverified original BUY execution UTC, NOT local journal creation. */
  assertedOriginalBuyExecutedAtUtc:string;
  /** Explicitly unverified reviewer UTC; clock is not independently attested. */
  reviewedAtUtc:string;
  /** Explicitly unverified effective-dated contract expiry UTC. */
  assertedContractExpiryUtc:string;
}
export type OriginalBuyAnchoredGttState=
  'INVALID_ORIGINAL_BUY_OPTION_OR_QUANTITY_SCOPE'|
  'ORIGINAL_BUY_REVIEW_OR_CONTRACT_UTC_INVALID'|
  'ORIGINAL_BUY_IN_FUTURE_OR_HORIZON_OVERFLOW'|
  'BROKER_GTT_PARENT_SCOPE_OR_RULE_MISMATCH'|
  'BROKER_GTT_MICROSECOND_EVIDENCE_INVALID'|
  'BROKER_GTT_CREATED_AFTER_REVIEW'|
  'BROKER_GTT_NOT_SCHEDULED_OR_CHILD_EXISTS'|
  'ORIGINAL_ENTRY_HOLDING_WINDOW_ALREADY_ELAPSED'|
  'BROKER_GTT_ALREADY_EXPIRED_AT_REVIEW'|
  'ASSERTED_CONTRACT_ALREADY_EXPIRED_AT_REVIEW'|
  'ASSERTED_CONTRACT_EXPIRES_BEFORE_ENTRY_HOLD_END'|
  'BROKER_GTT_EXPIRES_BEFORE_ENTRY_HOLD_END'|
  'BROKER_GTT_EXPIRES_AFTER_ASSERTED_CONTRACT_EXPIRY'|
  'GTT_PREEXISTED_ASSERTED_BUY_SHORT_RISK_UNVERIFIED'|
  'GTT_CREATED_AFTER_ASSERTED_BUY_COVERAGE_GAP'|
  'ORIGINAL_BUY_ANCHORED_TEMPORAL_OVERLAP_NO_NATIVE_STOP';

export interface OriginalBuyAnchoredGttReport{
  state:OriginalBuyAnchoredGttState;
  reasonCodes:readonly string[];
  selectedWeeks:1|2|4|8|null;
  assertedOriginalBuyAtMs:number|null;
  reviewedAtMs:number|null;
  originalBuyAnchoredHoldEndMs:number|null;
  rollingReviewAnchoredHoldEndMs:number|null;
  assertedContractExpiresAtMs:number|null;
  brokerGttCreatedAtUs:number|null;
  brokerGttExpiresAtUs:number|null;
  gttCreatedAfterBuyGapUs:number|null;
  originalBuyExecutionIndependentlyVerified:false;
  exactBuyFillCohortAndAccountIndependentlyVerified:false;
  currentNetLongIndependentlyVerified:false;
  assertedContractExpiryIndependentlyVerified:false;
  clockSourceIndependentlyAttested:false;
  gttAccountWideContinuityVerified:false;
  specificOptionGttSellEligibleVerified:false;
  exchangeNativeStopAckVerified:false;
  persistentOvernightProtectionCertified:false;
  futureGapFillGuaranteed:false;
  positional1515ForcedSquareOff:false;
  duplicateSellAuthorized:false;
  brokerOrderGttWriteAuthorized:false;
  autoPositionClosureAuthorized:false;
  realisedPnlWriteAuthorized:false;
  liveNrmlBuyAuthorized:false;
  brokerWrites:0;
  localWrites:0;
}

type Data=Partial<Pick<OriginalBuyAnchoredGttReport,
  'selectedWeeks'|'assertedOriginalBuyAtMs'|'reviewedAtMs'|
  'originalBuyAnchoredHoldEndMs'|'rollingReviewAnchoredHoldEndMs'|
  'assertedContractExpiresAtMs'|'brokerGttCreatedAtUs'|
  'brokerGttExpiresAtUs'|'gttCreatedAfterBuyGapUs'>>;
const report=(state:OriginalBuyAnchoredGttState,reason:string,
  d:Data={}):OriginalBuyAnchoredGttReport=>({
  state,reasonCodes:[reason],
  selectedWeeks:d.selectedWeeks??null,
  assertedOriginalBuyAtMs:d.assertedOriginalBuyAtMs??null,
  reviewedAtMs:d.reviewedAtMs??null,
  originalBuyAnchoredHoldEndMs:d.originalBuyAnchoredHoldEndMs??null,
  rollingReviewAnchoredHoldEndMs:d.rollingReviewAnchoredHoldEndMs??null,
  assertedContractExpiresAtMs:d.assertedContractExpiresAtMs??null,
  brokerGttCreatedAtUs:d.brokerGttCreatedAtUs??null,
  brokerGttExpiresAtUs:d.brokerGttExpiresAtUs??null,
  gttCreatedAfterBuyGapUs:d.gttCreatedAfterBuyGapUs??null,
  originalBuyExecutionIndependentlyVerified:false,
  exactBuyFillCohortAndAccountIndependentlyVerified:false,
  currentNetLongIndependentlyVerified:false,
  assertedContractExpiryIndependentlyVerified:false,
  clockSourceIndependentlyAttested:false,
  gttAccountWideContinuityVerified:false,
  specificOptionGttSellEligibleVerified:false,
  exchangeNativeStopAckVerified:false,
  persistentOvernightProtectionCertified:false,
  futureGapFillGuaranteed:false,
  positional1515ForcedSquareOff:false,
  duplicateSellAuthorized:false,
  brokerOrderGttWriteAuthorized:false,
  autoPositionClosureAuthorized:false,
  realisedPnlWriteAuthorized:false,
  liveNrmlBuyAuthorized:false,brokerWrites:0,localWrites:0
});

/** A favorable state is only a consistent caller-supplied time comparison. */
export function auditOriginalBuyAnchoredGttHorizonReadOnly(
  scope:OriginalBuyAnchoredGttScope,brokerGtt:unknown
):OriginalBuyAnchoredGttReport{
  if(!scope||!option(scope.instrumentKey)||!gttId(scope.gttOrderId)||
     !orderId(scope.originalBuyOrderId)||scope.product!=='NRML'||
     ![1,2,4,8].includes(scope.selectedWeeks)||
     scope.assertedOriginalBuyFillCount!==1||
     !positiveInt(scope.assertedOriginalBuyQuantity)||
     !positiveInt(scope.assertedLotSize)||
     !positiveInt(scope.assertedCurrentNetLongQuantity)||
     scope.assertedOriginalBuyQuantity%scope.assertedLotSize!==0||
     scope.assertedCurrentNetLongQuantity%scope.assertedLotSize!==0||
     scope.assertedCurrentNetLongQuantity>scope.assertedOriginalBuyQuantity)
    return report('INVALID_ORIGINAL_BUY_OPTION_OR_QUANTITY_SCOPE',
      'ONE_ASSERTED_BUY_FILL_NRML_FO_EXACT_CONTRACT_LOT_AND_NET_REQUIRED');
  const d:Data={selectedWeeks:scope.selectedWeeks};
  const buy=isoUtc(scope.assertedOriginalBuyExecutedAtUtc);
  const review=isoUtc(scope.reviewedAtUtc);
  const contract=isoUtc(scope.assertedContractExpiryUtc);
  if(buy===null||review===null||contract===null)
    return report('ORIGINAL_BUY_REVIEW_OR_CONTRACT_UTC_INVALID',
      'STRICT_CANONICAL_UTC_OR_EXCHANGE_MASTER_UNAVAILABLE',d);
  d.assertedOriginalBuyAtMs=buy;
  d.reviewedAtMs=review;
  d.assertedContractExpiresAtMs=contract;
  const end=buy+scope.selectedWeeks*weekMs;
  const rolling=review+scope.selectedWeeks*weekMs;
  if(review<buy||!Number.isSafeInteger(end)||end>=lastMs||
     !Number.isSafeInteger(rolling)||rolling>=lastMs)
    return report('ORIGINAL_BUY_IN_FUTURE_OR_HORIZON_OVERFLOW',
      'ORIGINAL_BUY_AFTER_REVIEW_OR_HOLDING_WINDOW_OVERFLOWS',d);
  d.originalBuyAnchoredHoldEndMs=end;
  d.rollingReviewAnchoredHoldEndMs=rolling; // diagnostic ONLY; never substitute.
  if(!obj(brokerGtt)||brokerGtt.gtt_order_id!==scope.gttOrderId||
     brokerGtt.instrument_token!==scope.instrumentKey||
     brokerGtt.exchange!==scope.instrumentKey.split('|',1)[0]||
     brokerGtt.product!=='D'||brokerGtt.type!=='SINGLE'||
     brokerGtt.quantity!==scope.assertedCurrentNetLongQuantity||
     !Array.isArray(brokerGtt.rules)||brokerGtt.rules.length!==1||
     !obj(brokerGtt.rules[0])||
     brokerGtt.rules[0].strategy!=='ENTRY'||
     brokerGtt.rules[0].transaction_type!=='SELL'||
     brokerGtt.rules[0].trigger_type!=='BELOW'||
     typeof brokerGtt.rules[0].trigger_price!=='number'||
     !Number.isFinite(brokerGtt.rules[0].trigger_price)||
     brokerGtt.rules[0].trigger_price<=0)
    return report('BROKER_GTT_PARENT_SCOPE_OR_RULE_MISMATCH',
      'EXACT_SINGLE_NRML_OPTION_SELL_BELOW_AND_REMAINING_NET_REQUIRED',d);
  if(!validUpstoxGttTimeFieldsIfPresent(brokerGtt)||
     !us(brokerGtt.created_at)||!us(brokerGtt.expires_at))
    return report('BROKER_GTT_MICROSECOND_EVIDENCE_INVALID',
      'CREATED_EXPIRES_UNSAFE_MISSING_WRONG_UNIT_OR_REVERSED',d);
  const created=brokerGtt.created_at;
  const expires=brokerGtt.expires_at;
  d.brokerGttCreatedAtUs=created;
  d.brokerGttExpiresAtUs=expires;
  const reviewUs=review*1000;
  const buyUs=buy*1000;
  const endUs=end*1000;
  const contractUs=contract*1000;
  if(created>reviewUs)
    return report('BROKER_GTT_CREATED_AFTER_REVIEW',
      'EXACT_MICROSECOND_GTT_CREATION_AFTER_REVIEW_CLOCK',d);
  const rule=brokerGtt.rules[0];
  if(rule.status!=='SCHEDULED'||rule.order_id!==null)
    return report('BROKER_GTT_NOT_SCHEDULED_OR_CHILD_EXISTS',
      'RULE_NOT_SCHEDULED_OR_GENERATED_LIMIT_CHILD_EXISTS',d);
  if(reviewUs>=endUs)
    return report('ORIGINAL_ENTRY_HOLDING_WINDOW_ALREADY_ELAPSED',
      'DO_NOT_RESET_HOLDING_START_ON_RESTART_OR_NEW_REVIEW',d);
  if(expires<=reviewUs)
    return report('BROKER_GTT_ALREADY_EXPIRED_AT_REVIEW',
      'GTT_EXPIRY_EQUAL_OR_BEFORE_REVIEW_MICROSECOND',d);
  if(contractUs<=reviewUs)
    return report('ASSERTED_CONTRACT_ALREADY_EXPIRED_AT_REVIEW',
      'ASSERTED_CONTRACT_EXPIRY_EQUAL_OR_BEFORE_REVIEW',d);
  if(contractUs<endUs)
    return report('ASSERTED_CONTRACT_EXPIRES_BEFORE_ENTRY_HOLD_END',
      'SELECTED_WEEKS_OUTRUN_CALLER_ASSERTED_OPTION_EXPIRY',d);
  if(expires<endUs)
    return report('BROKER_GTT_EXPIRES_BEFORE_ENTRY_HOLD_END',
      'GTT_MICROSECOND_EXPIRY_SHORTER_THAN_ORIGINAL_ENTRY_HORIZON',d);
  if(expires>contractUs)
    return report('BROKER_GTT_EXPIRES_AFTER_ASSERTED_CONTRACT_EXPIRY',
      'BROKER_GTT_MICROSECOND_EXPIRY_BEYOND_UNATTESTED_OPTION_EXPIRY',d);
  if(created<buyUs)
    return report('GTT_PREEXISTED_ASSERTED_BUY_SHORT_RISK_UNVERIFIED',
      'GTT_SELL_EXISTED_BEFORE_ORIGINAL_BUY_ORPHAN_SHORT_RISK',d);
  if(created>buyUs){
    d.gttCreatedAfterBuyGapUs=created-buyUs;
    return report('GTT_CREATED_AFTER_ASSERTED_BUY_COVERAGE_GAP',
      'ORIGINAL_BUY_TO_GTT_CREATION_INTERVAL_NOT_PROTECTED',d);
  }
  return report('ORIGINAL_BUY_ANCHORED_TEMPORAL_OVERLAP_NO_NATIVE_STOP',
    'ANCHORED_HORIZON_ONLY_NOT_BROKER_OR_EXCHANGE_STOP',d);
}
