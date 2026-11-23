/**
 * Phase51 strictly offline manually initiated, owner-private session audit.
 * No broker/network/GTT/order imports. Redacted aggregate outputs only.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase51DeclaredOosSessionCoverage,
  type Phase51Input,type Phase51IndependentPins
} from '../src/server/engine/ema15m/adaptivePhase51DeclaredSessionOosLedger.js';

const arg=(key:string):string|null=>{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
};
function privateOwnerOnly(p:string|null):p is string{
  if(!p||!isAbsolute(p)||p.length>1300||p.includes('\0'))
    return false;
  try{
    const file=resolve(p),folder=dirname(file),
      f=lstatSync(file),d=lstatSync(folder);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(file)===file&&realpathSync(folder)===folder&&
      f.size>30&&f.size<=25_000_000&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||
        (f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const source=arg('--private-original-oos-session-ledger'),
  pins=arg('--independent-prespecified-session-ledger-pins');
if(!process.argv.includes('--approve-isolated-offline-review')||
  !privateOwnerOnly(source)||!privateOwnerOnly(pins)){
  console.error('PHASE51_ORIGINAL_SESSION_OFFLINE_SOURCE_OR_PINS_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-phase51-oos-sessions.ts --approve-isolated-offline-review --private-original-oos-session-ledger <OWNER_0600_JSON> --independent-prespecified-session-ledger-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const original=JSON.parse(readFileSync(source,'utf8')) as Phase51Input,
      lock=JSON.parse(readFileSync(pins,'utf8')) as Phase51IndependentPins;
    const r=auditPhase51DeclaredOosSessionCoverage(original,lock);
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      syntheticDataset:r.syntheticDataset,
      declaredCalendarSessions:r.declaredCalendarSessions,
      originalDecisionSessions:r.originalDecisionSessions,
      declaredOosSessions:r.declaredOosSessions,
      originalOosDecisions:r.originalOosDecisions,
      missingOriginalSessions:r.missingOriginalSessions,
      decisionsNotInDeclaredCalendar:r.decisionsNotInDeclaredCalendar,
      decisionsOutsideDeclaredSessionHours:r.decisionsOutsideDeclaredSessionHours,
      staleOrOutOfSessionCatalogCaptures:
        r.staleOrOutOfSessionCatalogCaptures,
      staleOrOutOfSessionChainCaptures:
        r.staleOrOutOfSessionChainCaptures,
      sessionsMissingOriginalContractOrChainUniverse:
        r.sessionsMissingOriginalContractOrChainUniverse,
      sessionsWithNoOriginalAvailableOptionL1:
        r.sessionsWithNoOriginalAvailableOptionL1,
      fullPhase50OosAttemptDenominator:
        r.fullPhase50OosAttemptDenominator,
      phase50Status:r.phase50Status,folds:r.folds,
      independentlyAuthenticatedExchangeCalendar:
        r.independentlyAuthenticatedExchangeCalendar,
      originalLicensedL1IndependentlyAuthenticated:
        r.originalLicensedL1IndependentlyAuthenticated,
      unbiasedOosProfitabilityProven:r.unbiasedOosProfitabilityProven,
      genuineBrokerOrderOrOvernightStopVerified:
        r.genuineBrokerOrderOrOvernightStopVerified,
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,nativeOrderInstruction:r.nativeOrderInstruction
    },null,2));
    if(r.status!=='DESCRIPTIVE_DECLARED_SESSION_COVERAGE_ONLY')
      process.exitCode=2;
  }catch{
    console.error('PHASE51_PRIVATE_ORIGINAL_SESSION_SOURCE_REJECTED_REDACTED');
    process.exitCode=2;
  }
}
