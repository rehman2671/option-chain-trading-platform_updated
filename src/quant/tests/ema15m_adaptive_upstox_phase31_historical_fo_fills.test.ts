import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditOfflineHistoricalFoFills,type OfflineHistoricalFoAuditInput,
  type HistoricalFoCapturePage
} from '../../server/engine/ema15m/adaptiveUpstoxPhase31HistoricalFoFills.js';

const account='SYNTHETIC_PHASE31_ACCOUNT';
const instrument='NSE_FO|SYNTHETIC_31';
const startDate='2026-11-16',endDate='2026-11-16';
const asOf='2026-11-17T10:00:00.000Z';
const raw=(data:Array<Record<string,unknown>>,page=1,total=data.length,
  totalPages=1,size=100)=>({
  status:'success',data,errors:null,
  meta_data:{page:{page_number:page,page_size:size,total_records:total,
    total_pages:totalPages}}
});
const row=(tradeId:string,side:'BUY'|'SELL',quantity=65,
  options:Record<string,unknown>={})=>({
  exchange:'NFO',segment:'FO',option_type:'CE',quantity,
  trade_id:tradeId,trade_date:startDate,transaction_type:side,
  scrip_name:'NIFTY',strike_price:'24000.0',
  expiry:'2026-12-24',price:250,amount:quantity*250,
  isin:'',symbol:'NIFTY',instrument_token:'',...options
});
function packet(trades:Array<Record<string,unknown>>=[]):
  OfflineHistoricalFoAuditInput {
  return {
    schemaVersion:'ADAPTIVE_UPSTOX_HISTORICAL_FO_V1',
    origin:'OPERATOR_SUPPLIED_UNVERIFIED',
    expected:{
      accountScopeId:account,instrumentKey:instrument,productType:'NRML',
      lotSize:65,expiry:'2026-12-24',expectedNetLongQuantity:130
    },
    pinnedContract:{
      exchange:'NFO',symbol:'NIFTY',optionType:'CE',
      strikePrice:24000,expiry:'2026-12-24'
    },
    startDate,endDate,asOf,maxCaptureAgeMinutes:5,
    openingNetLongQuantity:130,closingNetLongQuantity:130,
    pages:[{
      method:'GET',path:'/v2/charges/historical-trades',
      query:{segment:'FO',start_date:startDate,end_date:endDate,
        page_number:1,page_size:100},
      httpStatus:200,capturedAt:'2026-11-17T09:59:45.000Z',
      response:raw(trades)
    }]
  };
}
const rows=(p:OfflineHistoricalFoAuditInput,page=0)=>
  (p.pages[page].response as {data:Array<Record<string,unknown>>}).data;
const meta=(p:OfflineHistoricalFoAuditInput,page=0)=>
  (p.pages[page].response as {meta_data:{page:Record<string,unknown>}})
    .meta_data.page;
