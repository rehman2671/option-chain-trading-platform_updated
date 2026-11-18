/**
 * Adaptive Swing v2 Phase37 — REAL cryptographic CMS binding of original
 * PDF ByteRange + actual OpenSSL-verified CMS signer DER certificate.
 *
 * Manual OFFLINE ONLY; separate issuer trust in Phase36 is only pinned,
 * not proven to be a real regulator/broker CA. OpenSSL -noverify checks CMS
 * signature and signed PDF bytes, NOT PKI policy, OCSP/CRL or time.
 * No trading, broker HTTP, order writes, production runner or auto exits.
 */
import {createHash,X509Certificate} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {
  chmodSync,closeSync,constants,fsyncSync,lstatSync,mkdtempSync,
  openSync,readFileSync,realpathSync,rmSync,writeSync
} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {
  reviewPhase36DetachedX509,
  type Phase36DetachedCertificateInput,
  type Phase36IndependentCertificatePins
} from './adaptiveUpstoxPhase36DetachedSignerPins.js';

const SHA=/^[a-f0-9]{64}$/;
const MAX_PDF=2_000_000,MAX_CMS=100_000,MAX_BIN=12_000_000;
const MAX_OUT=80_000;
const BINS=['/usr/bin/openssl','/usr/local/bin/openssl'] as const;
const sha=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');
function dirAllowed(p:string):boolean{
  if(typeof p!=='string'||!isAbsolute(p)||p.length>1024||
    p.includes('\0'))return false;
  try{
    const path=resolve(p),m=lstatSync(path);
    return m.isDirectory()&&!m.isSymbolicLink()&&
      realpathSync(path)===path&&(m.mode&0o077)===0&&
      (typeof process.getuid!=='function'||m.uid===process.getuid());
  }catch{return false;}
}
function fileAllowed(path:string,max:number,privateFile:boolean){
  if(typeof path!=='string'||!isAbsolute(path)||path.length>1300||
    path.includes('\0'))return false;
  try{
    const p=resolve(path),s=lstatSync(p);
    if(!s.isFile()||s.isSymbolicLink()||realpathSync(p)!==p||
      s.size<12||s.size>max||(s.mode&0o022)!==0)return false;
    if(privateFile&&((s.mode&0o077)!==0||
      (typeof process.getuid==='function'&&s.uid!==process.getuid())))
      return false;
    if(!privateFile&&s.uid!==0&&
      typeof process.getuid==='function'&&s.uid!==process.getuid())
      return false;
    return true;
  }catch{return false;}
}
export type Phase37SupportedSubFilter=
  'adbe.pkcs7.detached'|'ETSI.CAdES.detached';
export interface Phase37CmsRequest {
  schemaVersion:'ADAPTIVE_V2_PHASE37_ORIGINAL_PDF_CMS_V1';
  source:'PRIVATE_ORIGINAL_PDF_UNVERIFIED';
  originalPdfPath:string;
  opensslBinary:'/usr/bin/openssl'|'/usr/local/bin/openssl';
  timeoutMs:number;
  operatorAuthorization:'OWNER_APPROVED_OFFLINE_CMS_CRYPTO_ONLY';
}
export interface Phase37IndependentCmsPins {
  schemaVersion:'INDEPENDENT_PHASE37_CMS_ORIGINAL_SOURCE_PINS_V1';
  expectedOriginalPdfSha256:string;
  expectedOpenSslBinarySha256:string;
  expectedSignerDerSha256:string;
  expectedIssuerDerSha256:string;
  expectedSubFilter:Phase37SupportedSubFilter;
}
export interface Phase37OpenSslResult {
  exitCode:number|null;stdout:Uint8Array;stderr:Uint8Array;
  timedOut:boolean;
}
export type Phase37OpenSslRunner=(binary:string,args:readonly string[],
  timeoutMs:number)=>Phase37OpenSslResult;
