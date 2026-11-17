/**
 * Explicit OFFLINE Phase 17 full evidence dossier. No trading API, tokens,
 * broker, exchange fetch, order placement, paper order or live activation.
 *
 * Exactly one original bundle path and fourteen distinct named arguments:
 * npx tsx scripts/audit-adaptive-full-readiness.ts <source-bundle.json> \
 *  --source-artifact <original-feed-bytes> \
 *  --exchange-calendar-evidence <independent-ledger.json> \
 *  --calendar-source-document <retained-calendar-document> \
 *  --signed-evidence-envelope <detached-witness.json> \
 *  --reviewer-trust-registry <operator-approved-keys.json> \
 *  --pinned-reviewer-trust-sha256 <out-of-band-pin> \
 *  --policy-lock-manifest <prespecified-policy-lock.json> \
 *  --pinned-policy-lock-sha256 <out-of-band-pin> \
 *  --entry-first-policy <phase8.json> \
 *  --market-data-policy <phase10.json> \
 *  --evidence-gate-policy <phase11.json> \
 *  --hysteresis-policy <phase12.json> \
 *  --matched-hysteresis-policy <phase13.json> \
 *  --premium-stress-policy <phase14.json>
 *
 * A zero exit code (when evidence is internally consistent) is NOT an
 * authentication, safety or production trading authorization.
 */
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {
  runAdaptiveFullResearchReadiness,type ReadinessPolicyBytes
} from '../src/server/engine/ema15m/adaptiveFullResearchReadiness.js';
import type {ResearchEvidenceWitnessEnvelope} from
  '../src/server/engine/ema15m/adaptiveSignedEvidenceWitness.js';

const PATH_FLAGS={
  '--source-artifact':'vendorArchiveBytes',
  '--exchange-calendar-evidence':'calendarManifestBytes',
  '--calendar-source-document':'calendarDocumentBytes',
  '--signed-evidence-envelope':'witnessEnvelopeBytes',
  '--reviewer-trust-registry':'reviewerTrustRegistryBytes',
  '--policy-lock-manifest':'policyLockManifestBytes',
  '--entry-first-policy':'entryFirstExit',
  '--market-data-policy':'marketDataQuality',
  '--evidence-gate-policy':'researchEvidenceGate',
  '--hysteresis-policy':'regimeHysteresis',
  '--matched-hysteresis-policy':'matchedOos',
  '--premium-stress-policy':'premiumCostDepthStress'
} as const;
const PIN_FLAGS=[
  '--pinned-reviewer-trust-sha256',
  '--pinned-policy-lock-sha256'
] as const;
type FileFlag=keyof typeof PATH_FLAGS;
type PinFlag=typeof PIN_FLAGS[number];
const isPin=(flag:string):flag is PinFlag=>
  (PIN_FLAGS as readonly string[]).includes(flag);
const isFile=(flag:string):flag is FileFlag=>
  Object.prototype.hasOwnProperty.call(PATH_FLAGS,flag);
const maxBytes=(flag:FileFlag)=>
  ['--source-artifact','--calendar-source-document'].includes(flag)?
    50*1024*1024:
  ['--exchange-calendar-evidence'].includes(flag)?1024*1024:
  256*1024;
async function bytes(file:string,max:number):Promise<Uint8Array>{
  const s=await stat(file);
  if(!s.isFile()||s.size<2||s.size>max)
    throw new Error('SOURCE_FILE_EMPTY_INVALID_OR_OVERSIZED');
  return readFile(file);
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length!==1+(Object.keys(PATH_FLAGS).length+PIN_FLAGS.length)*2||
     !args[0]||args[0].startsWith('-'))
    throw new Error('USAGE: <bundle.json> '+Object.keys(PATH_FLAGS).
      concat(PIN_FLAGS).map(x=>x+' <value>').join(' '));
  const flags=new Map<string,string>();
  for(let i=1;i<args.length;i+=2){
    const k=args[i],v=args[i+1];
    if(!(isFile(k)||isPin(k))||!v||v.startsWith('--')||flags.has(k))
      throw new Error('UNSUPPORTED_OR_DUPLICATE_FULL_READINESS_ARGUMENT');
    if(isPin(k)&&!/^[0-9a-f]{64}$/.test(v))
      throw new Error('INVALID_OUT_OF_BAND_SHA256_PIN_FORMAT');
    flags.set(k,v);
  }
  if(flags.size!==Object.keys(PATH_FLAGS).length+PIN_FLAGS.length)
    throw new Error('MISSING_MANDATORY_EVIDENCE_OR_POLICY_FILE');
  const bundle=resolve(args[0]);
  const files=Object.fromEntries(
    (Object.keys(PATH_FLAGS) as FileFlag[]).map(k=>[k,resolve(flags.get(k)!)])
  ) as Record<FileFlag,string>;
  const locations=[bundle,...Object.values(files)];
  const canonical=await Promise.all(locations.map(p=>realpath(p)));
  if(new Set(canonical).size!==canonical.length)
    throw new Error('SAME_FILE_SYMLINK_OR_ALIAS_CANNOT_SATISFY_DISTINCT_RESEARCH_ARTIFACTS');
  const data=await Promise.all((Object.keys(PATH_FLAGS) as FileFlag[]).
    map(k=>bytes(files[k],maxBytes(k))));
  const read=new Map<string,Uint8Array>((Object.keys(PATH_FLAGS) as FileFlag[]).
    map((k,i)=>[k,data[i]]));
  const get=(k:FileFlag)=>read.get(k)!;
  const evidenceEnvelope:ResearchEvidenceWitnessEnvelope=JSON.parse(
    Buffer.from(get('--signed-evidence-envelope')).toString('utf8'));
  const policies:ReadinessPolicyBytes={
    entryFirstExit:get('--entry-first-policy'),
    marketDataQuality:get('--market-data-policy'),
    researchEvidenceGate:get('--evidence-gate-policy'),
    regimeHysteresis:get('--hysteresis-policy'),
    matchedOos:get('--matched-hysteresis-policy'),
    premiumCostDepthStress:get('--premium-stress-policy')
  };
  const report=runAdaptiveFullResearchReadiness({
    bundleBytes:await bytes(bundle,50*1024*1024),
    vendorArchiveBytes:get('--source-artifact'),
    calendarManifestBytes:get('--exchange-calendar-evidence'),
    calendarDocumentBytes:get('--calendar-source-document'),
    witnessEnvelope:evidenceEnvelope,
    reviewerTrustRegistryBytes:get('--reviewer-trust-registry'),
    pinnedReviewerTrustRegistrySha256:
      flags.get('--pinned-reviewer-trust-sha256')!,
    policyLockManifestBytes:get('--policy-lock-manifest'),
    pinnedPolicyLockManifestSha256:
      flags.get('--pinned-policy-lock-sha256')!,
    policies
  });
  // Only DATASET-LEVEL aggregate study rows and SHA fingerprints.
  // Source file bytes, licensed option instrument L1, private keys,
  // reviewer public PEM, signed witnesses and L1 quote paths NEVER printed.
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='INTERNALLY_CONSISTENT_EXTERNAL_REVIEW_REQUIRED')
    process.exitCode=1;
}
main().catch(err=>{
  console.error('FULL_OFFLINE_RESEARCH_READINESS_ERROR: '+
    (err instanceof Error?err.message:'UNEXPECTED_SOURCE_OR_POLICY_ERROR'));
  process.exitCode=1;
});
