/**
 * Explicit, locally invoked, owner-authorized read-only Upstox collector.
 * NEVER loaded by live trading engine, app router or scheduler.
 *
 * Requires a whitelisted static-IP host and Analytics Token set in
 * UPSTOX_ANALYTICS_READONLY_TOKEN. Don't put tokens in CLI args, JSON, logs.
 */
import {readFileSync} from 'node:fs';
import {
  captureExplicitlyAuthorizedUpstoxGetEvidence,
  createStrictNativeUpstoxAnalyticsGetTransport
} from '../src/server/engine/ema15m/adaptiveUpstoxAuthorizedGetCapture.js';
import {
  persistPrivateReadOnlyCapture,privateEvidenceParentReady
} from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';
import type {
  ReadOnlyExpectedPosition,ReadOnlyNrmlAuditPolicy
} from '../src/server/engine/ema15m/adaptiveReadOnlyNrmlProtectionAudit.js';

const flag=(key:string)=>{
  const i=process.argv.indexOf(key);
  return i<0?null:process.argv[i+1]??null;
};
const expectedFile=flag('--expected'),policyFile=flag('--policy'),
  parent=flag('--private-parent'),seq=Number(flag('--sequence'));
const approved=process.argv.includes('--approve-get-only'),
  whitelisted=process.argv.includes('--confirm-whitelisted-static-ip'),
  token=process.env.UPSTOX_ANALYTICS_READONLY_TOKEN;
if(!approved||!whitelisted||!expectedFile||!policyFile||!parent||
  !Number.isInteger(seq)||seq<1||seq>64||
  !privateEvidenceParentReady(parent)||
  !token||token.length<12){
  console.error('READ_ONLY_CAPTURE_NOT_ENABLED_OR_PRIVATE_DIR_NOT_SECURE');
  console.error('Usage: UPSTOX_ANALYTICS_READONLY_TOKEN=<secret managed by operator> npx tsx scripts/capture-adaptive-upstox-authorized-get.ts --approve-get-only --confirm-whitelisted-static-ip --expected <private-expected-FO-NRML.json> --policy <private-locked-policy.json> --private-parent <existing owner-private 0700 absolute directory> --sequence 1');
  process.exitCode=2;
}else{
  try{
    const parse=(path:string):unknown=>JSON.parse(readFileSync(path,'utf8'));
    const expected=parse(expectedFile) as ReadOnlyExpectedPosition;
    const policy=parse(policyFile) as ReadOnlyNrmlAuditPolicy;
    const outcome=await captureExplicitlyAuthorizedUpstoxGetEvidence({
      expected,phase25Policy:policy,
      // Operator-approved private metadata must use actual Upstox UCC.
      expectedBrokerUserId:expected.accountScopeId,
      analyticsToken:token,
      operatorAuthorization:'ACCOUNT_OWNER_APPROVED_GET_ONLY',
      staticIpReview:'OPERATOR_ATTESTS_WHITELISTED_EGRESS',
      credentialType:'UPSTOX_ANALYTICS_TOKEN_ONLY',
      sequence:seq,timeoutMs:7500
    },createStrictNativeUpstoxAnalyticsGetTransport());
    const stored=outcome.privateArchive?
      persistPrivateReadOnlyCapture(parent,outcome.report,outcome.privateArchive):
      null;
    // Explicitly never print archive, raw profile UCC, order ids, trade ids,
    // bearer token, full URL, exception object or filesystem path.
    console.log(JSON.stringify({report:outcome.report,
      privateStorageStatus:stored?.status??'NO_PRIVATE_ARCHIVE',
      privateArchiveSha256:stored?.evidenceJsonSha256??null},null,2));
    if(outcome.report.status!=='CAPTURE_RECORDED_UNVERIFIED'||
      stored?.status!=='PRIVATE_EVIDENCE_WRITTEN_UNVERIFIED'||
      outcome.report.phase26Status!=='STRUCTURAL_REVIEW_ONLY')
      process.exitCode=2;
  }catch{
    console.error('PRIVATE_READ_ONLY_GET_CAPTURE_ABORTED_WITHOUT_DETAILS');
    process.exitCode=2;
  }
}
