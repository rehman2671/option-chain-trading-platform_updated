import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { auditAdaptiveSourceArtifact } from
  '../../server/engine/ema15m/adaptiveSourceArtifactAudit.js';
import { auditAdaptiveExchangeWindows, type DeclaredTradingSession } from
  '../../server/engine/ema15m/adaptiveSessionIntegrity.js';
import assert from 'node:assert/strict';
import {
  ingestVendorHistoricalBundle, type VerifiedHistoricalBundleV1
} from '../../server/engine/ema15m/adaptiveVendorIngestion.js';
import { runAdaptiveWalkForwardStudy } from
  '../../server/engine/ema15m/adaptiveWalkForwardStudy.js';
import type { ClosedIndexCandle } from
  '../../server/engine/ema15m/adaptiveMarketRegime.js';

const DAY=86_400_000;
const indexKey='NSE_INDEX|Nifty 50';
const expiries=[8,15,28,56];
const at=(ms:number)=>new Date(ms).toISOString();

function fixture():VerifiedHistoricalBundleV1 {
  const all:ClosedIndexCandle[]=[];
  let last=25000;
  const sessions:VerifiedHistoricalBundleV1['sessions']=[];
  const quotes:VerifiedHistoricalBundleV1['executionL1']=[];
  for(let day=0;day<20;day++){
    const start=Date.UTC(2026,8,1+day);
    const date=at(start).slice(0,10);
    for(let slot=0;slot<25;slot++){
      const stamp=at(start+225*60_000+slot*15*60_000);
      const close=last+6;
      all.push({
        timestamp:stamp,open:last,high:close+5,low:last-5,
        close,isClosed:true
      });
      last=close;
    }
    if(day<7)continue;
    const decisionAt=at(start+390*60_000);
    const candles=all.filter(c=>Date.parse(c.timestamp)+900_000<=Date.parse(decisionAt));
    const spot=candles[candles.length-1].close;
    const contracts=expiries.flatMap((offset,i)=>(['CE','PE'] as const).map((side,j)=>{
      const expiry=at(start+offset*DAY).slice(0,10);
      return {
        underlying_symbol:'NIFTY',underlying_key:indexKey,segment:'NSE_FO',
        instrument_type:side,strike_price:Math.round(spot/50)*50,expiry,
        instrument_key:'NSE_FO|'+(90000+day*8+i*2+j),
        trading_symbol:'MOCK_'+day+'_'+i+'_'+side,
        lot_size:65,tick_size:0.05
      };
    }));
    const chains=expiries.map((offset,i)=>{
      const expiry=at(start+offset*DAY).slice(0,10);
      const side=(j:number,delta:number)=>({
        instrument_key:contracts[i*2+j].instrument_key,
        market_data:{
          bid_price:99,ask_price:100,bid_qty:300,ask_qty:300,
          volume:15000,oi:120000
        },
        option_greeks:{delta,theta:-3,iv:18,gamma:0.01,vega:4}
      });
      return {
        eventAt:at(start+386*60_000),availableAt:at(start+386*60_000+1000),
        sourceRecordId:'CHAIN_'+day+'_'+i,
        data:{
          expiry,
          rows:[{
            expiry,underlying_key:indexKey,underlying_spot_price:spot,
            strike_price:contracts[i*2].strike_price,
            call_options:side(0,0.6),put_options:side(1,-0.6)
          }]
        }
      };
    });
    for(const c of contracts){
      const entry=Date.parse(decisionAt)+60_000;
      const exit=Date.parse(decisionAt)+DAY+60_000;
      quotes.push({
        eventAt:at(entry),availableAt:at(entry+1000),
        sourceRecordId:'ENTRY_'+c.instrument_key,
        instrumentKey:c.instrument_key,bid:101,ask:102,bidQty:130,askQty:130
      });
      quotes.push({
        eventAt:at(exit),availableAt:at(exit+1000),
        sourceRecordId:'EXIT_'+c.instrument_key,
        instrumentKey:c.instrument_key,bid:111,ask:112,bidQty:130,askQty:130
      });
    }
    sessions.push({
      sessionDate:date,decisionAt,underlyingCandles:candles,
      contracts:{
        eventAt:at(start+385*60_000),availableAt:at(start+385*60_000+1000),
        sourceRecordId:'CONTRACTS_'+day,data:contracts
      },
      chains
    });
  }
  const d=sessions.map(x=>x.sessionDate);
  return{
    schemaVersion:'ADAPTIVE_VERIFIED_L1_BUNDLE_V1',
    provenance:{
      datasetId:'SYNTHETIC_VENDOR_L1_TEST_ONLY',
      vendor:'TEST_GENERATOR_DO_NOT_USE_FOR_MARKET_DECISIONS',
      licenseOrEntitlementReference:'TEST_ONLY',
      sourceArtifactSha256:'a'.repeat(64),
      collection:'ORIGINAL_EVENT_FEED_ARCHIVE',
      timestampBasis:'ORIGINAL_EXCHANGE_OR_VENDOR_EVENT_TIME',
      originalAvailabilityTimestampRecorded:true,
      synthetic:true,calendarSource:'SYNTHETIC_20_DAYS',
      expectedSessions:d
    },
    instrument:'NIFTY',underlyingKey:indexKey,sessions,executionL1:quotes,
    maximumOriginalFeedLatencySeconds:3,
    policy:{
      holdCalendarDays:{'1W':1,'2W':1,'4W':1,'8W':1},
      slippageBpsPerSide:10,feesAndTaxesINRPerSide:5,
      maxSnapshotAgeMinutes:5,maxEntryDelayMinutes:10,
      maxExitDelayDays:2,minCalendarDaysBeforeExpiry:2,
      folds:[
        {trainStart:d[0],trainEnd:d[0],testStart:d[4],testEnd:d[6]},
        {trainStart:d[7],trainEnd:d[7],testStart:d[11],testEnd:d[12]}
      ]
    }
  };
}


