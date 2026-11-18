/**
 * Adaptive Swing v2 Phase38: OFFLINE signed-CRL and pinned CA-chain audit.
 *
 * Real OpenSSL -crl_check_all verifies a locally pinned issuer-signed CRL
 * and the signer chain at a separately ASSERTED evaluation time.
 *
 * No OCSP, no independent real-world broker/CA enrollment, no TSA,
 * no account/stop-order verification. Operator-only and fail-closed.
 */
import {createHash,X509Certificate} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {
  chmodSync,closeSync,constants,fsyncSync,lstatSync,mkdtempSync,
  openSync,readFileSync,realpathSync,rmSync,writeSync
} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import type {Phase37CmsAuditReport}
  from './adaptiveUpstoxPhase37OriginalCmsBinding.js';
import type {Phase36DetachedCertificateInput}
  from './adaptiveUpstoxPhase36DetachedSignerPins.js';

const HASH=/^[a-f0-9]{64}$/;
const APPROVED_BINS=['/usr/bin/openssl','/usr/local/bin/openssl'];
const MAX_PDF=2_000_000,MAX_BIN=12_000_000,
  MAX_CA=30_000,MAX_CRL=128_000,MAX_OUTPUT=20_000;
const digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const date=(x:unknown):number=>
  typeof x==='string'&&
  /^\d{4}-\d\d-\d\dT/.test(x)&&
  /(?:Z|[+-]\d\d:\d\d)$/.test(x)?Date.parse(x):NaN;