export interface Phase37CmsAuditReport {
  mode:'OFFLINE_ORIGINAL_PDF_CMS_SIGNER_CRYPTO_BINDING';
  status:'INVALID_EVIDENCE'|'PDF_SIGNATURE_STRUCTURE_REJECTED'|
    'CMS_CRYPTO_OR_SIGNER_REJECTED'|
    'ORIGINAL_PDF_CMS_SIGNER_LINKED_UNVERIFIED';
  executionAuthorized:false;productionSafe:false;
  brokerAuthenticated:false;brokerStopInstalled:false;
  protectedOvernight:false;nativeOrderInstruction:null;
  actuallyRanNativeOpenSsl:boolean;
  exactSignedPdfByteRangesVerified:boolean;
  originalEmbeddedCmsSignatureCryptographicallyVerified:boolean;
  embeddedSignerDerMatchesIndependentPin:boolean;
  detachedPhase36SignerIssuerLocallyConsistent:boolean;
  pdfCmsSignerCryptographicallyLinkedToPinnedDer:boolean;
  brokerSignerIdentityVerified:false;
  independentlyTrustedIssuerCaVerified:false;
  currentRevocationChecked:false;
  independentlyTrustedTimestampVerified:false;
  originalEcnAnnexureValidated:false;
  nativeStopAckOrOvernightContinuityVerified:false;
  originalPdfSha256:string|null;
  cmsDerSha256:string|null;
  signedRangesSha256:string|null;
  derivedSignerDerSha256:string|null;
  reasonCodes:string[];warnings:string[];
}
const warnings=[
  'OPENSSL_NO_VERIFY_MEANS_CMS_CRYPTO_ONLY_NOT_CERTIFICATE_TRUST_CHAIN',
  'ACTUAL_CMS_SIGNER_DER_LINK_IS_NOT_REGULATED_UPSTOX_ISSUER_AUTH',
  'PHASE36_PINNED_SELF_SIGNED_CA_CAN_BE_SYNTHETIC_OR_MALICIOUS',
  'NO_INDEPENDENT_PDF_ACTIVE_SIGNATURE_FIELD_SEMANTICS_OR_FULL_PADES',
  'NO_CURRENT_CRL_OCSP_OR_INDEPENDENT_TRUSTED_TIMESTAMP',
  'CMS_VERIFY_DOES_NOT_EXTRACT_OR_AUTHENTICATE_ECN_ANNEXURE_ROWS',
  'EXTERNAL_OS_SANDBOX_MUST_ENFORCE_NO_NETWORK_EGRESS',
  'SIGNED_ECN_CANNOT_PROVE_NATIVE_STOP_ACK_REPLACE_CANCEL_OR_GAP_FILL',
  'NO_LIVE_NRML_ORDERS_GTT_OR_15_15_POSITIONAL_EXIT'
];
const empty=():Phase37CmsAuditReport=>({
  mode:'OFFLINE_ORIGINAL_PDF_CMS_SIGNER_CRYPTO_BINDING',
  status:'INVALID_EVIDENCE',
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  protectedOvernight:false,nativeOrderInstruction:null,
  actuallyRanNativeOpenSsl:false,
  exactSignedPdfByteRangesVerified:false,
  originalEmbeddedCmsSignatureCryptographicallyVerified:false,
  embeddedSignerDerMatchesIndependentPin:false,
  detachedPhase36SignerIssuerLocallyConsistent:false,
  pdfCmsSignerCryptographicallyLinkedToPinnedDer:false,
  brokerSignerIdentityVerified:false,
  independentlyTrustedIssuerCaVerified:false,
  currentRevocationChecked:false,
  independentlyTrustedTimestampVerified:false,
  originalEcnAnnexureValidated:false,
  nativeStopAckOrOvernightContinuityVerified:false,
  originalPdfSha256:null,cmsDerSha256:null,
  signedRangesSha256:null,derivedSignerDerSha256:null,
  reasonCodes:[],warnings
});
const fail=(status:Phase37CmsAuditReport['status'],code:string,
  partial?:Partial<Phase37CmsAuditReport>):Phase37CmsAuditReport=>({
  ...empty(),...partial,status,reasonCodes:[code]
});
export interface Phase37ExtractedPdfSignature {
  ok:boolean;reasonCode:string;
  signedContent:Uint8Array|null;
  cmsDer:Uint8Array|null;
  subfilter:Phase37SupportedSubFilter|null;
  signedRangeSha256:string|null;
}
const bad=(reasonCode:string):Phase37ExtractedPdfSignature=>({
  ok:false,reasonCode,signedContent:null,cmsDer:null,
  subfilter:null,signedRangeSha256:null
});
/** Only DER-definite TLV SEQUENCE; zero PDF hex placeholder padding.
 * Do not attempt BER indefinite-len, malformed or multi-signer magic.
 */
