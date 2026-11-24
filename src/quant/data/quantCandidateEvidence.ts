/**
 * Read-only option candidate evidence for legacy Quant decisions.
 * Candidate text does not specify leg sides, so never construct an order from it.
 * No practice fallback, inferred expiry, fixed lot, or spot-as-option-premium.
 */
const keys:Record<string,{underlyingKey:string;segment:string}>={
  NIFTY:{underlyingKey:'NSE_INDEX|Nifty 50',segment:'NSE_FO'},
  BANKNIFTY:{underlyingKey:'NSE_INDEX|Nifty Bank',segment:'NSE_FO'},
  SENSEX:{underlyingKey:'BSE_INDEX|SENSEX',segment:'BSE_FO'}
};
type Row=Record<string,unknown>;
type Candidate={strike:number;optionType:'CE'|'PE'};
export type QuantCandidateEvidence=Candidate&{
  instrumentKey:string;expiry:string;lotSize:number;quantity:number;
  lastPrice:number;bestBid:number;bestAsk:number;bidQuantity:number;askQuantity:number;
  exchangeTimestamp:string;snapshotTimestamp:string;
};
export type QuantEvidenceResult={status:'VERIFIED_READ_ONLY'|'UNAVAILABLE';reason:string;
  candidates:QuantCandidateEvidence[];orderAuthorized:false};
type Provider={getProviderMode():string;getOptionContracts(key:string):Promise<unknown>;
  getLiveOptionQuote(key:string):Promise<unknown>};
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const positiveInt=(v:unknown):v is number=>positive(v)&&Number.isSafeInteger(v);
const row=(v:unknown):Row|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Row:null;
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
  Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const instant=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)?Date.parse(v):NaN;
export function parseQuantCandidates(value:unknown):Candidate[]|null {
  if(typeof value!=='string'||value.length>200)return null;
  const parts=value.split('/').map(s=>s.trim());
  if(parts.length<1||parts.length>8)return null;
  const candidates:Candidate[]=[];
  for(const part of parts){
    const m=/^([1-9]\d{0,7}(?:\.\d{1,2})?)\s+(CE|PE)$/.exec(part);
    if(!m)return null;
    const strike=Number(m[1]),optionType=m[2] as Candidate['optionType'];
    if(!positive(strike)||candidates.some(c=>c.strike===strike&&c.optionType===optionType))return null;
    candidates.push({strike,optionType});
  }
  return candidates;
}
export async function readQuantCandidateEvidence(
  input:{underlying:string;strikes:unknown;expiry:unknown;lots:unknown},
  provider:unknown,clock:()=>number=Date.now
):Promise<QuantEvidenceResult>{
  const fail=(reason:string):QuantEvidenceResult=>({status:'UNAVAILABLE',reason,candidates:[],orderAuthorized:false});
  const spec=Object.prototype.hasOwnProperty.call(keys,input.underlying)?keys[input.underlying]:undefined;
  const candidates=parseQuantCandidates(input.strikes);
  const lots=input.lots,expiry=input.expiry;
  const start=clock();
  if(!Number.isFinite(start)||!spec||!candidates||!positiveInt(lots)||lots>100||!date(expiry)||
      expiry<new Date(start+330*60000).toISOString().slice(0,10))return fail('INVALID_OR_UNSUPPORTED_CONTRACT_REQUEST');
  const p=provider as Partial<Provider>|null;
  try {
    if(!p||p.getProviderMode?.()!=='LIVE'||typeof p.getOptionContracts!=='function'||typeof p.getLiveOptionQuote!=='function')return fail('LIVE_CONTRACT_PROVIDER_UNAVAILABLE');
    const rows=await p.getOptionContracts(spec.underlyingKey);
    if(!Array.isArray(rows)||rows.length>100000)return fail('INVALID_CONTRACT_MASTER');
    const contracts=candidates.map(c=>{
      const matches=rows.map(row).filter((r):r is Row=>!!r&&r.underlying_key===spec.underlyingKey&&r.underlying_symbol===input.underlying&&r.segment===spec.segment&&r.instrument_type===c.optionType&&r.expiry===expiry&&r.strike_price===c.strike);
      if(matches.length!==1)return null;
      const m=matches[0],instrumentKey=m.instrument_key,lotSize=m.lot_size;
      if(typeof instrumentKey!=='string'||!instrumentKey.startsWith(spec.segment+'|')||!/^[0-9]+$/.test(instrumentKey.slice(spec.segment.length+1))||!positiveInt(lotSize)||!positiveInt(lotSize*lots))return null;
      if(rows.filter(r=>row(r)?.instrument_key===instrumentKey).length!==1)return null;
      return {...c,instrumentKey,expiry,lotSize,quantity:lotSize*lots};
    });
    if(contracts.some(c=>!c))return fail('EXACT_LISTED_CONTRACT_NOT_UNIQUE');
    const resolved=contracts.filter((c):c is NonNullable<typeof c>=>c!==null);
    if(new Set(resolved.map(c=>c.instrumentKey)).size!==resolved.length)return fail('DUPLICATE_CONTRACT_IDENTITY');
    const quotes=await Promise.all(resolved.map(c=>p.getLiveOptionQuote!(c.instrumentKey)));
    const now=clock();
    if(!Number.isFinite(now)||now<start||now-start>20000||p.getProviderMode?.()!=='LIVE')return fail('EVIDENCE_WINDOW_EXPIRED');
    const result:QuantCandidateEvidence[]=[];
    for(let i=0;i<resolved.length;i++){
      const c=resolved[i],q=row(quotes[i]);
      if(!q||q.instrumentKey!==c.instrumentKey||q.source!=='UPSTOX_FULL_MARKET_QUOTE_V3_LTP'||q.bookSource!=='UPSTOX_FULL_MARKET_QUOTE_V3_DEPTH_D5')return fail('EXACT_LIVE_QUOTE_UNAVAILABLE');
      const trade=instant(q.exchangeTimestamp),snapshot=instant(q.snapshotTimestamp);
      if(!Number.isFinite(trade)||!Number.isFinite(snapshot)||trade>now||snapshot>now||now-trade>30000||now-snapshot>10000||trade>snapshot||
        !positive(q.price)||!positive(q.bestBidPrice)||!positive(q.bestAskPrice)||q.bestBidPrice>q.bestAskPrice||
        !positiveInt(q.bestBidQuantity)||!positiveInt(q.bestAskQuantity))return fail('STALE_OR_INVALID_QUOTE');
      result.push({...c,lastPrice:q.price,bestBid:q.bestBidPrice,bestAsk:q.bestAskPrice,bidQuantity:q.bestBidQuantity,askQuantity:q.bestAskQuantity,exchangeTimestamp:String(q.exchangeTimestamp),snapshotTimestamp:String(q.snapshotTimestamp)});
    }
    return {status:'VERIFIED_READ_ONLY',reason:'Exact listed candidates and recent broker quotes; leg sides and risk approval not established.',candidates:result,orderAuthorized:false};
  }catch{return fail('BROKER_EVIDENCE_READ_FAILED');}
}
