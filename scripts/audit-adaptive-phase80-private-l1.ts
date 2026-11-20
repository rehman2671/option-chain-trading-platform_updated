/**
 * Phase80 owner-private 1W–8W original native option L1 audit.
 * No vendor/broker HTTP, orders or trading writes. Run in OS no-network sandbox.
 * Every input must be 0600 in an owned 0700 dir OUTSIDE GitHub repository.
 */
import {reviewPhase80OwnerPrivateFiles,type Phase80PrivatePaths}
  from '../src/server/engine/ema15m/adaptivePhase80PrivateL1Intake.js';
const FLAGS:{[k:string]:keyof Phase80PrivatePaths}={
  '--original-native-option-l1-csv':'nativeCsv',
  '--original-frozen-listed-catalog':'catalogJson',
  '--declared-session-calendar':'sessionsJson',
  '--preregistered-quote-policy':'policyJson',
  '--unverified-source-declaration':'sourceDeclarationJson',
  '--independent-original-source-pins':'independentPinsJson'
};
const args=process.argv.slice(2);
const parsed:Partial<Phase80PrivatePaths>={};
let valid=args.length===13&&args[0]==='--approve-isolated-private-offline-review';
for(let i=1;i<args.length;i+=2){
  const key=FLAGS[args[i]],value=args[i+1];
  if(!key||!value||value.startsWith('--')||parsed[key]!==undefined)
    valid=false;
  else parsed[key]=value;
}
if(!valid||Object.values(FLAGS).some(x=>parsed[x]===undefined)){
  console.error('PHASE80_EXPLICIT_PRIVATE_OFFLINE_REVIEW_AND_SIX_ABSOLUTE_FILES_REQUIRED');
  process.exitCode=2;
}else{
  const r=reviewPhase80OwnerPrivateFiles(parsed as Phase80PrivatePaths,
    process.cwd());
  // Only prevalidated fixed reason codes and aggregate counts. No raw files,
  // full source SHA, private paths or instrument/order IDs in stdout/stderr.
  console.log(JSON.stringify(r,null,2));
  if(!r.status.startsWith('DESCRIPTIVE_'))process.exitCode=2;
}
