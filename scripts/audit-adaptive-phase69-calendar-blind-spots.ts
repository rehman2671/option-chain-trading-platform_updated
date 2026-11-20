/**
 * Owner-private Phase69 offline original option full-duration source calendar
 * blind-spot audit. Node itself does NOT enforce network isolation;
 * run under externally enforced OS/container no-egress controls.
 *
 * No exchange/vendor download, broker writes, NRML/GTT/stop or 15:15 exits.
 */
import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase69CalendarBlindSpots,
  type Phase69Input,type Phase69Pins
} from '../src/server/engine/ema15m/adaptivePhase69CalendarBlindSpots.js';

function value(flag:string):string|null{
  const i=process.argv.indexOf(flag);
  return i<0?null:process.argv[i+1]??null;
}
function ownerOnlyFile(s:string|null,max:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)return false;
  try{
    const file=resolve(s),dir=dirname(file),
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
const source=value('--private-phase69-full-duration-dossier'),
  pinsPath=value('--independent-phase69-acquisition-gap-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !ownerOnlyFile(source,250_000_000)||
  !ownerOnlyFile(pinsPath,2_000_000)){
  console.error('PHASE69_OWNER_ONLY_ORIGINAL_OPTION_DURATION_AND_GAP_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase69-calendar-blind-spots.ts --approve-isolated-offline-review --private-phase69-full-duration-dossier <OWNER_0600_JSON> --independent-phase69-acquisition-gap-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(source,'utf8')) as Phase69Input;
    const pins=JSON.parse(readFileSync(pinsPath,'utf8')) as Phase69Pins;
    const r=auditPhase69CalendarBlindSpots(input,pins);
    // Redacted aggregates only: NO original missing session DATES,
    // instrument keys, strikes, premium prices, source-record IDs,
    // client availableAt, vendor papers, credentials, PINs or accounts.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      phase68Status:r.phase68Status,syntheticDataset:r.syntheticDataset,
      originalOosDecisionDays:r.originalOosDecisionDays,
      originalOosNoEntryDays:r.originalOosNoEntryDays,
      originalOosListedCePeContractPairs:
        r.originalOosListedCePeContractPairs,
      originalAllListedPairsWithCalendarBlindSpots:
        r.originalAllListedPairsWithCalendarBlindSpots,
      originalPairsWithMissingDeclaredCloseBidMarks:
        r.originalPairsWithMissingDeclaredCloseBidMarks,
      originalPairsWithoutVerifiedCompleteFullDurationEvidence:
        r.originalPairsWithoutVerifiedCompleteFullDurationEvidence,
      totalUnexplainedPotentialWeekdayContractSlots:
        r.totalUnexplainedPotentialWeekdayContractSlots,
      distinctPotentialWeekdayCandidateDatesMissingFromDeclaredCalendar:
        r.distinctPotentialWeekdayCandidateDatesMissingFromDeclaredCalendar,
      longestConsecutiveUnexplainedWeekdayRun:
        r.longestConsecutiveUnexplainedWeekdayRun,
      totalMissingOrStaleDeclaredSessionBidMarkSlots:
        r.totalMissingOrStaleDeclaredSessionBidMarkSlots,
      originalPremiumGivebackQuoteOnlyAlerts:
        r.originalPremiumGivebackQuoteOnlyAlerts,
      originalOvernightGapQuoteOnlyAlerts:
        r.originalOvernightGapQuoteOnlyAlerts,
      candidateWeekdaysMayIncludeExchangeHolidaysOrClosures:
        r.candidateWeekdaysMayIncludeExchangeHolidaysOrClosures,
      declaredCalendarMayOmitSpecialWeekendSessions:
        r.declaredCalendarMayOmitSpecialWeekendSessions,
      cells:r.cells,
      sourceCandidateCalendarCompletenessOfficiallyVerified:
        r.sourceCandidateCalendarCompletenessOfficiallyVerified,
      exchangeOrVendorHistoricOptionL1EntitlementVerified:
        r.exchangeOrVendorHistoricOptionL1EntitlementVerified,
      originalClientHistoricalAvailableAtTrusted:
        r.originalClientHistoricalAvailableAtTrusted,
      genuinePositionPnLOrStatisticalMultiregimeEdgeProven:
        r.genuinePositionPnLOrStatisticalMultiregimeEdgeProven,
      optimalOneToEightWeekContractRecommended:
        r.optimalOneToEightWeekContractRecommended,
      completeLongPremiumDebitLossProtectionProven:
        r.completeLongPremiumDebitLossProtectionProven,
      brokerNrmlGttNativeStopChildExchangeAckVerified:
        r.brokerNrmlGttNativeStopChildExchangeAckVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      nativeOrderInstruction:r.nativeOrderInstruction,
      externalEvidenceRequired:r.externalEvidenceRequired
    },null,2));
    if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE69_FULL_DURATION_WEEKDAY_ACQUISITION_AUDIT_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
