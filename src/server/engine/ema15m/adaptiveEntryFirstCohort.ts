/**
 * Adaptive Swing v2 Phase 8 — OUT-OF-SAMPLE ENTRY-FIRST COHORT.
 *
 * Selection is based ONLY on decision-time closed index candles, the original
 * pre-decision contract catalog and dated option chain, then on the first
 * original-availability-time ASK within the predeclared entry delay.
 *
 * Missing/future fixed-hold exits are NEVER used to select an entry. Every
 * test-window decision × policy arm × expiry bucket stays in the denominator.
 *
 * The Phase 3 comparator is called only as a dataset/fold VALIDITY GATE; its
 * future exit results are intentionally neither read nor used for selection.
 * Research only: no order routing, broker API, paper/live position side effects.
 */
import { analyzeAdaptiveRegime } from './adaptiveMarketRegime.js';
import { rankAdaptiveOptions, type HorizonBucket, type RankedOption } from './adaptiveOptionRanker.js';
import { compareAdaptiveHistorical, type HistoricalArm,
  type HistoricalComparisonInput, type HistoricalExecutableQuote,
  type HistoricalDecision } from './historicalAdaptiveComparison.js';

const DAY=86_400_000;
const HORIZONS: HorizonBucket[]=['1W','2W','4W','8W'];
const ARMS: HistoricalArm[]=['EMA_BASELINE','REGIME_FILTER','REGIME_AND_RANK'];
const ms=(x:string)=>Date.parse(x);
export type EntryDisposition='NO_TRADE_SIGNAL'|'NO_POINT_IN_TIME_CONTRACT'|
 'PRE_EXPIRY_BUFFER_VIOLATION'|'MISSING_EXECUTABLE_ENTRY_L1'|
 'PREDECLARED_EXPOSURE_COOLDOWN'|'UNUSABLE_UNDERLYING_HISTORY'|
 'HYSTERESIS_NEW_ENTRY_BLOCKED'|'ENTRY_OBSERVED';
export interface CohortDecision {
  foldIndex:number;
  arm:HistoricalArm;
  horizon:HorizonBucket;
  sessionDate:string;
  decisionAt:string;
  disposition:EntryDisposition;
  instrumentKey:string|null;
  expiry:string|null;
  entryAt:string|null;
  entryAsk:number|null;
  entryBid:number|null;
  quantity:number|null;
  scheduledFixedHoldAt:string|null;
  lastEligibleFixedHoldExitAt:string|null;
}
export interface EntryFirstCohortReport {
  mode:'RESEARCH_ONLY';
  executionAuthorized:false;
  productionSafe:false;
  sourceAuthenticated:false;
  status:'REJECTED'|'ENTRY_COHORT_RECORDED';
  errors:string[];
  attempts:CohortDecision[];
  counts:{
    testDecisions:number;
    attempts:number;
    qualifyingEntryCount:number;
    missingEntryCount:number;
    noTradeCount:number;
  };
  warnings:string[];
}
function selectLatestChain(d:HistoricalDecision,expiry:string,ageMs:number):unknown {
  const eligible=d.chains.filter(x=>x.expiry===expiry &&
    Number.isFinite(ms(x.capturedAt))&&ms(x.capturedAt)<=ms(d.decisionAt)&&
    ms(d.decisionAt)-ms(x.capturedAt)<=ageMs&&Array.isArray(x.rows))
    .sort((a,b)=>ms(b.capturedAt)-ms(a.capturedAt));
  return eligible[0]?.rows??null;
}

/**
 * Optional research-only point-in-time advisory gate.
 * The map is keyed by fold|horizon|decisionAt and carries the Phase 12 advisory
 * computed WITHOUT future option quotes. A filtered replay creates its OWN
 * cooldown state; a skipped baseline entry does not reserve filtered exposure.
 * Existing Phase 8 calls without a gate are byte-for-byte behavior compatible.
 */
export const adaptiveCohortAdvisoryKey=(foldIndex:number,
  horizon:HorizonBucket,decisionAt:string)=>
  foldIndex+'|'+horizon+'|'+decisionAt;
