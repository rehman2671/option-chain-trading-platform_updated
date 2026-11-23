/**
 * Phase33 PRIVATE local-only reviewer prepare/verify of contract note evidence.
 *
 * Reads original private PDF bytes without parsing or uploading; imports
 * separately transcribed FO rows and the complete Phase31 historical cohort.
 * Outputs only hashes, status, counts, reason/action codes (never raw notes).
 * No network, broker token, signing key, native order or scheduler.
 */
import {lstatSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase33OfflineContractNote,preparePhase33NoteReviewMessage,
  type Phase33OfflineNoteBundle,type Phase33ExternalReviewTrust
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase33ContractNoteReview.js';
import {privateEvidenceParentReady}
  from '../src/server/engine/ema15m/adaptiveUpstoxPrivateEvidenceArchive.js';

const arg=(name:string):string|null=>{
  const i=process.argv.indexOf(name);
  return i<0?null:process.argv[i+1]??null;
};
const noteFile=arg('--note-record');
const pdfFile=arg('--original-pdf');
const trustFile=arg('--external-trust');
const mode=arg('--mode');
function privateFile(file:string|null):file is string{
  if(!file||!isAbsolute(file)||file.length>1300||
    file.includes('\0')||!privateEvidenceParentReady(dirname(file)))
    return false;
  try{
    const p=resolve(file),m=lstatSync(p);
    return m.isFile()&&!m.isSymbolicLink()&&
      (m.mode&0o077)===0&&m.size>10&&m.size<=3_000_000&&
      (typeof process.getuid!=='function'||m.uid===process.getuid());
  }catch{return false;}
}
if(!['prepare','verify'].includes(mode??'')||
  !privateFile(noteFile)||!privateFile(pdfFile)||
  (mode==='verify'&&!privateFile(trustFile))){
  console.error('PHASE33_PRIVATE_REVIEW_INPUT_UNAVAILABLE');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase33-contract-note.ts --mode prepare|verify --note-record <PRIVATE_0600_NOTE_AND_HISTORY_JSON> --original-pdf <PRIVATE_0600_ECN_PDF> [--external-trust <SEPARATELY_PINNED_PRIVATE_0600_REVIEW_TRUST_JSON>]');
  process.exitCode=2;
}else{
  try{
    const raw=JSON.parse(readFileSync(noteFile,'utf8')) as
      Phase33OfflineNoteBundle;
    const bytes=readFileSync(pdfFile);
    if(bytes.length>2_000_000)throw Error('OVERSIZED_DOCUMENT');
    raw.note.originalPdfBase64=bytes.toString('base64');
    if(mode==='prepare'){
      const pre=preparePhase33NoteReviewMessage(raw,raw.reviewer.signedAt);
      // The signed message contains only a domain-separated digest/time.
      console.log(JSON.stringify({
        status:pre.reasonCodes.length?'REJECTED':'PREPARED_NOT_SIGNED',
        reviewerMessageUtf8:pre.message,
        originalPdfSha256:pre.pdfHash,
        reasonCodes:pre.reasonCodes,
        warning:'THIS DOES_NOT_VALIDATE_BROKER_PDF_DIGITAL_SIGNATURE'
      },null,2));
      if(pre.reasonCodes.length)process.exitCode=2;
    }else{
      const pinned=JSON.parse(readFileSync(trustFile!,'utf8')) as
        Phase33ExternalReviewTrust;
      const audit=auditPhase33OfflineContractNote(raw,pinned);
      console.log(JSON.stringify(audit,null,2));
      if(audit.status!=='NOTE_AND_FO_ROWS_MATCHED_UNVERIFIED')
        process.exitCode=2;
    }
  }catch{
    // Never print raw error bodies, PDFs, UCC or private file paths.
    console.error('PRIVATE_CONTRACT_NOTE_REVIEW_ABORTED_WITHOUT_DETAILS');
    process.exitCode=2;
  }
}
