/**
 * Phase39 PRIVATE manual-only offline OCSP + RFC3161.
 *
 * Phase37 original CMS and Phase38 signed CRL are rerun NATIVELY here.
 * Never trust cached operator-supplied PASSED reports.
 * No broker token, API requests, URL, trading route, order/GTT write.
 */
import {lstatSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase37OriginalPdfCmsSigner,
  type Phase37CmsRequest,type Phase37IndependentCmsPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase37OriginalCmsBinding.js';
import {
  auditPhase38OfflineSignedCrl,
  type Phase38OfflineCrlRequest,type Phase38IndependentCrlPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase38SignedCrlTrustGate.js';
import {
  auditPhase39OfflineOcspAndTsa,
  type Phase39PrivateRequest,type Phase39IndependentPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase39OfflineOcspTsa.js';
import type {
  Phase36DetachedCertificateInput,
  Phase36IndependentCertificatePins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase36DetachedSignerPins.js';
import {
  privateEvidenceParentReady
} from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';
const flags=[
  '--private-phase37-cms-request',
  '--independent-phase37-cms-pins',
  '--private-phase36-detached-certificates',
  '--independent-phase36-x509-pins',
  '--private-phase38-crl-request',
  '--independent-phase38-crl-pins',
  '--private-phase39-ocsp-tsa-request',
  '--independent-phase39-ocsp-tsa-pins'
];
const val=(flag:string):string|null=>{
  const i=process.argv.indexOf(flag);
  return i>=0?process.argv[i+1]??null:null;
};
function privateInput(p:string|null):p is string{
  if(!p||!isAbsolute(p)||p.length>1300||p.includes('\0')||
    !privateEvidenceParentReady(dirname(p)))return false;
  try{
    const s=lstatSync(resolve(p));
    return s.isFile()&&!s.isSymbolicLink()&&
      s.size>10&&s.size<=160000&&(s.mode&0o077)===0&&
      (typeof process.getuid!=='function'||s.uid===process.getuid());
  }catch{return false;}
}
const inputs=flags.map(val);
if(!process.argv.includes('--approve-private-offline-ocsp-tsa')||
  !inputs.every(privateInput)){
  console.error('PHASE39_PRIVATE_INPUT_OR_EXPLICIT_APPROVAL_REQUIRED');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase39-ocsp-tsa.ts --approve-private-offline-ocsp-tsa '+
    flags.map(x=>x+' <OWNER_0600_JSON>').join(' '));
  process.exitCode=2;
}else{
  try{
    const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')) as unknown;
    const cmsRequest=read(inputs[0]!) as Phase37CmsRequest,
      cmsPins=read(inputs[1]!) as Phase37IndependentCmsPins,
      detached=read(inputs[2]!) as Phase36DetachedCertificateInput,
      x509Pins=read(inputs[3]!) as Phase36IndependentCertificatePins,
      crlRequest=read(inputs[4]!) as Phase38OfflineCrlRequest,
      crlPins=read(inputs[5]!) as Phase38IndependentCrlPins,
      latest=read(inputs[6]!) as Phase39PrivateRequest,
      latestPins=read(inputs[7]!) as Phase39IndependentPins;
    if(cmsRequest.originalPdfPath!==crlRequest.originalPdfPath||
      cmsRequest.originalPdfPath!==latest.originalPdfPath||
      crlRequest.privateRootCaPemPath!==latest.caPemPath||
      cmsRequest.opensslBinary!==crlRequest.opensslBinary||
      cmsRequest.opensslBinary!==latest.opensslBinary||
      cmsPins.expectedOriginalPdfSha256!==
        crlPins.expectedOriginalPdfSha256||
      cmsPins.expectedOriginalPdfSha256!==
        latestPins.expectedOriginalPdfSha256||
      cmsPins.expectedSignerDerSha256!==
        crlPins.expectedCmsSignerDerSha256||
      cmsPins.expectedSignerDerSha256!==
        latestPins.expectedCmsSignerDerSha256||
      cmsPins.expectedIssuerDerSha256!==
        crlPins.expectedRootCaDerSha256||
      cmsPins.expectedIssuerDerSha256!==
        latestPins.expectedCaDerSha256||
      crlPins.expectedRootCaPemSha256!==
        latestPins.expectedCaPemSha256||
      cmsPins.expectedOpenSslBinarySha256!==
        latestPins.expectedOpenSslBinarySha256||
      cmsPins.expectedOpenSslBinarySha256!==
        crlPins.expectedOpenSslBinarySha256)
      throw Error('PHASE37_38_39_PRIVATE_SOURCE_IDENTITY_NOT_PINNED');
    // Each of 37, 38, 39 executes real local cryptography in this process.
    const cms=auditPhase37OriginalPdfCmsSigner(
      cmsRequest,cmsPins,detached,x509Pins);
    const crl=auditPhase38OfflineSignedCrl(
      crlRequest,crlPins,cms,detached);
    const check=auditPhase39OfflineOcspAndTsa(
      latest,latestPins,crl,detached);
    console.log(JSON.stringify({
      cmsStatus:cms.status,cmsReasons:cms.reasonCodes,
      crlStatus:crl.status,crlReasons:crl.reasonCodes,
      offlineOcspTsa:check,
      warning:'SIGNED_RESPONSES_UNDER_OPERATOR_ROOT_ARE_NOT_BROKER_IDENTITY_OR_NATIVE_STOP_PROOF'
    },null,2));
    if(check.status!==
      'OFFLINE_OCSP_AND_PDF_TIMESTAMP_CONSISTENT_UNVERIFIED')
      process.exitCode=2;
  }catch{
    // Raw filenames, cert subjects, keys, DER and PDF not logged.
    console.error('PHASE39_OFFLINE_SOURCE_REJECTED_NO_SENSITIVE_DETAILS');
    process.exitCode=2;
  }
}