function exactDerLength(bytes:Uint8Array):number|null{
  if(bytes.length<256||bytes[0]!==0x30)return null;
  const marker=bytes[1];
  let len:number,offset:number;
  if(marker<0x80){len=marker;offset=2;}
  else{
    const count=marker&0x7f;
    if(count<1||count>4||bytes.length<2+count||
      bytes[2]===0|| (count===1&&bytes[2]<128))return null;
    len=0;
    for(let i=0;i<count;i++)len=len*256+bytes[2+i];
    offset=2+count;
  }
  const size=offset+len;
  return len>0&&size<=bytes.length&&size<=MAX_CMS?size:null;
}
/** Conservative PDF subset: one signature dictionary, one ByteRange,
 * one hex Contents, no unsigned append; never a PDF parser/renderer.
 */
export function extractPhase37OriginalPdfCms(
  original:Uint8Array
):Phase37ExtractedPdfSignature{
  if(!(original instanceof Uint8Array)||original.length<400||
    original.length>MAX_PDF||Buffer.from(original.subarray(0,5))
      .toString('ascii')!=='%PDF-'||
    !Buffer.from(original.subarray(Math.max(0,original.length-1024)))
      .toString('latin1').includes('%%EOF'))
    return bad('ORIGINAL_PDF_BYTES_NOT_SUPPORTED');
  const txt=Buffer.from(original).toString('latin1');
  const signatures=[...txt.matchAll(/\/Type\s*\/Sig\b/g)];
  const byteRanges=[...txt.matchAll(
    /\/ByteRange\s*\[\s*0\s+(\d{1,15})\s+(\d{1,15})\s+(\d{1,15})\s*\]/g
  )];
  const content=[...txt.matchAll(/\/Contents\s*<([a-fA-F0-9]{512,200000})>/g)];
  const subfilters=[...txt.matchAll(
    /\/SubFilter\s*\/(adbe\.pkcs7\.detached|ETSI\.CAdES\.detached)\b/g
  )];
  if(signatures.length!==1||byteRanges.length!==1||
    content.length!==1||subfilters.length!==1)
    return bad('MISSING_AMBIGUOUS_OR_UNSUPPORTED_PDF_SIGNATURE_DICTIONARY');
  const match=byteRanges[0],part=content[0],type=subfilters[0][1];
  const start=Number(match[1]),end=Number(match[2]),length=Number(match[3]);
  const lt=part.index!+part[0].indexOf('<');
  const gt=part.index!+part[0].lastIndexOf('>');
  if(![start,end,length].every(Number.isSafeInteger)||
    start!==lt||end!==gt+1||length!==original.length-end||
    length<=0||start<=0||end>original.length||
    end<=start+2)
    return bad('SIGNED_BYTE_RANGE_NOT_EXACT_CONTENTS_WITH_FULL_DOCUMENT_COVERAGE');
  const hex=part[1];
  if(hex.length%2!==0)
    return bad('CMS_HEX_LENGTH_NOT_EVEN');
  const cmsPadded=Buffer.from(hex,'hex');
  if(cmsPadded.length>MAX_CMS||
    cmsPadded.toString('hex')!==hex.toLowerCase())
    return bad('CMS_CONTENTS_NOT_CANONICAL_HEX');
  const size=exactDerLength(cmsPadded);
  if(size===null||!cmsPadded.subarray(size).every(b=>b===0))
    return bad('CMS_NOT_SINGLE_DER_OR_NONZERO_PDF_PLACEHOLDER_PADDING');
  const cms=cmsPadded.subarray(0,size);
  const contentBytes=Buffer.concat([
    Buffer.from(original.subarray(0,start)),
    Buffer.from(original.subarray(end))
  ]);
  return {ok:true,reasonCode:'',signedContent:contentBytes,
    cmsDer:cms,subfilter:type as Phase37SupportedSubFilter,
    signedRangeSha256:sha(contentBytes)};
}
export function nativePhase37OpenSslRunner(
  binary:string,args:readonly string[],timeoutMs:number
):Phase37OpenSslResult{
  const processResult=spawnSync(binary,[...args],{
    shell:false,encoding:'buffer',timeout:timeoutMs,
    maxBuffer:MAX_OUT,windowsHide:true,
    env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',
      HOME:'/nonexistent',TZ:'UTC',OPENSSL_CONF:'/dev/null'}
  });
  return {exitCode:processResult.status,
    stdout:processResult.stdout instanceof Buffer?
      processResult.stdout:new Uint8Array(),
    stderr:processResult.stderr instanceof Buffer?
      processResult.stderr:new Uint8Array(),
    timedOut:!!processResult.signal||!!processResult.error};
}
function privateTempWrite(file:string,data:Uint8Array){
  const fd=openSync(file,constants.O_CREAT|constants.O_EXCL|
    constants.O_NOFOLLOW|constants.O_WRONLY,0o600);
  try{
    const body=Buffer.from(data);let n=0;
    while(n<body.length){
      const k=writeSync(fd,body,n,body.length-n);
      if(k<=0)throw Error('SHORT_PRIVATE_CMS_WRITE');
      n+=k;
    }
    fsyncSync(fd);
  }finally{closeSync(fd);}
}
function signerPem(raw:Uint8Array):Buffer|null{
  if(raw.length<300||raw.length>MAX_OUT)return null;
  const text=Buffer.from(raw).toString('ascii');
  if(!/^-----BEGIN CERTIFICATE-----\r?\n(?:[A-Za-z0-9+/=]{1,76}\r?\n)+-----END CERTIFICATE-----\r?\n?$/.test(text))
    return null;
  try{
    const x=new X509Certificate(text);
    return Buffer.from(x.raw);
  }catch{return null;}
}
/** Actual OpenSSL CMS signature check over exact signed PDF bytes AND
 * verified signer certificate. X509 CA trust still is NOT authenticated.
 */
