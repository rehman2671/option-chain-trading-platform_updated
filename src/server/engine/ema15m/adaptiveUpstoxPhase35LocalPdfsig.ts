/**
 * Adaptive Swing v2 Phase35: manual-only local Poppler pdfsig preflight.
 *
 * ACTUAL subprocess verifies CMS signature and NSS chain status locally.
 * -no-ocsp deliberately disables online revocation => not fresh revocation.
 * No broker issuer fingerprint/auth, timestamp, PDF table or stop proof.
 * Run only in an independently sandboxed host with zero network egress.
 */
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,resolve,join} from 'node:path';

const SHA=/^[a-f0-9]{64}$/;
const MAX_PDF=2000000,MAX_OUTPUT=100000,MAX_BINARY=12000000,MAX_NSS=15000000;
const allowed=['/usr/bin/pdfsig','/usr/local/bin/pdfsig'];
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
function secureFile(p:string,max:number,isPrivate:boolean):boolean{
  if(typeof p!=='string'||!isAbsolute(p)||p.length>1300||p.includes('\0'))
    return false;
  try{
    const path=resolve(p),m=lstatSync(path);
    if(!m.isFile()||m.isSymbolicLink()||m.size<10||m.size>max||
      realpathSync(path)!==path||(m.mode&0o022)!==0)return false;
    if(isPrivate){
      if((m.mode&0o077)!==0||
        (typeof process.getuid==='function'&&m.uid!==process.getuid()))
        return false;
    }else if(m.uid!==0&&typeof process.getuid==='function'&&
      m.uid!==process.getuid())return false;
    return true;
  }catch{return false;}
}
function secureDir(p:string):boolean{
  if(typeof p!=='string'||!isAbsolute(p)||p.length>1024||p.includes('\0'))
    return false;
  try{
    const path=resolve(p),m=lstatSync(path);
    return m.isDirectory()&&!m.isSymbolicLink()&&
      realpathSync(path)===path&&(m.mode&0o077)===0&&
      (typeof process.getuid!=='function'||m.uid===process.getuid());
  }catch{return false;}
}
export interface Phase35PdfsigRequest {
  schemaVersion:'ADAPTIVE_V2_PHASE35_PDFSIG_LOCAL_PRECHECK_V1';
  originalPdfPath:string;
  trustedNssDbDirectory:string;
  executablePath:'/usr/bin/pdfsig'|'/usr/local/bin/pdfsig';
  expectedOriginalPdfSha256:string;
  expectedPdfsigBinarySha256:string;
  expectedNssCert9DbSha256:string;
  timeoutMs:number;
  operatorAuthorization:'OPERATOR_APPROVED_LOCAL_PDFSIG_NO_ONLINE_OCSP';
}
export interface PdfsigToolOutput {
  exitCode:number|null;stdout:string;stderr:string;timedOut:boolean;
}
export type Phase35PdfsigRunner=(binary:string,args:readonly string[],
  timeoutMs:number)=>PdfsigToolOutput;
