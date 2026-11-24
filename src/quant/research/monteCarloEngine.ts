import type {MonteCarloResult} from '../types.js';

/** Explicit input-sample IID bootstrap only. No generated positive-expectancy
 * trades, guaranteed capital requirements or true probability of ruin. */
export class MonteCarloEngine {
 public runSimulation(strategyId:string,simulationsCount:number=2000,tradesSample:number[]=[]):MonteCarloResult{
  const empty=():MonteCarloResult=>({strategyId,simulationsCount:0,medianPnl:0,percentile5Pnl:0,percentile50Pnl:0,percentile95Pnl:0,
   maxDrawdownDistribution:{p5:0,p50:0,p95:0},riskOfRuinPct:0,worstCaseCapitalNeeded:0,maxConsecutiveLossesP95:0,
   confidenceInterval95:[0,0],evidenceStatus:'NO_TRADE_SAMPLE',sampleSize:0});
  if(!Number.isSafeInteger(simulationsCount)||simulationsCount<1||simulationsCount>10000||!Array.isArray(tradesSample)||
    tradesSample.length<4||tradesSample.length>10000||tradesSample.some(n=>!Number.isFinite(n))||
    simulationsCount*tradesSample.length>2_000_000)return empty();
  let state=2166136261;
  for(const ch of JSON.stringify([strategyId,simulationsCount,tradesSample]))state=Math.imul(state^ch.charCodeAt(0),16777619)>>>0;
  if(!state)state=1;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const pnl:number[]=[],dd:number[]=[],streaks:number[]=[];
  for(let i=0;i<simulationsCount;i++){
   let value=0,peak=0,drawdown=0,streak=0,maxStreak=0;
   for(let j=0;j<tradesSample.length;j++){
    const ret=tradesSample[Math.floor(random()*tradesSample.length)];value+=ret;
    peak=Math.max(peak,value);drawdown=Math.max(drawdown,peak-value);
    streak=ret<0?streak+1:0;maxStreak=Math.max(maxStreak,streak);
   }
   if(!Number.isFinite(value)||!Number.isFinite(drawdown))return empty();
   pnl.push(value);dd.push(drawdown);streaks.push(maxStreak);
  }
  for(const xs of [pnl,dd,streaks])xs.sort((a,b)=>a-b);
  const q=(xs:number[],p:number)=>xs[Math.floor((xs.length-1)*p)];
  return {strategyId,simulationsCount,medianPnl:q(pnl,.5),percentile5Pnl:q(pnl,.05),percentile50Pnl:q(pnl,.5),percentile95Pnl:q(pnl,.95),
   maxDrawdownDistribution:{p5:q(dd,.05),p50:q(dd,.5),p95:q(dd,.95)},riskOfRuinPct:0,worstCaseCapitalNeeded:0,
   maxConsecutiveLossesP95:q(streaks,.95),confidenceInterval95:[q(pnl,.025),q(pnl,.975)],
   evidenceStatus:'INPUT_SAMPLE_BOOTSTRAP',sampleSize:tradesSample.length};
 }
}
export const monteCarloEngine=new MonteCarloEngine();
