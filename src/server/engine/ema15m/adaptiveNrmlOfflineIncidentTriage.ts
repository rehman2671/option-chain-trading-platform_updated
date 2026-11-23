/**
 * Phase128 — pure, offline, HALT-ONLY NRML manual incident triage.
 *
 * Integrates Phase127 eight-read account census directly from operator
 * snapshots, not from a caller-provided or JSON-forged "successful" report.
 *
 * A report is a recommendation for manual review, not an operational
 * kill-switch acknowledgement and NEVER a broker instruction.
 * No Upstox calls, broker writes, database writes, time reads or routes.
 * An old snapshot, partial fill, UNKNOWN ACK, reconnect, missing GTT or
 * GTT/BUY same-second ambiguity MUST NOT become automatic SELL/close.
 */
import {
  auditBraidedNrmlAccountReadsReadOnly,
  type BraidedAccountInput,
  type BraidedAccountState
} from './adaptiveBraidedNrmlAccountReadsReadOnly.js';

const id=(v:unknown):v is string=>
  typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const utc=(v:unknown):number|null=>{
  if(typeof v!=='string'||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))
    return null;
  const ms=Date.parse(v);
  return Number.isSafeInteger(ms)&&
    ms>=946684800000&&ms<4102444800000&&
    new Date(ms).toISOString()===v?ms:null;
};
export type NrmlIncidentKind=
  'REGULAR_READ_REVIEW'|'BROKER_RECONNECT'|
  'RESTART_RECOVERY'|'BUY_PARTIAL_FILL'|
  'SELL_CHILD_UNKNOWN_ACK'|'OVERNIGHT_GAP'|
  'GTT_PARENT_MISSING'|'EXPIRY_APPROACHING';

export interface OfflineNrmlIncidentInput{
  schemaVersion:'ADAPTIVE_NRML_PHASE128_HALT_TRIAGE_V1';
  /** Unique operator-supplied label; not an authenticated ticket or UUID. */
  incidentRef:string;
  incidentKind:NrmlIncidentKind;
  assessmentAtUtc:string;
  /** Max age of the final observed source receipt vs review moment. */
  maximumSourceAgeSeconds:number;
  /** Protected issue #20 release override is NEVER accepted. */
  scope:'EXISTING_NRML_OPTION_LONG_ONLY';
  captureOrigin:'OPERATOR_SUPPLIED_UNATTESTED';
  braided:BraidedAccountInput;
}
export type OfflineNrmlIncidentState=
  'INVALID_INCIDENT_SCOPE_OR_SOURCE_CLOCK'|
  'BROKER_SNAPSHOT_STALE_OR_REVIEW_IN_FUTURE'|
  'BROKER_ORDER_GTT_POSITION_OR_AUTH_SCOPE_CONFLICT'|
  'PARTIAL_FILL_UNKNOWN_ACK_RESTART_OR_GAP_MANUAL_RESPONSE'|
  'CURRENT_EVIDENCE_AMBIGUOUS_MANUAL_RECONCILIATION'|
  'STABLE_BUT_UNATTESTED_HUMAN_ONLY_REVIEW';

export type ManualNrmlAction=
  'FREEZE_NEW_NRML_ENTRIES_MANUALLY'|
  'DO_NOT_RETRY_SELL_OR_CANCEL_REPLACE_FROM_OFFLINE_REPORT'|
  'DO_NOT_WRITE_CLOSED_POSITION_OR_REALIZED_PNL'|
  'DO_NOT_APPLY_MIS_1515_SQUAREOFF_TO_NRML'|
  'CONTACT_BROKER_AND_DESIGNATED_HUMAN_RISK_OPERATOR'|
  'VERIFY_CURRENT_BROKER_NET_ACTIVE_ORDERS_GTT_AND_CHILD_FILLS_OUT_OF_BAND'|
  'REQUIRE_INDEPENDENT_ORIGINAL_OPTION_L1_AND_EXCHANGE_CALENDAR_REVIEW'|
  'PRESERVE_RAW_AUTHENTIC_BROKER_AND_EXCHANGE_EVIDENCE_PRIVATELY';
