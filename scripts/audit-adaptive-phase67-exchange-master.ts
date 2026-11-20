/**
 * Phase67 owner-private OFFLINE second-source issuer-like F&O master/calendar
 * reconciliation. No vendor/exchange/broker network, GTT, NRML or stop writes.
 * Operate in externally enforced no-egress isolated environment. Successful
 * return means owner-supplied sources are coherent, NOT real issuer identity.
 */
import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase67IssuerCalendarCrosscheck,
  type Phase67Input,type Phase67IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase67IssuerCalendarCrosscheck.js';
function arg(key:string):string|null{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
}
function privateOwnedFile(s:string|null,max:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)
    return false;
  try{
    const f=resolve(s),d=dirname(f),a=lstatSync(f),b=lstatSync(d);
    return a.isFile()&&!a.isSymbolicLink()&&
      b.isDirectory()&&!b.isSymbolicLink()&&
      realpathSync(f)===f&&realpathSync(d)===d&&
      a.size>128&&a.size<=max&&
      (a.mode&0o077)===0&&(b.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (a.uid===process.getuid()&&b.uid===process.getuid()));
  }catch{return false;}
}
const source=arg('--private-phase67-new-vendor-and-issuer-package'),
  pinsPath=arg('--independent-phase67-dual-source-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateOwnedFile(source,185_000_000)||
  !privateOwnedFile(pinsPath,2_000_000)){
  console.error('PHASE67_PRIVATE_SEPARATE_EXCHANGE_LIKE_MASTER_CALENDAR_AND_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase67-exchange-master.ts --approve-isolated-offline-review --private-phase67-new-vendor-and-issuer-package <OWNER_0600_JSON> --independent-phase67-dual-source-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase67Input,
      pins=JSON.parse(readFileSync(pinsPath,'utf8')) as
        Phase67IndependentPins;
    const r=auditPhase67IssuerCalendarCrosscheck(input,pins);
    // No raw exchange-like master, quote source, expiry days, instrument
    // IDs, prices, licence document, PIN fingerprints or account material.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase66Status:r.phase66Status,
      syntheticDataset:r.syntheticDataset,
      originalOosDecisions:r.originalOosDecisions,
      originalAllListedCePeContractPairs:
        r.originalAllListedCePeContractPairs,
      matchedOriginalDecisionTimeIssuerSnapshots:
        r.matchedOriginalDecisionTimeIssuerSnapshots,
      matchedOriginalCePeContractPairs:
        r.matchedOriginalCePeContractPairs,
      distinctListedOriginalInstruments:
        r.distinctListedOriginalInstruments,
      candidateIssuerSessions:r.candidateIssuerSessions,
      originalSourceQuotesConfinedToClaimedIssuerSessions:
        r.originalSourceQuotesConfinedToClaimedIssuerSessions,
      originalQuotesBeyondClaimedLastTradableSession:
        r.originalQuotesBeyondClaimedLastTradableSession,
      originalOosNextOpenSessionsMatched:
        r.originalOosNextOpenSessionsMatched,
      sourceCandidateMasterAndCalendarConsistent:
        r.sourceCandidateMasterAndCalendarConsistent,
      independentlyAuthenticatedExchangeMasterIssuer:
        r.independentlyAuthenticatedExchangeMasterIssuer,
      independentlyAuthenticatedExchangeCalendarIssuer:
        r.independentlyAuthenticatedExchangeCalendarIssuer,
      independentlyVerifiedVendorHistoricalL1Entitlement:
        r.independentlyVerifiedVendorHistoricalL1Entitlement,
      contemporaneousSourceArrivalClockTrusted:
        r.contemporaneousSourceArrivalClockTrusted,
      expiryOrLotClaimIsOfficialExchangeTruth:
        r.expiryOrLotClaimIsOfficialExchangeTruth,
      statisticalMultiregimeOosProfitabilityVerified:
        r.statisticalMultiregimeOosProfitabilityVerified,
      bestOptionDurationAuthorized:r.bestOptionDurationAuthorized,
      nativeNrmlBrokerStopGttAckVerified:
        r.nativeNrmlBrokerStopGttAckVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction,
      externalBlockers:r.externalBlockers
    },null,2));
    if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE67_UNVERIFIED_CANDIDATE_ISSUER_AUDIT_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
