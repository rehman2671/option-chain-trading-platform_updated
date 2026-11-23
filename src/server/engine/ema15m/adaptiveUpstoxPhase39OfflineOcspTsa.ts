/**
 * Adaptive Swing v2 Phase39 — OFFLINE genuine OpenSSL OCSP response and
 * RFC3161 timestamp token/response validation against original PDF bytes.
 *
 * No URLs, outbound network, broker writes, or trading routes.
 * Both trust roots, response bytes and evaluation time remain private,
 * separately pinned OPERATOR inputs. Fake CAs can generate valid proofs.
 * This is NOT an official Upstox identity or independently trusted clock.
 */
import {createHash,X509Certificate} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {
  chmodSync,closeSync,constants,fsyncSync,lstatSync,mkdirSync,mkdtempSync,
  openSync,readFileSync,realpathSync,rmSync,writeSync
} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import type {
  Phase38OfflineCrlReport,Phase38OfflineCrlRequest
} from './adaptiveUpstoxPhase38SignedCrlTrustGate.js';
import type {Phase36DetachedCertificateInput}
  from './adaptiveUpstoxPhase36DetachedSignerPins.js';

const HASH=/^[a-f0-9]{64}$/;
const ALLOWED=['/usr/bin/openssl','/usr/local/bin/openssl'];
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const MAX_DOC=2_000_000,MAX_TOOL=12_000_000,
  MAX_OCSP=100_000,MAX_TSR=150_000,MAX_CERT=30_000,
  MAX_OUT=25_000;
const instant=(x:unknown):number=>
  typeof x==='string'&&/^\d{4}-\d\d-\d\dT/.test(x)&&
  /(?:Z|[+-]\d\d:\d\d)$/.test(x)?Date.parse(x):NaN;
function ownerDir(path:string):boolean{
  if(typeof path!=='string'||!isAbsolute(path)||
    path.length>1200||path.includes('\0'))return false;
  try{
    const p=resolve(path),s=lstatSync(p);
    return s.isDirectory()&&!s.isSymbolicLink()&&realpathSync(p)===p&&
      (s.mode&0o077)===0&&
      (typeof process.getuid!=='function'||s.uid===process.getuid());
  }catch{return false;}
}
function ownedFile(path:string,max:number):boolean{
  if(typeof path!=='string'||!isAbsolute(path)||
    path.length>1300||path.includes('\0')||
    !ownerDir(dirname(path)))return false;
  try{
    const p=resolve(path),s=lstatSync(p);
    return s.isFile()&&!s.isSymbolicLink()&&realpathSync(p)===p&&
      (s.mode&0o077)===0&&s.size>=12&&s.size<=max&&
      (typeof process.getuid!=='function'||s.uid===process.getuid());
  }catch{return false;}
}
function toolFile(path:string):boolean{
  if(typeof path!=='string'||!ALLOWED.includes(path))return false;
  try{
    const s=lstatSync(path);
    return s.isFile()&&!s.isSymbolicLink()&&s.size>=12&&
      s.size<=MAX_TOOL&&(s.mode&0o022)===0&&
      (s.uid===0||(typeof process.getuid==='function'&&
        s.uid===process.getuid()));
  }catch{return false;}
}
function exclusive(file:string,bytes:Uint8Array){
  const fd=openSync(file,constants.O_CREAT|constants.O_EXCL|
    constants.O_NOFOLLOW|constants.O_WRONLY,0o600);
  try{
    const data=Buffer.from(bytes);let done=0;
    while(done<data.length){
      const n=writeSync(fd,data,done,data.length-done);
      if(n<=0)throw Error('PRIVATE_WRITE_FAILURE');
      done+=n;
    }
    fsyncSync(fd);
  }finally{closeSync(fd);}
}
function singlePemCert(b:Buffer):X509Certificate|null{
  const s=b.toString('ascii');
  if(!/^-----BEGIN CERTIFICATE-----\r?\n(?:[A-Za-z0-9+/=]{1,76}\r?\n)+-----END CERTIFICATE-----\r?\n?$/.test(s))
    return null;
  try{return new X509Certificate(b);}catch{return null;}
}
interface Outcome {
  code:number|null;stdout:Uint8Array;stderr:Uint8Array;timedOut:boolean;
}
export type Phase39Runner=(binary:string,args:readonly string[],
  timeoutMs:number)=>Outcome;
