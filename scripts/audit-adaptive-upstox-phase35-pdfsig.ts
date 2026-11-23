/**
 * Phase35 manual operator-only Poppler pdfsig inspection (and optional
 * Phase34 dossier cross-check). NO API, shell, broker orders or polling.
 * Run in a separately provisioned unprivileged zero-egress container.
 */
import {lstatSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  inspectPhase35LocalPdfSignature,
  type Phase35PdfsigRequest
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase35LocalPdfsig.js';
import {
  reviewPhase35SignatureAndEcnDossier
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase35SignatureEcnDossier.js';
import type {
  Phase34ExternalValidationInput,Phase34IndependentVerifierPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase34ExternalEcnReceiptGate.js';
import {privateEvidenceParentReady}
  from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';

function arg(name:string):string|null{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
}
function privateFile(file:string|null,max=3_000_000):file is string{
  if(!file||!isAbsolute(file)||file.length>1300||
    file.includes('\0')||!privateEvidenceParentReady(dirname(file)))
    return false;
  try{
    const m=lstatSync(resolve(file));
    return m.isFile()&&!m.isSymbolicLink()&&
      (m.mode&0o077)===0&&m.size>10&&m.size<=max&&
      (typeof process.getuid!=='function'||m.uid===process.getuid());
  }catch{return false;}
}
const approved=process.argv.includes('--approve-local-offline-pdfsig');
const requestFile=arg('--private-request');
const externalFile=arg('--private-phase34-dossier');
const pinsFile=arg('--private-phase34-pins');
const externalRequested=externalFile!==null||pinsFile!==null;
if(!approved||!privateFile(requestFile,65536)||
  (externalRequested&&(!privateFile(externalFile)||
    !privateFile(pinsFile,65536)))){
  console.error('PHASE35_PRIVATE_OFFLINE_PDFSIG_PRECONDITION_NOT_MET');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase35-pdfsig.ts --approve-local-offline-pdfsig --private-request <0600_pinned_binary_pdf_nss_request.json> [--private-phase34-dossier <0600.json> --private-phase34-pins <0600.json>]');
  process.exitCode=2;
}else{
  try{
    const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')) as unknown;
    const request=read(requestFile) as Phase35PdfsigRequest;
    const local=inspectPhase35LocalPdfSignature(request);
    const combined=externalRequested?
      reviewPhase35SignatureAndEcnDossier(
        local,
        read(externalFile!) as Phase34ExternalValidationInput,
        read(pinsFile!) as Phase34IndependentVerifierPins
      ):null;
    // Never print subprocess stderr/stdout, signer DN, filenames or ECN rows.
    console.log(JSON.stringify({
      localPdfsig:local,phase34CrossChecked:combined,
      warning:'NO_OCSP_NO_BROKER_ISSUER_ATTESTATION_NO_NRML_TRADING_AUTH'
    },null,2));
    if(local.status!==
      'LOCAL_PDFSIG_CRYPTO_AND_NSS_TRUST_REPORTED_UNVERIFIED'||
      (externalRequested&&combined?.status!==
        'LOCAL_SIGNATURE_AND_EXTERNAL_ECN_ASSERTIONS_MATCH_UNVERIFIED'))
      process.exitCode=2;
  }catch{
    console.error('PRIVATE_PHASE35_PDFSIG_REVIEW_FAILED_NO_SENSITIVE_DETAIL');
    process.exitCode=2;
  }
}
