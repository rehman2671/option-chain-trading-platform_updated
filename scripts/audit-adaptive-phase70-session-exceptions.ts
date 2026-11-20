/**
 * Phase70 owner-only OFFLINE third claimed-exchange day-calendar auditor.
 * Enforce OS/container network no-egress independently. This CLI cannot
 * authenticate exchange issuers, license historical market data, verify
 * original client receive times or execute NRML orders/stops/GTT.
 */
import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase70ExchangeDayExceptions,
  type Phase70Input,type Phase70Pins
} from '../src/server/engine/ema15m/adaptivePhase70SessionExceptionEvidence.js';

function flag(s:string):string|null{
  const i=process.argv.indexOf(s);
  return i<0?null:process.argv[i+1]??null;
}
function ownerOnly(s:string|null,limit:number):s is string{
  if(!s||!isAbsolute(s)||s.includes('\0')||s.length>1300)
    return false;
  try{
    const file=resolve(s),parent=dirname(file),
      f=lstatSync(file),p=lstatSync(parent);
    return f.isFile()&&!f.isSymbolicLink()&&
      p.isDirectory()&&!p.isSymbolicLink()&&
      realpathSync(file)===file&&realpathSync(parent)===parent&&
      f.size>128&&f.size<=limit&&
      (f.mode&0o077)===0&&(p.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&p.uid===process.getuid()));
  }catch{return false;}
}
const inputPath=flag('--private-phase70-calendar-exception-package'),
  pinsPath=flag('--independent-phase70-exchange-day-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !ownerOnly(inputPath,255_000_000)||!ownerOnly(pinsPath,2_000_000)){
  console.error('PHASE70_PRIVATE_THIRD_EXCHANGE_LIKE_CALENDAR_AND_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase70-session-exceptions.ts --approve-isolated-offline-review --private-phase70-calendar-exception-package <OWNER_0600_JSON> --independent-phase70-exchange-day-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const input=JSON.parse(readFileSync(inputPath,'utf8')) as Phase70Input,
      pins=JSON.parse(readFileSync(pinsPath,'utf8')) as Phase70Pins,
      result=auditPhase70ExchangeDayExceptions(input,pins);
    // Aggregate SOURCE-acquisition counts ONLY. No exact holiday dates,
    // market quotations, contract IDs, issuer archive, licence documents,
    // quote source timestamps, private paths or sensitive account details.
    console.log(JSON.stringify({
      mode:result.mode,status:result.status,reasonCodes:result.reasonCodes,
      phase69Status:result.phase69Status,
      syntheticDataset:result.syntheticDataset,
      originalOosDecisions:result.originalOosDecisions,
      originalNoEntryDays:result.originalNoEntryDays,
      originalAllListedCePePairs:result.originalAllListedCePePairs,
      sourceClaimedCalendarDays:result.sourceClaimedCalendarDays,
      matchedOriginalEntryNextSessionDecisions:
        result.matchedOriginalEntryNextSessionDecisions,
      missingWeekdayContractSlotsFromPhase69:
        result.missingWeekdayContractSlotsFromPhase69,
      claimedHolidayContractSlots:result.claimedHolidayContractSlots,
      claimedEmergencyClosureContractSlots:
        result.claimedEmergencyClosureContractSlots,
      missingRegularOpenExchangeLikeCalendarContractSlots:
        result.missingRegularOpenExchangeLikeCalendarContractSlots,
      claimedClosureNotKnownAtOriginalDecisionSlots:
        result.claimedClosureNotKnownAtOriginalDecisionSlots,
      explicitlyDeclaredWeekendSpecialSessionContractSlots:
        result.explicitlyDeclaredWeekendSpecialSessionContractSlots,
      missingSpecialWeekendOpenSourceContractSlots:
        result.missingSpecialWeekendOpenSourceContractSlots,
      remainingUnclassifiedWeekdayContractSlots:
        result.remainingUnclassifiedWeekdayContractSlots,
      cells:result.cells,
      independentlyAuthenticatedOfficialExchangeHolidayEvidence:
        result.independentlyAuthenticatedOfficialExchangeHolidayEvidence,
      independentlyAuthenticatedSpecialSessionPublisher:
        result.independentlyAuthenticatedSpecialSessionPublisher,
      allegedHolidayNeverConfirmsExchangeWasClosed:
        result.allegedHolidayNeverConfirmsExchangeWasClosed,
      fullOriginalHoldingQuoteSourceCensoredUntilActualDataVerified:
        result.fullOriginalHoldingQuoteSourceCensoredUntilActualDataVerified,
      genuineHistoricalOptionDataLicenseVerified:
        result.genuineHistoricalOptionDataLicenseVerified,
      historicalClientSourceAvailableAtIndependentlyVerified:
        result.historicalClientSourceAvailableAtIndependentlyVerified,
      genuineOosRegimeProfitabilityProven:
        result.genuineOosRegimeProfitabilityProven,
      fullPaidLongOptionPremiumDebitLossEliminated:
        result.fullPaidLongOptionPremiumDebitLossEliminated,
      optimalOneToEightWeekExpiryAuthorized:
        result.optimalOneToEightWeekExpiryAuthorized,
      nrmlGttStopExchangeChildAckVerified:
        result.nrmlGttStopExchangeChildAckVerified,
      executionAuthorized:result.executionAuthorized,
      productionSafe:result.productionSafe,
      nativeOrderInstruction:result.nativeOrderInstruction,
      externalEvidenceRequired:result.externalEvidenceRequired
    },null,2));
    if(!result.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
  }catch{
    console.error('PHASE70_UNVERIFIED_EXCHANGE_DAY_CANDIDATE_AUDIT_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