export function nativePhase39OpenSsl(
  binary:string,args:readonly string[],timeoutMs:number
):Outcome{
  const p=spawnSync(binary,[...args],{
    shell:false,encoding:'buffer',timeout:timeoutMs,maxBuffer:MAX_OUT,
    env:{PATH:'/usr/bin:/bin',HOME:'/nonexistent',LANG:'C',
      LC_ALL:'C',TZ:'UTC',OPENSSL_CONF:'/dev/null'},
    windowsHide:true
  });
  return {code:p.status,
    stdout:p.stdout instanceof Buffer?p.stdout:new Uint8Array(),
    stderr:p.stderr instanceof Buffer?p.stderr:new Uint8Array(),
    timedOut:!!p.error||!!p.signal};
}
function isSuccess(x:Outcome):boolean{
  return !!x&&!x.timedOut&&x.code===0&&
    x.stdout instanceof Uint8Array&&x.stderr instanceof Uint8Array&&
    x.stdout.length<=MAX_OUT&&x.stderr.length<=MAX_OUT;
}
export interface Phase39PrivateRequest{
  schemaVersion:'ADAPTIVE_V2_PHASE39_OFFLINE_OCSP_TSA_V1';
  source:'OPERATOR_PRIVATE_UNVERIFIED';
  originalPdfPath:string;
  caPemPath:string;
  signedOcspDerPath:string;
  signedTimestampResponseDerPath:string;
  tsaSignerCertificatePemPath:string;
  opensslBinary:'/usr/bin/openssl'|'/usr/local/bin/openssl';
  assessmentAsOf:string;
  maximumOcspAgeSeconds:number;
  timeoutMs:number;
  operatorAuthorization:'MANUAL_PINNED_OFFLINE_OCSP_RFC3161_ONLY';
}
export interface Phase39IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE39_OCSP_TSA_PINS_V1';
  expectedOriginalPdfSha256:string;
  expectedCmsSignerDerSha256:string;
  expectedCaPemSha256:string;
  expectedCaDerSha256:string;
  expectedOcspDerSha256:string;
  expectedTimestampResponseDerSha256:string;
  expectedTsaSignerDerSha256:string;
  expectedOpenSslBinarySha256:string;
  expectedAssessmentAsOf:string;
}
export interface Phase39Report{
  mode:'OFFLINE_PINNED_OCSP_RFC3161_CRYPTO_AUDIT';
  status:'INVALID_EVIDENCE'|'OCSP_SIGNATURE_OR_STATUS_REJECTED'|
    'RFC3161_TIMESTAMP_REJECTED'|
    'OFFLINE_OCSP_AND_PDF_TIMESTAMP_CONSISTENT_UNVERIFIED';
  executionAuthorized:false;productionSafe:false;
  brokerAuthenticated:false;brokerStopInstalled:false;
  protectedOvernight:false;nativeOrderInstruction:null;
  actualNativeOpenSslRan:boolean;
  originalPdfHashMatched:boolean;
  originalCmsSignerDerPinned:boolean;
  offlineOcspGoodForSignerAtAssertedTime:boolean;
  rfc3161TokenVerifiedForExactOriginalPdf:boolean;
  onlineOcspActuallyFetched:false;
  verifiedRealWorldOcspResponderOrigin:false;
  realWorldBrokerIssuerEnrollmentVerified:false;
  independentTrustedTimeSourceVerified:false;
  originalCmsSignatureSigningTimeVerified:false;
  guaranteedNativeStopSurvival:false;
  originalPdfSha256:string|null;
  ocspDerSha256:string|null;
  timestampResponseSha256:string|null;
  ocspThisUpdate:string|null;
  ocspNextUpdate:string|null;
  reasonCodes:string[];
  warnings:string[];
}
const warnings=[
  'OCSP_RESPONSE_WAS_OPERATOR_SUPPLIED_OFFLINE_NOT_FETCHED_FROM_PINNED_RESPONDER',
  'FAKE_ROOT_CAN_SIGN_VALID_OCSP_AND_RFC3161_TOKENS',
  'RFC3161_RESPONSE_STAMPS_EXACT_PDF_BYTES_NOT_INDEPENDENTLY_CMS_SIGNING_TIME',
  'TIMESTAMP_CA_AND_TIMESTAMP_SOURCE_HAVE_NO_REAL_WORLD_AUTHENTICITY_PROOF',
  'OCSP_ASSESSMENT_TIME_IS_OPERATOR_ASSERTED_NOT_TRUSTED_CLOCK',
  'NO_GENUINE_UPSTOX_CA_ENROLLMENT_BROKER_ISSUER_OR_ACCOUNT_ATTESTATION',
  'NO_NATIVE_EXCHANGE_STOP_ACK_CANCEL_REPLACE_OR_OVERNIGHT_SURVIVAL',
  'NO_LIVE_NRML_AUTO_TRADING_GTT_WRITES_OR_15_15_POSITIONAL_AUTO_EXIT'
];
const blank=():Phase39Report=>({
  mode:'OFFLINE_PINNED_OCSP_RFC3161_CRYPTO_AUDIT',
  status:'INVALID_EVIDENCE',
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  protectedOvernight:false,nativeOrderInstruction:null,
  actualNativeOpenSslRan:false,originalPdfHashMatched:false,
  originalCmsSignerDerPinned:false,
  offlineOcspGoodForSignerAtAssertedTime:false,
  rfc3161TokenVerifiedForExactOriginalPdf:false,
  onlineOcspActuallyFetched:false,
  verifiedRealWorldOcspResponderOrigin:false,
  realWorldBrokerIssuerEnrollmentVerified:false,
  independentTrustedTimeSourceVerified:false,
  originalCmsSignatureSigningTimeVerified:false,
  guaranteedNativeStopSurvival:false,
  originalPdfSha256:null,ocspDerSha256:null,
  timestampResponseSha256:null,ocspThisUpdate:null,
  ocspNextUpdate:null,reasonCodes:[],warnings
});
const reject=(status:Phase39Report['status'],reason:string,
  fields?:Partial<Phase39Report>):Phase39Report=>({
  ...blank(),...fields,status,reasonCodes:[reason]
});
export interface Phase39OcspText{
  ok:boolean;reasonCode:string;
  thisUpdate:string|null;nextUpdate:string|null;
}
/** Strict single-CertID status, avoiding a forged success in another row. */
export function parsePhase39OcspResult(text:string):Phase39OcspText{
  const fail=(reasonCode:string):Phase39OcspText=>({
    ok:false,reasonCode,thisUpdate:null,nextUpdate:null
  });
  if(typeof text!=='string'||text.length<50||
    text.length>MAX_OUT||text.includes('\uFFFD'))
    return fail('MALFORMED_OCSP_VERIFIER_OUTPUT');
  const lines=text.split(/\r?\n/);
  if(lines.filter(x=>x.trim()==='Response verify OK').length!==1||
    lines.filter(x=>/:\s*(?:good|revoked|unknown)\s*$/.test(x)).length!==1)
    return fail('AMBIGUOUS_OR_MISSING_SINGLE_OCSP_STATUS');
  const status=lines.find(x=>/:\s*(?:good|revoked|unknown)\s*$/.test(x));
  if(!status?.endsWith(': good'))
    return fail('SIGNER_OCSP_STATUS_NOT_GOOD');
  const a=lines.filter(x=>/^\s*This Update:\s*/.test(x)),
    b=lines.filter(x=>/^\s*Next Update:\s*/.test(x));
  if(a.length!==1||b.length!==1)
    return fail('MISSING_OR_DUPLICATE_OCSP_VALIDITY_WINDOW');
  const start=Date.parse(a[0].split('This Update:')[1].trim()),
    stop=Date.parse(b[0].split('Next Update:')[1].trim());
  if(!Number.isFinite(start)||!Number.isFinite(stop)||stop<=start)
    return fail('INVALID_OCSP_THIS_NEXT_UPDATE');
  return {ok:true,reasonCode:'',
    thisUpdate:new Date(start).toISOString(),
    nextUpdate:new Date(stop).toISOString()};
}
/** Native verifications only. The caller may give a synthetic Phase38
 * report for isolated tests, but the MANUAL CLI always reruns real 37/38.
 */
