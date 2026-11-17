import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,readFileSync,readdirSync,
  writeFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {
  collectExplicitHistoricalFoGetEvidence,
  createStrictHistoricalFoGetTransport,
  type ExplicitHistoricalFoCaptureRequest,
  type Phase32HistoricalFoCaptureOutcome,
  type HistoricalFoPageTransport,
  type Phase32HistoricalUrl
} from '../../server/engine/ema15m/adaptiveUpstoxPhase32HistoricalFoCollector.js';
import {
  persistEncryptedHistoricalFoArchive,
  decryptHistoricalFoArchive,verifyPrivateHistoricalFoArchive
} from '../../server/engine/ema15m/adaptiveUpstoxPhase32HistoricalFoArchive.js';
import type {
  ReadOnlyGetTransport,AllowedUpstoxGetUrl,
  ReadOnlyGetResult
} from '../../server/engine/ema15m/adaptiveUpstoxAuthorizedGetCapture.js';

const account='SYNTHETIC_PHASE32_UCC';
const instrument='NSE_FO|SYNTHETIC32';
const startDate='2026-11-16';
const at='2026-11-17T10:00:00.000Z';
const profileUrl='https://api.upstox.com/v2/user/profile';
const token='SYNTHETIC_TEST_ONLY_ANALYTICS_NO_REAL_CREDENTIAL';
const profile={status:'success',data:{
  user_id:account,broker:'UPSTOX',is_active:true,
  products:['D','I'],order_types:['SL']
}};
const trade=(tradeId:string,side:'BUY'|'SELL',quantity=65,
  extra:Record<string,unknown>={})=>({
  exchange:'NFO',segment:'FO',option_type:'CE',
  trade_id:tradeId,trade_date:startDate,transaction_type:side,
  symbol:'NIFTY',scrip_name:'NIFTY',strike_price:'24000.0',
  expiry:'2026-12-24',price:250,quantity,
  instrument_token:'',...extra
});
const meta=(data:unknown[],page:number,records:number,size:number,
  pages:number)=>({
  status:'success',data,errors:null,
  meta_data:{page:{page_number:page,page_size:size,
    total_records:records,total_pages:pages}}
});
function request():ExplicitHistoricalFoCaptureRequest{
  let clock=0;
  return {
    expected:{accountScopeId:account,instrumentKey:instrument,
      productType:'NRML',expiry:'2026-12-24',
      lotSize:65,expectedNetLongQuantity:130},
    pinnedContract:{exchange:'NFO',symbol:'NIFTY',
      optionType:'CE',strikePrice:24000,expiry:'2026-12-24'},
    openingNetLongQuantity:130,closingNetLongQuantity:130,
    startDate,endDate:startDate,pageSize:1,
    maximumPages:4,timeoutMs:1500,maxCaptureAgeMinutes:5,
    analyticsToken:token,expectedBrokerUserId:account,
    operatorAuthorization:'ACCOUNT_OWNER_APPROVED_GET_ONLY',
    staticIpReview:'OPERATOR_ATTESTS_WHITELISTED_EGRESS',
    credentialType:'UPSTOX_ANALYTICS_TOKEN_ONLY',
    clock:()=>Date.parse(at)+clock++*1000
  };
}
type ResponseBody=Record<string,unknown>;
function mocked(bodies:ResponseBody[]=[
  meta([trade('T1','BUY')],1,2,1,2),
  meta([trade('T2','SELL')],2,2,1,2)
],p:unknown=profile){
  const calls:string[]=[];
  const profileTransport:ReadOnlyGetTransport={
    get:async (url:AllowedUpstoxGetUrl,bearer:string,timeout:number)=>{
      calls.push(String(url));
      assert.equal(String(url),profileUrl);
      assert.equal(bearer,token);assert.equal(timeout,1500);
      return {status:200,finalUrl:url,redirected:false,
        contentType:'application/json',
        bodyBytes:Buffer.from(JSON.stringify(p))};
    }
  };
  const foTransport:HistoricalFoPageTransport={
    get:async (url:Phase32HistoricalUrl,bearer:string,timeout:number)=>{
      calls.push(String(url));
      assert.equal(bearer,token);assert.equal(timeout,1500);
      assert.ok(url.startsWith('https://api.upstox.com/v2/charges/historical-trades?segment=FO&'));
      const parsed=new URL(url);
      const idx=Number(parsed.searchParams.get('page_number'))-1;
      assert.ok(idx>=0);
      return {status:200,finalUrl:url,redirected:false,
        contentType:'application/json; charset=utf-8',
        bodyBytes:Buffer.from(JSON.stringify(bodies[idx]))};
    }
  };
  return {calls,profileTransport,foTransport};
}
const audit=(req:ExplicitHistoricalFoCaptureRequest=request(),
  mocks=mocked())=>
  collectExplicitHistoricalFoGetEvidence(
    req,mocks.profileTransport,mocks.foTransport);