const ownerDir=(path:string):boolean=>{
  if(typeof path!=='string'||!isAbsolute(path)||path.length>1100||
    path.includes('\0'))return false;
  try{
    const p=resolve(path),s=lstatSync(p);
    return s.isDirectory()&&!s.isSymbolicLink()&&
      realpathSync(p)===p&&(s.mode&0o077)===0&&
      (typeof process.getuid!=='function'||s.uid===process.getuid());
  }catch{return false;}
};
const secureFile=(path:string,max:number,privateOnly:boolean)=>{
  if(typeof path!=='string'||!isAbsolute(path)||path.length>1300||
    path.includes('\0'))return false;
  try{
    const p=resolve(path),s=lstatSync(p);
    if(!s.isFile()||s.isSymbolicLink()||realpathSync(p)!==p||
      s.size<12||s.size>max||(s.mode&0o022)!==0)
      return false;
    if(privateOnly&&((s.mode&0o077)!==0||
      !ownerDir(dirname(path))||
      (typeof process.getuid==='function'&&s.uid!==process.getuid())))
      return false;
    if(!privateOnly&&s.uid!==0&&
      typeof process.getuid==='function'&&s.uid!==process.getuid())
      return false;
    return true;
  }catch{return false;}
};
export interface Phase38OfflineCrlRequest{
  schemaVersion:'ADAPTIVE_V2_PHASE38_SIGNED_CRL_CHAIN_V1';
  source:'OPERATOR_PRIVATE_UNVERIFIED';
  originalPdfPath:string;
  privateRootCaPemPath:string;
  privateSignedCrlPemPath:string;
  opensslBinary:'/usr/bin/openssl'|'/usr/local/bin/openssl';
  assessmentAsOf:string;
  maxCrlAgeHours:number;
  timeoutMs:number;
  operatorAuthorization:'MANUAL_OFFLINE_PINNED_CRL_REVIEW';
}
export interface Phase38IndependentCrlPins{
  schemaVersion:'INDEPENDENT_PHASE38_CRL_ROOT_SOURCE_PINS_V1';
  expectedOriginalPdfSha256:string;
  expectedCmsSignerDerSha256:string;
  expectedRootCaDerSha256:string;
  expectedRootCaPemSha256:string;
  expectedSignedCrlPemSha256:string;
  expectedOpenSslBinarySha256:string;
  expectedAssessmentAsOf:string;
}
export interface Phase38OpenSslResult{
  exitCode:number|null;
  stdout:Uint8Array;
  stderr:Uint8Array;
  timedOut:boolean;
}
export type Phase38OpenSslRunner=(
  binary:string,args:readonly string[],timeoutMs:number
)=>Phase38OpenSslResult;
export interface Phase38OfflineCrlReport{
  mode:'OFFLINE_REAL_OPENSSL_PINNED_CRL_CHAIN_CHECK';
  status:'INVALID_EVIDENCE'|'OFFLINE_CRL_CHAIN_REJECTED'|
    'PINNED_CA_AND_SIGNED_CRL_CONSISTENT_OFFLINE_UNVERIFIED';
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  protectedOvernight:false;
  nativeOrderInstruction:null;
  actuallyRanNativeOpenSsl:boolean;
  sameCmsSignerAsPhase37:boolean;
  issuerCaDerMatchesExternalPin:boolean;
  signedCrlAcceptedAtClaimedAsOf:boolean;
  localIssuerCertificateChainVerified:boolean;
  offlineCrlFreshAtClaimedAsOf:boolean;
  currentOnlineOcspRevocationVerified:false;
  independentCaEnrollmentAndBrokerIdentityVerified:false;
  trustedRfc3161TimestampVerified:false;
  originalPdfActiveSignatureFieldVerified:false;
  genuineExchangeOrderAcknowledgementVerified:false;
  overnightStopContinuityVerified:false;
  originalPdfSha256:string|null;
  pinnedRootCaDerSha256:string|null;
  pinnedCrlSha256:string|null;
  crlThisUpdate:string|null;
  crlNextUpdate:string|null;
  reasonCodes:string[];
  warnings:string[];
}
const warnings=[
  'ROOT_CA_FINGERPRINT_IS_EXTERNALLY_SUPPLIED_NOT_GENUINE_UPSTOX_BROKER_ATTESTATION',
  'CRL_SIGNED_BY_AN_UNTRUSTED_FAKE_CA_CAN_STILL_VERIFY_CRYPTOGRAPHICALLY',
  'ASSESSMENT_TIME_IS_OPERATOR_ASSERTED_NOT_INDEPENDENT_TRUSTED_TIMESTAMP',
  'OFFLINE_SIGNED_CRL_VALIDITY_DOES_NOT_EQUAL_CURRENT_ONLINE_OCSP_STATUS',
  'EXPLICITLY_PINNED_SINGLE_SELF_SIGNED_CA_CHAIN_ONLY',
  'OPENSSL_VERIFICATION_MUST_RUN_IN_INDEPENDENT_NO_NETWORK_OS_SANDBOX',
  'CMS_CRYPTO_AND_ECN_DO_NOT_PROVE_NATIVE_EXCHANGE_STOP_ORDER_ACK',
  'NO_LIVE_NRML_ORDERS_GTT_WRITES_OR_15_15_POSITIONAL_EXIT'
];
const initial=():Phase38OfflineCrlReport=>({
  mode:'OFFLINE_REAL_OPENSSL_PINNED_CRL_CHAIN_CHECK',
  status:'INVALID_EVIDENCE',
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  protectedOvernight:false,nativeOrderInstruction:null,
  actuallyRanNativeOpenSsl:false,
  sameCmsSignerAsPhase37:false,
  issuerCaDerMatchesExternalPin:false,
  signedCrlAcceptedAtClaimedAsOf:false,
  localIssuerCertificateChainVerified:false,
  offlineCrlFreshAtClaimedAsOf:false,
  currentOnlineOcspRevocationVerified:false,
  independentCaEnrollmentAndBrokerIdentityVerified:false,
  trustedRfc3161TimestampVerified:false,
  originalPdfActiveSignatureFieldVerified:false,
  genuineExchangeOrderAcknowledgementVerified:false,
  overnightStopContinuityVerified:false,
  originalPdfSha256:null,pinnedRootCaDerSha256:null,
  pinnedCrlSha256:null,crlThisUpdate:null,crlNextUpdate:null,
  reasonCodes:[],warnings
});
const fail=(status:Phase38OfflineCrlReport['status'],
  reason:string,partial?:Partial<Phase38OfflineCrlReport>):
  Phase38OfflineCrlReport=>({
    ...initial(),...partial,status,reasonCodes:[reason]
  });
const privateWrite=(path:string,bytes:Uint8Array)=>{
  const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|
    constants.O_NOFOLLOW|constants.O_WRONLY,0o600);
  try{
    const buffer=Buffer.from(bytes);let n=0;
    while(n<buffer.length){
      const wrote=writeSync(fd,buffer,n,buffer.length-n);
      if(wrote<=0)throw Error('SHORT_PRIVATE_CA_WRITE');
      n+=wrote;
    }
    fsyncSync(fd);
  }finally{closeSync(fd);}
};
function singlePemCertificate(data:Buffer):X509Certificate|null{
  const text=data.toString('ascii');
  if(!/^-----BEGIN CERTIFICATE-----\r?\n(?:[A-Za-z0-9+/=]{1,76}\r?\n)+-----END CERTIFICATE-----\r?\n?$/.test(text))
    return null;
  try{return new X509Certificate(data);}catch{return null;}
}
const singleCrlPem=(data:Buffer):boolean=>
  /^-----BEGIN X509 CRL-----\r?\n(?:[A-Za-z0-9+/=]{1,76}\r?\n)+-----END X509 CRL-----\r?\n?$/
    .test(data.toString('ascii'));
