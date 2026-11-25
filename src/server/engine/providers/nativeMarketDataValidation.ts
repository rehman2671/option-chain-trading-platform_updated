import type {OptionContractQuote} from './types.js';
type Row=Record<string,unknown>;
const object=(v:unknown):Row|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Row:null;
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function exactCivilDate(value:unknown):value is string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const t=Date.parse(value+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===value;
}
export function nativeTradeTimestamp(raw:unknown,receivedAt:number):string|undefined{
 if(typeof raw!=='number'&&!(typeof raw==='string'&&/^\d{13}$/.test(raw)))return undefined;
 const ms=Number(raw);
 if(!Number.isSafeInteger(ms)||ms<946684800000||ms>=4102444800000||ms>receivedAt+3000)return undefined;
 return new Date(ms).toISOString();
}
export function parseNativeOptionChain(raw:unknown,underlyingKey:string,expiry:string,strikes:readonly number[],observedAt:number):Map<string,{ce:OptionContractQuote;pe:OptionContractQuote}>{
 const empty=()=>new Map<string,{ce:OptionContractQuote;pe:OptionContractQuote}>();
 const response=object(raw);
 if(!response||response.status!=='success'||!Array.isArray(response.data)||response.data.length>20000||
  !exactCivilDate(expiry)||!Number.isSafeInteger(observedAt)||observedAt<946684800000||
  observedAt>=4102444800000||!Array.isArray(strikes)||strikes.some(x=>!positive(x)))return empty();
 const result=empty(),seen=new Set<number>(),keys=new Set<string>(),wanted=new Set(strikes);
 const segment=underlyingKey.startsWith('BSE_')?'BSE_FO':'NSE_FO';
 function leg(value:unknown,strike:number,optionType:'CE'|'PE'):OptionContractQuote|null{
  const l=object(value),m=object(l?.market_data),g=object(l?.option_greeks),key=l?.instrument_key;
  if(!l||!m||typeof key!=='string'||!new RegExp('^'+segment+'\\|[0-9]+$').test(key)||keys.has(key))return null;
  keys.add(key);
  const ltp=positive(m.ltp)?m.ltp:0,oi=count(m.oi)?m.oi:0,volume=count(m.volume)?m.volume:0;
  const oiAvailable=count(m.oi),changeInOIAvailable=oiAvailable&&count(m.prev_oi);
  const change=changeInOIAvailable?oi-Number(m.prev_oi):0;
  const bid=positive(m.bid_price)?m.bid_price:undefined,ask=positive(m.ask_price)?m.ask_price:undefined;
  const validBook=bid!==undefined&&ask!==undefined&&bid<=ask;
  const iv=positive(g?.iv)?g.iv:0;
  return {strikePrice:strike,optionType,ltp,oi,volume,changeInOI:change,
   pChangeInOI:changeInOIAvailable&&Number(m.prev_oi)>0?Number((100*change/Number(m.prev_oi)).toFixed(2)):0,
   iv,bidPrice:validBook?bid:undefined,askPrice:validBook?ask:undefined,ltpAvailable:ltp>0,oiAvailable,
   volumeAvailable:count(m.volume),changeInOIAvailable,ivAvailable:iv>0,
   source:'UPSTOX_CHAIN_UNTIMED',instrumentKey:key,expiry,receivedAt:new Date(observedAt).toISOString(),exchangeTimestampVerified:false};
 }
 for(const item of response.data){
  const r=object(item);
  if(!r||r.expiry!==expiry||r.underlying_key!==underlyingKey||!positive(r.strike_price)||seen.has(r.strike_price))return empty();
  const strike=r.strike_price;seen.add(strike);
  const ce=leg(r.call_options,strike,'CE'),pe=leg(r.put_options,strike,'PE');
  if(!ce||!pe)return empty();
  if(wanted.size===0||wanted.has(strike))result.set(String(strike),{ce,pe});
 }
 return result;
}
