import type {WalkForwardResult} from '../types.js';

/** Existing endpoint has no independently partitioned train/validation/OOS
 * observations. Do not generate profitable windows from fixed formulas. */
export class WalkForwardEngine {
 public runWalkForward(strategyId:string,windowsCount:number=4):WalkForwardResult{
  return {strategyId,windowsCount:0,inSampleSharpeAvg:0,outOfSampleSharpeAvg:0,efficiencyRatio:0,
   stabilityPct:0,passed:false,windows:[],evidenceStatus:'NO_INDEPENDENT_OOS'};
 }
}
export const walkForwardEngine=new WalkForwardEngine();