const audit=(p=packet())=>auditOfflineHistoricalFoFills(p);
function fails(p:OfflineHistoricalFoAuditInput,reason:string,
  status:'INVALID_EVIDENCE'|'BLOCKED_OR_UNKNOWN'='BLOCKED_OR_UNKNOWN'){
  const r=audit(p);
  assert.equal(r.status,status,JSON.stringify(r));
  assert.ok(r.reasons.includes(reason),JSON.stringify(r.reasons));
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.nativeOrderInstruction,null);
  return r;
}
describe('Phase31 Upstox historical FO pages vs NRML stop limits',()=>{
  it('reconciles same-date historical fills, never certifies native stop',()=>{
    const p=packet([row('T1','BUY',65),row('T2','SELL',65)]);
    const result=audit(p);
    assert.equal(result.status,'HISTORICAL_FILLS_RECONCILED_UNVERIFIED');
    assert.equal(result.paginationComplete,true);
    assert.equal(result.pagesReviewed,1);
    assert.equal(result.totalFoRows,2);
    assert.equal(result.selectedOptionFillRows,2);
    assert.equal(result.selectedOptionMatchedWithoutInstrumentToken,2);
    assert.equal(result.computedClosingNetQuantity,130);
    assert.equal(result.nativeOrderHistoryVerified,false);
    assert.equal(result.historicallyExecutedFillsVerified,false);
    assert.equal(result.brokerAuthenticated,false);
    assert.equal(result.brokerStopInstalled,false);
    assert.equal(result.protectedOvernight,false);
    assert.equal(result.nativeOrderInstruction,null);
    assert.ok(/^[0-9a-f]{64}$/.test(result.snapshotJsonChainSha256!));
    const printed=JSON.stringify(result);
    for(const secret of [account,instrument,'T1','T2','NIFTY'])
      assert.ok(!printed.includes(secret));
  });
  it('empty complete page does not invent trade evidence',()=>{
    const result=audit(packet());
    assert.equal(result.status,'HISTORICAL_FILLS_RECONCILED_UNVERIFIED');
    assert.equal(result.totalFoRows,0);
    assert.equal(result.historicallyExecutedFillsVerified,false);
    assert.equal(result.brokerStopInstalled,false);
  });
  it('an independent FO descriptor must not aggregate unrelated contracts',()=>{
    const result=audit(packet([
      row('OTHER','BUY',65,{strike_price:'24100.0'}),
      row('DIFFERENT','SELL',65,{option_type:'PE'})
    ]));
    assert.equal(result.selectedOptionFillRows,0);
    assert.equal(result.computedClosingNetQuantity,130);
    assert.equal(result.totalFoRows,2);
  });
  it('supports fully sequential two-page history and expected position delta',()=>{
    const p=packet();
    p.openingNetLongQuantity=65;
    p.closingNetLongQuantity=130;
    p.pages=[
      {method:'GET',path:'/v2/charges/historical-trades',
        query:{segment:'FO',start_date:startDate,end_date:endDate,
          page_number:1,page_size:1},
        httpStatus:200,capturedAt:'2026-11-17T09:59:40.000Z',
        response:raw([row('BUY1','BUY',65)],1,2,2,1)},
      {method:'GET',path:'/v2/charges/historical-trades',
        query:{segment:'FO',start_date:startDate,end_date:endDate,
          page_number:2,page_size:1},
        httpStatus:200,capturedAt:'2026-11-17T09:59:45.000Z',
        response:raw([row('OTHER','SELL',65,{strike_price:'24100.0'})],
          2,2,2,1)}
    ];
    const result=audit(p);
    assert.equal(result.status,'HISTORICAL_FILLS_RECONCILED_UNVERIFIED');
    assert.equal(result.pagesReviewed,2);
    assert.equal(result.totalFoRows,2);
    assert.equal(result.computedClosingNetQuantity,130);
  });
  it('incomplete missing pagination and page-total manipulation fail',()=>{
    const p=packet([row('T1','SELL',65)]);
    meta(p).total_records=101;
    meta(p).total_pages=2;
    fails(p,'INCOMPLETE_FO_HISTORY_PAGE_ROW_COUNT','INVALID_EVIDENCE');
    const p2=packet([row('T1','SELL',65)]);
    meta(p2).total_pages=2;
    fails(p2,'INCONSISTENT_FO_HISTORY_PAGINATION_TOTALS',
      'INVALID_EVIDENCE');
    const p3=packet([row('T1','SELL',65)]);
    p3.pages[0].query.page_number=2;
    fails(p3,'MISSING_STALE_FILTERED_OR_NONSEQUENTIAL_FO_PAGE',
      'INVALID_EVIDENCE');
  });
  it('cross-page repeated trade IDs cannot double-fill quantity',()=>{
    const p=packet();
    p.pages=[
      {method:'GET',path:'/v2/charges/historical-trades',
        query:{segment:'FO',start_date:startDate,end_date:endDate,
          page_number:1,page_size:1},httpStatus:200,
        capturedAt:'2026-11-17T09:59:41.000Z',
        response:raw([row('SAME','BUY',65)],1,2,2,1)},
      {method:'GET',path:'/v2/charges/historical-trades',
        query:{segment:'FO',start_date:startDate,end_date:endDate,
          page_number:2,page_size:1},httpStatus:200,
        capturedAt:'2026-11-17T09:59:42.000Z',
        response:raw([row('SAME','SELL',65)],2,2,2,1)}
    ];
    fails(p,'DUPLICATED_FO_TRADE_ID_ACROSS_PAGES','INVALID_EVIDENCE');
  });
  it('position delta that cannot be explained by FO fills is blocked',()=>{
    const p=packet([row('SELL1','SELL',65)]);
    const r=fails(p,'HISTORICAL_FO_FILLS_DO_NOT_EXPLAIN_POSITION_DELTA');
    assert.ok(r.operatorActions.includes(
      'FREEZE_NEW_NRML_ENTRIES_PENDING_INDEPENDENT_REVIEW'));
    assert.equal(r.computedClosingNetQuantity,65);
  });
  it('closing position cannot contradict the independently expected NRML long',()=>{
    const p=packet([row('T1','BUY',65)]);
    p.closingNetLongQuantity=195;
    const r=fails(p,'HISTORICAL_FO_CLOSE_DISAGREES_WITH_EXPECTED_POSITION');
    assert.equal(r.computedClosingNetQuantity,195);
    const bad=packet();bad.expected.expectedNetLongQuantity=131;
    fails(bad,'INVALID_FO_CONTRACT_RANGE_OR_BOUNDED_PAGINATION_ENVELOPE',
      'INVALID_EVIDENCE');
  });
  it('descriptor conflict with nonempty different broker instrument key blocks',()=>{
    const p=packet([row('WRONG_KEY','BUY',65,{
      instrument_token:'NSE_FO|OTHER'})]);
    fails(p,'DESCRIPTOR_MATCH_WITH_CONFLICTING_OPTION_INSTRUMENT_KEY');
  });
  it('invalid lot multiple triggers conservative review',()=>{
    const p=packet([row('ODD','BUY',13),row('REST','SELL',13)]);
    fails(p,'FO_TRADE_NOT_MULTIPLE_OF_INDEPENDENTLY_PINNED_LOT');
  });
  it('cross-day range may reconcile fills but never proves stop survival',()=>{
    const p=packet([
      row('OLD','BUY',65,{trade_date:'2026-11-16'}),
      row('NEW','SELL',65,{trade_date:'2026-11-17'})
    ]);
    p.endDate='2026-11-17';
    p.pages[0].query.end_date=p.endDate;
    const r=fails(p,'HISTORICAL_FILLS_CANNOT_PROVE_OVERNIGHT_NATIVE_STOP_CONTINUITY');
    assert.equal(r.paginationComplete,true);
    assert.equal(r.computedClosingNetQuantity,130);
    assert.equal(r.rangeSpansMultipleIndiaDates,true);
    assert.ok(r.operatorActions.includes(
      'REQUEST_BROKER_NATIVE_ORDER_AND_COMPLETED_GTT_HISTORY'));
  });
  it('cross-session no fills also cannot certify overnight protection',()=>{
    const p=packet();
    p.endDate='2026-11-17';
    p.pages[0].query.end_date=p.endDate;
    fails(p,'HISTORICAL_FILLS_CANNOT_PROVE_OVERNIGHT_NATIVE_STOP_CONTINUITY');
  });
  it('expired/future range, stale clock and malformed GET never pass',()=>{
    const p=packet();
    p.endDate='2026-11-19';p.pages[0].query.end_date=p.endDate;
    fails(p,'HISTORICAL_FO_RANGE_ENDS_IN_FUTURE_IST');
    const q=packet();
    q.pages[0].capturedAt='2026-11-17T09:30:00.000Z';
    fails(q,'MISSING_STALE_FILTERED_OR_NONSEQUENTIAL_FO_PAGE',
      'INVALID_EVIDENCE');
    const w=packet();
    w.pages[0].httpStatus=403 as 200;
    fails(w,'MISSING_STALE_FILTERED_OR_NONSEQUENTIAL_FO_PAGE',
      'INVALID_EVIDENCE');
    const x=packet();
    x.pages[0].response={status:'error',data:[]};
    fails(x,'MALFORMED_FO_HISTORY_RESPONSE_OR_PAGE_METADATA',
      'INVALID_EVIDENCE');
  });
  it('invalid dates, contract identity and account scope reject',()=>{
    const p=packet();p.pinnedContract.expiry='2026-12-31';
    fails(p,'INVALID_FO_CONTRACT_RANGE_OR_BOUNDED_PAGINATION_ENVELOPE',
      'INVALID_EVIDENCE');
    const q=packet();q.expected.accountScopeId='';
    fails(q,'INVALID_FO_CONTRACT_RANGE_OR_BOUNDED_PAGINATION_ENVELOPE',
      'INVALID_EVIDENCE');
    const u=packet();u.startDate='2026-02-30';
    fails(u,'INVALID_FO_CONTRACT_RANGE_OR_BOUNDED_PAGINATION_ENVELOPE',
      'INVALID_EVIDENCE');
  });
  it('bad row fields and trade date beyond requested window reject',()=>{
    const p=packet([row('X','BUY',65,{trade_date:'2026-11-15'})]);
    fails(p,'UNMAPPABLE_OR_INVALID_HISTORICAL_FO_TRADE_ROW',
      'INVALID_EVIDENCE');
    const q=packet([row('X','BUY',65,{quantity:1.5})]);
    fails(q,'UNMAPPABLE_OR_INVALID_HISTORICAL_FO_TRADE_ROW',
      'INVALID_EVIDENCE');
  });
});