/** Native fixed arguments; no shell, no AIA, OCSP or CRL download. */
export function nativePhase38OpenSslRunner(
  binary:string,args:readonly string[],timeoutMs:number
):Phase38OpenSslResult{
  const result=spawnSync(binary,[...args],{
    shell:false,encoding:'buffer',timeout:timeoutMs,
    maxBuffer:MAX_OUTPUT,windowsHide:true,
    env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',
      TZ:'UTC',HOME:'/nonexistent',OPENSSL_CONF:'/dev/null'}
  });
  return {
    exitCode:result.status,
    stdout:result.stdout instanceof Buffer?result.stdout:new Uint8Array(),
    stderr:result.stderr instanceof Buffer?result.stderr:new Uint8Array(),
    timedOut:!!result.error||!!result.signal
  };
}
function acceptableOutput(
  out:Phase38OpenSslResult
):boolean{
  return !!out&&!out.timedOut&&out.exitCode===0&&
    out.stdout instanceof Uint8Array&&
    out.stderr instanceof Uint8Array&&
    out.stdout.length<=MAX_OUTPUT&&
    out.stderr.length<=MAX_OUTPUT;
}
export interface Phase38ParsedCrlDates{
  valid:boolean;
  thisUpdate:string|null;
  nextUpdate:string|null;
  reasonCode:string;
}
export function parsePhase38CrlDates(output:string):
  Phase38ParsedCrlDates{
  const bad=(reasonCode:string):Phase38ParsedCrlDates=>({
    valid:false,thisUpdate:null,nextUpdate:null,reasonCode
  });
  if(typeof output!=='string'||output.length<30||
    output.length>2048||output.includes('\uFFFD'))
    return bad('UNKNOWN_OR_MALFORMED_OPENSSL_CRL_DATES');
  const lines=output.trim().split(/\r?\n/);
  if(lines.length!==2||
    !/^lastUpdate=[A-Za-z]{3} [ 0-9]{1,2} \d\d:\d\d:\d\d \d{4} GMT$/.test(lines[0])||
    !/^nextUpdate=[A-Za-z]{3} [ 0-9]{1,2} \d\d:\d\d:\d\d \d{4} GMT$/.test(lines[1]))
    return bad('UNKNOWN_OR_DUPLICATE_CRL_DATE_FIELDS');
  const a=Date.parse(lines[0].slice('lastUpdate='.length)),
    b=Date.parse(lines[1].slice('nextUpdate='.length));
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)
    return bad('INVALID_SIGNED_CRL_TIME_INTERVAL');
  return {
    valid:true,thisUpdate:new Date(a).toISOString(),
    nextUpdate:new Date(b).toISOString(),reasonCode:''
  };
}
/**
 * Phase37 local CMS verifier must already be run in the same operator CLI.
 * CA/CRL evidence cannot authorize trading, even if it cryptographically
 * validates under an externally pinned *synthetic* root.
 */
