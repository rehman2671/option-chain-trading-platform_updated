/**
 * Phase36 PRIVATE, manually authorized, local-only PDF text + certificate
 * review. Phase35 native pdfsig must be RE-RUN, not loaded as a forged report.
 * No network, broker credentials, trading engine or order operation.
 */
import {lstatSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  inspectPhase35LocalPdfSignature,
  type Phase35PdfsigRequest
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase35LocalPdfsig.js';
import {
  auditPhase36ExtractedEcnText,
  type Phase36ExtractRequest
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase36PdfTextAnnexure.js';
import {
  reviewPhase36DetachedX509,reviewPhase36EcnTextAndDetachedSigner,
  type Phase36DetachedCertificateInput,
  type Phase36IndependentCertificatePins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase36DetachedSignerPins.js';
import {privateEvidenceParentReady}
  from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';

const arg=(flag:string):string|null=>{
  const i=process.argv.indexOf(flag);
  return i<0?null:process.argv[i+1]??null;
};
function privateFile(file:string|null):file is string{
  if(!file||!isAbsolute(file)||file.length>1300||
    file.includes('\0')||
    !privateEvidenceParentReady(dirname(file)))return false;
  try{
    const s=lstatSync(resolve(file));
    return s.isFile()&&!s.isSymbolicLink()&&s.size>5&&
      s.size<=400000&&(s.mode&0o077)===0&&
      (typeof process.getuid!=='function'||s.uid===process.getuid());
  }catch{return false;}
}
const phase35File=arg('--private-phase35-request');
const phase36File=arg('--private-text-request');
const detachedFile=arg('--private-detached-certificates');
const pinsFile=arg('--independent-certificate-pins');
if(!process.argv.includes('--approve-offline-no-egress-review')||
  !privateFile(phase35File)||!privateFile(phase36File)||
  !privateFile(detachedFile)||!privateFile(pinsFile)){
  console.error('PRIVATE_PHASE36_REVIEW_PRECONDITIONS_NOT_READY');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase36-ecn.ts --approve-offline-no-egress-review --private-phase35-request <private-0600-json> --private-text-request <private-0600-json> --private-detached-certificates <private-0600-json> --independent-certificate-pins <private-0600-json>');
  process.exitCode=2;
}else{
  try{
    const read=(file:string):unknown=>
      JSON.parse(readFileSync(file,'utf8')) as unknown;
    const phase35Request=read(phase35File) as Phase35PdfsigRequest;
    const phase36Request=read(phase36File) as Phase36ExtractRequest;
    const signerEvidence=read(detachedFile) as
      Phase36DetachedCertificateInput;
    const independentPins=read(pinsFile) as
      Phase36IndependentCertificatePins;
    // Never use cached/injected Phase35 report as signature proof.
    const phase35=inspectPhase35LocalPdfSignature(phase35Request);
    // All three independent audit subscopes MUST refer to same file hash.
    if(phase35Request.expectedOriginalPdfSha256!==
      phase36Request.expectedOriginalPdfSha256||
      phase35Request.originalPdfPath!==phase36Request.originalPdfPath||
      phase35Request.expectedOriginalPdfSha256!==
      independentPins.originalPdfSha256||
      phase35Request.expectedOriginalPdfSha256!==
      signerEvidence.originalPdfSha256)
      throw Error('PRIVATE_PDF_IDENTITY_DISAGREEMENT');
    const text=auditPhase36ExtractedEcnText(phase36Request,phase35);
    const certificate=reviewPhase36DetachedX509(
      signerEvidence,independentPins);
    const summary=reviewPhase36EcnTextAndDetachedSigner(
      phase35,text,certificate);
    console.log(JSON.stringify({
      phase35:{
        status:phase35.status,reasonCodes:phase35.reasonCodes,
        originalPdfSha256:phase35.originalPdfSha256
      },
      phase36Text:text,detachedSignerCertificate:certificate,
      phase36Summary:summary
    },null,2));
    if(summary.status!==
      'TEXT_AND_DETACHED_CERT_PINS_LOCALLY_CONSISTENT_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PHASE36_OFFLINE_ECN_REVIEW_REJECTED_NO_PRIVATE_DETAIL');
    process.exitCode=2;
  }
}