export interface Phase35PdfsigReport {
  mode:'ISOLATED_LOCAL_PDFSIG_NSS_OFFLINE_SIGNATURE_PRECHECK';
  status:'INVALID_PRECONDITION'|'PDFSIG_PROCESS_OR_SIGNATURE_REJECTED'|
    'LOCAL_PDFSIG_CRYPTO_AND_NSS_TRUST_REPORTED_UNVERIFIED';
  executionAuthorized:false;productionSafe:false;
  brokerAuthenticated:false;brokerStopInstalled:false;
  protectedOvernight:false;nativeOrderInstruction:null;
  localToolActuallyExecuted:boolean;
  cryptoSignatureReportedValid:boolean;
  fullDocumentCoverageReported:boolean;
  nssCertificateChainReportedTrusted:boolean;
  onlineOcspChecked:false;crlFreshnessProven:false;
  independentlyTrustedTimestamp:false;
  brokerCertificateFingerprintAuthenticated:false;
  pdfAnnexureRowsExtractedAndCompared:false;
  issuerAuthenticated:false;
  fileSizeBytes:number|null;originalPdfSha256:string|null;
  toolBinarySha256:string|null;nssCert9DbSha256:string|null;
  reasonCodes:string[];warnings:string[];
}
const warnings=[
  'PDFSIG_NO_OCSP_OFFLINE_REVOCATION_NOT_FRESHLY_CHECKED',
  'NSS_TRUSTED_CERTIFICATE_NOT_PROOF_OF_UPSTOX_BROKER_ISSUER_IDENTITY',
  'PDF_SIGNING_TIME_NOT_INDEPENDENT_TRUSTED_TIMESTAMP',
  'BINARY_AND_CERT_DB_HASHES_MUST_BE_PINNED_INDEPENDENTLY',
  'RUN_PDFSIG_ONLY_IN_OS_SANDBOX_WITH_NO_NETWORK_EGRESS',
  'PDF_SIGNATURE_DOES_NOT_VALIDATE_ECN_ANNEXURE_ROWS',
  'CERTIFICATE_TRUST_DOES_NOT_PROVE_NATIVE_STOP_OR_OVERNIGHT_PROTECTION',
  'NO_LIVE_NRML_ORDERS_OR_15_15_POSITIONAL_EXIT'
];
const initial=():Phase35PdfsigReport=>({
  mode:'ISOLATED_LOCAL_PDFSIG_NSS_OFFLINE_SIGNATURE_PRECHECK',
  status:'INVALID_PRECONDITION',
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  protectedOvernight:false,nativeOrderInstruction:null,
  localToolActuallyExecuted:false,cryptoSignatureReportedValid:false,
  fullDocumentCoverageReported:false,nssCertificateChainReportedTrusted:false,
  onlineOcspChecked:false,crlFreshnessProven:false,
  independentlyTrustedTimestamp:false,
  brokerCertificateFingerprintAuthenticated:false,
  pdfAnnexureRowsExtractedAndCompared:false,issuerAuthenticated:false,
  fileSizeBytes:null,originalPdfSha256:null,toolBinarySha256:null,
  nssCert9DbSha256:null,reasonCodes:[],warnings
});
function rejected(status:Phase35PdfsigReport['status'],reason:string,
  partial?:Partial<Phase35PdfsigReport>):Phase35PdfsigReport{
  return {...initial(),...partial,status,reasonCodes:[reason]};
}
export interface Phase35PdfsigParsed {
  accepted:boolean;reasonCode:string;
  cryptoValid:boolean;entireDocumentSigned:boolean;nssChainTrusted:boolean;
}
/** Parsed status only. Mock stdout is NOT evidence of actual execution. */
export function parsePhase35PdfsigText(
  output:string,pdfSize:number
):Phase35PdfsigParsed{
  const fail=(reasonCode:string):Phase35PdfsigParsed=>({
    accepted:false,reasonCode,cryptoValid:false,entireDocumentSigned:false,
    nssChainTrusted:false
  });
  if(typeof output!=='string'||output.length<20||
    output.length>MAX_OUTPUT||!Number.isSafeInteger(pdfSize)||
    pdfSize<12||pdfSize>MAX_PDF||
    !/^Digital Signature Info of: [^\r\n]{1,1500}\r?$/m.test(output))
    return fail('UNRECOGNIZED_OR_OVERSIZED_PDFSIG_STDOUT');
  const lines=output.split(/\r?\n/).map(x=>x.trim());
  const sigs=lines.filter(x=>/^Signature #\d+:$/.test(x));
  if(sigs.length!==1||sigs[0]!=='Signature #1:')
    return fail('MISSING_MULTIPLE_OR_UNKNOWN_PDF_SIGNATURE_FIELDS');
  const one=(re:RegExp):string|null=>{
    const m=lines.filter(x=>re.test(x));
    return m.length===1?m[0]:null;
  };
  const range=one(/^- Signed Ranges:/);
  const type=one(/^- Signature Type:/);
  const hash=one(/^- Signing Hash Algorithm:/);
  const crypto=one(/^- Signature Validation:/);
  const chain=one(/^- Certificate Validation:/);
  const coverage=lines.filter(x=>x==='- Total document signed'||
    x==='- Not total document signed');
  if(!range||!type||!hash||!crypto||!chain||coverage.length!==1)
    return fail('INCOMPLETE_AMBIGUOUS_PDFSIG_SIGNATURE_FIELDS');
  if(!/^- Signing Hash Algorithm: SHA-(?:256|384|512)$/.test(hash)||
    !/^- Signature Type: (?:ETSI\.CAdES\.detached|adbe\.pkcs7\.detached)$/.test(type))
    return fail('WEAK_OR_UNKNOWN_SIGNATURE_HASH_OR_CMS_FORMAT');
  const match=/^- Signed Ranges: \[0 - (\d+)\],? \[(\d+) - (\d+)\]$/.exec(range);
  if(!match)return fail('UNKNOWN_OR_MALFORMED_SIGNED_BYTE_RANGES');
  const left=Number(match[1]),right=Number(match[2]),end=Number(match[3]);
  if(!Number.isSafeInteger(left)||!Number.isSafeInteger(right)||
    !Number.isSafeInteger(end)||left<1||right<=left||end<=right||
    end!==pdfSize||coverage[0]!=='- Total document signed')
    return fail('PDF_NOT_FULLY_SIGNED_OR_HAS_UNSIGNED_APPEND');
  if(!/^- Signature Validation: Signature is Valid\.?$/.test(crypto))
    return fail('PDF_CRYPTOGRAPHIC_SIGNATURE_NOT_VALID');
  if(!/^- Certificate Validation: Certificate is Trusted\.?$/.test(chain))
    return fail('LOCAL_NSS_CERTIFICATE_CHAIN_NOT_TRUSTED');
  return {accepted:true,reasonCode:'',cryptoValid:true,
    entireDocumentSigned:true,nssChainTrusted:true};
}
/** Real subprocess. Operator must additionally enforce OS sandbox policy. */
export function nativePhase35PdfsigRunner(binary:string,
  args:readonly string[],timeoutMs:number):PdfsigToolOutput{
  const p=spawnSync(binary,[...args],{
    shell:false,encoding:'utf8',timeout:timeoutMs,maxBuffer:MAX_OUTPUT,
    windowsHide:true,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',
      HOME:'/nonexistent',TZ:'UTC'}
  });
  return {exitCode:p.status,stdout:p.stdout??'',stderr:p.stderr??'',
    timedOut:!!p.error||!!p.signal};
}
/** Actual process only when runner is the bundled native subprocess. */
export function inspectPhase35LocalPdfSignature(
  request:Phase35PdfsigRequest,
  runner:Phase35PdfsigRunner=nativePhase35PdfsigRunner
):Phase35PdfsigReport{
  if(!request||request.schemaVersion!==
    'ADAPTIVE_V2_PHASE35_PDFSIG_LOCAL_PRECHECK_V1'||
    request.operatorAuthorization!==
    'OPERATOR_APPROVED_LOCAL_PDFSIG_NO_ONLINE_OCSP'||
    !allowed.includes(request.executablePath)||
    ![request.expectedOriginalPdfSha256,
      request.expectedPdfsigBinarySha256,
      request.expectedNssCert9DbSha256].every(x=>
        typeof x==='string'&&SHA.test(x))||
    !Number.isSafeInteger(request.timeoutMs)||request.timeoutMs<500||
    request.timeoutMs>10000||typeof runner!=='function')
    return rejected('INVALID_PRECONDITION',
      'PDFSIG_PRECONDITION_OR_INDEPENDENT_PINS_INVALID');
  const pdf=request.originalPdfPath,nss=request.trustedNssDbDirectory;
  if(!secureDir(dirname(pdf))||!secureDir(nss)||
    !secureFile(pdf,MAX_PDF,true)||
    !secureFile(join(nss,'cert9.db'),MAX_NSS,true)||
    !secureFile(request.executablePath,MAX_BINARY,false))
    return rejected('INVALID_PRECONDITION',
      'PRIVATE_PDF_NSS_STORE_OR_EXECUTABLE_NOT_SECURE');
  let pdfBytes:Buffer,toolBytes:Buffer,certBytes:Buffer;
  try{
    pdfBytes=readFileSync(pdf);
    toolBytes=readFileSync(request.executablePath);
    certBytes=readFileSync(join(nss,'cert9.db'));
  }catch{
    return rejected('INVALID_PRECONDITION','PINNED_PDFSIG_INPUT_NOT_READABLE');
  }
  const pdfHash=sha(pdfBytes),binHash=sha(toolBytes),dbHash=sha(certBytes);
  if(pdfBytes.subarray(0,5).toString('ascii')!=='%PDF-'||
    !pdfBytes.subarray(Math.max(0,pdfBytes.length-1024))
      .toString('latin1').includes('%%EOF')||
    pdfHash!==request.expectedOriginalPdfSha256||
    binHash!==request.expectedPdfsigBinarySha256||
    dbHash!==request.expectedNssCert9DbSha256)
    return rejected('INVALID_PRECONDITION',
      'PINNED_PDF_BINARY_OR_NSS_CERT_DB_DIGEST_MISMATCH');
  const info={fileSizeBytes:pdfBytes.length,originalPdfSha256:pdfHash,
    toolBinarySha256:binHash,nssCert9DbSha256:dbHash};
  let out:PdfsigToolOutput;
  try{
    // -nocert, -aia, -dump, -sign, -no-appearance are never passed.
    // -no-ocsp disables ONLINE revocation: local CRL freshness NOT proven.
    out=runner(request.executablePath,
      ['-no-ocsp','-nssdir','sql:'+nss,pdf],request.timeoutMs);
  }catch{
    return rejected('PDFSIG_PROCESS_OR_SIGNATURE_REJECTED',
      'PDFSIG_EXECUTION_ABORTED_WITHOUT_PRIVATE_ERROR',info);
  }
  const native=runner===nativePhase35PdfsigRunner;
  if(!out||out.timedOut||out.exitCode!==0||
    typeof out.stdout!=='string'||
    Buffer.byteLength(out.stdout)>MAX_OUTPUT||
    typeof out.stderr!=='string'||
    Buffer.byteLength(out.stderr)>MAX_OUTPUT)
    return rejected('PDFSIG_PROCESS_OR_SIGNATURE_REJECTED',
      'PDFSIG_EXIT_TIMEOUT_OR_BOUNDED_OUTPUT_FAILURE',{
        ...info,localToolActuallyExecuted:native
      });
  const parsed=parsePhase35PdfsigText(out.stdout,pdfBytes.length);
  if(!parsed.accepted)
    return rejected('PDFSIG_PROCESS_OR_SIGNATURE_REJECTED',
      parsed.reasonCode,{...info,localToolActuallyExecuted:native});
  if(!native)
    return rejected('PDFSIG_PROCESS_OR_SIGNATURE_REJECTED',
      'INJECTED_PDFSIG_TEXT_IS_ONLY_A_PARSER_TEST',info);
  return {...initial(),...info,
    status:'LOCAL_PDFSIG_CRYPTO_AND_NSS_TRUST_REPORTED_UNVERIFIED',
    localToolActuallyExecuted:true,cryptoSignatureReportedValid:true,
    fullDocumentCoverageReported:true,nssCertificateChainReportedTrusted:true};
}