export interface OfflineNrmlIncidentReport{
  state:OfflineNrmlIncidentState;
  reasonCodes:readonly string[];
  phase127State:BraidedAccountState|null;
  observedEvidenceAgeMs:number|null;
  incidentIsManualReviewNotBrokerInstruction:true;
  operatorActionSuggestionsOnly:true;
  operatorFreezeActuallyEngaged:false;
  independentHumanRiskApprovalVerified:false;
  currentBrokerAccountActuallyReAuthenticated:false;
  externalCalendarAndExpiryActuallyVerified:false;
  originalOptionL1LicensedAndBacktested:false;
  brokerStopChildNativeExchangeAckVerified:false;
  closeOnlyNrmlSellNoShortPermissionVerified:false;
  overlappingSellExposureCleared:false;
  overnightGapFillGuaranteed:false;
  originalHistoricalAccountOrderGttHistoryComplete:false;
  liveNrmlBuyAuthorized:false;
  automaticBrokerStopPlacementAuthorized:false;
  automaticExitOrEmergencySellAuthorized:false;
  duplicateSellRetryAuthorized:false;
  autoCloseOrRealisedPnlAuthorized:false;
  nrml1515SquareOffAuthorized:false;
  brokerWrites:0;
  localWrites:0;
  manualActions:readonly ManualNrmlAction[];
}
const universal:readonly ManualNrmlAction[]=[
  'FREEZE_NEW_NRML_ENTRIES_MANUALLY',
  'DO_NOT_RETRY_SELL_OR_CANCEL_REPLACE_FROM_OFFLINE_REPORT',
  'DO_NOT_WRITE_CLOSED_POSITION_OR_REALIZED_PNL',
  'DO_NOT_APPLY_MIS_1515_SQUAREOFF_TO_NRML'
];
function make(
  state:OfflineNrmlIncidentState,reason:string,
  phase127State:BraidedAccountState|null=null,
  evidenceAgeMs:number|null=null
):OfflineNrmlIncidentReport{
  const urgent=state!=='STABLE_BUT_UNATTESTED_HUMAN_ONLY_REVIEW';
  const next:ManualNrmlAction[]=[...universal,
    'VERIFY_CURRENT_BROKER_NET_ACTIVE_ORDERS_GTT_AND_CHILD_FILLS_OUT_OF_BAND',
    'PRESERVE_RAW_AUTHENTIC_BROKER_AND_EXCHANGE_EVIDENCE_PRIVATELY',
    'REQUIRE_INDEPENDENT_ORIGINAL_OPTION_L1_AND_EXCHANGE_CALENDAR_REVIEW'];
  if(urgent)next.push('CONTACT_BROKER_AND_DESIGNATED_HUMAN_RISK_OPERATOR');
  return {
    state,reasonCodes:[reason],phase127State,
    observedEvidenceAgeMs:evidenceAgeMs,
    incidentIsManualReviewNotBrokerInstruction:true,
    operatorActionSuggestionsOnly:true,
    operatorFreezeActuallyEngaged:false,
    independentHumanRiskApprovalVerified:false,
    currentBrokerAccountActuallyReAuthenticated:false,
    externalCalendarAndExpiryActuallyVerified:false,
    originalOptionL1LicensedAndBacktested:false,
    brokerStopChildNativeExchangeAckVerified:false,
    closeOnlyNrmlSellNoShortPermissionVerified:false,
    overlappingSellExposureCleared:false,
    overnightGapFillGuaranteed:false,
    originalHistoricalAccountOrderGttHistoryComplete:false,
    liveNrmlBuyAuthorized:false,
    automaticBrokerStopPlacementAuthorized:false,
    automaticExitOrEmergencySellAuthorized:false,
    duplicateSellRetryAuthorized:false,
    autoCloseOrRealisedPnlAuthorized:false,
    nrml1515SquareOffAuthorized:false,
    brokerWrites:0,localWrites:0,manualActions:next
  };
}
const kinds=new Set<NrmlIncidentKind>([
  'REGULAR_READ_REVIEW','BROKER_RECONNECT',
  'RESTART_RECOVERY','BUY_PARTIAL_FILL',
  'SELL_CHILD_UNKNOWN_ACK','OVERNIGHT_GAP',
  'GTT_PARENT_MISSING','EXPIRY_APPROACHING'
]);
const urgentKinds=new Set<NrmlIncidentKind>([
  'BROKER_RECONNECT','RESTART_RECOVERY','BUY_PARTIAL_FILL',
  'SELL_CHILD_UNKNOWN_ACK','OVERNIGHT_GAP',
  'GTT_PARENT_MISSING','EXPIRY_APPROACHING'
]);
const upstreamIncident=new Set<BraidedAccountState>([
  'BROKER_ACCOUNT_OR_AUTH_EPOCH_CHANGED_BETWEEN_ENDPOINTS',
  'BROKER_RECEIPT_ID_DUPLICATE_OR_READ_CLOCK_REVERSED',
  'ORDERBOOK_CHANGED_WITHIN_FIRST_OR_SECOND_PASS',
  'ORDERBOOK_CHANGED_BETWEEN_PASSES',
  'GTT_PARENT_CHANGED_BETWEEN_PASSES',
  'POSITION_LONG_OR_OTHER_EXPOSURE_CHANGED_BETWEEN_PASSES',
  'BRAID_SOURCE_DIFFERS_FROM_PHASE125_126_ACCOUNT_CENSUS',
  'PHASE126_BUY_CENSUS_OR_GTT_ALREADY_QUARANTINED'
]);

