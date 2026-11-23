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
/**
 * Pure automatic ENTRY preflight. The product-only MIS check is NOT a
 * live-order permission: a disabled toggle, ambiguous kill-switch state
 * or mid-flight product mutation must reject BEFORE automatic reversal
 * exits, contract/network reads, BUY attempts and broker-order claims.
 *
 * A manual operator-initiated exit uses a separate broker-authoritative
 * exit path. This guard must not be used to auto SELL an existing long.
 */
export function assessEmaAutomaticLiveEntryPreflight(
  originallySelectedProduct:unknown,
  currentlySelectedProduct:unknown,
  currentLiveToggle:unknown,
  killSwitchHalted:unknown
):{allowed:boolean;reason:string|null}{
  const original=assessEmaLiveProductGate(originallySelectedProduct);
  if(!original.allowed)return original;
  const current=assessEmaLiveProductGate(currentlySelectedProduct);
  if(!current.allowed)return current;
  if(originallySelectedProduct!==currentlySelectedProduct)
    return {allowed:false,
      reason:'Live entry product changed during broker verification; fail closed.'};
  if(currentLiveToggle!==true)
    return {allowed:false,
      reason:'Live broker execution disabled; suppress automatic entry and reversal exit.'};
  if(killSwitchHalted!==false)
    return {allowed:false,
      reason:'Kill switch active or status unavailable; suppress automatic entry and reversal exit.'};
  return {allowed:true,reason:null};
}

/**
 * Persisted EMA live product must be an exact MIS/NRML value. A malformed
 * row may be DISPLAYED as legacy MIS, but MUST disable live execution,
 * never silently coerce an unsafe NRML/unknown product into live MIS.
 * No broker effects; usable on DB read and DB settings write boundaries.
 */
export function normalizeEmaLiveProductSettings(
  storedProduct:unknown,
  liveEnabled:unknown
):{productType:EmaBrokerProduct;liveEnabled:boolean;recognized:boolean}{
  const recognized=storedProduct==='MIS'||storedProduct==='NRML';
  return {
    productType:recognized?storedProduct:'MIS',
    liveEnabled:recognized&&liveEnabled===true,
    recognized
  };
}

/**
 * Existing legacy EMA live position SELL is a real broker order, even
 * when called by a "manual" route or when the entry came from an
 * earlier deployed version. Block NRML/unknown product here until
 * independently approved CLOSE-ONLY, existing-long net and GTT-child
 * reconciliation have been integrated in a separate release.
 *
 * Operators can reconcile/close an actual long in their broker's own
 * authenticated interface. This is NOT a broker instruction.
 */
export function assessEmaBrokerExitProductGate(
  product:unknown
):{allowed:boolean;reason:string|null}{
  if(product==='MIS')return {allowed:true,reason:null};
  if(product==='NRML')
    return {allowed:false,
      reason:'NRML broker SELL blocked: independently verified existing long, '+
        'close-only/no-short, outstanding GTT and child SELL reconciliation '+
        'and manual broker release are required (issue #20).'};
  return {allowed:false,
    reason:'Unknown live position product; broker SELL blocked, no MIS fallback.'};
}

/** Legacy EMA SL/target/trailing polling is MIS-only until the independent
 * NRML positional order/stop lifecycle receives a separate release. */
export function isMisLiveAutoExitCandidate(
  position:unknown
):boolean{
  if(!position||typeof position!=='object')return false;
  const p=position as {productType?:unknown;status?:unknown};
  return p.productType==='MIS'&&p.status==='OPEN';
}

/** The 15:15 intraday job must NEVER square off an NRML position. */
export function isMisForcedSquareOffEligible(
  position:unknown
):boolean{
  if(!position||typeof position!=='object')return false;
  const p=position as {status?:unknown;productType?:unknown};
  return p.status==='OPEN'&&p.productType==='MIS';
}
