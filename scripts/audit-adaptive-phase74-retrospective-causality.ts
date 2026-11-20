/**
 * Phase74 owner-private OFFLINE original L1 as-of decision lookahead review.
 * OS/container must enforce NO network egress. The retrospectively
 * acquired source cannot prove original client receipt or broker fills.
 * No broker, market-data download, NRML, native GTT/stop API or 15:15 exit.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase74RetrospectiveCausalReplay,
  type Phase74Input,type Phase74Pins
} from '../src/server/engine/ema15m/adaptivePhase74RetrospectiveCausalReplay.js';

function value(flag:string):string|null{
  const i=process.argv.indexOf(flag);
  return i<0?null:process.argv[i+1]??null;
}
function ownerFile(v:string|null,max:number):v is string{
  if(!v||!isAbsolute(v)||v.includes('\0')||v.length>1300)return false;
  try{
    const f=resolve(v),d=dirname(f),
      file=lstatSync(f),parent=lstatSync(d);
    return file.isFile()&&!file.isSymbolicLink()&&
      parent.isDirectory()&&!parent.isSymbolicLink()&&
      realpathSync(f)===f&&realpathSync(d)===d&&
      file.size>128&&file.size<=max&&
      (file.mode&0o077)===0&&(parent.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (file.uid===process.getuid()&&parent.uid===process.getuid()));
  }catch{return false;}
}
const source=value('--private-phase74-original-retrospective-dossier'),
  pinsFile=value('--independent-phase74-asof-decision-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !ownerFile(source,280_000_000)||!ownerFile(pinsFile,2_000_000)){
  console.error('PHASE74_PRIVATE_ORIGINAL_QUOTE_SOURCE_AND_ASOF_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase74-retrospective-causality.ts --approve-isolated-offline-review --private-phase74-original-retrospective-dossier <OWNER_0600_JSON> --independent-phase74-asof-decision-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase74Input,
      pins=JSON.parse(readFileSync(pinsFile,'utf8')) as Phase74Pins,
      r=auditPhase74RetrospectiveCausalReplay(input,pins);
    // Privacy: only original OOS aggregates. Never print quote prices,
    // instrument IDs/strikes, source record IDs, alleged issuer or vendor
    // identities, signed licence paperwork, original dates or client data.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase73Status:r.phase73Status,syntheticDataset:r.syntheticDataset,
      originalOosDecisionDays:r.originalOosDecisionDays,
      originalNoEntryDays:r.originalNoEntryDays,
      originalListedCePePairs:r.originalListedCePePairs,
      originalNoEntryListedPairs:r.originalNoEntryListedPairs,
      originalNativeL1QuoteRows:r.originalNativeL1QuoteRows,
      allSourceRowsInArchiveClaimedPriorToRetrospectiveReceipt:
        r.allSourceRowsInArchiveClaimedPriorToRetrospectiveReceipt,
      originallyListedPairsWithClaimedAsOfL1BidAndAsk:
        r.originallyListedPairsWithClaimedAsOfL1BidAndAsk,
      originallyListedPairsWithNoClaimedAsOfL1AtDecision:
        r.originallyListedPairsWithNoClaimedAsOfL1AtDecision,
      originallyListedPairsWithQuoteEventBeforeDecisionButAvailableLater:
        r.originallyListedPairsWithQuoteEventBeforeDecisionButAvailableLater,
      originallyListedPairsWithFirstPostDecisionQuote:
        r.originallyListedPairsWithFirstPostDecisionQuote,
      originallyListedPairsWhoseArchiveReceivedAfterDecision:
        r.originallyListedPairsWhoseArchiveReceivedAfterDecision,
      originalClientTimeReceiptsIndependentlyVerified:
        r.originalClientTimeReceiptsIndependentlyVerified,
      realOriginalExchangeClientMarketDataRightsVerified:
        r.realOriginalExchangeClientMarketDataRightsVerified,
      originalSourceAvailableAtFromHistoricalFileNotTrusted:
        r.originalSourceAvailableAtFromHistoricalFileNotTrusted,
      receiptOfBulkArchiveAfterDecisionCannotProveThenAvailable:
        r.receiptOfBulkArchiveAfterDecisionCannotProveThenAvailable,
      genuineCausalEntryBacktestFromThisPackageAuthorized:
        r.genuineCausalEntryBacktestFromThisPackageAuthorized,
      independentlyProvenMultiRegimeFullDurationReturns:
        r.independentlyProvenMultiRegimeFullDurationReturns,
      fullLongOptionPaidPremiumLossRiskEliminated:
        r.fullLongOptionPaidPremiumLossRiskEliminated,
      brokerNrmlGttStopChildExchangeAckVerified:
        r.brokerNrmlGttStopChildExchangeAckVerified,
      bestOneToEightWeekExpiryAuthorized:
        r.bestOneToEightWeekExpiryAuthorized,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction,
      cells:r.cells,externalEvidenceRequired:r.externalEvidenceRequired
    },null,2));
    if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE74_HISTORICAL_ASOF_SOURCE_RESEARCH_AUDIT_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
