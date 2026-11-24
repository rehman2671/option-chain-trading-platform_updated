import {parseBrokerRiskResponse,brokerNumber} from './brokerAccountRiskEvidence.js';
import {guardFullBrokerPositionRows} from '../engine/ema15m/adaptiveUpstoxNativeReadCardinalityGuard.js';
import type {PortfolioPosition} from './portfolioGreekEvidence.js';
import type {BrokerRiskSnapshot} from '../engine/ema15m/brokerRiskGate.js';
export interface BrokerEntryIdentity {
  accountId:string; authEpoch:number; instrumentKey:string; quantity:number; product:'I'|'D';
}
export interface BoundBrokerEntryEvidence {
  source:'UPSTOX_ACCOUNT_READS'; identity:Readonly<BrokerEntryIdentity>;
  observedAt:number; receivedAt:number; snapshot:BrokerRiskSnapshot;
  reportedOptionPositions:PortfolioPosition[];
  // Non-atomic broker-reported list, not independent completeness certification.
  accountCompletenessCertified:false; orderAuthorized:false;
}
export function validBrokerEntryIdentity(i:BrokerEntryIdentity):boolean{
  return !!i&&typeof i.accountId==='string'&&i.accountId.length>0&&i.accountId.length<=128&&
    Number.isSafeInteger(i.authEpoch)&&i.authEpoch>0&&typeof i.instrumentKey==='string'&&
    /^(NSE_FO|BSE_FO)\|[0-9]+$/.test(i.instrumentKey)&&Number.isSafeInteger(i.quantity)&&i.quantity>0&&
    ['I','D'].includes(i.product);
}
/** Never ignore an unsupported nonzero account position. Zero rows do not add
 * exposure. Native segment IDs alone do not prove that a contract is an option;
 * independent listed-contract/Greek identity is still required downstream. */
export function buildBoundBrokerEntryEvidence(i:BrokerEntryIdentity,funds:unknown,margin:unknown,portfolio:unknown,
  startedAt:number,receivedAt:number):BoundBrokerEntryEvidence|null{
  if(!validBrokerEntryIdentity(i)||!Number.isSafeInteger(startedAt)||startedAt<=0)return null;
  const snapshot=parseBrokerRiskResponse(funds,margin,portfolio,startedAt,receivedAt);
  if(!snapshot||!portfolio||typeof portfolio!=='object')return null;
  const rows=guardFullBrokerPositionRows((portfolio as {data?:unknown}).data);
  if(!rows||rows.length>5000)return null;
  const reportedOptionPositions:PortfolioPosition[]=[];
  for(const row of rows){
    const q=brokerNumber(row.net_quantity);
    if(q===null||!Number.isSafeInteger(q))return null;
    if(q===0)continue;
    if(typeof row.instrument_token!=='string'||!/^(NSE_FO|BSE_FO)\|[0-9]+$/.test(row.instrument_token)||
       (row.product!=='I'&&row.product!=='D'))return null;
    reportedOptionPositions.push({instrumentKey:row.instrument_token,product:row.product,netQuantity:q});
  }
  if(reportedOptionPositions.length!==snapshot.activePositions)return null;
  return {source:'UPSTOX_ACCOUNT_READS',identity:{...i},observedAt:startedAt,receivedAt,snapshot,reportedOptionPositions,
    accountCompletenessCertified:false,orderAuthorized:false};
}