export function auditPhase37OriginalPdfCmsSigner(
  request:Phase37CmsRequest,
  pins:Phase37IndependentCmsPins,
  detached:Phase36DetachedCertificateInput,
  detachedPins:Phase36IndependentCertificatePins,
  runner:Phase37OpenSslRunner=nativePhase37OpenSslRunner
):Phase37CmsAuditReport{
  if(!request||!pins||!detached||!detachedPins||
    request.schemaVersion!=='ADAPTIVE_V2_PHASE37_ORIGINAL_PDF_CMS_V1'||
    request.source!=='PRIVATE_ORIGINAL_PDF_UNVERIFIED'||
    request.operatorAuthorization!==
      'OWNER_APPROVED_OFFLINE_CMS_CRYPTO_ONLY'||
    !BINS.includes(request.opensslBinary)||
    pins.schemaVersion!==
      'INDEPENDENT_PHASE37_CMS_ORIGINAL_SOURCE_PINS_V1'||
    ![pins.expectedOriginalPdfSha256,
      pins.expectedOpenSslBinarySha256,
      pins.expectedSignerDerSha256,
      pins.expectedIssuerDerSha256].every(
      x=>typeof x==='string'&&SHA.test(x)
    )||
    !['adbe.pkcs7.detached','ETSI.CAdES.detached'].includes(
      pins.expectedSubFilter
    )||
    detached.originalPdfSha256!==pins.expectedOriginalPdfSha256||
    detachedPins.originalPdfSha256!==pins.expectedOriginalPdfSha256||
    detachedPins.expectedSignerDerSha256!==pins.expectedSignerDerSha256||
    detachedPins.expectedIssuerDerSha256!==pins.expectedIssuerDerSha256||
    !Number.isSafeInteger(request.timeoutMs)||request.timeoutMs<500||
    request.timeoutMs>10000||typeof runner!=='function)
    return fail('INVALID_EVIDENCE','INVALID_INDEPENDENT_CMS_SOURCE_CERT_SCOPE');
  if(!dirAllowed(dirname(request.originalPdfPath))||
    !fileAllowed(request.originalPdfPath,MAX_PDF,true)||
    !fileAllowed(request.opensslBinary,MAX_BIN,false))
    return fail('INVALID_EVIDENCE',
      'PRIVATE_ORIGINAL_PDF_OR_PINNED_OPENSSL_EXECUTABLE_UNAVAILABLE');
  let original:Buffer,binary:Buffer;
  try{
    original=readFileSync(request.originalPdfPath);
    binary=readFileSync(request.opensslBinary);
  }catch{
    return fail('INVALID_EVIDENCE','PRIVATE_PDF_OR_OPENSSL_BINARY_UNREADABLE');
  }
  const pdfHash=sha(original),binaryHash=sha(binary);
  if(pdfHash!==pins.expectedOriginalPdfSha256||
    binaryHash!==pins.expectedOpenSslBinarySha256)
    return fail('INVALID_EVIDENCE','ORIGINAL_PDF_OR_OPENSSL_BINARY_SHA256_MISMATCH');
  const partial={originalPdfSha256:pdfHash};
  const parsed=extractPhase37OriginalPdfCms(original);
  if(!parsed.ok||!parsed.cmsDer||!parsed.signedContent||
    parsed.subfilter!==pins.expectedSubFilter)
    return fail('PDF_SIGNATURE_STRUCTURE_REJECTED',
      !parsed.ok?parsed.reasonCode:'CMS_SUBFILTER_MISMATCH',partial);
  const detachedReviewed=reviewPhase36DetachedX509(detached,detachedPins);
  if(detachedReviewed.status!==
    'DETACHED_SIGNER_ISSUER_CHAIN_CONSISTENT_UNLINKED'||
    detachedReviewed.originalPdfSha256!==pdfHash)
    return fail('INVALID_EVIDENCE','PHASE36_PINNED_SIGNER_ISSUER_DER_NOT_VALIDATED',
      partial);
  const basic={
    ...partial,cmsDerSha256:sha(parsed.cmsDer),
    signedRangesSha256:parsed.signedRangeSha256
  };
  let output:Phase37OpenSslResult;
  let work:string|null=null;
  try{
    // A private 0700 ephemeral directory; no plaintext trade file on disk.
    // The content and CMS DER are private and removed in finally.
    work=mkdtempSync(join(dirname(request.originalPdfPath),'.phase37-cms-'));
    chmodSync(work,0o700);
    const cmsFile=join(work,'signature.cms.der'),
      dataFile=join(work,'pdf.signed.ranges.bin');
    privateTempWrite(cmsFile,parsed.cmsDer);
    privateTempWrite(dataFile,parsed.signedContent);
    // Openssl -verify by default checks the content signature, digest
    // and signed attributes. -noverify ONLY disables CA-chain validation.
    // /dev/stdout emits signer certificates, not the signed PDF payload.
    output=runner(request.opensslBinary,[
      'cms','-verify','-binary','-inform','DER',
      '-in',cmsFile,'-content',dataFile,
      '-noverify','-verify_retcode','-signer','/dev/stdout',
      '-out','/dev/null'
    ],request.timeoutMs);
  }catch{
    return fail('CMS_CRYPTO_OR_SIGNER_REJECTED',
      'NATIVE_OPENSSL_CMS_VERIFICATION_PROCESS_FAILED',basic);
  }finally{
    if(work){
      try{rmSync(work,{recursive:true,force:true});}
      catch{
        // Never expose private file or raw error path in report.
      }
    }
  }
  const wasNative=runner===nativePhase37OpenSslRunner;
  if(!output||output.timedOut||output.exitCode!==0||
    !(output.stdout instanceof Uint8Array)||
    !(output.stderr instanceof Uint8Array)||
    output.stdout.length>MAX_OUT||output.stderr.length>MAX_OUT)
    return fail('CMS_CRYPTO_OR_SIGNER_REJECTED',
      'CMS_SIGNATURE_INVALID_TIMEOUT_OR_UNBOUNDED_NATIVE_OUTPUT',{
        ...basic,actuallyRanNativeOpenSsl:wasNative
      });
  const pem=signerPem(output.stdout);
  if(!pem)return fail('CMS_CRYPTO_OR_SIGNER_REJECTED',
    'OPENSSL_VERIFIED_CMS_SIGNER_CERTIFICATE_NOT_UNIQUE_OR_DER_INVALID',
    {...basic,actuallyRanNativeOpenSsl:wasNative});
  const derHash=sha(pem);
  if(derHash!==pins.expectedSignerDerSha256||
    derHash!==sha(Buffer.from(detached.signerCertificateDerBase64,'base64')))
    return fail('CMS_CRYPTO_OR_SIGNER_REJECTED',
      'ACTUAL_CMS_VERIFIED_SIGNER_DER_DISAGREES_WITH_PINNED_CERTIFICATE',
      {...basic,derivedSignerDerSha256:derHash,
        actuallyRanNativeOpenSsl:wasNative});
  if(!wasNative)
    return fail('CMS_CRYPTO_OR_SIGNER_REJECTED',
      'INJECTED_OPENSSL_OUTPUT_NOT_NATIVE_CRYPTOGRAPHIC_EVIDENCE',basic);
  return {...empty(),...basic,
    status:'ORIGINAL_PDF_CMS_SIGNER_LINKED_UNVERIFIED',
    actuallyRanNativeOpenSsl:true,
    exactSignedPdfByteRangesVerified:true,
    originalEmbeddedCmsSignatureCryptographicallyVerified:true,
    embeddedSignerDerMatchesIndependentPin:true,
    detachedPhase36SignerIssuerLocallyConsistent:true,
    pdfCmsSignerCryptographicallyLinkedToPinnedDer:true,
    derivedSignerDerSha256:derHash};
}
