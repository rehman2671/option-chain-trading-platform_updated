/**
 * Adaptive Swing v2 Phase29 — bounded, explicitly authorized GET-only
 * Upstox Analytics Token collector for PRIVATE, local evidence capture.
 *
 * This module is NOT imported by the trading engine, routes, cron or UI.
 * It never sends POST/PUT/PATCH/DELETE, places orders or stores credentials.
 * HTTP TLS provides a transport connection, NOT a broker-signed order ACK.
 */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditOfflineUpstoxReadOnlyCapture,
  type OfflineUpstoxCaptureBundle,
  type OfflineUpstoxBridgeReport
} from './adaptiveUpstoxOfflineReadOnlyBridge.js';
import type {
  OfflineUpstoxLifecycleFrame,
  OfflineUpstoxDayTradeCapture
} from './adaptiveUpstoxOfflineNrmlLifecycle.js';
import type {
  ReadOnlyExpectedPosition,ReadOnlyNrmlAuditPolicy
} from './adaptiveReadOnlyNrmlProtectionAudit.js';

const ORIGIN='https://api.upstox.com';
const LIMIT=90_000; // Also fits Phase28's base64 original body cap.
const ENDPOINTS={
  profile:'/v2/user/profile',
  positions:'/v2/portfolio/short-term-positions',
  orders:'/v2/order/retrieve-all',
  gtts:'/v3/order/gtt',
  trades:'/v2/order/trades/get-trades-for-day'
} as const;
type BookName=keyof typeof ENDPOINTS;
type CaptureBook=Exclude<BookName,'profile'>;
export type AllowedUpstoxGetUrl=
  `https://api.upstox.com${(typeof ENDPOINTS)[BookName]}`;
export interface ReadOnlyGetResult {
  status:number;
  finalUrl:string;
  redirected:boolean;
  contentType:string;
  bodyBytes:Uint8Array;
}
export interface ReadOnlyGetTransport {
  /** Implementations MUST accept only fixed allowlisted HTTPS GET URLs.
   * The native implementation below is deliberately no-redirect, no-retry.
   */
  get(url:AllowedUpstoxGetUrl,bearer:string,timeoutMs:number):
    Promise<ReadOnlyGetResult>;
}
export interface AuthorizedOfflineCaptureRequest {
  expected:ReadOnlyExpectedPosition;
  phase25Policy:ReadOnlyNrmlAuditPolicy;
  expectedBrokerUserId:string;
  analyticsToken:string;
  /** All are asserted by operator, NEVER independently attested here. */
  operatorAuthorization:'ACCOUNT_OWNER_APPROVED_GET_ONLY';
  staticIpReview:'OPERATOR_ATTESTS_WHITELISTED_EGRESS';
  credentialType:'UPSTOX_ANALYTICS_TOKEN_ONLY';
  sequence:number;
  timeoutMs:number;
  /** Injectable clock for offline deterministic synthetic tests. */
  clock?:()=>number;
}
export interface SensitiveReadOnlyCaptureArchive {
  /** Contains FULL private broker profile data. Never print or commit. */
  profileResponseUtf8Base64:string;
  /** Phase27-compatible frame: account identifiers, positions and trades. */
  frame:OfflineUpstoxLifecycleFrame;
  /** Exact decoded response-body bytes; not signed TLS/wire bytes. */
  byteWitnesses:Array<{
    sequence:number;book:CaptureBook;responseUtf8Base64:string
  }>;
}
export interface AuthorizedOfflineCaptureReport {
  mode:'EXPLICIT_GET_ONLY_BROKER_EVIDENCE_CAPTURE';
  status:'REJECTED_PRECONDITION'|'CAPTURE_FAILED'|
    'CAPTURE_RECORDED_UNVERIFIED';
  executionAuthorized:false;
  productionSafe:false;
  brokerAuthenticated:false;
  brokerStopInstalled:false;
  nativeOrderInstruction:null;
  readOnlyNetworkActuallyAttempted:boolean;
  accountProfileMatched:boolean;
  phase26Status:OfflineUpstoxBridgeReport['status']|null;
  reasonCodes:string[];
  responseCount:number;
  responseBodySha256:Partial<Record<BookName,string>>;
  /** No raw UCC, account ID, token or order IDs in this report. */
  accountScopeSha256:string|null;
  warnings:string[];
}
export interface OfflineCaptureOutcome {
  report:AuthorizedOfflineCaptureReport;
  /** Always treat as sensitive: never console.log or send to UI. */
  privateArchive:SensitiveReadOnlyCaptureArchive|null;
}
const warnings=[
  'ACCOUNT_OWNER_CONSENT_IP_WHITELIST_AND_TOKEN_TYPE_ARE_OPERATOR_ATTESTED',
  'PROFILE_UCC_MATCHES_EXPECTED_ID_BUT_DOES_NOT_PROVE_INDEPENDENT_ACCOUNT_OWNERSHIP',
  'UPSTOX_TLS_GET_IS_NOT_BROKER_SIGNED_LIFECYCLE_OR_STOP_INSTALLATION',
  'DECODED_HTTP_RESPONSE_BODY_BYTES_ARE_NOT_RAW_TLS_OR_NETWORK_WIRE_BYTES',
  'UPSTOX_DAY_ORDER_AND_TRADE_BOOKS_DO_NOT_ATTEST_OVERNIGHT_STOP_SURVIVAL',
  'NO_NATIVE_OR_GTT_ORDER_WRITE_OR_15_15_NRML_SQUARE_OFF',
  'PRIVATE_SNAPSHOT_ARCHIVE_CONTAINS_ACCOUNT_IDENTIFIERS'
];
const id=(v:unknown):v is string=>
  typeof v==='string'&&v.trim().length>0&&v.length<=256;
