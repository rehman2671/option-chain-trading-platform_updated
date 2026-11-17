/**
 * Adaptive Swing v2 Phase32 — EXPLICIT operator-only GET historical F&O
 * execution capture. NEVER imported into the trading engine, routes or jobs.
 *
 * Profile UCC checked first; exactly one allowlisted historical path with a
 * canonical FO query; bounded complete pagination, no redirect/retry/order.
 * The separate GET result is still NOT broker-signed or ownership evidence.
 */
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  createStrictNativeUpstoxAnalyticsGetTransport,
  type ReadOnlyGetTransport,
  type ReadOnlyGetResult
} from './adaptiveUpstoxAuthorizedGetCapture.js';
import {
  auditOfflineHistoricalFoFills,
  type OfflineHistoricalFoAuditInput,
  type HistoricalFoCapturePage,
  type PinnedFoTradeIdentity,
  type HistoricalFoAuditStatus
} from './adaptiveUpstoxPhase31HistoricalFoFills.js';
import type {ReadOnlyExpectedPosition}
  from './adaptiveReadOnlyNrmlProtectionAudit.js';

const ORIGIN='https://api.upstox.com';
const HIST_PATH='/v2/charges/historical-trades';
const PROFILE_URL='https://api.upstox.com/v2/user/profile' as const;
const MAX_BYTES=90_000;
const SHA=/^[a-f0-9]{64}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v)
  .digest('hex');
const rec=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>
  typeof v==='string'&&v.trim().length>0&&v.length<=256;
const int=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const day=(v:unknown):v is string=>
  typeof v==='string'&&DATE.test(v)&&
  Number.isFinite(Date.parse(v+'T00:00:00Z'))&&
  new Date(Date.parse(v+'T00:00:00Z')).toISOString().slice(0,10)===v;

