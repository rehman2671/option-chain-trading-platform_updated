/**
 * Adaptive Swing v2 Phase37: explicit HUMAN/OFFLINE original PDF CMS
 * signing certificate binding. No broker HTTP, auto trading, CA promotion.
 *
 * Use only under separately provisioned OS-enforced no-egress sandbox.
 * Private 0600 JSON and original 0600 PDF under process-owned 0700 dirs.
 */
import {lstatSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase37OriginalPdfCmsSigner,
  type Phase37CmsRequest,
  type Phase37IndependentCmsPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase37OriginalCmsBinding.js';
import type {
  Phase36DetachedCertificateInput,
  Phase36IndependentCertificatePins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase36DetachedSignerPins.js';
import {
  privateEvidenceParentReady
} from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';

function arg(flag:string):string|null{
  const i=process.argv.indexOf(flag);
  return i<0?null:process.argv[i+1]??null;
}
function privateJson(path:string|null):path is string{
  if(typeof path!=='string'||!isAbsolute(path)||path.length>1300||
    path.includes('\0')||
    !privateEvidenceParentReady(dirname(path)))return false;
  try{
    const p=resolve(path),m=lstatSync(p);
    return m.isFile()&&!m.isSymbolicLink()&&
      (m.mode&0o077)===0&&m.size>10&&m.size<=150000&&
      (typeof process.getuid!=='function'||m.uid===process.getuid());
  }catch{return false;}
}
const requestPath=arg('--private-cms-request'),
  pinsPath=arg('--independent-cms-pins'),
  certPath=arg('--private-phase36-detached-cert'),
  certPinsPath=arg('--independent-phase36-cert-pins');
if(!process.argv.includes('--approve-offline-no-egress-cms')||
  !privateJson(requestPath)||!privateJson(pinsPath)||
  !privateJson(certPath)||!privateJson(certPinsPath)){
  console.error('PHASE37_PRIVATE_CMS_SOURCE_AND_APPROVAL_MISSING');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase37-cms.ts --approve-offline-no-egress-cms --private-cms-request <owner_0600.json> --independent-cms-pins <owner_0600.json> --private-phase36-detached-cert <owner_0600.json> --independent-phase36-cert-pins <owner_0600.json>');
  process.exitCode=2;
}else{
  try{
    const read=(path:string):unknown=>
      JSON.parse(readFileSync(path,'utf8')) as unknown;
    const request=read(requestPath) as Phase37CmsRequest,
      pins=read(pinsPath) as Phase37IndependentCmsPins,
      detached=read(certPath) as Phase36DetachedCertificateInput,
      detachedPins=read(certPinsPath) as
        Phase36IndependentCertificatePins;
    const report=auditPhase37OriginalPdfCmsSigner(
      request,pins,detached,detachedPins);
    // Never output any PDF, certificate bytes, private path, signer DN,
    // UCC, order ID, trade row, or native OpenSSL stderr/stdout.
    console.log(JSON.stringify(report,null,2));
    if(report.status!=='ORIGINAL_PDF_CMS_SIGNER_LINKED_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PHASE37_PRIVATE_CMS_REJECTED_NO_SECRET_DETAILS');
    process.exitCode=2;
  }
}
