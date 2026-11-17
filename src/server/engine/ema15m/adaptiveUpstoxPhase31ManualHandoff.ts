/**
 * Adaptive Swing v2 Phase31 — deterministic MANUAL ONLY positional session
 * handoff and expiry-risk playbook. Zero side effects / broker operations.
 *
 * Do not share the MIS 15:15 intraday exit policy with NRML 1–8W options.
 * Current-day order-history and historical FILLS are different evidence.
 */
import type {
  ReadOnlyExpectedPosition
} from './adaptiveReadOnlyNrmlProtectionAudit.js';
import type {
  Phase30ShadowReview
} from './adaptiveUpstoxPhase30ShadowDossier.js';
import type {
  OfflineHistoricalFoAuditReport
} from './adaptiveUpstoxPhase31HistoricalFoFills.js';

export interface Phase31SessionHandoffInput {
  schemaVersion:'ADAPTIVE_V2_PHASE31_NRML_MANUAL_HANDOFF_V1';
  expected:ReadOnlyExpectedPosition;
  shadow:Phase30ShadowReview;
  historicalFills:OfflineHistoricalFoAuditReport;
  asOf:string;
  session:'OPEN'|'PREOPEN'|'CLOSED'|'UNKNOWN';
  /** Externally supplied effective-date calendar, still UNVERIFIED here. */
  assertedEffectiveExpiry:string;
  minCalendarDaysBeforeExpiry:number;
}
export interface Phase31ManualHandoffReport {
  mode:'ADAPTIVE_V2_NRML_SHADOW_MANUAL_SESSION_HANDOFF';
  status:'INVALID_INPUT'|'HUMAN_ESCALATION_REQUIRED'|
    'SHADOW_OBSERVATION_ONLY_UNVERIFIED';
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  protectedOvernight:false;
  nativeOrderInstruction:null;
  manualExitRequiredToBeDecidedByHuman:true;
  auto1515PositionalExit:false;
  reasons:string[];
  requiredOperatorReviews:string[];
  calendarDaysUntilAssertedExpiry:number|null;
  expectedContractQuantity:number|null;
  warnings:string[];
}
const base=():Phase31ManualHandoffReport=>({
  mode:'ADAPTIVE_V2_NRML_SHADOW_MANUAL_SESSION_HANDOFF',
  status:'INVALID_INPUT',executionAuthorized:false,
  productionSafe:false,brokerAuthenticated:false,
  brokerStopInstalled:false,protectedOvernight:false,
  nativeOrderInstruction:null,manualExitRequiredToBeDecidedByHuman:true,
  auto1515PositionalExit:false,reasons:[],requiredOperatorReviews:[],
  calendarDaysUntilAssertedExpiry:null,
  expectedContractQuantity:null,warnings:[
    'EXCHANGE_CALENDAR_IS_OPERATOR_ASSERTED_NOT_SOURCE_AUTHENTICATED',
    'NRML_POSITIONAL_15_15_AUTO_SQUARE_OFF_FORBIDDEN',
    'HISTORICAL_FILLS_CANNOT_PROVE_OVERNIGHT_STOP_SURVIVAL',
    'NO_BROKER_NATIVE_STOP_PLACEMENT_OR_EXIT_INSTRUCTIONS',
    'BROKER_STATIC_IP_ACCOUNT_OWNERSHIP_AND_FILLS_NOT_INDEPENDENTLY_ATTESTED'
  ]
});
const date=(v:unknown):v is string=>{
  if(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v))return false;
  const millis=Date.parse(v+'T00:00:00.000Z');
  return Number.isFinite(millis)&&new Date(millis).toISOString()
    .slice(0,10)===v;
};
const time=(v:unknown):number=>
  typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&
  /(Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
const reason=(rs:string[],r:string)=>{if(!rs.includes(r))rs.push(r);};
/** An operator playbook only: never generates even a synthetic order. */
export function assessPhase31ManualNrmlHandoff(
  input:Phase31SessionHandoffInput
):Phase31ManualHandoffReport{
  const r=base();
  if(!input||input.schemaVersion!==
    'ADAPTIVE_V2_PHASE31_NRML_MANUAL_HANDOFF_V1'||
    !input.expected||input.expected.productType!=='NRML'||
    !/^(NSE_FO|BSE_FO)\|/.test(input.expected.instrumentKey)||
    !Number.isSafeInteger(input.expected.expectedNetLongQuantity)||
    input.expected.expectedNetLongQuantity<0||
    !Number.isSafeInteger(input.expected.lotSize)||
    input.expected.lotSize<=0||
    input.expected.expectedNetLongQuantity%input.expected.lotSize!==0||
    !date(input.expected.expiry)||!date(input.assertedEffectiveExpiry)||
    !Number.isFinite(time(input.asOf))||
    !Number.isInteger(input.minCalendarDaysBeforeExpiry)||
    input.minCalendarDaysBeforeExpiry<1||
    input.minCalendarDaysBeforeExpiry>30||
    !['OPEN','PREOPEN','CLOSED','UNKNOWN'].includes(input.session)||
    !input.shadow||!input.historicalFills)
    return {...r,reasons:['INVALID_MANUAL_HANDOFF_SCOPE_OR_RISK_POLICY']};
  const asOfDay=new Date(time(input.asOf)+330*60_000)
    .toISOString().slice(0,10);
  const remainingDays=Math.round((
    Date.parse(input.assertedEffectiveExpiry+'T00:00:00.000Z')-
    Date.parse(asOfDay+'T00:00:00.000Z'))/86400000);
  const rs:string[]=[];
  const reviews=new Set<string>([
    'CONFIRM_ACCOUNT_OWNERSHIP_STATIC_IP_AND_READ_ONLY_SOURCE_CHAIN',
    'OBTAIN_INDEPENDENT_NATIVE_STOP_ORDER_ACK_AND_FULL_CHANGE_HISTORY',
    'REVIEW_POSITION_SIZE_GAP_AND_LOT_WITH_AUTHORIZED_HUMAN_OPERATOR'
  ]);
  if(input.assertedEffectiveExpiry!==input.expected.expiry){
    reason(rs,'EXPECTED_OPTION_EXPIRY_DISAGREES_WITH_ASSERTED_CALENDAR');
    reviews.add('OBTAIN_INDEPENDENT_EFFECTIVE_DATED_EXCHANGE_EXPIRY_NOTICE');
  }
  if(remainingDays<=input.minCalendarDaysBeforeExpiry){
    reason(rs,remainingDays<=0?'EXPIRY_DATE_REACHED_OR_PASSED':
      'EXPIRY_WITHIN_LOCKED_MANUAL_REVIEW_BUFFER');
    reviews.add('URGENT_HUMAN_EXPIRY_MANAGEMENT_NO_AUTO_LIQUIDATION');
    reviews.add('CHECK_EXCHANGE_CONTRACT_SETTLEMENT_AND_TRADING_CUTOFF');
  }
  if(input.session!=='OPEN'){
    reason(rs,'SESSION_NOT_CONFIRMED_OPEN_FOR_NRML_POSITION');
    reviews.add('VALIDATE_AUTHORITATIVE_SESSION_OPEN_CLOSE_AND_RESTART_GAPS');
  }
  if(input.expected.expectedNetLongQuantity>0&&input.session==='CLOSED'){
    reason(rs,'OVERNIGHT_OPEN_NRML_LONG_POSITION_REQUIRES_HUMAN_REVIEW');
    reviews.add('HUMAN_OWNED_OVERNIGHT_GAP_STRESS_AND_RISK_LIMIT_REVIEW');
  }
  if(input.shadow.status!=='SHADOW_REVIEW_ONLY_UNVERIFIED'||
    input.shadow.brokerAuthenticated!==false||
    input.shadow.executionAuthorized!==false||
    input.shadow.brokerStopInstalled!==false||
    input.shadow.protectedOvernight!==false){
    reason(rs,'SHADOW_CAPTURE_OR_PROTECTION_EVIDENCE_NOT_ACCEPTABLE');
    reviews.add('RECOLLECT_PRIVATE_SIGNED_ORDER_POSITION_GTT_EVIDENCE');
  }
  if(input.historicalFills.status!==
      'HISTORICAL_FILLS_RECONCILED_UNVERIFIED'||
    !input.historicalFills.paginationComplete||
    input.historicalFills.closingNetQuantity!==
      input.expected.expectedNetLongQuantity){
    reason(rs,'FILL_HISTORY_OR_END_POSITION_NOT_RECONCILED');
    reviews.add('RECONCILE_COMPLETE_HISTORICAL_FO_TRADE_PAGES');
  }
  if(input.historicalFills.rangeSpansMultipleIndiaDates){
    reason(rs,'MULTI_DAY_FILLS_DO_NOT_ESTABLISH_NATIVE_STOP_SURVIVAL');
    reviews.add('OBTAIN_BROKER_NATIVE_STOP_CANCEL_REPLACE_AND_SESSION_LOGS');
  }
  if(input.expected.expectedNetLongQuantity===0){
    reviews.add('VERIFY_NO_ORPHAN_PROTECTIVE_SELL_OR_GTT_REMAINS');
  }
  const issue=rs.length>0;
  if(issue)reviews.add('ESCALATE_TO_HUMAN_RISK_OWNER_AND_FREEZE_NEW_NRML_ENTRIES');
  reviews.add('NO_AUTOMATED_NRML_SQUARE_OFF_AT_15_15');
  return {...r,
    status:issue?'HUMAN_ESCALATION_REQUIRED':
      'SHADOW_OBSERVATION_ONLY_UNVERIFIED',
    reasons:rs,requiredOperatorReviews:[...reviews],
    calendarDaysUntilAssertedExpiry:remainingDays,
    expectedContractQuantity:input.expected.expectedNetLongQuantity
  };
}
