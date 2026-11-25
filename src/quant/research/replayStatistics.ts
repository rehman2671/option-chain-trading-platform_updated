/** Descriptive closed-trade statistics, not annualized returns or validation. */
export function replayStatistics(returns:readonly number[],seedText:string){
 if(!Array.isArray(returns)||returns.length>100000||returns.some(n=>!Number.isFinite(n)))return null;
 const n=returns.length,wins=returns.filter(x=>x>0),losses=returns.filter(x=>x<0);
 const sum=(xs:readonly number[])=>xs.reduce((s,x)=>s+x,0);
 const total=sum(returns),positive=sum(wins),negative=-sum(losses);
 const mean=n?total/n:0,variance=n>1?sum(returns.map(x=>(x-mean)**2))/(n-1):0;
 const downside=n?Math.sqrt(sum(returns.map(x=>Math.min(0,x)**2))/n):0;
 if(![total,positive,negative,mean,variance,downside].every(Number.isFinite))return null;
 // Per-trade ratios; no trading-frequency or annualization assumptions.
 const ratio=variance>0?mean/Math.sqrt(variance):null;
 const sortino=downside>0?mean/downside:null;
 const profitFactor=negative>0?positive/negative:null;
 const avgLoss=losses.length?negative/losses.length:0;
 const expectancyR=avgLoss>0?mean/avgLoss:null;
 // Reproducible non-cryptographic bootstrap, bounded work. Independent IID
 // resampling does not measure sequence dependence, tails or OOS evidence.
 let state=2166136261;
 for(const c of seedText)state=Math.imul(state^c.charCodeAt(0),16777619)>>>0;
 if(!state)state=1;
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
 let bootstrap:[number,number,number]|null=null;
 if(n>=4&&n<=10000){
  const samples:number[]=[];
  const runs=Math.min(500,Math.floor(1000000/n));
  for(let k=0;k<runs;k++){
   let t=0;for(let j=0;j<n;j++)t+=returns[Math.floor(random()*n)];
   if(!Number.isFinite(t))return null;samples.push(t);
  }
  samples.sort((a,b)=>a-b);
  const q=(p:number)=>samples[Math.floor((samples.length-1)*p)];
  bootstrap=[q(.05),q(.5),q(.95)];
 }
 return {sampleSize:n,total,winRate:n?wins.length/n*100:0,lossRate:n?losses.length/n*100:0,
  avgWin:wins.length?positive/wins.length:0,avgLoss,profitFactor,expectancyR,ratio,sortino,bootstrap,
  walkForwardVerified:false as const,outOfSampleVerified:false as const,orderAuthorized:false as const};
}