export type Phase32HistoricalUrl=`https://api.upstox.com/v2/charges/historical-trades?segment=FO&start_date=${string}&end_date=${string}&page_number=${number}&page_size=${number}`;
export interface HistoricalFoPageTransport {
  get(url:Phase32HistoricalUrl,bearer:string,timeoutMs:number):
    Promise<ReadOnlyGetResult>;
}
export interface ExplicitHistoricalFoCaptureRequest {
  expected:ReadOnlyExpectedPosition;
  pinnedContract:PinnedFoTradeIdentity;
  openingNetLongQuantity:number;
  closingNetLongQuantity:number;
  startDate:string;
  endDate:string;
  pageSize:number;
  maximumPages:number;
  timeoutMs:number;
  maxCaptureAgeMinutes:number;
  analyticsToken:string;
  expectedBrokerUserId:string;
  operatorAuthorization:'ACCOUNT_OWNER_APPROVED_GET_ONLY';
  staticIpReview:'OPERATOR_ATTESTS_WHITELISTED_EGRESS';
  credentialType:'UPSTOX_ANALYTICS_TOKEN_ONLY';
  /** Dependency-injected synthetic clock; NEVER independently attested. */
  clock?:()=>number;
}
export interface PrivateHistoricalFoArchive {
  schemaVersion:'ADAPTIVE_UPSTOX_PHASE32_PRIVATE_FO_CAPTURE_V1';
  source:'EXPLICIT_READ_ONLY_OPERATOR_CAPTURE_UNVERIFIED';
  /** Contains FULL private profile/UCC; never log or commit. */
  profileResponseUtf8Base64:string;
  /** Full operator-scope selected FO research input and ALL raw rows. */
  input:OfflineHistoricalFoAuditInput;
  responseBytes:Array<{pageNumber:number;responseUtf8Base64:string}>;
}
export interface Phase32HistoricalFoCaptureReport {
  mode:'MANUAL_GET_ONLY_HISTORICAL_FO_CAPTURE';
  status:'REJECTED_PRECONDITION'|'CAPTURE_FAILED'|
    'CAPTURE_RECORDED_UNVERIFIED';
  executionAuthorized:false;productionSafe:false;
  brokerAuthenticated:false;brokerStopInstalled:false;
  nativeOrderInstruction:null;protectedOvernight:false;
  accountProfileMatched:boolean;
  readOnlyNetworkActuallyAttempted:boolean;
  phase31Status:HistoricalFoAuditStatus|null;
  pageCount:number;
  totalFoRows:number;
  requestedPageSize:number|null;
  responseDigestChainSha256:string|null;
  reasonCodes:string[];
  warnings:string[];
}
export interface Phase32HistoricalFoCaptureOutcome {
  report:Phase32HistoricalFoCaptureReport;
  /** Contains raw broker PII/trades: strictly private local data only. */
  privateArchive:PrivateHistoricalFoArchive|null;
}
const warnings=[
  'OPERATOR_AUTHORIZATION_TOKEN_TYPE_EGRESS_IP_NOT_INDEPENDENTLY_VERIFIED',
  'PROFILE_USER_ID_MATCHES_TOKEN_RESPONSE_NOT_EXTERNAL_ACCOUNT_OWNERSHIP',
  'UPSTOX_HISTORICAL_FO_EXECUTIONS_DO_NOT_INCLUDE_NATIVE_STOP_ACK_HISTORY',
  'RAW_HTTP_BODY_BYTES_ARE_NOT_SIGNED_BROKER_TLS_WIRE_RECORDS',
  'END_OF_DAY_OR_DURING_PAGINATION_MUTATION_CANNOT_BE_EXCLUDED',
  'THIS_COLLECTOR_DOES_NOT_PLACE_CANCEL_MODIFY_OR_SQUARE_OFF_NRML'
];
const blank=():Phase32HistoricalFoCaptureReport=>({
  mode:'MANUAL_GET_ONLY_HISTORICAL_FO_CAPTURE',
  status:'REJECTED_PRECONDITION',executionAuthorized:false,
  productionSafe:false,brokerAuthenticated:false,
  brokerStopInstalled:false,nativeOrderInstruction:null,
  protectedOvernight:false,accountProfileMatched:false,
  readOnlyNetworkActuallyAttempted:false,phase31Status:null,
  pageCount:0,totalFoRows:0,requestedPageSize:null,
  responseDigestChainSha256:null,reasonCodes:[],warnings
});
function responseBody(response:ReadOnlyGetResult,url:string):
  {body:Record<string,unknown>;bytes:Uint8Array}|null{
  if(!response||response.status!==200||response.redirected!==false||
    response.finalUrl!==url||
    !/^application\/json(?:\s*;|$)/i.test(response.contentType)||
    !(response.bodyBytes instanceof Uint8Array)||
    response.bodyBytes.length<2||response.bodyBytes.length>MAX_BYTES)
    return null;
  try{
    const body=JSON.parse(
      new TextDecoder('utf-8',{fatal:true}).decode(response.bodyBytes)
    ) as unknown;
    return rec(body)&&body.status==='success'?
      {body,bytes:response.bodyBytes}:null;
  }catch{return null;}
}
function validRequest(r:ExplicitHistoricalFoCaptureRequest,now:number){
  if(!r||!Number.isFinite(now)||!r.expected||!r.pinnedContract||
    r.expected.productType!=='NRML'||!id(r.expected.accountScopeId)||
    r.expected.accountScopeId!==r.expectedBrokerUserId||
    !/^(NSE_FO|BSE_FO)\|/.test(r.expected.instrumentKey)||
    !int(r.expected.lotSize)||r.expected.lotSize===0||
    !int(r.expected.expectedNetLongQuantity)||
    !int(r.openingNetLongQuantity)||!int(r.closingNetLongQuantity)||
    r.expected.expectedNetLongQuantity%r.expected.lotSize!==0||
    r.openingNetLongQuantity%r.expected.lotSize!==0||
    r.closingNetLongQuantity%r.expected.lotSize!==0||
    !day(r.startDate)||!day(r.endDate)||r.endDate<r.startDate||
    !day(r.expected.expiry)||r.expected.expiry!==r.pinnedContract.expiry||
    !id(r.pinnedContract.symbol)||r.pinnedContract.strikePrice<=0||
    !Number.isFinite(r.pinnedContract.strikePrice)||
    !['CE','PE'].includes(r.pinnedContract.optionType)||
    !['NFO','BFO'].includes(r.pinnedContract.exchange)||
    (r.pinnedContract.exchange==='NFO'?
      !r.expected.instrumentKey.startsWith('NSE_FO|'):
      !r.expected.instrumentKey.startsWith('BSE_FO|'))||
    !Number.isInteger(r.pageSize)||r.pageSize<1||r.pageSize>100||
    !Number.isInteger(r.maximumPages)||r.maximumPages<1||
    r.maximumPages>16||!Number.isInteger(r.timeoutMs)||
    r.timeoutMs<500||r.timeoutMs>15000||
    !Number.isInteger(r.maxCaptureAgeMinutes)||
    r.maxCaptureAgeMinutes<1||r.maxCaptureAgeMinutes>30||
    !id(r.analyticsToken)||r.analyticsToken.length<12||
    /\s/.test(r.analyticsToken)||
    r.operatorAuthorization!=='ACCOUNT_OWNER_APPROVED_GET_ONLY'||
    r.staticIpReview!=='OPERATOR_ATTESTS_WHITELISTED_EGRESS'||
    r.credentialType!=='UPSTOX_ANALYTICS_TOKEN_ONLY')
    return false;
  const today=new Date(now+330*60_000).toISOString().slice(0,10);
  const diff=Math.round((Date.parse(r.endDate+'T00:00:00Z')-
    Date.parse(r.startDate+'T00:00:00Z'))/86400000);
  const age=Math.round((Date.parse(today+'T00:00:00Z')-
    Date.parse(r.startDate+'T00:00:00Z'))/86400000);
  // Deliberately conservative: <= 31-day requested window, <= ~3 years.
  return r.endDate<=today&&diff<=31&&age>=0&&age<=1100;
}
function canonicalUrl(request:ExplicitHistoricalFoCaptureRequest,
  page:number):Phase32HistoricalUrl{
  return `${ORIGIN}${HIST_PATH}?segment=FO&start_date=${request.startDate}&end_date=${request.endDate}&page_number=${page}&page_size=${request.pageSize}`
    as Phase32HistoricalUrl;
}
/** Explicit native GET transport. Strict path/query canonicalization,
 * no redirects, no retries, no body streaming into unlimited memory.
 */