const record=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v);
const sha=(v:Uint8Array|string):string=>
  createHash('sha256').update(v).digest('hex');
const safe=():AuthorizedOfflineCaptureReport=>({
  mode:'EXPLICIT_GET_ONLY_BROKER_EVIDENCE_CAPTURE',
  status:'REJECTED_PRECONDITION',
  executionAuthorized:false,productionSafe:false,
  brokerAuthenticated:false,brokerStopInstalled:false,
  nativeOrderInstruction:null,
  readOnlyNetworkActuallyAttempted:false,accountProfileMatched:false,
  phase26Status:null,reasonCodes:[],responseCount:0,
  responseBodySha256:{},accountScopeSha256:null,warnings
});
interface BookSnapshot{
  capturedAt:string;body:unknown;bytes:Uint8Array;hash:string;
}
/** Node/WHATWG fetch adapter, WITH NO REDIRECTS, RETRIES OR WRITES.
 * Do not allow custom base URL/headers/query, Authorization in URL or logs.
 */
export function createStrictNativeUpstoxAnalyticsGetTransport():ReadOnlyGetTransport{
  return {
    async get(url,bearer,timeoutMs){
      // Runtime allowlist is essential even for callers circumventing TS.
      if(!Object.values(ENDPOINTS).some(x=>url===ORIGIN+x))
        throw Error('DISALLOWED_READ_ONLY_ENDPOINT');
      if(!Number.isInteger(timeoutMs)||timeoutMs<500||timeoutMs>15000)
        throw Error('INVALID_READ_ONLY_TIMEOUT');
      const result=await fetch(url,{
        method:'GET',redirect:'manual',
        cache:'no-store',credentials:'omit',
        headers:{Authorization:'Bearer '+bearer,Accept:'application/json'},
        signal:AbortSignal.timeout(timeoutMs)
      });
      if(result.redirected||result.url!==url||result.status!==200||
        !/^application\/json(?:\s*;|$)/i.test(
          result.headers.get('content-type')??'')){
        await result.body?.cancel().catch(()=>undefined);
        return {status:result.status,finalUrl:result.url,
          redirected:result.redirected,
          contentType:result.headers.get('content-type')??'',
          bodyBytes:new Uint8Array()};
      }
      if(!result.body)throw Error('EMPTY_READ_ONLY_BODY');
      const reader=result.body.getReader();
      const chunks:Uint8Array[]=[];
      let length=0;
      try{
        while(true){
          const step=await reader.read();
          if(step.done)break;
          length+=step.value.byteLength;
          if(length>LIMIT)throw Error('OVERSIZED_READ_ONLY_BODY');
          chunks.push(step.value);
        }
      }finally{
        reader.releaseLock();
      }
      const bytes=new Uint8Array(length);
      let at=0;
      for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
      return {status:result.status,finalUrl:result.url,
        redirected:false,contentType:result.headers.get('content-type')??'',
        bodyBytes:bytes};
    }
  };
}
/** Never include transport error strings or broker body in any report. */
export async function captureExplicitlyAuthorizedUpstoxGetEvidence(
  request:AuthorizedOfflineCaptureRequest,
  transport:ReadOnlyGetTransport
):Promise<OfflineCaptureOutcome>{
  const empty=safe();
  const fail=(code:string,wasAttempted=false,
    count=0,hashes:Partial<Record<BookName,string>>={},
    accountScopeSha256:string|null=null):OfflineCaptureOutcome=>({
    report:{...empty,status:wasAttempted?'CAPTURE_FAILED':'REJECTED_PRECONDITION',
      readOnlyNetworkActuallyAttempted:wasAttempted,reasonCodes:[code],
      responseCount:count,responseBodySha256:hashes,accountScopeSha256},
    privateArchive:null
  });
  if(!request||!transport||typeof transport.get!=='function'||
    !request.expected||!id(request.expectedBrokerUserId)||
    request.expected.accountScopeId!==request.expectedBrokerUserId||
    request.expected.productType!=='NRML'||
    !/^(NSE_FO|BSE_FO)\|/.test(request.expected.instrumentKey)||
    !id(request.analyticsToken)||request.analyticsToken.length<12||
    /[\r\n\s]/.test(request.analyticsToken)||
    request.operatorAuthorization!=='ACCOUNT_OWNER_APPROVED_GET_ONLY'||
    request.staticIpReview!=='OPERATOR_ATTESTS_WHITELISTED_EGRESS'||
    request.credentialType!=='UPSTOX_ANALYTICS_TOKEN_ONLY'||
    !Number.isInteger(request.sequence)||request.sequence<1||
    request.sequence>64||
    !Number.isInteger(request.timeoutMs)||
    request.timeoutMs<500||request.timeoutMs>15000||
    !request.phase25Policy)
    return fail('READ_ONLY_AUTHORIZATION_OR_CAPTURE_PRECONDITION_FAILED');
  const now=request.clock??Date.now;
  let observedCount=0;
  const hashes:Partial<Record<BookName,string>>={};
  const accountHash=sha(request.expectedBrokerUserId);
  async function read(book:BookName):Promise<BookSnapshot|null>{
    const url=(ORIGIN+ENDPOINTS[book]) as AllowedUpstoxGetUrl;
    // Retry is forbidden: uncertain network failures must not produce
    // fabricated complete-book states.
    const response=await transport.get(url,request.analyticsToken,
      request.timeoutMs);
    if(!response||response.status!==200||
      response.redirected!==false||response.finalUrl!==url||
      !/^application\/json(?:\s*;|$)/i.test(response.contentType)||
      !(response.bodyBytes instanceof Uint8Array)||
      response.bodyBytes.length<2||response.bodyBytes.length>LIMIT)
      return null;
    let parsed:unknown;
    try{
      parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true})
        .decode(response.bodyBytes));
    }catch{return null;}
    if(!record(parsed)||parsed.status!=='success'||
      (book==='profile'? !record(parsed.data):
        !Array.isArray(parsed.data)||!parsed.data.every(record)))
      return null;
    observedCount++;
    hashes[book]=sha(response.bodyBytes);
    const when=now();
    if(!Number.isFinite(when))return null;
    return {capturedAt:new Date(when).toISOString(),
      body:parsed,bytes:response.bodyBytes,hash:hashes[book]!};
  }
  try{
    // Account identity is compared BEFORE acquiring sensitive books.
    const profile=await read('profile');
    if(!profile)return fail('PROFILE_READ_OR_ENVELOPE_FAILED',true,
      observedCount,hashes,accountHash);
    const p=(profile.body as {data:Record<string,unknown>}).data;
    if(p.user_id!==request.expectedBrokerUserId||p.broker!=='UPSTOX'||
      p.is_active!==true||!Array.isArray(p.products)||
      !p.products.includes('D')||!Array.isArray(p.order_types)||
      !p.order_types.some(x=>x==='SL'||x==='SL-M'))
      return fail('PROFILE_BROKER_ACCOUNT_OR_NRML_ENTITLEMENT_MISMATCH',
        true,observedCount,hashes,accountHash);
    const captured={} as Record<CaptureBook,BookSnapshot>;
    for(const book of ['positions','orders','gtts','trades'] as const){
      const value=await read(book);
      if(!value)return fail('REQUIRED_READ_ONLY_BOOK_GET_FAILED',true,
        observedCount,hashes,accountHash);
      captured[book]=value;
    }
    const toBook=(book:'positions'|'orders'|'gtts')=>({
      method:'GET' as const,path:ENDPOINTS[book],
      unfiltered:true as const,httpStatus:200 as const,
      capturedAt:captured[book].capturedAt,
      response:captured[book].body
    });
    const capture:OfflineUpstoxCaptureBundle={
      schemaVersion:'ADAPTIVE_UPSTOX_OFFLINE_READ_ONLY_V1',
      origin:'OPERATOR_SUPPLIED_UNVERIFIED',
      accountScopeId:request.expectedBrokerUserId,
      positions:toBook('positions'),orders:toBook('orders'),
      gtts:toBook('gtts')
    };
    const trades:OfflineUpstoxDayTradeCapture={
      method:'GET',path:'/v2/order/trades/get-trades-for-day',
      unfiltered:true,httpStatus:200,
      capturedAt:captured.trades.capturedAt,
      response:captured.trades.body
    };
    const evaluation=now();
    if(!Number.isFinite(evaluation))
      return fail('INVALID_READ_ONLY_CAPTURE_CLOCK',true,
        observedCount,hashes,accountHash);
    const frame:OfflineUpstoxLifecycleFrame={
      sequence:request.sequence,
      asOf:new Date(evaluation).toISOString(),
      expected:request.expected,capture,trades
    };
    const audit=auditOfflineUpstoxReadOnlyCapture(
      request.expected,capture,frame.asOf,request.phase25Policy);
    // A blocked Phase26 result must still be archived for operator
    // incident review, NEVER interpreted as safe trading.
    return {
      report:{...empty,status:'CAPTURE_RECORDED_UNVERIFIED',
        readOnlyNetworkActuallyAttempted:true,
        accountProfileMatched:true,responseCount:observedCount,
        responseBodySha256:hashes,accountScopeSha256:accountHash,
        phase26Status:audit.status,
        reasonCodes:audit.reasons.length?[
          'SINGLE_FRAME_STRUCTURAL_REVIEW_HAS_BLOCKERS',...audit.reasons]:[]},
      privateArchive:{
        profileResponseUtf8Base64:Buffer.from(profile.bytes).toString('base64'),
        frame,
        byteWitnesses:(['positions','orders','gtts','trades'] as const)
          .map(book=>({
            sequence:request.sequence,book,
            responseUtf8Base64:
              Buffer.from(captured[book].bytes).toString('base64')
          }))
      }
    };
  }catch{
    // In particular, never serialize transport errors with sensitive URLs,
    // Authorization headers, tokens or response bodies.
    return fail('READ_ONLY_NETWORK_OR_TRANSPORT_FAILED',true,
      observedCount,hashes,accountHash);
  }
}