export function auditPhase38OfflineSignedCrl(
  request:Phase38OfflineCrlRequest,
  pins:Phase38IndependentCrlPins,
  phase37:Phase37CmsAuditReport,
  detached:Phase36DetachedCertificateInput,
  runner:Phase38OpenSslRunner=nativePhase38OpenSslRunner
):Phase38OfflineCrlReport{
  if(!request||!pins||!phase37||!detached||
    request.schemaVersion!=='ADAPTIVE_V2_PHASE38_SIGNED_CRL_CHAIN_V1'||
    request.source!=='OPERATOR_PRIVATE_UNVERIFIED'||
    request.operatorAuthorization!==
      'MANUAL_OFFLINE_PINNED_CRL_REVIEW'||
    pins.schemaVersion!=='INDEPENDENT_PHASE38_CRL_ROOT_SOURCE_PINS_V1'||
    !APPROVED_BINS.includes(request.opensslBinary)||
    ![pins.expectedOriginalPdfSha256,
      pins.expectedCmsSignerDerSha256,pins.expectedRootCaDerSha256,
      pins.expectedRootCaPemSha256,pins.expectedSignedCrlPemSha256,
      pins.expectedOpenSslBinarySha256].every(
      x=>typeof x==='string'&&HASH.test(x))||
    !Number.isFinite(date(request.assessmentAsOf))||
    date(request.assessmentAsOf)!==date(pins.expectedAssessmentAsOf)||
    !Number.isSafeInteger(request.maxCrlAgeHours)||
    request.maxCrlAgeHours<1||request.maxCrlAgeHours>168||
    !Number.isSafeInteger(request.timeoutMs)||
    request.timeoutMs<500||request.timeoutMs>10000||
    typeof runner!=='function')
    return fail('INVALID_EVIDENCE','INVALID_CRL_POLICY_OR_INDEPENDENT_PIN_INPUT');
  if(phase37.status!=='ORIGINAL_PDF_CMS_SIGNER_LINKED_UNVERIFIED'||
    phase37.actuallyRanNativeOpenSsl!==true||
    phase37.originalEmbeddedCmsSignatureCryptographicallyVerified!==true||
    phase37.pdfCmsSignerCryptographicallyLinkedToPinnedDer!==true||
    phase37.brokerAuthenticated!==false||
    phase37.brokerStopInstalled!==false||
    phase37.productionSafe!==false||
    phase37.executionAuthorized!==false||
    phase37.protectedOvernight!==false||
    phase37.originalPdfSha256!==pins.expectedOriginalPdfSha256||
    phase37.derivedSignerDerSha256!==pins.expectedCmsSignerDerSha256||
    detached.originalPdfSha256!==pins.expectedOriginalPdfSha256)
    return fail('INVALID_EVIDENCE','PHASE37_REAL_CMS_SIGNER_SOURCE_PREREQUISITE_FAILED');
  if(!secureFile(request.originalPdfPath,MAX_PDF,true)||
    !secureFile(request.privateRootCaPemPath,MAX_CA,true)||
    !secureFile(request.privateSignedCrlPemPath,MAX_CRL,true)||
    !secureFile(request.opensslBinary,MAX_BIN,false))
    return fail('INVALID_EVIDENCE','PRIVATE_CA_CRL_PDF_OR_OPENSSL_FILE_PRECONDITION_FAILED');
  let rootBytes:Buffer,crlBytes:Buffer,pdfBytes:Buffer,
    binaryBytes:Buffer,signerDer:Buffer;
  try{
    rootBytes=readFileSync(request.privateRootCaPemPath);
    crlBytes=readFileSync(request.privateSignedCrlPemPath);
    pdfBytes=readFileSync(request.originalPdfPath);
    binaryBytes=readFileSync(request.opensslBinary);
    signerDer=Buffer.from(detached.signerCertificateDerBase64,'base64');
  }catch{return fail('INVALID_EVIDENCE','OFFLINE_PINNED_CRL_INPUT_BYTES_UNAVAILABLE');}
  let root:X509Certificate,signer:X509Certificate;
  const maybeRoot=singlePemCertificate(rootBytes);
  if(!maybeRoot||!singleCrlPem(crlBytes))
    return fail('INVALID_EVIDENCE','PINNED_ROOT_OR_CRL_NOT_SINGLE_PEM_OBJECT');
  root=maybeRoot;
  try{signer=new X509Certificate(signerDer);}
  catch{return fail('INVALID_EVIDENCE','ACTUAL_CMS_SIGNER_DER_INVALID');}
  if(digest(pdfBytes)!==pins.expectedOriginalPdfSha256||
    digest(binaryBytes)!==pins.expectedOpenSslBinarySha256||
    digest(rootBytes)!==pins.expectedRootCaPemSha256||
    digest(root.raw)!==pins.expectedRootCaDerSha256||
    digest(crlBytes)!==pins.expectedSignedCrlPemSha256||
    digest(signer.raw)!==pins.expectedCmsSignerDerSha256||
    digest(Buffer.from(detached.issuerCertificateDerBase64,'base64'))!==
      pins.expectedRootCaDerSha256||
    !root.ca||signer.ca||
    !signer.checkIssued(root)||!signer.verify(root.publicKey)||
    !root.checkIssued(root)||!root.verify(root.publicKey))
    return fail('INVALID_EVIDENCE','CRL_ROOT_SOURCE_OR_CMS_SIGNER_FINGERPRINT_DISAGREEMENT');
  const basic={
    originalPdfSha256:pins.expectedOriginalPdfSha256,
    pinnedRootCaDerSha256:pins.expectedRootCaDerSha256,
    pinnedCrlSha256:pins.expectedSignedCrlPemSha256,
    sameCmsSignerAsPhase37:true,
    issuerCaDerMatchesExternalPin:true
  };
  const native=runner===nativePhase38OpenSslRunner;
  let temporary:string|null=null;
  try{
    temporary=mkdtempSync(
      join(dirname(request.originalPdfPath),'.phase38-crl-'));
    chmodSync(temporary,0o700);
    const rootPath=join(temporary,'pinned-root.pem'),
      crlPath=join(temporary,'signed.crl.pem'),
      signerPath=join(temporary,'verified-cms-leaf.pem');
    privateWrite(rootPath,rootBytes);
    privateWrite(crlPath,crlBytes);
    privateWrite(signerPath,Buffer.from(signer.toString(),'ascii'));
    const crlResult=runner(request.opensslBinary,[
      'crl','-in',crlPath,'-noout','-lastupdate','-nextupdate'
    ],request.timeoutMs);
    if(!acceptableOutput(crlResult))
      return fail('OFFLINE_CRL_CHAIN_REJECTED',
        'SIGNED_CRL_DATE_EXTRACTION_FAILURE',basic);
    const dates=parsePhase38CrlDates(
      Buffer.from(crlResult.stdout).toString('utf8'));
    if(!dates.valid||!dates.thisUpdate||!dates.nextUpdate)
      return fail('OFFLINE_CRL_CHAIN_REJECTED',
        dates.reasonCode,basic);
    const thisTime=Date.parse(dates.thisUpdate),
      nextTime=Date.parse(dates.nextUpdate),
      evalTime=date(request.assessmentAsOf);
    if(evalTime<thisTime||evalTime>=nextTime||
      evalTime-thisTime>request.maxCrlAgeHours*3600000)
      return fail('OFFLINE_CRL_CHAIN_REJECTED',
        'CRL_NOT_FRESH_AT_EXTERNALLY_ASSERTED_ASSESSMENT_TIME',{
          ...basic,crlThisUpdate:dates.thisUpdate,
          crlNextUpdate:dates.nextUpdate
        });
    const verifyResult=runner(request.opensslBinary,[
      'verify','-no-CApath','-no-CAstore',
      '-CAfile',rootPath,'-CRLfile',crlPath,
      '-crl_check_all','-purpose','smimesign',
      '-auth_level','2','-verify_depth','1',
      '-check_ss_sig','-x509_strict','-attime',
      String(Math.floor(evalTime/1000)),signerPath
    ],request.timeoutMs);
    if(!acceptableOutput(verifyResult))
      return fail('OFFLINE_CRL_CHAIN_REJECTED',
        'SIGNED_CRL_OR_CA_VERIFICATION_REJECTED',{
          ...basic,crlThisUpdate:dates.thisUpdate,
          crlNextUpdate:dates.nextUpdate,
          actuallyRanNativeOpenSsl:native
        });
    const verdict=Buffer.from(verifyResult.stdout).toString('utf8');
    if(!/^(?:\/[^\r\n]{1,1200}|[^\r\n]{1,1200}): OK\r?\n?$/.test(verdict))
      return fail('OFFLINE_CRL_CHAIN_REJECTED',
        'AMBIGUOUS_OPENSSL_SIGNER_VERIFY_SUCCESS_OUTPUT',basic);
    if(!native)
      return fail('OFFLINE_CRL_CHAIN_REJECTED',
        'MOCKED_OPENSSL_CRL_IS_NOT_ACTUAL_CRYPTOGRAPHIC_EVIDENCE',basic);
    return {...initial(),...basic,
      status:'PINNED_CA_AND_SIGNED_CRL_CONSISTENT_OFFLINE_UNVERIFIED',
      actuallyRanNativeOpenSsl:true,
      signedCrlAcceptedAtClaimedAsOf:true,
      localIssuerCertificateChainVerified:true,
      offlineCrlFreshAtClaimedAsOf:true,
      crlThisUpdate:dates.thisUpdate,
      crlNextUpdate:dates.nextUpdate};
  }catch{
    return fail('OFFLINE_CRL_CHAIN_REJECTED',
      'OPENSSL_CRL_SUBPROCESS_OR_PRIVATE_TEMP_FAILURE',basic);
  }finally{
    if(temporary){
      try{rmSync(temporary,{recursive:true,force:true});}
      catch{ /* No private paths, CA, CRL or signer data in logs. */ }
    }
  }
}
