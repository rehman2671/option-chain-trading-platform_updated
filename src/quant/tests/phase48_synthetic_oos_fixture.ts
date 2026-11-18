/** Strictly synthetic historical OOS fixture. Replays existing Phase8 generator. */
import type {HistoricalComparisonInput}
  from '../../server/engine/ema15m/historicalAdaptiveComparison.js';
import type {DeclaredTradingSession}
  from '../../server/engine/ema15m/adaptiveSessionIntegrity.js';
import type {AdaptiveExitReplayPolicy}
  from '../../server/engine/ema15m/adaptivePositionalExitReplay.js';
import type {ClosedIndexCandle}
  from '../../server/engine/ema15m/adaptiveMarketRegime.js';

const DAY=86_400_000,MIN=60_000;
const iso=(n:number)=>new Date(n).toISOString();
const underlying='NSE_INDEX|Nifty 50';
// 1W must be inside Phase46's <=8 calendar-day declared expiry window.
const offsets=[7,15,28,56];
const horizon=['1W','2W','4W','8W'] as const;
const stopPolicy=():AdaptiveExitReplayPolicy=>({
  schemaVersion:'ADAPTIVE_OPTION_EXIT_REPLAY_V1',
  horizonRules:{
    '1W':{initialStopFraction:.2,trailActivationFraction:.2,
      trailingGivebackFraction:.1,maxHoldCalendarDays:2},
    '2W':{initialStopFraction:.2,trailActivationFraction:.2,
      trailingGivebackFraction:.1,maxHoldCalendarDays:2},
    '4W':{initialStopFraction:.2,trailActivationFraction:.2,
      trailingGivebackFraction:.1,maxHoldCalendarDays:2},
    '8W':{initialStopFraction:.2,trailActivationFraction:.2,
      trailingGivebackFraction:.1,maxHoldCalendarDays:2}
  },
  minQuotesPerDeclaredSession:2,minIntermediateQuotes:2,
  maxSameSessionQuoteGapMinutes:15,maxTriggerToNextQuoteMinutes:6
});
type Path='GIVEBACK'|'GAP'|'FLAT';
export function makePhase48SyntheticOosInput(path:Path='GIVEBACK'):{
  input:HistoricalComparisonInput;sessions:DeclaredTradingSession[];testDate:string
}{
  const candles:ClosedIndexCandle[]=[];
  const decisions:HistoricalComparisonInput['decisions']=[];
  const quotes:HistoricalComparisonInput['executionQuotes']=[];
  const sessions:DeclaredTradingSession[]=[];
  let prev=25000;
  for(let day=0;day<=12;day++){
    const start=Date.UTC(2026,8,1+day);
    const sessionDate=iso(start).slice(0,10);
    sessions.push({
      sessionDate,openAt:iso(start+225*MIN),
      closeAt:iso(start+600*MIN),sourceRecordId:'SYNTHETIC_CAL_'+day
    });
    if(day===12)continue;
    for(let i=0;i<25;i++){
      const t=iso(start+(225+15*i)*MIN),close=prev+6;
      candles.push({
        timestamp:t,open:prev,high:close+4,low:prev-4,
        close,isClosed:true
      });prev=close;
    }
    if(day<7)continue;
    const decision=iso(start+390*MIN);
    const seen=candles.filter(c=>Date.parse(c.timestamp)+15*MIN<=Date.parse(decision));
    const spot=seen[seen.length-1].close;
    const strike=Math.round(spot/50)*50;
    const contracts=offsets.flatMap((offset,i)=>(['CE','PE'] as const).map((side,j)=>{
      const expiry=iso(start+offset*DAY).slice(0,10);
      return{
        underlying_symbol:'NIFTY',underlying_key:underlying,segment:'NSE_FO',
        instrument_type:side,strike_price:strike,expiry,
        instrument_key:'NSE_FO|'+(100000+day*8+i*2+j),
        trading_symbol:'SYNTHETIC_'+day+'_'+i+'_'+side,lot_size:65,tick_size:.05
      };
    }));
    const chains=offsets.map((offset,i)=>{
      const expiry=iso(start+offset*DAY).slice(0,10);
      const side=(j:number,delta:number)=>({
        instrument_key:contracts[i*2+j].instrument_key,
        market_data:{bid_price:99,ask_price:100,bid_qty:1000,ask_qty:1000,
          volume:50000,oi:400000},
        option_greeks:{delta,theta:-1,iv:18,gamma:.01,vega:3}
      });
      return {
        expiry,capturedAt:iso(start+388*MIN),
        rows:[{
          underlying_key:underlying,underlying_spot_price:spot,
          expiry,strike_price:strike,call_options:side(0,.6),put_options:side(1,-.6)
        }]
      };
    });
    for(const c of contracts){
      const enter=Date.parse(decision)+MIN;
      // All independent per-instrument original-availability-time L1.
      for(let minutes=0;enter+minutes*MIN<=start+600*MIN;minutes+=5){
        const price=day===11 && path==='GIVEBACK'
          ? minutes>=20?113:minutes>=15?116:minutes>=10?130:minutes>=5?110:99
          :day===11 && path==='GAP'
            ?minutes>=10?125:minutes>=5?130:99:103;
        const bid=minutes===0?99:price;
        quotes.push({observedAt:iso(enter+minutes*MIN),instrumentKey:c.instrument_key,
          bid,ask:minutes===0?100:bid+1,bidQty:1000,askQty:1000});
      }
      // The following exchange session carries the due exit or gap trigger.
      const nextStart=start+DAY;
      for(let minutes=0;minutes<=375;minutes+=5){
        let bid=106;
        if(day===11 && path==='GAP')bid=minutes===0?70:71;
        quotes.push({observedAt:iso(nextStart+(225+minutes)*MIN),
          instrumentKey:c.instrument_key,bid,ask:bid+1,bidQty:1000,askQty:1000});
      }
    }
    decisions.push({
      sessionDate,decisionAt:decision,candles:seen,
      contractsCapturedAt:iso(start+385*MIN),listedContracts:contracts,chains
    });
  }
  const dates=decisions.map(d=>d.sessionDate);
  return{
    input:{
      provenance:{
        datasetId:'SYNTHETIC_ENTRY_FIRST_FIXTURE',source:'OFFLINE_GENERATOR',
        calendarSource:'OFFLINE_SESSION_FIXTURE',expectedSessions:dates,synthetic:true
      },
      underlyingKey:underlying,instrument:'NIFTY',decisions,executionQuotes:quotes,
      policy:{
        holdCalendarDays:{'1W':1,'2W':1,'4W':1,'8W':1},
        slippageBpsPerSide:0,feesAndTaxesINRPerSide:0,
        maxSnapshotAgeMinutes:5,maxEntryDelayMinutes:10,
        maxExitDelayDays:1,minCalendarDaysBeforeExpiry:2,
        folds:[{
          trainStart:dates[0],trainEnd:dates[0],
          testStart:dates[4],testEnd:dates[4]
        }]
      }
    },sessions,testDate:dates[4]
  };
}