/**
 * This does NOT activate a kill switch in the trading engine. It tells
 * the operator what independent review to do without taking any action.
 * Caller data and signed/venue provenance are always unverified here.
 */
export function triageNrmlOfflineIncidentReadOnly(
  x:OfflineNrmlIncidentInput
):OfflineNrmlIncidentReport{
  const now=utc(x?.assessmentAtUtc);
  const last=utc(x?.braided?.second?.orderAfter?.captureAtUtc);
  const first=utc(x?.braided?.first?.orderBefore?.captureAtUtc);
  const review=utc(x?.braided?.originalBuyAndCensus?.originalBuy
    ?.first?.input?.cohortScope?.reviewedAtUtc);
  if(!x||x.schemaVersion!=='ADAPTIVE_NRML_PHASE128_HALT_TRIAGE_V1'||
     !id(x.incidentRef)||!kinds.has(x.incidentKind)||
     x.scope!=='EXISTING_NRML_OPTION_LONG_ONLY'||
     x.captureOrigin!=='OPERATOR_SUPPLIED_UNATTESTED'||
     !Number.isSafeInteger(x.maximumSourceAgeSeconds)||
     x.maximumSourceAgeSeconds<1||x.maximumSourceAgeSeconds>120||
     now===null||last===null||first===null||review===null)
    return make('INVALID_INCIDENT_SCOPE_OR_SOURCE_CLOCK',
      'EXACT_EXISTING_LONG_UNATTESTED_OPERATOR_SCOPE_AND_UTC_CLOCK_REQUIRED');
  const age=now-last;
  if(age<0||now<review||first>now||
     age>x.maximumSourceAgeSeconds*1000)
    return make('BROKER_SNAPSHOT_STALE_OR_REVIEW_IN_FUTURE',
      'SOURCE_LAST_GET_FUTURE_OR_TOO_OLD_OR_REVIEW_TIME_BEYOND_NOW',
      null,age);
  // Never deserialize a favorable prior report. Re-run the entire pure
  // source-rooted Phase127 audit from the actual supplied raw snapshots.
  const upstream=auditBraidedNrmlAccountReadsReadOnly(x.braided);
  if(upstreamIncident.has(upstream.state)||
     upstream.state==='INVALID_ACCOUNT_BRAID_OR_CAPTURE_WINDOW'||
     upstream.state==='ORDER_GTT_POSITION_GET_ARRAY_MISSING_MALFORMED_OR_UNBOUNDED'||
     upstream.state==='DUPLICATE_ACCOUNT_ORDER_GTT_OR_POSITION_KEY')
    return make('BROKER_ORDER_GTT_POSITION_OR_AUTH_SCOPE_CONFLICT',
      'BROKER_ACCOUNT_ORDER_GTT_POSITION_SOURCE_MOVED_OR_UNVERIFIABLE',
      upstream.state,age);
  if(urgentKinds.has(x.incidentKind))
    return make('PARTIAL_FILL_UNKNOWN_ACK_RESTART_OR_GAP_MANUAL_RESPONSE',
      'INCIDENT_KIND_REQUIRES_BROKER_HUMAN_RECONCILIATION_NO_AUTO_SELL',
      upstream.state,age);
  if(upstream.state!=='EIGHT_SOURCE_READ_BRAID_STABLE_SAME_SECOND_GTT_UNRESOLVED'&&
     upstream.state!=='EIGHT_SOURCE_READ_BRAID_STABLE_NOT_HISTORICALLY_ATTESTED')
    return make('CURRENT_EVIDENCE_AMBIGUOUS_MANUAL_RECONCILIATION',
      'CURRENT_ACCOUNT_GETS_CANNOT_PROVE_HISTORICAL_NRML_STOP_COVER',
      upstream.state,age);
  if(upstream.state==='EIGHT_SOURCE_READ_BRAID_STABLE_SAME_SECOND_GTT_UNRESOLVED')
    return make('CURRENT_EVIDENCE_AMBIGUOUS_MANUAL_RECONCILIATION',
      'SAME_SECOND_BUY_GTT_ORDERING_UNRESOLVED_AND_HISTORICALLY_INCOMPLETE',
      upstream.state,age);
  return make('STABLE_BUT_UNATTESTED_HUMAN_ONLY_REVIEW',
    'NO_VENUE_SIGNED_ORIGINAL_TRADES_BROKER_STOP_HISTORY_OR_LIVE_RELEASE',
    upstream.state,age);
}
