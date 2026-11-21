/**
 * Phase96: a broker-reported current net position must be a UNIQUE row,
 * never the sum of potentially duplicated/ambiguous position records.
 *
 * Source: Upstox GET /v2/portfolio/short-term-positions (read-only).
 * Product I => MIS, D => NRML. The API is a non-atomic broker snapshot,
 * NOT an independent exchange receipt or permission to place an order.
 */
export type StrictBrokerProduct = 'MIS' | 'NRML';
export type UniquePositionIssue =
  | 'POSITION_SOURCE_MISSING_OR_TRUNCATED'
  | 'INVALID_EXACT_INSTRUMENT_OR_PRODUCT'
  | 'MALFORMED_BROKER_POSITION_RECORD'
  | 'BROKER_POSITION_NOT_VISIBLE'
  | 'DUPLICATE_OR_OTHER_PRODUCT_POSITION'
  | 'INVALID_OR_SHORT_BROKER_NET_QUANTITY';
export type UniqueBrokerPositionResult =
  | { verified: true; netQuantity: number; issue: null }
  | { verified: false; netQuantity: null; issue: UniquePositionIssue };
const fail = (issue:UniquePositionIssue):UniqueBrokerPositionResult => ({
  verified:false,netQuantity:null,issue
});
const validNet = (value:unknown):number | null=>{
  if(typeof value==='number')
    return Number.isSafeInteger(value)&&value>=0?value:null;
  // No coercion: null, '', booleans, 5e1, leading-zero and decimal strings
  // cannot pass as a broker-authoritative quantity.
  if(typeof value==='string'&&/^(?:0|[1-9][0-9]*)$/.test(value)){
    const parsed=Number(value);
    return Number.isSafeInteger(parsed)?parsed:null;
  }
  return null;
};
/**
 * Do not treat an absent position, unknown opposite product, duplicate row
 * or HTTP/parse failure as a zero holding. A single explicit zero-quantity
 * row can be reported as 0 for diagnostics, but the SELL quantity guard
 * separately requires a positive matching remaining lot quantity.
 */
export function resolveUniqueBrokerNetPosition(
  rows:unknown,
  instrumentKey:unknown,
  product:unknown
):UniqueBrokerPositionResult{
  if(typeof instrumentKey!=='string'||!instrumentKey||
     instrumentKey.length>256||(product!=='NRML'&&product!=='MIS'))
    return fail('INVALID_EXACT_INSTRUMENT_OR_PRODUCT');
  if(!Array.isArray(rows)||rows.length>10000)
    return fail('POSITION_SOURCE_MISSING_OR_TRUNCATED');
  const expectedProduct=product==='NRML'?'D':'I';
  let found:Record<string,unknown>|null=null;
  let count=0;
  for(const candidate of rows){
    if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||
       typeof candidate.instrument_token!=='string'||
       candidate.instrument_token.length===0){
      return fail('MALFORMED_BROKER_POSITION_RECORD');
    }
    const r=candidate as Record<string,unknown>;
    if(r.instrument_token!==instrumentKey)continue;
    count++;
    // A matching contract on another product cannot be ignored merely
    // because one valid product D/I row also exists.
    if(r.product!==expectedProduct)
      return fail('DUPLICATE_OR_OTHER_PRODUCT_POSITION');
    if(count>1)
      return fail('DUPLICATE_OR_OTHER_PRODUCT_POSITION');
    found=r;
  }
  if(count===0||!found)
    return fail('BROKER_POSITION_NOT_VISIBLE');
  const qty=validNet(found.net_quantity);
  if(qty===null)
    return fail('INVALID_OR_SHORT_BROKER_NET_QUANTITY');
  return {verified:true,netQuantity:qty,issue:null};
}
