/**
 * Phase95: never submit the original option quantity after a partial SELL.
 * This guard only checks arithmetic and the last broker-reported NRML/MIS
 * net; it does not authorize NRML live mode, certify a stop, or send orders.
 */
export type BrokerSellQuantityDecision=
  |{allowed:false;reason:string;remainingQuantity:0;priorExitFilledQuantity:0}
  |{allowed:true;reason:null;remainingQuantity:number;priorExitFilledQuantity:number};
const posInt=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const nnInt=(x:unknown):x is number=>
  typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
/** Fail closed if quantity changed or a broker query did not complete. */
export function assessBrokerRemainingSellQuantity(input:{
  originalPositionQuantity:unknown;
  previousConfirmedSellFills:unknown;
  lotSize:unknown;
  brokerNetQuantity:unknown;
}):BrokerSellQuantityDecision{
  const reject=(reason:string):BrokerSellQuantityDecision=>({
    allowed:false,reason,remainingQuantity:0,priorExitFilledQuantity:0
  });
  if(!input||!posInt(input.originalPositionQuantity)||
     !nnInt(input.previousConfirmedSellFills)||
     !posInt(input.lotSize)||
     input.originalPositionQuantity%input.lotSize!==0||
     input.previousConfirmedSellFills>input.originalPositionQuantity)
    return reject('INVALID_DURABLE_POSITION_LOT_OR_CUMULATIVE_EXIT_FILLS');
  const remaining=input.originalPositionQuantity-input.previousConfirmedSellFills;
  if(!posInt(remaining)||remaining%input.lotSize!==0)
    return reject('NO_POSITIVE_LOT_MULTIPLE_REMAINING_TO_SELL');
  if(!nnInt(input.brokerNetQuantity)||
     input.brokerNetQuantity!==remaining)
    return reject('BROKER_NET_NOT_AUTHORITATIVELY_MATCHED_TO_REMAINING_LONG');
  return {
    allowed:true,reason:null,remainingQuantity:remaining,
    priorExitFilledQuantity:input.previousConfirmedSellFills
  };
}