export function createStrictHistoricalFoGetTransport():HistoricalFoPageTransport{
  return {
    async get(url,bearer,timeoutMs){
      if(!Number.isInteger(timeoutMs)||timeoutMs<500||timeoutMs>15000)
        throw Error('INVALID_HISTORICAL_GET_TIMEOUT');
      if(typeof url!=='string'||url.length>300||
        !/^https:\/\/api\.upstox\.com\/v2\/charges\/historical-trades\?segment=FO&start_date=\d{4}-\d\d-\d\d&end_date=\d{4}-\d\d-\d\d&page_number=[1-9]\d*&page_size=[1-9]\d*$/.test(url))
        throw Error('DISALLOWED_HISTORICAL_GET_URL');
      const u=new URL(url);
      const page=Number(u.searchParams.get('page_number'));
      const size=Number(u.searchParams.get('page_size'));
      if(!day(u.searchParams.get('start_date'))||
        !day(u.searchParams.get('end_date'))||
        u.searchParams.get('end_date')!>=u.searchParams.get('start_date')!||
        !Number.isInteger(page)||page<1||page>16||
        !Number.isInteger(size)||size<1||size>100)
        throw Error('INVALID_CANONICAL_FO_QUERY');
      const resp=await fetch(url,{
        method:'GET',redirect:'manual',cache:'no-store',credentials:'omit',
        headers:{Authorization:'Bearer '+bearer,Accept:'application/json'},
        signal:AbortSignal.timeout(timeoutMs)
      });
      if(resp.redirected||resp.url!==url||resp.status!==200||
        !/^application\/json(?:\s*;|$)/i.test(
          resp.headers.get('content-type')??'')){
        await resp.body?.cancel().catch(()=>undefined);
        return {status:resp.status,finalUrl:resp.url,
          redirected:resp.redirected,
          contentType:resp.headers.get('content-type')??'',
          bodyBytes:new Uint8Array()};
      }
      if(!resp.body)throw Error('MISSING_FO_GET_BODY');
      const reader=resp.body.getReader();
      const chunks:Uint8Array[]=[];let total=0;
      try{
        while(true){
          const next=await reader.read();
          if(next.done)break;
          total+=next.value.byteLength;
          if(total>MAX_BYTES)throw Error('OVERSIZED_FO_GET_BODY');
          chunks.push(next.value);
        }
      }finally{reader.releaseLock();}
      const bytes=new Uint8Array(total);let index=0;
      for(const part of chunks){bytes.set(part,index);index+=part.length;}
      return {status:resp.status,finalUrl:resp.url,
        redirected:false,contentType:resp.headers.get('content-type')??'',
        bodyBytes:bytes};
    }
  };
}
/** Manual operator action only. No persistence; caller must encrypt archive. */
export async function collectExplicitHistoricalFoGetEvidence(
  request:ExplicitHistoricalFoCaptureRequest,
  profileTransport:ReadOnlyGetTransport,
  historyTransport:HistoricalFoPageTransport
):Promise<Phase32HistoricalFoCaptureOutcome>{
  const b=blank();
  const fail=(reason:string,attempted=false,
    count=0):Phase32HistoricalFoCaptureOutcome=>({
    report:{...b,status:attempted?'CAPTURE_FAILED':'REJECTED_PRECONDITION',
      readOnlyNetworkActuallyAttempted:attempted,pageCount:count,
      requestedPageSize:request?.pageSize??null,reasonCodes:[reason]},
    privateArchive:null
  });
  let clock:()=>number;
  try{clock=request?.clock??Date.now;}catch{
    return fail('INVALID_HISTORICAL_CAPTURE_CLOCK');
  }
  if(!profileTransport||typeof profileTransport.get!=='function'||
    !historyTransport||typeof historyTransport.get!=='function'||
    typeof clock!=='function'||!validRequest(request,clock()))
    return fail('HISTORICAL_FO_GET_CONSENT_SCOPE_OR_BOUNDS_INVALID');
  let count=0;
  try{
    const profile=responseBody(await profileTransport.get(
      PROFILE_URL,request.analyticsToken,request.timeoutMs),PROFILE_URL);
    if(!profile||!rec(profile.body.data)||
      profile.body.data.user_id!==request.expectedBrokerUserId||
      profile.body.data.broker!=='UPSTOX'||
      profile.body.data.is_active!==true||
      !Array.isArray(profile.body.data.products)||
      !profile.body.data.products.includes('D'))
      return fail('PROFILE_ACCOUNT_OR_NRML_ENTITLEMENT_UNVERIFIED',true);
    const rawPages:PrivateHistoricalFoArchive['responseBytes']=[];
    const pages:HistoricalFoCapturePage[]=[];
    let totalPages:number|null=null,totalRecords:number|null=null;
    let chain=sha('PHASE32_FO_RAW_HTTP_BODIES_V1\n'+sha(profile.bytes));
    for(let page=1;page<=request.maximumPages;page++){
      const url=canonicalUrl(request,page);
      const result=responseBody(await historyTransport.get(
        url,request.analyticsToken,request.timeoutMs),url);
      if(!result||!Array.isArray(result.body.data)||
        !result.body.data.every(rec)||!rec(result.body.meta_data)||
        !rec(result.body.meta_data.page))
        return fail('HISTORICAL_FO_GET_OR_PAGE_METADATA_FAILED',true,count);
      const meta=result.body.meta_data.page;
      if(!int(meta.page_number)||meta.page_number!==page||
        !int(meta.page_size)||meta.page_size!==request.pageSize||
        !int(meta.total_records)||!int(meta.total_pages)||
        meta.total_pages!==Math.max(1,Math.ceil(
          meta.total_records/meta.page_size))||
        meta.total_pages>request.maximumPages||
        (totalPages!==null&&(meta.total_pages!==totalPages||
          meta.total_records!==totalRecords)))
        return fail('HISTORICAL_FO_PAGINATION_INCOMPLETE_OR_CHANGED',true,count);
      totalPages=meta.total_pages;totalRecords=meta.total_records;
      const expectedRows=Math.max(0,Math.min(request.pageSize,
        totalRecords-(page-1)*request.pageSize));
      if(result.body.data.length!==expectedRows)
        return fail('HISTORICAL_FO_MISSING_PAGE_ROWS',true,count);
      rawPages.push({pageNumber:page,
        responseUtf8Base64:Buffer.from(result.bytes).toString('base64')});
      pages.push({
        method:'GET',path:HIST_PATH,query:{
          segment:'FO',start_date:request.startDate,
          end_date:request.endDate,page_number:page,
          page_size:request.pageSize
        },httpStatus:200,
        capturedAt:new Date(clock()).toISOString(),
        response:result.body
      });
      chain=sha(chain+'\n'+page+'\n'+sha(result.bytes));
      count++;
      if(page===totalPages)break;
    }
    if(count!==totalPages)return fail('HISTORICAL_FO_PAGE_LIMIT_REACHED',true,count);
    const input:OfflineHistoricalFoAuditInput={
      schemaVersion:'ADAPTIVE_UPSTOX_HISTORICAL_FO_V1',
      origin:'OPERATOR_SUPPLIED_UNVERIFIED',expected:request.expected,
      pinnedContract:request.pinnedContract,
      openingNetLongQuantity:request.openingNetLongQuantity,
      closingNetLongQuantity:request.closingNetLongQuantity,
      startDate:request.startDate,endDate:request.endDate,
      asOf:new Date(clock()).toISOString(),
      maxCaptureAgeMinutes:request.maxCaptureAgeMinutes,pages
    };
    const assessment=auditOfflineHistoricalFoFills(input);
    if(assessment.status==='INVALID_EVIDENCE')
      return fail('PHASE31_STRICT_HISTORICAL_FO_AUDIT_REJECTED',true,count);
    const report:Phase32HistoricalFoCaptureReport={
      ...b,status:'CAPTURE_RECORDED_UNVERIFIED',
      readOnlyNetworkActuallyAttempted:true,accountProfileMatched:true,
      phase31Status:assessment.status,pageCount:count,
      totalFoRows:assessment.totalFoRows,
      requestedPageSize:request.pageSize,
      responseDigestChainSha256:chain,
      reasonCodes:assessment.reasons.length?[
        'HISTORICAL_FILL_REVIEW_HAS_BLOCKERS',...assessment.reasons]:[]
    };
    return {report,privateArchive:{
      schemaVersion:'ADAPTIVE_UPSTOX_PHASE32_PRIVATE_FO_CAPTURE_V1',
      source:'EXPLICIT_READ_ONLY_OPERATOR_CAPTURE_UNVERIFIED',
      profileResponseUtf8Base64:Buffer.from(profile.bytes).toString('base64'),
      input,responseBytes:rawPages
    }};
  }catch{
    // NEVER emit exception, bearer, private path or original response.
    return fail('HISTORICAL_GET_TRANSPORT_OR_CLOCK_FAILED',true,count);
  }
}
