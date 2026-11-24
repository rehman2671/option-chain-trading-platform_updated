/** Pure read-only aggregation. Caller must supply authenticated complete broker
 * positions and normalized fresh per-unit Greeks from the same account session.
 * This function does NOT authenticate upstream claims or authorize an order. */
export interface PortfolioPosition {
  instrumentKey:string; product:'I'|'D'; netQuantity:number;
}
export interface GreekMark {
  instrumentKey:string; underlying:'NIFTY'|'BANKNIFTY'|'SENSEX';
  observedAt:number; sessionEpoch:string; convention:'PER_UNIT_PER_POINT_PER_DAY_PER_IV_POINT';
  delta:number; gamma:number; theta:number; vega:number;
}
export interface PortfolioGreekInput {
  accountScope:string; sessionEpoch:string; positionsObservedAt:number;
  completePositionSet:boolean; positions:PortfolioPosition[]; marks:GreekMark[];
}
type Totals={netDelta:number;netGamma:number;netTheta:number;netVega:number;grossDelta:number;grossGamma:number;grossTheta:number;grossVega:number};
type Outcome={status:'COMPLETE_INPUT_AGGREGATE';byUnderlying:Record<string,Totals>;activePositions:number;orderAuthorized:false}
  |{status:'UNKNOWN';reason:string;orderAuthorized:false};
const key=(v:unknown):v is string=>typeof v==='string'&&/^(NSE_FO|BSE_FO)\|[0-9]+$/.test(v);
const fresh=(t:number,now:number)=>Number.isSafeInteger(t)&&t>0&&t<=now&&now-t<=15000;
const zero=():Totals=>({netDelta:0,netGamma:0,netTheta:0,netVega:0,grossDelta:0,grossGamma:0,grossTheta:0,grossVega:0});
export function aggregatePortfolioGreekEvidence(input:PortfolioGreekInput,expectedAccount:string,expectedEpoch:string,now:number):Outcome {
  const fail=(reason:string):Outcome=>({status:'UNKNOWN',reason,orderAuthorized:false});
  if(!input||typeof expectedAccount!=='string'||!expectedAccount||typeof expectedEpoch!=='string'||!expectedEpoch||
    input.accountScope!==expectedAccount||input.sessionEpoch!==expectedEpoch||input.completePositionSet!==true||
    !Number.isSafeInteger(now)||!fresh(input.positionsObservedAt,now)||!Array.isArray(input.positions)||
    !Array.isArray(input.marks)||input.positions.length>5000||input.marks.length>5000)return fail('ACCOUNT_POSITION_EVIDENCE_UNAVAILABLE');
  const marks=new Map<string,GreekMark>();
  for(const m of input.marks){
    if(!m||!key(m.instrumentKey)||marks.has(m.instrumentKey)||m.sessionEpoch!==expectedEpoch||
      !['NIFTY','BANKNIFTY','SENSEX'].includes(m.underlying)||!fresh(m.observedAt,now)||
      m.convention!=='PER_UNIT_PER_POINT_PER_DAY_PER_IV_POINT'||
      ![m.delta,m.gamma,m.theta,m.vega].every(Number.isFinite)||Math.abs(m.delta)>1||m.gamma<0||m.vega<0)
      return fail('GREEK_MARK_INVALID_OR_DUPLICATE');
    marks.set(m.instrumentKey,m);
  }
  const seen=new Set<string>();const used=new Set<string>();const byUnderlying:Record<string,Totals>={};let activePositions=0;
  for(const p of input.positions){
    if(!p||!key(p.instrumentKey)||!['I','D'].includes(p.product)||!Number.isSafeInteger(p.netQuantity))return fail('POSITION_IDENTITY_INVALID');
    const identity=p.instrumentKey+':'+p.product;
    if(seen.has(identity))return fail('DUPLICATE_POSITION');
    seen.add(identity);
    if(p.netQuantity===0)continue;
    const m=marks.get(p.instrumentKey);
    if(!m)return fail('MISSING_ACTIVE_POSITION_GREEKS');
    used.add(p.instrumentKey);activePositions++;
    const totals=byUnderlying[m.underlying]??(byUnderlying[m.underlying]=zero());
    const q=p.netQuantity;
    for(const [metric,net,gross] of [
      ['delta','netDelta','grossDelta'],['gamma','netGamma','grossGamma'],
      ['theta','netTheta','grossTheta'],['vega','netVega','grossVega']
    ] as const){
      const value=m[metric]*q;totals[net]+=value;totals[gross]+=Math.abs(value);
      if(!Number.isFinite(totals[net])||!Number.isFinite(totals[gross]))return fail('AGGREGATE_OVERFLOW');
    }
  }
  if(used.size!==marks.size)return fail('UNMATCHED_GREEK_MARK');
  // No cross-underlying netting and no additional lot multiplier: netQuantity is units.
  return {status:'COMPLETE_INPUT_AGGREGATE',byUnderlying,activePositions,orderAuthorized:false};
}
