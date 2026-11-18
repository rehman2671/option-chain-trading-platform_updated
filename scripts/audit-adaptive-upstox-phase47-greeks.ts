/**
 * Phase47 owner-private manual-only OFFLINE frozen preclose Greek sensitivity.
 *
 * No Upstox/NSE network access, WebSocket, webhook, broker execution,
 * account credential, GTT order modify/cancel, scheduled trading route.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase47FrozenGreekGapResidual,
  type Phase47GreekRiskInput,type Phase47GreekRiskPolicy,
  type Phase47IndependentPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase47FrozenGreekGapResidual.js';

const value=(flag:string):string|null=>{
  const i=process.argv.indexOf(flag);
  return i<0?null:process.argv[i+1]??null;
};
function privateFile(path:string|null):path is string{
  if(!path||!isAbsolute(path)||path.length>1300||
    path.includes('\0'))return false;
  try{
    const p=resolve(path),parent=dirname(p),
      f=lstatSync(p),d=lstatSync(parent);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(p)===p&&realpathSync(parent)===parent&&
      f.size>10&&f.size<=1_500_000&&
      (f.mode&0o077)===0&&(d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||(
        f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const original=value('--private-original-l1-and-greek-archive'),
  pinsPath=value('--independent-source-policy-hash-pins'),
  rulesPath=value('--predeclared-greek-risk-policy');
if(!process.argv.includes('--approve-operator-offline-review')||
  !privateFile(original)||!privateFile(pinsPath)||
  !privateFile(rulesPath)){
  console.error('PHASE47_OWNER_PRIVATE_OPERATOR_OFFLINE_APPROVAL_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase47-greeks.ts --approve-operator-offline-review --private-original-l1-and-greek-archive <OWNER_0600_JSON> --independent-source-policy-hash-pins <OWNER_0600_JSON> --predeclared-greek-risk-policy <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const raw=JSON.parse(readFileSync(original,'utf8')) as
      Phase47GreekRiskInput;
    const pins=JSON.parse(readFileSync(pinsPath,'utf8')) as
      Phase47IndependentPins;
    const policy=JSON.parse(readFileSync(rulesPath,'utf8')) as
      Phase47GreekRiskPolicy;
    const r=auditPhase47FrozenGreekGapResidual(raw,pins,policy);
    // REDACT all raw option quotes, original underlying levels, Greeks,
    // source instrument keys, record IDs, UCCs, private paths or tokens.
    // A local PASS is never authorization to trade or proof of causality.
    console.log(JSON.stringify({
      mode:r.mode,status:r.status,reasonCodes:r.reasonCodes,
      datasetLabel:r.datasetLabel,horizonsReviewed:r.horizonsReviewed,
      alertCells:r.alertCells,
      cells:r.cells.map(c=>({
        horizon:c.horizon,residualRiskAlert:c.residualRiskAlert,
        ivShockRiskAlert:c.ivShockRiskAlert,
        thetaMagnitudeRiskAlert:c.thetaMagnitudeRiskAlert,
        declaredExpiryProximityAlert:c.declaredExpiryProximityAlert,
        modelMayProduceNegativePremium:c.modelMayProduceNegativePremium
      })),
      executionAuthorized:r.executionAuthorized,
      productionSafe:r.productionSafe,
      originalLicensedOptionL1IndependentlyVerified:
        r.originalLicensedOptionL1IndependentlyVerified,
      empiricalIvThetaCausalityEstablished:
        r.empiricalIvThetaCausalityEstablished,
      brokerNativeStopsVerified:r.brokerNativeStopsVerified,
      protectedOvernight:r.protectedOvernight,
      nativeOrderInstruction:r.nativeOrderInstruction
    },null,2));
    if(r.status!=='DESCRIPTIVE_GREEK_RESIDUAL_ONLY')
      process.exitCode=2;
  }catch{
    console.error('PHASE47_PRIVATE_ORIGINAL_GREEK_INPUT_REJECTED_NO_DETAILS');
    process.exitCode=2;
  }
}
