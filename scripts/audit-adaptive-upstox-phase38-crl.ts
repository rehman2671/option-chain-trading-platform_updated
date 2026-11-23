/**
 * Adaptive Swing v2 Phase38 private manual OFFLINE signed-CRL review.
 *
 * Re-runs native Phase37 CMS crypto from original PDF in this process;
 * then checks pinned CA and issuer-signed CRL at asserted review time.
 *
 * The private certificate enrollment / CRL freshness assertion is NOT an
 * independently recognized real Upstox CA, current online OCSP or TSA.
 * No broker APIs, engine routes, live orders, GTT or scheduled jobs.
 */
import {lstatSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase37OriginalPdfCmsSigner,
  type Phase37CmsRequest,
  type Phase37IndependentCmsPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase37OriginalCmsBinding.js';
import {
  auditPhase38OfflineSignedCrl,
  type Phase38OfflineCrlRequest,
  type Phase38IndependentCrlPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase38SignedCrlTrustGate.js';
import type {
  Phase36DetachedCertificateInput,
  Phase36IndependentCertificatePins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase36DetachedSignerPins.js';
import {privateEvidenceParentReady}
  from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';

const arg=(flag:string):string|null=>{
  const i=process.argv.indexOf(flag);
  return i<0?null:process.argv[i+1]??null;
};
function privateJson(path:string|null):path is string{
  if(typeof path!=='string'||!isAbsolute(path)||path.length>1300||
    path.includes('\0')||!privateEvidenceParentReady(dirname(path)))
    return false;
  try{
    const p=resolve(path),s=lstatSync(p);
    return s.isFile()&&!s.isSymbolicLink()&&
      (s.mode&0o077)===0&&s.size>10&&s.size<=150000&&
      (typeof process.getuid!=='function'||s.uid===process.getuid());
  }catch{return false;}
}
const paths=[
  '--private-phase37-cms-request',
  '--independent-phase37-cms-pins',
  '--private-phase36-detached-certificate',
  '--independent-phase36-certificate-pins',
  '--private-phase38-crl-request',
  '--independent-phase38-crl-pins'
];
const values=paths.map(arg);
if(!process.argv.includes('--approve-operator-offline-crl-review')||
  !values.every(privateJson)){
  console.error('PHASE38_PRIVATE_CRL_OR_MANUAL_APPROVAL_MISSING');
  console.error(
    'Usage: npx tsx scripts/audit-adaptive-upstox-phase38-crl.ts --approve-operator-offline-crl-review '+
    paths.map(x=>x+' <OWNER_PRIVATE_0600_JSON>').join(' ')
  );
  process.exitCode=2;
}else{
  try{
    const read=(p:string)=>
      JSON.parse(readFileSync(p,'utf8')) as unknown;
    const cmsRequest=read(values[0]!) as Phase37CmsRequest,
      cmsPins=read(values[1]!) as Phase37IndependentCmsPins,
      detached=read(values[2]!) as Phase36DetachedCertificateInput,
      detachedPins=read(values[3]!) as
        Phase36IndependentCertificatePins,
      crlRequest=read(values[4]!) as Phase38OfflineCrlRequest,
      crlPins=read(values[5]!) as Phase38IndependentCrlPins;
    if(cmsRequest.originalPdfPath!==crlRequest.originalPdfPath||
      cmsRequest.opensslBinary!==crlRequest.opensslBinary||
      cmsPins.expectedOriginalPdfSha256!==
        crlPins.expectedOriginalPdfSha256||
      cmsPins.expectedSignerDerSha256!==
        crlPins.expectedCmsSignerDerSha256||
      cmsPins.expectedIssuerDerSha256!==
        crlPins.expectedRootCaDerSha256||
      cmsPins.expectedOpenSslBinarySha256!==
        crlPins.expectedOpenSslBinarySha256)
      throw Error('INCONSISTENT_PRIVATE_PHASE37_PHASE38_CRYPTO_INPUT');
    // NEVER trust a cached operator-supplied Phase37 "PASS" document.
    // Must rerun native OpenSSL CMS verification in this operator process.
    const cms=auditPhase37OriginalPdfCmsSigner(
      cmsRequest,cmsPins,detached,detachedPins);
    const crl=auditPhase38OfflineSignedCrl(
      crlRequest,crlPins,cms,detached);
    // Deliberately report ONLY redacted statuses, hashes and reason codes.
    console.log(JSON.stringify({
      phase37Cms:{
        status:cms.status,reasonCodes:cms.reasonCodes,
        originalPdfSha256:cms.originalPdfSha256
      },
      phase38SignedCrl:crl,
      warning:'OFFLINE_CRL_AT_OPERATOR_TIME_IS_NOT_TRUSTED_UPSTOX_CA_OR_CURRENT_OCSP'
    },null,2));
    if(cms.status!=='ORIGINAL_PDF_CMS_SIGNER_LINKED_UNVERIFIED'||
      crl.status!==
        'PINNED_CA_AND_SIGNED_CRL_CONSISTENT_OFFLINE_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PHASE38_PRIVATE_CRL_REVIEW_REJECTED_NO_SENSITIVE_DETAIL');
    process.exitCode=2;
  }
}
