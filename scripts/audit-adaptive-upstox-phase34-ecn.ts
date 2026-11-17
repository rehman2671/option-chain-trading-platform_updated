/**
 * Phase34 PRIVATE local-only encrypted F&O history, PDF and external receipt
 * review. Does NOT parse/validate PAdES or contact exchange/broker.
 * No token, network, private signing key or trade operations.
 */
import {lstatSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  decryptHistoricalFoArchive
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase32HistoricalFoArchive.js';
import {
  type Phase34CrossExchangeInput
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase34CrossExchangeWap.js';
import {
  verifyAndClaimPhase34ExternalReceiptOnce,
  type Phase34ExternalValidationInput,
  type Phase34ExternalVerifierReceipt,
  type Phase34IndependentVerifierPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase34ExternalEcnReceiptGate.js';
import type {OfflineContractNoteRecord}
  from '../src/server/engine/ema15m/adaptiveUpstoxPhase33ContractNoteReview.js';
import {
  privateEvidenceParentReady
} from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';

interface Phase34PrivateManifest {
  schemaVersion:'ADAPTIVE_V2_PHASE34_PRIVATE_REVIEW_MANIFEST_V1';
  privateOriginalPdfPath:string;
  privateTranscribedAnnexurePath:string;
  privateCrossExchangeScopePath:string;
  privateExternalVerifierReceiptPath:string;
  privatePinnedTrustPolicyPath:string;
  encryptedFoHistoryArchivePaths:string[];
}
const arg=(name:string)=>{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
};
function ownerPrivateFile(path:string,maxBytes=3_000_000){
  if(!path||!isAbsolute(path)||path.length>1400||
    path.includes('\0')||
    !privateEvidenceParentReady(dirname(path)))
    return false;
  try{
    const m=lstatSync(resolve(path));
    return m.isFile()&&!m.isSymbolicLink()&&
      (m.mode&0o077)===0&&
      (typeof process.getuid!=='function'||m.uid===process.getuid())&&
      m.size>2&&m.size<=maxBytes;
  }catch{return false;}
}
const manifestPath=arg('--private-manifest');
const nonceDir=arg('--nonce-registry-dir');
const key=process.env.ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX;
if(!manifestPath||!ownerPrivateFile(manifestPath,65536)||
  !nonceDir||!privateEvidenceParentReady(nonceDir)||
  !key||!/^[0-9a-f]{64}$/i.test(key)){
  console.error('PRIVATE_PHASE34_ECN_REVIEW_OR_NONCE_KEY_PRECONDITION_FAILED');
  console.error('Usage: ADAPTIVE_V2_EVIDENCE_AES256_KEY_HEX=<PRIVATE_KEY_ALREADY_PROVISIONED> npx tsx scripts/audit-adaptive-upstox-phase34-ecn.ts --private-manifest <EXISTING_0600_JSON> --nonce-registry-dir <EXISTING_0700_OWNER_PRIVATE_DIRECTORY>');
  process.exitCode=2;
}else{
  try{
    const readPrivateJson=(path:string):unknown=>{
      if(!ownerPrivateFile(path))throw Error('INSECURE_PRIVATE_PATH');
      return JSON.parse(readFileSync(path,'utf8')) as unknown;
    };
    const m=readPrivateJson(manifestPath) as Phase34PrivateManifest;
    if(!m||m.schemaVersion!==
      'ADAPTIVE_V2_PHASE34_PRIVATE_REVIEW_MANIFEST_V1'||
      !Array.isArray(m.encryptedFoHistoryArchivePaths)||
      m.encryptedFoHistoryArchivePaths.length<1||
      m.encryptedFoHistoryArchivePaths.length>2||
      !ownerPrivateFile(m.privateOriginalPdfPath,2_000_000))
      throw Error('INVALID_PHASE34_MANIFEST');
    const pdf=readFileSync(m.privateOriginalPdfPath);
    const note=readPrivateJson(m.privateTranscribedAnnexurePath) as
      OfflineContractNoteRecord;
    // Original unmodified bytes are bound in memory, not copied into JSON.
    note.originalPdfBase64=pdf.toString('base64');
    const scope=readPrivateJson(m.privateCrossExchangeScopePath) as
      Phase34CrossExchangeInput['scope'];
    const receipt=readPrivateJson(m.privateExternalVerifierReceiptPath) as
      Phase34ExternalVerifierReceipt;
    const pins=readPrivateJson(m.privatePinnedTrustPolicyPath) as
      Phase34IndependentVerifierPins;
    const histories=m.encryptedFoHistoryArchivePaths.map(path=>{
      if(!ownerPrivateFile(path))throw Error('UNTRUSTED_FO_ENCRYPTED_ARCHIVE');
      const recovered=decryptHistoricalFoArchive(path,key);
      if(!recovered)throw Error('INVALID_ENCRYPTED_FO_HISTORY_EVIDENCE');
      return recovered.archive.input;
    });
    const cross:Phase34CrossExchangeInput={
      schemaVersion:'ADAPTIVE_V2_PHASE34_CROSS_EXCHANGE_FO_WAP_V1',
      source:'OPERATOR_PRIVATE_UNVERIFIED',
      note,historicalSources:histories,scope
    };
    const bundle:Phase34ExternalValidationInput={
      schemaVersion:'ADAPTIVE_V2_PHASE34_EXTERNAL_PDF_WAP_AUDIT_V1',
      crossExchange:cross,externalVerifier:receipt
    };
    const outcome=verifyAndClaimPhase34ExternalReceiptOnce(
      bundle,pins,nonceDir);
    // Never log original PDF, trade IDs, UCC, paths, key or signatures.
    console.log(JSON.stringify({
      review:outcome.report,
      nonceStatus:outcome.nonce.status,
      warning:'EXTERNAL_VALIDATOR_SIGNED_CLAIMS_ONLY_NOT_NATIVE_BROKER_ACK'
    },null,2));
    if(outcome.report.status!==
      'EXTERNAL_VALIDATOR_CLAIMS_AND_WAP_MATCHED_UNVERIFIED'||
      outcome.nonce.status!==
      'CLAIMED_EXTERNAL_RECEIPT_OFFLINE_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PRIVATE_PHASE34_ECN_REVIEW_REJECTED_WITHOUT_DETAILS');
    process.exitCode=2;
  }
}
