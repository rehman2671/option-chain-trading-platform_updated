/**
 * Phase73 historical option best-L1 research rights and source acquisition
 * readiness ONLY. Owner-private files; OS/container must enforce network
 * no-egress. Does NOT authenticate vendor/legal rights, exchange history,
 * original client receiving time or live broker fills/stops/GTT.
 */
import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase73HistoricalSourceReadiness,
  type Phase73Input,type Phase73Pins
} from '../src/server/engine/ema15m/adaptivePhase73HistoricalL1LicenceReadiness.js';

function argument(flag:string):string|null{
  const i=process.argv.indexOf(flag);
  return i<0?null:process.argv[i+1]??null;
}
function privateFile(v:string|null,max:number):v is string{
  if(!v||!isAbsolute(v)||v.includes('\0')||v.length>1300)
    return false;
  try{
    const file=resolve(v),dir=dirname(file),
      f=lstatSync(file),d=lstatSync(dir);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(file)===file&&realpathSync(dir)===dir&&
      f.size>128&&f.size<=max&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const source=argument('--private-phase73-historical-source-rights'),
  pinsFile=argument('--independent-phase73-original-oos-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateFile(source,270_000_000)||
  !privateFile(pinsFile,2_000_000)){
  console.error('PHASE73_PRIVATE_HISTORICAL_OPTION_RIGHTS_AND_SOURCE_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase73-historical-source-rights.ts --approve-isolated-offline-review --private-phase73-historical-source-rights <OWNER_0600_JSON> --independent-phase73-original-oos-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase73Input,
      pins=JSON.parse(readFileSync(pinsFile,'utf8')) as Phase73Pins,
      r=auditPhase73HistoricalSourceReadiness(input,pins);
    // No source/contract ID, strike, premium, issuer, grant text,
    // source dates, original client clock, account, signature or raw key.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase72Status:r.phase72Status,
      syntheticDataset:r.syntheticDataset,
      originalOosDecisions:r.originalOosDecisions,
      originalNoEntryDays:r.originalNoEntryDays,
      originalAllListedCePePairs:r.originalAllListedCePePairs,
      originalL1QuoteRows:r.originalL1QuoteRows,
      originalAllListedOptionsWithCalendarOrBidGaps:
        r.originalAllListedOptionsWithCalendarOrBidGaps,
      licenceClaimScopeMechanicallyCoversFullOriginalExpiries:
        r.licenceClaimScopeMechanicallyCoversFullOriginalExpiries,
      claimedLicenceEffectiveOnArchiveDownload:
        r.claimedLicenceEffectiveOnArchiveDownload,
      observedSourceDigestAndOwnerAcquisitionClaimAgree:
        r.observedSourceDigestAndOwnerAcquisitionClaimAgree,
      horizons:r.horizons,
      genuineVendorLicenceGrantIndependentlyAuthenticated:
        r.genuineVendorLicenceGrantIndependentlyAuthenticated,
      actualDistributionResearchAndRetentionRightsLegallyVerified:
        r.actualDistributionResearchAndRetentionRightsLegallyVerified,
      officialExchangeIssuerAndCalendarAuthenticated:
        r.officialExchangeIssuerAndCalendarAuthenticated,
      realSourceArchiveOriginalMarketPricesVerified:
        r.realSourceArchiveOriginalMarketPricesVerified,
      retrospectiveArchiveCannotRestorePastStrategyAvailableAt:
        r.retrospectiveArchiveCannotRestorePastStrategyAvailableAt,
      reportedOriginalHistoricalClientReceiptTrustworthy:
        r.reportedOriginalHistoricalClientReceiptTrustworthy,
      independentRealRegimeOosProfitabilityEstablished:
        r.independentRealRegimeOosProfitabilityEstablished,
      fullPaidLongOptionPremiumDebitLossProtected:
        r.fullPaidLongOptionPremiumDebitLossProtected,
      nrmlGttBrokerChildExchangeAckVerified:
        r.nrmlGttBrokerChildExchangeAckVerified,
      bestExpiryHorizonRecommendationAuthorized:
        r.bestExpiryHorizonRecommendationAuthorized,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction,
      externalReviewBlockers:r.externalReviewBlockers
    },null,2));
    if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE73_OPTION_L1_RIGHTS_RESEARCH_AUDIT_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