const safety=(x:Phase32HistoricalFoCaptureOutcome)=>{
  const r=x.report;
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.protectedOvernight,false);
  assert.equal(JSON.stringify(r).includes(account),false);
  assert.equal(JSON.stringify(r).includes(instrument),false);
  assert.equal(JSON.stringify(r).includes(token),false);
};
function privateDir(){
  const dir=mkdtempSync(join(tmpdir(),'phase32-fo-'));
  chmodSync(dir,0o700);
  return dir;
}
function privateFile(dir:string){
  const dirs=readdirSync(dir);
  assert.equal(dirs.length,1);
  return join(dir,dirs[0],'history.private.aead.json');
}
describe('Phase32 strictly authorized bounded historical FO GET and AES archive',()=>{
  it('profile-first GET, two complete FO pages, sanitized report and original bytes',async()=>{
    const m=mocked();const r=await audit(request(),m);safety(r);
    assert.equal(r.report.status,'CAPTURE_RECORDED_UNVERIFIED');
    assert.equal(r.report.phase31Status,
      'HISTORICAL_FILLS_RECONCILED_UNVERIFIED');
    assert.equal(r.report.pageCount,2);
    assert.equal(r.report.totalFoRows,2);
    assert.equal(m.calls.length,3);
    assert.equal(m.calls[0],profileUrl);
    assert.equal(m.calls[1],
      'https://api.upstox.com/v2/charges/historical-trades?segment=FO&start_date=2026-11-16&end_date=2026-11-16&page_number=1&page_size=1');
    assert.equal(m.calls[2].endsWith('page_number=2&page_size=1'),true);
    assert.ok(r.privateArchive);
    assert.equal(r.privateArchive!.responseBytes.length,2);
    assert.equal(r.privateArchive!.input.pages.length,2);
    assert.equal(verifyPrivateHistoricalFoArchive(
      r.privateArchive!,r.report).status,'ARCHIVED_FO_PAGES_MATCH_UNVERIFIED');
    assert.ok(/^[a-f0-9]{64}$/.test(r.report.responseDigestChainSha256!));
    const printed=JSON.stringify(r.report);
    assert.ok(!printed.includes('T1'));
    assert.ok(!printed.includes('T2'));
  });
  it('empty complete FO page is not automatically proof of no historical trades',async()=>{
    const p=request();p.pageSize=100;
    const x=await audit(p,mocked([meta([],1,0,100,1)]));
    safety(x);
    assert.equal(x.report.status,'CAPTURE_RECORDED_UNVERIFIED');
    assert.equal(x.report.totalFoRows,0);
    assert.equal(x.report.phase31Status,
      'HISTORICAL_FILLS_RECONCILED_UNVERIFIED');
  });
  it('unauthorized/token/expiry/amount/filter preconditions: ZERO network',async()=>{
    for(const mutation of [
      {operatorAuthorization:'MISSING'},
      {staticIpReview:'NOT_APPROVED'},
      {credentialType:'BROKER_TRADING_TOKEN'},
      {analyticsToken:'bad'},
      {expectedBrokerUserId:'OTHER_UCC'},
      {pageSize:5000},{maximumPages:99},{timeoutMs:0},
      {startDate:'2027-01-01',endDate:'2027-01-01'},
      {startDate:'2026-10-01',endDate:'2026-11-16'},
      {openingNetLongQuantity:131},
      {pinnedContract:{...request().pinnedContract,expiry:'2026-12-31'}}
    ]){
      const m=mocked();
      const r=await audit({...request(),...mutation} as
        ExplicitHistoricalFoCaptureRequest,m);
      safety(r);
      assert.equal(r.report.status,'REJECTED_PRECONDITION',
        JSON.stringify(r.report));
      assert.equal(m.calls.length,0);
      assert.equal(r.privateArchive,null);
    }
  });
  it('profile/UCC entitlement mismatch stops BEFORE historical FO GET',async()=>{
    for(const data of [
      {...profile,data:{...profile.data,user_id:'OTHER_UCC'}},
      {...profile,data:{...profile.data,is_active:false}},
      {...profile,data:{...profile.data,broker:'OTHER'}},
      {...profile,data:{...profile.data,products:['I']}},
      {status:'error',data:profile.data}
    ]){
      const m=mocked(undefined,data);const r=await audit(request(),m);
      safety(r);
      assert.equal(r.report.status,'CAPTURE_FAILED');
      assert.deepEqual(m.calls,[profileUrl]);
      assert.equal(r.privateArchive,null);
    }
  });
  it('missing page, moving totals and over-bound max pages fail closed',async()=>{
    const m=mocked([
      meta([trade('T1','BUY')],1,4,1,4),
      meta([trade('T2','SELL')],2,4,1,4),
      meta([trade('T3','BUY')],3,4,1,4),
      meta([trade('T4','SELL')],4,4,1,4)
    ]);
    const r=request();r.maximumPages=2;
    const x=await audit(r,m);safety(x);
    assert.equal(x.report.status,'CAPTURE_FAILED');
    assert.equal(x.privateArchive,null);
    assert.equal(m.calls.length,2);
    const drift=mocked([
      meta([trade('T1','BUY')],1,2,1,2),
      meta([trade('T2','SELL')],2,3,1,3)
    ]);
    const y=await audit(request(),drift);safety(y);
    assert.equal(y.report.status,'CAPTURE_FAILED');
    assert.equal(y.privateArchive,null);
    const incomplete=mocked([
      meta([trade('T1','BUY')],1,2,1,2),
      meta([],2,2,1,2)
    ]);
    const z=await audit(request(),incomplete);safety(z);
    assert.equal(z.report.status,'CAPTURE_FAILED');
  });
  it('invalid success rows / duplicate trade IDs cannot be recorded',async()=>{
    const dup=mocked([
      meta([trade('SAME','BUY')],1,2,1,2),
      meta([trade('SAME','SELL')],2,2,1,2)
    ]);
    const r=await audit(request(),dup);safety(r);
    assert.equal(r.report.status,'CAPTURE_FAILED');
    assert.equal(r.report.reasonCodes[0],
      'PHASE31_STRICT_HISTORICAL_FO_AUDIT_REJECTED');
    assert.equal(r.privateArchive,null);
    const bad=mocked([
      meta([trade('T1','BUY',1.5)],1,2,1,2),
      meta([trade('T2','SELL')],2,2,1,2)
    ]);
    assert.equal((await audit(request(),bad)).report.status,'CAPTURE_FAILED');
  });
  it('cross-IST-date FO history archived only as BLOCKED and never promoted',async()=>{
    const r=request();
    r.endDate='2026-11-17';
    const m=mocked([
      meta([trade('T1','BUY',65)],1,2,1,2),
      meta([trade('T2','SELL',65,{trade_date:'2026-11-17'})],2,2,1,2)
    ]);
    const x=await audit(r,m);safety(x);
    assert.equal(x.report.status,'CAPTURE_RECORDED_UNVERIFIED');
    assert.equal(x.report.phase31Status,'BLOCKED_OR_UNKNOWN');
    assert.ok(x.report.reasonCodes.includes(
      'HISTORICAL_FILLS_CANNOT_PROVE_OVERNIGHT_NATIVE_STOP_CONTINUITY'));
  });
  it('redirect, error, invalid JSON and unsafe content types are rejected',async()=>{
    for(const delta of [
      {status:401},{status:429},{redirected:true,
        finalUrl:'https://evil.example/token'},
      {contentType:'text/html'},{
        bodyBytes:Buffer.from('<html>error</html>')
      },
      {bodyBytes:new Uint8Array(90001)}
    ]){
      const m=mocked();
      const original=m.foTransport.get.bind(m.foTransport);
      m.foTransport.get=async (url,bearer,timeout)=>({
        ...await original(url,bearer,timeout),...delta
      });
      const r=await audit(request(),m);safety(r);
      assert.equal(r.report.status,'CAPTURE_FAILED');
      assert.equal(r.privateArchive,null);
      assert.equal(m.calls.length,2);
      assert.ok(!JSON.stringify(r.report).includes('evil.example'));
    }
  });
  it('underlying network exceptions do not leak bearer or UCC',async()=>{
    const m=mocked();
    m.foTransport.get=async ()=>{throw Error('secret '+token+' '+account);};
    const x=await audit(request(),m);safety(x);
    assert.equal(x.report.status,'CAPTURE_FAILED');
    assert.deepEqual(x.report.reasonCodes,
      ['HISTORICAL_GET_TRANSPORT_OR_CLOCK_FAILED']);
  });
  it('native HTTP adapter uses exact canonical allowlist and GET only',async()=>{
    const old=globalThis.fetch;
    const calls:Array<{url:string;init:RequestInit}>=[];
    globalThis.fetch=(async (url:RequestInfo|URL,init?:RequestInit)=>{
      calls.push({url:String(url),init:init??{}});
      const resp=new Response(JSON.stringify(meta([],1,0,100,1)),{
        status:200,headers:{'content-type':'application/json'}
      });
      Object.defineProperty(resp,'url',{value:String(url)});
      return resp;
    }) as typeof fetch;
    try{
      const tr=createStrictHistoricalFoGetTransport();
      const url=
        'https://api.upstox.com/v2/charges/historical-trades?segment=FO&start_date=2026-11-16&end_date=2026-11-16&page_number=1&page_size=100';
      const x=await tr.get(url,token,1500);
      assert.equal(x.status,200);
      assert.equal(calls.length,1);
      assert.equal(calls[0].init.method,'GET');
      assert.equal(calls[0].init.redirect,'manual');
      assert.equal(calls[0].init.cache,'no-store');
      assert.equal(calls[0].init.credentials,'omit');
      for(const unsafe of [
        'https://evil.example/historical-trades?segment=FO&start_date=2026-11-16&end_date=2026-11-16&page_number=1&page_size=100',
        url+'&token=EVIL',url.replace('segment=FO','segment=EQ'),
        url.replace('page_number=1','page_number=17'),
        url.replace('page_size=100','page_size=5000')
      ]){
        await assert.rejects(tr.get(
          unsafe as Phase32HistoricalUrl,token,1500));
      }
      assert.equal(calls.length,1);
    }finally{globalThis.fetch=old;}
  });
  it('private AES-256-GCM historical archive roundtrip, no plaintext UCC/trades',async()=>{
    const outcome=await audit();
    assert.ok(outcome.privateArchive);
    const parent=privateDir(),key=randomBytes(32).toString('hex');
    try{
      const saved=persistEncryptedHistoricalFoArchive(
        parent,outcome.privateArchive!,outcome.report,key);
      assert.equal(saved.status,'ENCRYPTED_FO_ARCHIVE_WRITTEN');
      assert.ok(/^[a-f0-9]{64}$/.test(saved.encryptedJsonSha256!));
      const path=privateFile(parent),raw=readFileSync(path,'utf8');
      assert.equal(raw.includes(account),false);
      assert.equal(raw.includes(token),false);
      assert.equal(raw.includes('T1'),false);
      assert.equal(raw.includes('SYNTHETIC32'),false);
      assert.equal(raw.includes(key),false);
      assert.equal(statSync(path).mode&0o077,0);
      const opened=decryptHistoricalFoArchive(path,key);
      assert.equal(opened?.archive.responseBytes.length,2);
      assert.equal(opened?.report.status,'CAPTURE_RECORDED_UNVERIFIED');
      assert.equal(decryptHistoricalFoArchive(
        path,randomBytes(32).toString('hex')),null);
      const tampered=JSON.parse(raw);
      tampered.tagBase64=randomBytes(16).toString('base64');
      writeFileSync(path,JSON.stringify(tampered),{mode:0o600});
      assert.equal(decryptHistoricalFoArchive(path,key),null);
    }finally{rmSync(parent,{recursive:true,force:true});}
  });
  it('reformatted raw page breaks hash, non-private storage or wrong key blocked',async()=>{
    const outcome=await audit();
    const p=structuredClone(outcome.privateArchive!);
    const original=JSON.parse(Buffer.from(
      p.responseBytes[0].responseUtf8Base64,'base64').toString('utf8'));
    p.responseBytes[0].responseUtf8Base64=Buffer.from(
      JSON.stringify(original,null,2)).toString('base64');
    assert.equal(verifyPrivateHistoricalFoArchive(p,outcome.report).status,
      'INVALID_PRIVATE_FO_ARCHIVE');
    const parent=privateDir(),key=randomBytes(32).toString('hex');
    try{
      assert.equal(persistEncryptedHistoricalFoArchive(
        parent,p,outcome.report,key).status,
        'REJECTED_PRIVATE_FO_ENCRYPTION');
      assert.equal(persistEncryptedHistoricalFoArchive(
        parent,outcome.privateArchive!,outcome.report,'bad').status,
        'REJECTED_PRIVATE_FO_ENCRYPTION');
      chmodSync(parent,0o755);
      assert.equal(persistEncryptedHistoricalFoArchive(
        parent,outcome.privateArchive!,outcome.report,key).status,
        'REJECTED_PRIVATE_FO_ENCRYPTION');
    }finally{chmodSync(parent,0o700);
      rmSync(parent,{recursive:true,force:true});}
  });
});
