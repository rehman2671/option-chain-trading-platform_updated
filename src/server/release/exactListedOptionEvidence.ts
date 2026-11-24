import {brokerNumber} from './brokerAccountRiskEvidence.js';
import {validBrokerEntryIdentity,type BrokerEntryIdentity} from './boundBrokerEntryEvidence.js';

export const underlyingKeys={NIFTY:'NSE_INDEX|Nifty 50',BANKNIFTY:'NSE_INDEX|Nifty Bank',SENSEX:'BSE_INDEX|SENSEX'} as const;
type Underlying=keyof typeof underlyingKeys;
export interface ListedOptionRequest {
 identity:BrokerEntryIdentity; underlying:Underlying; optionType:'CE'|'PE'; strike:number; expiry:string;
}
export interface ListedOptionEvidence {
 source:'UPSTOX_LISTED_CONTRACT'; request:Readonly<ListedOptionRequest>;
 lotSize:number; tickSizePaise:number; tradingSymbol:string; observedAt:number;
 exchangeTimestampVerified:false; orderAuthorized:false;
}
const date=(s:unknown):s is string=>{
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
};
export function validListedOptionRequest(r:ListedOptionRequest):boolean{
 return !!r&&validBrokerEntryIdentity(r.identity)&&Object.prototype.hasOwnProperty.call(underlyingKeys,r.underlying)&&
  ['CE','PE'].includes(r.optionType)&&Number.isFinite(r.strike)&&r.strike>0&&date(r.expiry)&&
  r.identity.instrumentKey.startsWith(r.underlying==='SENSEX'?'BSE_FO|':'NSE_FO|');
}
/** Exact requested expiry only; do not silently select nearest expiry or infer
 * tick units. Native catalog tick_size is interpreted as integer paise by this
 * adapter contract. Reject ambiguous/malformed rows. Local receipt time is not
 * exchange freshness or authority to trade. */
export function verifyExactListedOption(r:ListedOptionRequest,raw:unknown,startedAt:number,receivedAt:number):ListedOptionEvidence|null{
 if(!validListedOptionRequest(r)||!Array.isArray(raw)||raw.length>50000||
  !Number.isSafeInteger(startedAt)||startedAt<946684800000||!Number.isSafeInteger(receivedAt)||
  receivedAt<startedAt||receivedAt-startedAt>15000||receivedAt>=4102444800000)return null;
 const today=new Date(receivedAt+330*60000).toISOString().slice(0,10);
 if(r.expiry<today)return null;
 const rows=raw.filter(x=>x&&typeof x==='object'&&x.instrument_key===r.identity.instrumentKey);
 if(rows.length!==1)return null;
 const c=rows[0];
 const segment=r.underlying==='SENSEX'?'BSE_FO':'NSE_FO';
 const lot=brokerNumber(c.lot_size),tick=brokerNumber(c.tick_size),strike=brokerNumber(c.strike_price);
 if(c.segment!==segment||c.underlying_key!==underlyingKeys[r.underlying]||c.underlying_symbol!==r.underlying||
  c.instrument_type!==r.optionType||c.expiry!==r.expiry||strike!==r.strike||
  lot===null||!Number.isSafeInteger(lot)||lot<=0||r.identity.quantity%lot!==0||
  tick===null||!Number.isSafeInteger(tick)||tick<=0||typeof c.trading_symbol!=='string'||
  !c.trading_symbol.trim()||c.trading_symbol.length>200)return null;
 return {source:'UPSTOX_LISTED_CONTRACT',request:{...r,identity:{...r.identity}},lotSize:lot,tickSizePaise:tick,
  tradingSymbol:c.trading_symbol,observedAt:startedAt,exchangeTimestampVerified:false,orderAuthorized:false};
}