export function buildAdaptiveEntryFirstCohort(
  input:HistoricalComparisonInput,
  newEntryAdvisories?:ReadonlyMap<string,'CE'|'PE'|'NO_TRADE'>
):EntryFirstCohortReport {
  const base:EntryFirstCohortReport={
    mode:'RESEARCH_ONLY',executionAuthorized:false,productionSafe:false,
    sourceAuthenticated:false,status:'REJECTED',errors:[],attempts:[],
    counts:{testDecisions:0,attempts:0,qualifyingEntryCount:0,
      missingEntryCount:0,noTradeCount:0},
    warnings:[
      'ENTRY_FIRST_DENOMINATOR_DOES_NOT_REQUIRE_FUTURE_EXIT_PRICES',
      'POSITION_COOLDOWN_IS_PREDECLARED_AND_MAY_DIFFER_FROM_LEGACY_EXIT_TIMING',
      'NO_BROKER_ORDER_OR_LIVE_STOP_IS_AUTHORIZED',
      'STRATEGY_AND_VENDOR_EVIDENCE_NOT_INDEPENDENTLY_CERTIFIED'
    ]
  };
  // Do not use comparator *results*; this is purely a schema/policy validator.
  const validation=compareAdaptiveHistorical(input);
  if(validation.status==='INVALID_DATASET')
    return {...base,errors:validation.errors};
  const attempts:CohortDecision[]=[];
  const quotesByKey=new Map<string,HistoricalExecutableQuote[]>();
  for(const q of input.executionQuotes){
    const items=quotesByKey.get(q.instrumentKey)??[];
    items.push(q);
    quotesByKey.set(q.instrumentKey,items);
  }
  for(const series of quotesByKey.values())
    series.sort((a,b)=>ms(a.observedAt)-ms(b.observedAt));
  let testDecisions=0;
  for(let foldIndex=0;foldIndex<input.policy.folds.length;foldIndex++){
    const fold=input.policy.folds[foldIndex];
    // A fixed *future* cooldown is declared by hold/exit policy, not updated
    // when a trade looks favorable. This avoids peeking at exit success.
    const cooldownUntil=new Map<string,number>();
    for(const d of input.decisions){
      if(d.sessionDate<fold.testStart||d.sessionDate>fold.testEnd)continue;
      testDecisions++;
      const decisionTime=ms(d.decisionAt);
      const report=analyzeAdaptiveRegime(d.candles,new Date(decisionTime));
      const last=d.candles[d.candles.length-1];
      const historyUsable=!['INSUFFICIENT_DATA','STALE_DATA'].includes(report.regime);
      const side=report.bias==='BULLISH'?'CE':report.bias==='BEARISH'?'PE':null;
      const eligibleSignal=report.candidateSignal===side;
      const chainByExpiry:Record<string,unknown>={};
      if(historyUsable&&side){
        for(const expiry of new Set(d.listedContracts.map(v=>v.expiry)))
          chainByExpiry[expiry]=selectLatestChain(d,expiry,
            input.policy.maxSnapshotAgeMinutes*60_000);
      }
      const ranked=historyUsable&&side ? rankAdaptiveOptions({
        brokerContracts:d.listedContracts,chainByExpiry,
        underlyingKey:input.underlyingKey,instrument:input.instrument,
        optionType:side,spot:last.close,asOf:new Date(decisionTime)
      }):null;
      for(const arm of ARMS)for(const horizon of HORIZONS){
        const basic:CohortDecision={
          foldIndex,arm,horizon,sessionDate:d.sessionDate,
          decisionAt:d.decisionAt,disposition:'NO_TRADE_SIGNAL',
          instrumentKey:null,expiry:null,entryAt:null,entryAsk:null,
          entryBid:null,quantity:null,
          scheduledFixedHoldAt:null,lastEligibleFixedHoldExitAt:null
        };
        const key=arm+':'+horizon;
        if(!historyUsable){
          attempts.push({...basic,disposition:'UNUSABLE_UNDERLYING_HISTORY'});
          continue;
        }
        if((cooldownUntil.get(key)??-Infinity)>decisionTime){
          attempts.push({...basic,disposition:'PREDECLARED_EXPOSURE_COOLDOWN'});
          continue;
        }
        if(!side||(arm!=='EMA_BASELINE'&&!eligibleSignal)){
          attempts.push(basic);continue;
        }
        if(newEntryAdvisories&&
           newEntryAdvisories.get(adaptiveCohortAdvisoryKey(
             foldIndex,horizon,d.decisionAt))!==side){
          attempts.push({...basic,disposition:'HYSTERESIS_NEW_ENTRY_BLOCKED'});
          continue;
        }
        const bucket=ranked?.options.find(v=>v.horizon===horizon);
        if(!bucket||bucket.status!=='RANKED'){
          attempts.push({...basic,disposition:'NO_POINT_IN_TIME_CONTRACT'});
          continue;
        }
        const candidate:RankedOption|undefined=arm==='REGIME_AND_RANK'?
          bucket.candidates[0]:bucket.candidates.slice().sort((a,b)=>
            Math.abs(a.strike-last.close)-Math.abs(b.strike-last.close)||
            a.ask-b.ask)[0];
        if(!candidate){
          attempts.push({...basic,disposition:'NO_POINT_IN_TIME_CONTRACT'});continue;
        }
        const planned=decisionTime+input.policy.holdCalendarDays[horizon]*DAY;
        const expiryMidnight=ms(candidate.expiry+'T00:00:00Z');
        const hardLimit=expiryMidnight-input.policy.minCalendarDaysBeforeExpiry*DAY;
        if(planned+input.policy.minCalendarDaysBeforeExpiry*DAY>=expiryMidnight){
          attempts.push({...basic,disposition:'PRE_EXPIRY_BUFFER_VIOLATION'});continue;
        }
        const entry=(quotesByKey.get(candidate.instrumentKey)??[]).find(q=>
          ms(q.observedAt)>decisionTime &&
          ms(q.observedAt)<=decisionTime+input.policy.maxEntryDelayMinutes*60_000 &&
          q.askQty>=candidate.lotSize && q.bidQty>=candidate.lotSize);
        if(!entry){
          // The contract choice is fixed ONLY by the decision-time chain.
          // Preserve its key/expiry and intended lot so that missing source
          // BID/ASK is attributable to the actual 1W–8W choice, rather than
          // disappearing into another liquid contract's feed coverage.
          // NO entry observation, trigger, cooldown, or exit price invented.
          attempts.push({
            ...basic,disposition:'MISSING_EXECUTABLE_ENTRY_L1',
            instrumentKey:candidate.instrumentKey,expiry:candidate.expiry,
            quantity:candidate.lotSize
          });
          continue;
        }
        attempts.push({
          ...basic,disposition:'ENTRY_OBSERVED',
          instrumentKey:candidate.instrumentKey,expiry:candidate.expiry,
          entryAt:entry.observedAt,entryAsk:entry.ask,entryBid:entry.bid,
          quantity:candidate.lotSize,
          scheduledFixedHoldAt:new Date(planned).toISOString(),
          lastEligibleFixedHoldExitAt:new Date(Math.min(
            planned+input.policy.maxExitDelayDays*DAY,hardLimit)).toISOString()
        });
        // This reserved exposure is independent of future bid movements or
        // eventual success/failure; no re-entry after a missing exit.
        cooldownUntil.set(key,Math.min(
          planned+input.policy.maxExitDelayDays*DAY,hardLimit));
      }
    }
  }
  const qualifyingEntryCount=attempts.filter(x=>x.disposition==='ENTRY_OBSERVED').length;
  const missingEntryCount=attempts.filter(x=>x.disposition==='MISSING_EXECUTABLE_ENTRY_L1').length;
  return {
    ...base,status:'ENTRY_COHORT_RECORDED',attempts,
    counts:{
      testDecisions,attempts:attempts.length,qualifyingEntryCount,
      missingEntryCount,noTradeCount:attempts.length-qualifyingEntryCount
    }
  };
}
