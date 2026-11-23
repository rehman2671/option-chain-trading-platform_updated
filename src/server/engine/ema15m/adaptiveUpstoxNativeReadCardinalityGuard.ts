/**
 * Phase119: fail-closed cardinality/identity guards for broker READ-ONLY
 * account-wide GTT, orderbook, position, and exact order trade GETs.
 *
 * These are broker-reported, current-day/non-atomic records, never
 * independent venue ACKs, broker account snapshot completeness,
 * an expiry calendar, or a LIVE NRML release authorization.
 * Guard failures return null (UNKNOWN), never [] (known empty).
 */
import {validUpstoxGttTimeFieldsIfPresent}
  from './adaptiveNrmlGttExpiryHorizonReadOnlyAudit.js';
type Row=Record<string,unknown>;
const obj=(x:unknown):x is Row=>
  x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is string=>
  typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const gtt=(x:unknown):x is string=>
  typeof x==='string'&&/^GTT-[A-Za-z0-9-]{1,240}$/.test(x);
const instrument=(x:unknown):x is string=>
  typeof x==='string'&&x.length>0&&x.length<=256&&
  /^[A-Za-z0-9_]+\|[^\s]{1,240}$/.test(x);
// Upstox v2 per-order trades documentation shows a numeric legacy
// instrument_token (e.g. "151064324") even where the native position
// catalog uses segment|instrument. Accept source shape ONLY; Phase113
// requires independently resolved exact F&O contract identity.
const tradeInstrument=(x:unknown):x is string=>
  instrument(x)||(typeof x==='string'&&/^[0-9]{1,32}$/.test(x));
const positive=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const nonnegative=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const products=new Set(['D','I','MTF','CO']);
const sides=new Set(['BUY','SELL']);
const orderTypes=new Set(['LIMIT','MARKET','SL','SL-M']);
const upper=(x:unknown)=>typeof x==='string'?x.trim().toUpperCase():'';
const safeNet=(x:unknown):boolean=>{
  if(typeof x==='number')return Number.isSafeInteger(x);
  return typeof x==='string'&&/^-?(?:0|[1-9][0-9]*)$/.test(x)&&
    Number.isSafeInteger(Number(x));
};
const bounded=(x:unknown,max:number):x is Row[]=>Array.isArray(x)&&
  x.length<max&&x.every(obj);
/** Keep strict exactly-one requested ID semantics; [] may mean completed
 * parent is not retrievable but cannot certify the position closed. */
export function guardExactBrokerGttGet(raw:unknown,expected:string):Row[]|null{
  if(!gtt(expected)||!bounded(raw,10_000)||raw.length>1)return null;
  if(raw.length===0)return [];
  const p=raw[0];
  return p.gtt_order_id===expected&&gtt(p.gtt_order_id)&&
    validUpstoxGttTimeFieldsIfPresent(p)&&
    instrument(p.instrument_token)&&products.has(String(p.product))&&
    ['SINGLE','MULTIPLE'].includes(String(p.type))&&
    positive(p.quantity)&&Array.isArray(p.rules)&&p.rules.length>0&&
    p.rules.length<=3&&p.rules.every(r=>obj(r)&&
      ['ENTRY','TARGET','STOPLOSS'].includes(String(r.strategy))&&
      sides.has(String(r.transaction_type))&&
      typeof r.status==='string'&&r.status.length>0)
    ?raw:null;
}
/** A malformed or repeated GTT from the account-wide list must never
 * hide another broker conditional BUY/SELL for the same option. */
export function guardFullBrokerGttList(raw:unknown):Row[]|null{
  if(!bounded(raw,10_000))return null;
  const seen=new Set<string>();
  for(const p of raw){
    if(!gtt(p.gtt_order_id)||seen.has(p.gtt_order_id)||
       !validUpstoxGttTimeFieldsIfPresent(p)||
       !instrument(p.instrument_token)||!products.has(String(p.product))||
       !['SINGLE','MULTIPLE'].includes(String(p.type))||
       !positive(p.quantity)||!Array.isArray(p.rules)||
       p.rules.length<1||p.rules.length>3||
       p.rules.some(r=>!obj(r)||!['ENTRY','TARGET','STOPLOSS'].includes(
         String(r.strategy))||!sides.has(String(r.transaction_type))||
         typeof r.status!=='string'||r.status.length===0))return null;
    seen.add(p.gtt_order_id);
  }
  return raw;
}
/** Current-day full orderbook is not complete historical account evidence.
 * Refuse malformed/duplicated rows rather than falsely reading no rival
 * order when a required contract/side/order ID is absent. */
export function guardFullBrokerOrderBook(raw:unknown):Row[]|null{
  if(!bounded(raw,10_000))return null;
  const seen=new Set<string>();
  for(const p of raw){
    if(!id(p.order_id)||seen.has(p.order_id)||
       !instrument(p.instrument_token)||!products.has(String(p.product))||
       !sides.has(String(p.transaction_type))||
       typeof p.status!=='string'||!p.status.trim()||
       !positive(p.quantity)||!nonnegative(p.filled_quantity)||
       !nonnegative(p.pending_quantity)||
       p.filled_quantity+p.pending_quantity>p.quantity)return null;
    seen.add(p.order_id);
  }
  return raw;
}
/** Per-order trades must all be explicitly from the requested order,
 * have unique trade IDs, and be numerically usable as broker executions.
 * Their venue references are STILL merely broker-reported strings. */
export function guardExactBrokerOrderTrades(
  raw:unknown,expectedOrderId:string
):Row[]|null{
  if(!id(expectedOrderId)||!bounded(raw,5000))return null;
  const seen=new Set<string>();
  for(const p of raw){
    if(!id(p.trade_id)||seen.has(p.trade_id)||
       p.order_id!==expectedOrderId||!tradeInstrument(p.instrument_token)||
       !products.has(String(p.product))||
       !sides.has(String(p.transaction_type))||
       !positive(p.quantity)||
       typeof p.average_price!=='number'||
       !Number.isFinite(p.average_price)||p.average_price<=0||
       !id(p.exchange_order_id))return null;
    seen.add(p.trade_id);
  }
  return raw;
}
/** Raw account positions may include valid negative shorts in OTHER
 * instruments. Do not declare the requested NRML long free of risk by
 * summing duplicate or missing broker rows: phase96 resolver remains
 * solely responsible for that exact-contract validation. */
export function guardFullBrokerPositionRows(raw:unknown):Row[]|null{
  if(!bounded(raw,10_000))return null;
  const seen=new Set<string>(),normalized:Row[]=[];
  for(const p of raw){
    if(!instrument(p.instrument_token)||!products.has(String(p.product)))
      return null;
    const hasNet=Object.prototype.hasOwnProperty.call(p,'net_quantity');
    const hasQuantity=Object.prototype.hasOwnProperty.call(p,'quantity');
    // Upstox GET /v2/portfolio/short-term-positions documents
    // 'quantity' as remaining net, not 'net_quantity'. Preserve an
    // explicit legacy net_quantity only when BOTH fields agree.
    if(!hasNet&&!hasQuantity)return null;
    if(hasNet&&!safeNet(p.net_quantity))return null;
    if(hasQuantity&&!safeNet(p.quantity))return null;
    if(hasNet&&hasQuantity&&
       Number(p.net_quantity)!==Number(p.quantity))return null;
    const key=p.instrument_token+'|'+p.product;
    if(seen.has(key))return null;
    seen.add(key);
    normalized.push(hasNet?p:{...p,net_quantity:p.quantity});
  }
  return normalized;
}
