/**
 * All quotes, original availableAt labels, retrospective download and
 * vendor licensing in this fixture are fabricated by one test owner.
 * A seemingly as-of L1 quote remains NOT actual client receipt proof.
 */
import {createHash} from 'node:crypto';
import {
  makePhase73SyntheticVendorRightsFixture
} from './phase73_synthetic_vendor_rights_fixture.js';
import {
  hashPhase74Evidence,
  type Phase74Input,type Phase74Pins,type Phase74PredeclaredCausalityPolicy
} from '../../server/engine/ema15m/adaptivePhase74RetrospectiveCausalReplay.js';

const sha=(v:Uint8Array)=>createHash('sha256').update(v)
  .digest('hex');

export function makePhase74SyntheticCausalReplayFixture(){
  const previous=makePhase73SyntheticVendorRightsFixture();
  const policy:Phase74PredeclaredCausalityPolicy={
    schemaVersion:'ADAPTIVE_PHASE74_RETROSPECTIVE_SOURCE_CAUSALITY_POLICY_V1',
    source:'OWNER_PRESPECIFIED_ASOF_ONLY_NOT_HISTORICAL_CLIENT_TRUST',
    maximumClaimedAsOfQuoteAgeMinutes:10,
    minimumClaimedDisplayedBidDepthLots:1,
    minimumClaimedDisplayedAskDepthLots:1,
    requireTrueContemporaneousSourceCaptureForLiveCausalClaims:true,
    allowRetrospectiveArchiveToImpersonateOriginalClientReceiveAt:false
  };
  const input:Phase74Input={
    schemaVersion:'ADAPTIVE_PHASE74_RETRO_ARCHIVE_CAUSAL_DECISION_QUARANTINE_V1',
    source:'OFFLINE_ORIGINAL_L1_SOURCE_CLAIMED_CLOCKS_NOT_CLIENT_RECEIPTS',
    phase73:previous.input,phase73Pins:previous.pins,policy
  };
  const pins:Phase74Pins={
    schemaVersion:'INDEPENDENT_PHASE74_ORIGINAL_ASOF_REPLAY_NONTRUST_PINS_V1',
    expectedPhase73InputSha256:'',
    expectedPhase73PinsSha256:'',
    expectedPolicySha256:'',
    expectedOriginalOosDecisions:4,
    expectedOriginalNoEntryDays:2,
    expectedOriginallyListedCePePairs:32,
    expectedOriginalNoEntryListedPairs:16,
    expectedOriginalNativeL1QuoteRows:previous.vendor.raw.length-1
  };
  const repin=()=>{
    pins.expectedPhase73InputSha256=hashPhase74Evidence(input.phase73);
    pins.expectedPhase73PinsSha256=hashPhase74Evidence(input.phase73Pins);
    pins.expectedPolicySha256=hashPhase74Evidence(input.policy);
  };
  // Propagate changes through ALL nested fake source/operator signed
  // third-party material; this shows a fabricated vintage can pass local
  // cryptography but no actual historical client receipt is established.
  const resignAllAfterVendorChange=()=>{
    const phase72=previous.parent,
      phase71=phase72.previous,
      phase70=phase71.parent,
      phase69=phase70.previous;
    phase69.syncSource();
    phase70.rebuild();phase70.updateArchive();phase70.repin();
    phase71.rebindOriginalAndResign();
    phase72.receipt.phase71SignedManifestRawSha256=sha(Buffer.from(
      phase71.input.claimedSignedManifestRawBase64,'base64'));
    phase72.receipt.originalCalendarArchiveRawSha256=sha(Buffer.from(
      phase71.input.phase70
        .separatelySuppliedClaimedExchangeDayArchiveBase64,'base64'));
    phase72.resignAll();
    const raw=Buffer.from(
      previous.vendor.input.newVendorNativeL1CsvBase64,'base64');
    previous.source.claimedNativeL1CsvSha256=sha(raw);
    previous.source.claimedOriginalL1QuoteRows=previous.vendor.raw.length-1;
    previous.pins.expectedOriginalL1QuoteRows=previous.vendor.raw.length-1;
    previous.updateSource();previous.repin();repin();
  };
  const pretendOneDecisionQuoteWasAvailableImmediately=()=>{
    const c=previous.vendor.catalog.decisions[1]
      .originallyListedContracts[0];
    const q=previous.vendor.raw.find((r,i)=>
      i>0&&r[2]===c.instrumentKey);
    if(!q)throw Error('synthetic first option L1 source missing');
    // The original event exactly coincides with decision time. Fake an
    // "immediate arrival" by removing 5 sec of alleged client latency.
    // The actual archive is STILL downloaded months afterward.
    q[4]=q[3];
    resignAllAfterVendorChange();
  };
  const inventAllFutureOptionCloses=()=>{
    previous.inventEveryMissingHistoricalBid();
    pins.expectedOriginalNativeL1QuoteRows=previous.vendor.raw.length-1;
    repin();
  };
  repin();
  return {
    previous,input,pins,repin,resignAllAfterVendorChange,
    pretendOneDecisionQuoteWasAvailableImmediately,
    inventAllFutureOptionCloses
  };
}
