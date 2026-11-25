import type {OverfitAnalysisResult} from '../types.js';
/** No independent perturbation or multiple-testing evidence is provided by this API. */
export class OverfitDetector {
 public analyzeOverfitting(strategyId:string,parameters:Record<string,any>={}):OverfitAnalysisResult{
  return {strategyId,parameterStabilityScore:0,deflatedSharpeScore:0,probabilityOfBacktestOverfit:0,
   complexityPenalty:0,perturbedParameterPerformance:[],overfitRisk:'CRITICAL',recommendation:'REJECT',
   evidenceStatus:'NO_PERTURBATION_EVIDENCE'};
 }
}
export const overfitDetector=new OverfitDetector();