function marketWindows(): DeclaredTradingSession[] {
  return Array.from({length:21}, (_,i)=>{
    const start=Date.UTC(2026,8,1+i);
    return {
      sessionDate:at(start).slice(0,10),
      openAt:at(start+225*60_000),
      closeAt:at(start+600*60_000),
      sourceRecordId:'SYNTHETIC_MARKET_WINDOW_'+i
    };
  });
}

describe('Adaptive Phase 5 event-time ingestion and OOS cost sensitivity',()=>{
  it('ingests original-event-time snapshots and conservatively replays availability time',()=>{
    const data=fixture();
    const result=ingestVendorHistoricalBundle(data);
    assert.equal(result.status,'SOURCE_ATTESTED_NOT_INDEPENDENTLY_VERIFIED');
    assert.equal(result.schemaValid,true);
    assert.equal(result.sourceAuthenticityIndependentlyVerified,false);
    assert.equal(result.executionAuthorized,false);
    assert.equal(result.counts.sessions,13);
    assert.equal(result.counts.chainSnapshots,52);
    assert.equal(result.counts.optionL1Observations,208);
    assert.equal(result.input?.provenance.synthetic,true);
    assert.equal(result.input?.provenance.quoteTimestampQuality,'SOURCE_ATTESTED_EVENT_TIME');
    assert.equal(result.input?.executionQuotes[0].observedAt,data.executionL1[0].availableAt);
  });
  it('runs fixed chronological folds and four cost scenarios without profitability claims',()=>{
    const result=runAdaptiveWalkForwardStudy(fixture());
    assert.equal(result.status,'DESCRIPTIVE_ONLY');
    assert.equal(result.executionAuthorized,false);
    assert.equal(result.productionSafe,false);
    assert.equal(result.empiricalProfitabilityProven,false);
    assert.equal(result.sourceAuthenticityIndependentlyVerified,false);
    assert.equal(result.foldWindows.length,2);
    assert.equal(result.scenarios.length,4);
    assert.equal(result.results.length,4*2*3*4);
    assert.equal(result.pairedOutOfSample.length,2*2*4);
    assert.equal(result.pairedOutOfSample[0].sufficientPairedSample,false);
    const base=result.results.find(x=>x.scenario==='BASE'&&x.foldIndex===0 &&
      x.arm==='EMA_BASELINE'&&x.horizon==='1W')!;
    const bad=result.results.find(x=>x.scenario==='COMBINED_COST_AND_L1_STRESS'&&
      x.foldIndex===0 && x.arm==='EMA_BASELINE'&&x.horizon==='1W')!;
    assert.ok(base.tradeCount>0);
    assert.equal(base.tradeCount,bad.tradeCount);
    assert.ok(bad.netPnlINR<base.netPnlINR);
    assert.equal(base.comparable,false);
  });
  it('rejects non-verifiable REST receipt-only source',()=>{
    const x:any=fixture();
    x.provenance.collection='UPSTOX_V2_READ_ONLY_REST';
    assert.ok(ingestVendorHistoricalBundle(x).errors.includes('INVALID_OR_UNVERIFIED_SOURCE_PROVENANCE'));
    assert.equal(runAdaptiveWalkForwardStudy(x).report,null);
  });
  it('rejects publication after decision, even when event timestamp was earlier',()=>{
    const x=fixture();
    x.sessions[0].chains[0].availableAt=
      at(Date.parse(x.sessions[0].decisionAt)+1000);
    const r=ingestVendorHistoricalBundle(x);
    assert.equal(r.input,null);
    assert.ok(r.errors.includes('INVALID_OR_LOOKAHEAD_VENDOR_EVENT_CLOCK'));
  });
  it('rejects delayed execution data that would not have been available on time',()=>{
    const x=fixture();
    x.executionL1[0].availableAt=at(Date.parse(x.executionL1[0].eventAt)+10000);
    assert.equal(ingestVendorHistoricalBundle(x).status,'REJECTED');
  });
  it('retains original source sequence and rejects duplicate, reversed or partly omitted packet IDs',()=>{
    const b=fixture();
    const first=b.executionL1[0];
    first.sourceSequence=100;
    b.executionL1.push({...first,
      sourceRecordId:'ADDITIONAL_ORIGINAL_SOURCE_SEQUENCE',
      sourceSequence:101,
      eventAt:at(Date.parse(first.eventAt)+500),
      availableAt:at(Date.parse(first.availableAt)+500)
    });
    assert.equal(ingestVendorHistoricalBundle(b).status,
      'SOURCE_ATTESTED_NOT_INDEPENDENTLY_VERIFIED');
    b.executionL1[b.executionL1.length-1].sourceSequence=100;
    assert.ok(ingestVendorHistoricalBundle(b).errors.includes(
      'INVALID_OR_NONMONOTONIC_ORIGINAL_SOURCE_SEQUENCE'));
    b.executionL1[b.executionL1.length-1].sourceSequence=101;
    delete b.executionL1[b.executionL1.length-1].sourceSequence;
    assert.ok(ingestVendorHistoricalBundle(b).errors.includes(
      'PARTIALLY_MISSING_ORIGINAL_SOURCE_SEQUENCE'));
    b.executionL1[b.executionL1.length-1].sourceSequence=NaN;
    assert.ok(ingestVendorHistoricalBundle(b).errors.includes(
      'INVALID_OR_NONMONOTONIC_ORIGINAL_SOURCE_SEQUENCE'));
  });
  it('rejects duplicate vendor L1 events and conflicting exact contract identities',()=>{
    const x=fixture();
    x.executionL1.push({...x.executionL1[0],sourceRecordId:'OTHER'});
    assert.ok(ingestVendorHistoricalBundle(x).errors.includes('DUPLICATED_OR_CONFLICTING_L1_EVENT'));
    const y=fixture();
    y.sessions[1].contracts.data[0].lot_size=70;
    assert.ok(ingestVendorHistoricalBundle(y).errors.includes('CONTRACT_CATALOG_MISMATCH_OR_DUPLICATE')===false);
    // Each daily fixture lists different keys: the mutated lot is legal,
    // but exact matching quote capacity/price must not be inferred from it.
    y.sessions[1].contracts.data[0].instrument_key=y.sessions[0].contracts.data[0].instrument_key;
    assert.equal(ingestVendorHistoricalBundle(y).status,'REJECTED');
  });
  it('rejects edited calendar and invalid OHLC rather than filling missing days',()=>{
    const x=fixture();
    x.provenance.expectedSessions.pop();
    assert.ok(ingestVendorHistoricalBundle(x).errors.includes('INCOMPLETE_SESSION_OR_QUOTE_SERIES'));
    const y=fixture();
    y.sessions[0].underlyingCandles[0].high=1;
    assert.ok(ingestVendorHistoricalBundle(y).errors.includes('INCOMPLETE_OR_LOOKAHEAD_UNDERLYING_CANDLES'));
  });
  it('rejects omitted Greeks and malformed null OHLC instead of defaulting to zeros',()=>{
    const missingGreek=fixture();
    const row:any=missingGreek.sessions[0].chains[0].data.rows[0];
    row.call_options.option_greeks.iv=null;
    const bad=ingestVendorHistoricalBundle(missingGreek);
    assert.equal(bad.status,'REJECTED');
    assert.ok(bad.errors.includes('MISSING_OR_INVALID_HISTORICAL_L1_GREEKS'));
    const malformed=fixture();
    (malformed.sessions[0].underlyingCandles as any)[0]=null;
    assert.doesNotThrow(()=>ingestVendorHistoricalBundle(malformed));
    assert.equal(ingestVendorHistoricalBundle(malformed).status,'REJECTED');
  });
  it('rejects distinct events incorrectly assigned one original availability timestamp',()=>{
    const x=fixture();
    const first=x.executionL1[0];
    x.executionL1.push({
      ...first,sourceRecordId:'ADDITIONAL_SAME_AVAIL',
      eventAt:at(Date.parse(first.eventAt)+500)
    });
    assert.ok(ingestVendorHistoricalBundle(x).errors.includes(
      'DUPLICATED_OR_CONFLICTING_L1_EVENT'));
  });
  it('rejects folds with no declared training or testing observations',()=>{
    const x=fixture();
    x.policy.folds[0].trainStart='2026-05-01';
    x.policy.folds[0].trainEnd='2026-05-15';
    const result=ingestVendorHistoricalBundle(x);
    assert.equal(result.input,null);
    assert.ok(result.errors.includes('FOLD_OUTSIDE_DECLARED_SESSION_COVERAGE'));
  });
  it('requires source-declared exchange windows for any non-synthetic bundle',()=>{
    const b=fixture();
    b.provenance.synthetic=false;
    const r=ingestVendorHistoricalBundle(b);
    assert.ok(r.errors.includes('MISSING_REAL_EXCHANGE_SESSION_CALENDAR'));
    assert.equal(r.input,null);
    b.declaredExchangeSessions=marketWindows();
    const valid=ingestVendorHistoricalBundle(b);
    assert.equal(valid.status,'SOURCE_ATTESTED_NOT_INDEPENDENTLY_VERIFIED');
    assert.equal(valid.sourceAuthenticityIndependentlyVerified,false);
  });
  it('audits decision/entry/exit and warm-up candles using separately declared windows',()=>{
    const b=fixture();
    b.declaredExchangeSessions=marketWindows();
    const good=auditAdaptiveExchangeWindows({
      declaredSessions:b.declaredExchangeSessions,
      decisions:b.sessions,optionQuotes:b.executionL1
    });
    assert.equal(good.valid,true);
    assert.equal(good.calendarIndependentlyAuthenticated,false);
    assert.ok(good.checkedCandles>100);
    const incomplete=marketWindows().slice(1);
    const bad=auditAdaptiveExchangeWindows({
      declaredSessions:incomplete,decisions:b.sessions,optionQuotes:b.executionL1
    });
    assert.ok(bad.errors.includes('CANDLE_OUTSIDE_DECLARED_EXCHANGE_WINDOW'));
    const quote=fixture();
    quote.declaredExchangeSessions=marketWindows();
    quote.executionL1[0].eventAt=at(Date.UTC(2026,8,8,11,0));
    quote.executionL1[0].availableAt=at(Date.UTC(2026,8,8,11,0,1));
    assert.ok(ingestVendorHistoricalBundle(quote).errors.includes(
      'EXECUTION_OUTSIDE_DECLARED_EXCHANGE_WINDOW'));
  });
  it('rejects duplicate or special-session-invalid declared market calendar',()=>{
    const b=fixture();
    const windows=marketWindows();
    windows[1].sessionDate=windows[0].sessionDate;
    assert.equal(auditAdaptiveExchangeWindows({
      declaredSessions:windows,decisions:b.sessions,optionQuotes:b.executionL1
    }).valid,false);
  });
  it('compares original vendor artifact bytes but never authenticates their vendor',()=>{
    const b=fixture();
    const original=Buffer.from('SYNTHETIC_TEST_VENDOR_BYTE_SOURCE','utf8');
    b.provenance.sourceArtifactSha256=createHash('sha256').update(original).digest('hex');
    const matched=auditAdaptiveSourceArtifact(b,original);
    assert.equal(matched.status,'CHECKSUM_MATCHED_AUTHENTICITY_UNVERIFIED');
    assert.equal(matched.marketAuthenticityVerified,false);
    assert.equal(matched.executionAuthorized,false);
    assert.equal(auditAdaptiveSourceArtifact(b).status,'MISSING_SOURCE');
    assert.equal(auditAdaptiveSourceArtifact(b,Buffer.from('TAMPERED')).status,
      'CHECKSUM_MISMATCH');
    assert.ok(auditAdaptiveSourceArtifact(b,Buffer.from('TAMPERED')).errors.includes(
      'ORIGINAL_SOURCE_ARTIFACT_SHA256_MISMATCH'));
  });
  it('rejects ambiguous reuse of an evidence record ID',()=>{
    const b=fixture();
    b.executionL1[1].sourceRecordId=b.executionL1[0].sourceRecordId;
    assert.ok(ingestVendorHistoricalBundle(b).errors.includes('REUSED_SOURCE_RECORD_ID'));
  });
  it('includes context-conditional OOS trade distribution, never causal/profit certification',()=>{
    const report=runAdaptiveWalkForwardStudy(fixture());
    const audit=report.marketRegimeAudit;
    assert.ok(audit);
    assert.equal(audit!.executionAuthorized,false);
    assert.equal(audit!.causalEffectEstablished,false);
    assert.equal(audit!.sourceAuthenticityVerified,false);
    assert.ok(audit!.cells.length>0);
    assert.ok(audit!.cells.every(c=>!c.productionSafe));
    assert.ok(audit!.cells.some(c=>c.executedTrades>0));
    assert.ok(audit!.cells.every(c=>
      (c.executedTrades===0 && c.netPnlINR===null) ||
      (c.executedTrades>0 && typeof c.netPnlINR==='number')));
  });
  it('does not let synthetic test output masquerade as empirically proven strategy',()=>{
    const x=fixture();
    x.provenance.synthetic=false; // an untrusted declaration is NOT authentication
    const report=runAdaptiveWalkForwardStudy(x);
    assert.equal(report.sourceAuthenticityIndependentlyVerified,false);
    assert.equal(report.empiricalProfitabilityProven,false);
    assert.equal(report.productionSafe,false);
  });
});
