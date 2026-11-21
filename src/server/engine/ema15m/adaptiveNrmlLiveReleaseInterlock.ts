/**
 * Phase90 — LIVE NRML requirement is explicit, but not a broker-order release.
 *
 * This module is deliberately PURE/read-only. Operator controls, environment
 * flags, source SHA pins and successful offline CI cannot demonstrate a real
 * broker-acknowledged NRML protective SELL or actual stop child reconciliation.
 * Until an independently reviewed broker-authoritative stop lifecycle exists,
 * no EMA live path may route a newly opened NRML BUY.
 *
 * Existing live MIS orders retain their separate legacy safety checks and
 * existing MIS 15:15 forced-squareoff schedule.
 */
export type EmaBrokerProduct='MIS'|'NRML';
export interface NrmlLiveStatus{
  mode:'NRML_LIVE_REQUESTED_RELEASE_BLOCKED'|'NRML_NOT_SELECTED';
  productType:EmaBrokerProduct|null;
  requested:boolean;
  globalLiveToggleEnabled:boolean;
  nrmlOrderRoutingAuthorized:false;
  nrmlPositional1515SquareOff:false;
  brokerNativeStopChildAckVerified:false;
  releaseBlockers:readonly string[];
}
const BLOCKERS=[
  'BROKER_AUTHORITATIVE_NRML_ACCOUNT_POSITION_AND_PRODUCT_RECONCILIATION_REQUIRED',
  'BROKER_NATIVE_STOP_GTT_CHILD_EXCHANGE_ACK_PROTECTED_QUANTITY_UNVERIFIED',
  'PARTIAL_FILL_UNKNOWN_ACK_DUPLICATE_SELL_RESTART_AND_GAP_NONFILL_NOT_CERTIFIED',
  'LICENSED_REAL_ORIGINAL_OPTION_L1_OOS_AND_OFFICIAL_EXPIRY_CALENDAR_NOT_INDEPENDENTLY_SIGNED_OFF',
  'HUMAN_RISK_CAPITAL_LIMITS_AND_MANUAL_PRODUCTION_RELEASE_NOT_APPROVED'
] as const;
/** Visible to authorised operators: "requested" is not "active". */
export function getNrmlLiveStatus(
  configuredProduct:unknown,
  globalLiveToggle:unknown
):NrmlLiveStatus{
  const productType=configuredProduct==='NRML'||configuredProduct==='MIS'?
    configuredProduct:null;
  return {
    mode:productType==='NRML'?'NRML_LIVE_REQUESTED_RELEASE_BLOCKED':
      'NRML_NOT_SELECTED',
    productType,requested:productType==='NRML',
    globalLiveToggleEnabled:globalLiveToggle===true,
    nrmlOrderRoutingAuthorized:false,
    nrmlPositional1515SquareOff:false,
    brokerNativeStopChildAckVerified:false,
    releaseBlockers:BLOCKERS
  };
}
/**
 * An explicit, independently reviewed native-stop integration must replace
 * this fail-closed NRML branch in a later, separately released change.
 * This is not an env-flag or operator-boolean based bypass.
 */
export function assessEmaLiveProductGate(
  configuredProduct:unknown
):{allowed:boolean;reason:string|null}{
  if(configuredProduct==='MIS')return {allowed:true,reason:null};
  if(configuredProduct==='NRML')return {
    allowed:false,
    reason:'NRML live BUY blocked: broker-authoritative account/position, '+
      'native stop/GTT child exchange ACK, full protected quantity, recovery, '+
      'gaps and independent release evidence are not verified (issue #20).'
  };
  return {allowed:false,reason:'Unrecognised broker order product; fail closed.'};
}
/** The 15:15 intraday job must NEVER square off an NRML position. */
export function isMisForcedSquareOffEligible(
  position:unknown
):boolean{
  if(!position||typeof position!=='object')return false;
  const p=position as {status?:unknown;productType?:unknown};
  return p.status==='OPEN'&&p.productType==='MIS';
}