export function auditPhase39OfflineOcspAndTsa(
  request:Phase39PrivateRequest,pins:Phase39IndependentPins,
  phase38:Phase38OfflineCrlReport,
  detached:Phase36DetachedCertificateInput,
  runner:Phase39Runner=nativePhase39OpenSsl
):Phase39Report{
  if(!request||!pins||!phase38||!detached||
    request.schemaVersion!=='ADAPTIVE_V2_PHASE39_OFFLINE_OCSP_TSA_V1'||
    request.source!=='OPERATOR_PRIVATE_UNVERIFIED'||
    request.operatorAuthorization!==
      'MANUAL_PINNED_OFFLINE_OCSP_RFC3161_ONLY'||
    pins.schemaVersion!=='INDEPENDENT_PHASE39_OCSP_TSA_PINS_V1'||
    !ALLOWED.includes(request.opensslBinary)||
    ![pins.expectedOriginalPdfSha256,
      pins.expectedCmsSignerDerSha256,pins.expectedCaPemSha256,
      pins.expectedCaDerSha256,pins.expectedOcspDerSha256,
      pins.expectedTimestampResponseDerSha256,
      pins.expectedTsaSignerDerSha256,pins.expectedOpenSslBinarySha256]
      .every(x=>typeof x==='string'&&HASH.test(x))||
    !Number.isFinite(instant(request.assessmentAsOf))||
    instant(request.assessmentAsOf)!==
      instant(pins.expectedAssessmentAsOf)||
    !Number.isSafeInteger(request.maximumOcspAgeSeconds)||
    request.maximumOcspAgeSeconds<60||
    request.maximumOcspAgeSeconds>86400||
    !Number.isSafeInteger(request.timeoutMs)||
    request.timeoutMs<500||request.timeoutMs>10000||
    typeof runner!=='function')
    return reject('INVALID_EVIDENCE','INVALID_PHASE39_APPROVAL_OR_PIN_POLICY');
  if(phase38.status!==
    'PINNED_CA_AND_SIGNED_CRL_CONSISTENT_OFFLINE_UNVERIFIED'||
    phase38.actuallyRanNativeOpenSsl!==true||
    phase38.originalPdfSha256!==pins.expectedOriginalPdfSha256||
    phase38.pinnedRootCaDerSha256!==pins.expectedCaDerSha256||
    phase38.executionAuthorized!==false||
    phase38.productionSafe!==false||
    phase38.brokerAuthenticated!==false||
    phase38.brokerStopInstalled!==false||
    phase38.protectedOvernight!==false||
    detached.originalPdfSha256!==pins.expectedOriginalPdfSha256)
    return reject('INVALID_EVIDENCE','PHASE38_CRL_CHAIN_NOT_ACCEPTABLE');
  if(!ownedFile(request.originalPdfPath,MAX_DOC)||
    !ownedFile(request.caPemPath,MAX_CERT)||
    !ownedFile(request.signedOcspDerPath,MAX_OCSP)||
    !ownedFile(request.signedTimestampResponseDerPath,MAX_TSR)||
    !ownedFile(request.tsaSignerCertificatePemPath,MAX_CERT)||
    !toolFile(request.opensslBinary))
    return reject('INVALID_EVIDENCE','PRIVATE_PDF_OCSP_TSA_OR_OPENSSL_FILE_INVALID');
  let pdf:Buffer,ca:Buffer,ocsp:Buffer,tsr:Buffer,tsa:Buffer,
    openssl:Buffer,leaf:Buffer;
  try{
    pdf=readFileSync(request.originalPdfPath);
    ca=readFileSync(request.caPemPath);
    ocsp=readFileSync(request.signedOcspDerPath);
    tsr=readFileSync(request.signedTimestampResponseDerPath);
    tsa=readFileSync(request.tsaSignerCertificatePemPath);
    openssl=readFileSync(request.opensslBinary);
    leaf=Buffer.from(detached.signerCertificateDerBase64,'base64');
  }catch{
    return reject('INVALID_EVIDENCE','UNREADABLE_PRIVATE_PHASE39_BYTES');
  }
  const caCert=singlePemCert(ca),tsaCert=singlePemCert(tsa);
  if(!caCert||!tsaCert||
    pdf.subarray(0,5).toString('ascii')!=='%PDF-'||
    !pdf.subarray(Math.max(0,pdf.length-1024))
      .toString('latin1').includes('%%EOF')||
    sha(pdf)!==pins.expectedOriginalPdfSha256||
    sha(ca)!==pins.expectedCaPemSha256||
    sha(caCert.raw)!==pins.expectedCaDerSha256||
    sha(tsaCert.raw)!==pins.expectedTsaSignerDerSha256||
    sha(ocsp)!==pins.expectedOcspDerSha256||
    sha(tsr)!==pins.expectedTimestampResponseDerSha256||
    sha(openssl)!==pins.expectedOpenSslBinarySha256||
    sha(leaf)!==pins.expectedCmsSignerDerSha256||
    !caCert.ca||tsaCert.ca||!tsaCert.checkIssued(caCert)||
    !tsaCert.verify(caCert.publicKey)||
    sha(Buffer.from(detached.issuerCertificateDerBase64,'base64'))!==
      pins.expectedCaDerSha256)
    return reject('INVALID_EVIDENCE','PHASE39_PDF_CA_CMS_SIGNER_OCSP_TSA_PIN_MISMATCH');
  const basic={
    originalPdfHashMatched:true,originalCmsSignerDerPinned:true,
    originalPdfSha256:sha(pdf),ocspDerSha256:sha(ocsp),
    timestampResponseSha256:sha(tsr)
  };
  let dir:string|null=null;
  const native=runner===nativePhase39OpenSsl;
  try{
    dir=mkdtempSync(join(dirname(request.originalPdfPath),'.phase39-'));
    chmodSync(dir,0o700);
    const caPath=join(dir,'root-ca.pem'),leafPath=join(dir,'cms-leaf.pem'),
      ocspPath=join(dir,'response.ocsp.der'),
      tsaPath=join(dir,'tsa.pem'),tsrPath=join(dir,'response.rfc3161.der'),
      pdfPath=join(dir,'original.pdf'),emptyStore=join(dir,'empty-store');
    mkdirSync(emptyStore,{mode:0o700});
    exclusive(caPath,ca);exclusive(ocspPath,ocsp);
    exclusive(tsaPath,tsa);exclusive(tsrPath,tsr);
    exclusive(pdfPath,pdf);
    let verifiedLeaf:X509Certificate;
    try{verifiedLeaf=new X509Certificate(leaf);}
    catch{return reject('INVALID_EVIDENCE','INVALID_PHASE39_CMS_SIGNER_DER',basic);}
    exclusive(leafPath,Buffer.from(verifiedLeaf.toString(),'ascii'));
    const ocspOut=runner(request.opensslBinary,[
      'ocsp','-respin',ocspPath,'-issuer',caPath,'-cert',leafPath,
      '-CAfile',caPath,'-no-CApath','-no-CAstore','-no_nonce',
      '-validity_period','0',
      '-status_age',String(request.maximumOcspAgeSeconds)
    ],request.timeoutMs);
    if(!isSuccess(ocspOut))
      return reject('OCSP_SIGNATURE_OR_STATUS_REJECTED',
        'OPENSSL_OCSP_SIGNATURE_CHAIN_OR_RESPONSE_FAILURE',basic);
    // OpenSSL prints verified response signature on STDERR, while
    // certificate GOOD/REVOKED status and signed times appear on STDOUT.
    if(Buffer.from(ocspOut.stderr).toString('utf8').trim()!==
      'Response verify OK')
      return reject('OCSP_SIGNATURE_OR_STATUS_REJECTED',
        'OPENSSL_OCSP_SIGNATURE_VALIDITY_NOT_CONFIRMED',basic);
    const parsed=parsePhase39OcspResult('Response verify OK\n'+
      Buffer.from(ocspOut.stdout).toString('utf8'));
    if(!parsed.ok||!parsed.thisUpdate||!parsed.nextUpdate)
      return reject('OCSP_SIGNATURE_OR_STATUS_REJECTED',
        parsed.reasonCode,basic);
    const t=instant(request.assessmentAsOf),
      thisTime=Date.parse(parsed.thisUpdate),
      nextTime=Date.parse(parsed.nextUpdate);
    if(t<thisTime||t>=nextTime||
      t-thisTime>request.maximumOcspAgeSeconds*1000)
      return reject('OCSP_SIGNATURE_OR_STATUS_REJECTED',
        'OFFLINE_OCSP_NOT_FRESH_AT_PINNED_ASSESSMENT_TIME',{
          ...basic,ocspThisUpdate:parsed.thisUpdate,
          ocspNextUpdate:parsed.nextUpdate
        });
    const withOcsp={...basic,
      offlineOcspGoodForSignerAtAssertedTime:true,
      ocspThisUpdate:parsed.thisUpdate,
      ocspNextUpdate:parsed.nextUpdate};
    // RFC3161 response must hash EXACT original PDF bytes.
    // It is NOT necessarily a token embedded in the PDF CMS.
    const tsOut=runner(request.opensslBinary,[
      'ts','-verify','-data',pdfPath,'-in',tsrPath,
      '-CAfile',caPath,'-CApath',emptyStore,'-untrusted',tsaPath
    ],request.timeoutMs);
    if(!isSuccess(tsOut)||
      Buffer.from(tsOut.stdout).toString('utf8').trim()!=='Verification: OK')
      return reject('RFC3161_TIMESTAMP_REJECTED',
        'OPENSSL_TIMESTAMP_SIGNATURE_CHAIN_OR_PDF_IMPRINT_REJECTED',
        withOcsp);
    // Independently bind the ACTUAL CMS signer inside this timestamp
    // response to the externally pinned TSA DER (not merely an untrusted
    // -untrusted certificate that OpenSSL might ignore).
    const tokenPath=join(dir,'actual-ts-token.der'),
      verifiedTsaPath=join(dir,'actual-ts-signer.pem');
    const extract=runner(request.opensslBinary,[
      'ts','-reply','-in',tsrPath,'-token_out','-out',tokenPath
    ],request.timeoutMs);
    if(!isSuccess(extract))
      return reject('RFC3161_TIMESTAMP_REJECTED',
        'RFC3161_SIGNED_TOKEN_EXTRACTION_REJECTED',withOcsp);
    exclusive(verifiedTsaPath,new Uint8Array());
    const cms=runner(request.opensslBinary,[
      'cms','-verify','-inform','DER','-in',tokenPath,
      '-noverify','-signer',verifiedTsaPath,'-out','/dev/null'
    ],request.timeoutMs);
    if(!isSuccess(cms))
      return reject('RFC3161_TIMESTAMP_REJECTED',
        'RFC3161_TOKEN_CMS_SIGNER_VERIFICATION_FAILED',withOcsp);
    const ss=lstatSync(verifiedTsaPath);
    if(!ss.isFile()||ss.isSymbolicLink()||(ss.mode&0o077)!==0||
      ss.size<300||ss.size>MAX_CERT)
      return reject('RFC3161_TIMESTAMP_REJECTED',
        'INVALID_RFC3161_SIGNER_CERTIFICATE_FILE',withOcsp);
    const actual=singlePemCert(readFileSync(verifiedTsaPath));
    if(!actual||sha(actual.raw)!==pins.expectedTsaSignerDerSha256)
      return reject('RFC3161_TIMESTAMP_REJECTED',
        'RFC3161_ACTUAL_TOKEN_SIGNER_DER_DIFFERS_FROM_PIN',withOcsp);
    if(!native)
      return reject('RFC3161_TIMESTAMP_REJECTED',
        'MOCKED_OCSP_TSA_OUTPUT_NOT_NATIVE_CRYPTO_EVIDENCE',withOcsp);
    return {...blank(),...withOcsp,
      status:'OFFLINE_OCSP_AND_PDF_TIMESTAMP_CONSISTENT_UNVERIFIED',
      actualNativeOpenSslRan:true,
      rfc3161TokenVerifiedForExactOriginalPdf:true};
  }catch{
    return reject('INVALID_EVIDENCE',
      'PRIVATE_PHASE39_OPENSSL_PROCESS_OR_TEMP_FAILURE',basic);
  }finally{
    if(dir)try{rmSync(dir,{recursive:true,force:true});}
      catch{/* Never print sensitive filenames or bytes. */}
  }
}
