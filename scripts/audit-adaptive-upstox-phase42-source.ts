/**
 * Phase42 PRIVATE/OFFLINE original GET response receipts + original calendar
 * PDF bytes. This CLI never calls Upstox, NSE, BSE, a webhook, or an order
 * API. It will never authenticate a purported broker TLS handshake.
 *
 * Provision two existing owner-0600 JSON files in owner-0700 directories.
 * Do not put bearer tokens, private keys or personal account data in logs.
 */
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {
  auditPhase42OriginalGetReceipts,
  type Phase42RawSourceBundle,type Phase42IndependentPins
} from '../src/server/engine/ema15m/adaptiveUpstoxPhase42RawGetProvenance.js';

const option=(name:string):string|null=>{
  const at=process.argv.indexOf(name);
  return at<0?null:process.argv[at+1]??null;
};
function approvedPrivateJson(p:string|null):p is string{
  if(!p||!isAbsolute(p)||p.length>1300||p.includes('\0'))
    return false;
  try{
    const actual=resolve(p),dir=dirname(actual),
      f=lstatSync(actual),d=lstatSync(dir);
    return f.isFile()&&!f.isSymbolicLink()&&
      d.isDirectory()&&!d.isSymbolicLink()&&
      realpathSync(actual)===actual&&realpathSync(dir)===dir&&
      f.size>10&&f.size<=4_500_000&&(f.mode&0o077)===0&&
      (d.mode&0o077)===0&&
      (typeof process.getuid!=='function'||(
        f.uid===process.getuid()&&d.uid===process.getuid()));
  }catch{return false;}
}
const source=option('--private-original-get-receipt-bundle'),
  pins=option('--independent-origin-witness-pins');
if(!process.argv.includes('--approve-offline-readonly-receipt-audit')||
  !approvedPrivateJson(source)||!approvedPrivateJson(pins)){
  console.error('PHASE42_PRIVATE_OFFLINE_RECEIPT_PRECONDITIONS_NOT_MET');
  console.error('Usage: npx tsx scripts/audit-adaptive-upstox-phase42-source.ts --approve-offline-readonly-receipt-audit --private-original-get-receipt-bundle <OWNER_0600_JSON> --independent-origin-witness-pins <OWNER_0600_JSON>');
  process.exitCode=2;
}else{
  try{
    const body=JSON.parse(readFileSync(source,'utf8')) as
      Phase42RawSourceBundle;
    const trust=JSON.parse(readFileSync(pins,'utf8')) as
      Phase42IndependentPins;
    const review=auditPhase42OriginalGetReceipts(body,trust);
    // Only redacted aggregate findings. Never output original HTTP body,
    // raw account scope, instrument, GTT ID, witness keys or private paths.
    console.log(JSON.stringify(review,null,2));
    if(review.status!==
      'RAW_GET_BYTES_AND_CALENDAR_PDF_DUAL_WITNESSED_UNVERIFIED')
      process.exitCode=2;
  }catch{
    console.error('PHASE42_PRIVATE_SOURCE_RECEIPT_REJECTED_NO_SENSITIVE_DETAILS');
    process.exitCode=2;
  }
}
