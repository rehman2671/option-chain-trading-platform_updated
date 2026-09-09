import { TradeConversionPlan } from '../types';

export class ConversionEngine {
  /**
   * Evaluates valid conversion strategies for an open options position to mitigate risk or finance decay.
   */
  public evaluateConversion(
    positionId: string,
    symbol: string,
    currentStructure: string,
    spotPrice: number,
    netPnl: number,
    currentLots: number = 2
  ): TradeConversionPlan[] {
    const plans: TradeConversionPlan[] = [];

    // Conversion 1: Naked Long Call -> Bull Call Spread (Finance Theta & Lock Gain/Cap Downside)
    if (currentStructure.toUpperCase().includes('LONG_CALL') || currentStructure.toUpperCase().includes('CALL')) {
      const shortCallStrike = Math.round((spotPrice * 1.015) / 50) * 50;
      plans.push({
        positionId,
        symbol,
        currentStructure: 'Naked Long Call',
        proposedStructure: 'Bull Call Debit Spread',
        targetLegs: [
          {
            action: 'SELL',
            strike: shortCallStrike,
            optionType: 'CE',
            lots: currentLots,
            estimatedPremium: 65
          }
        ],
        marginImpact: -15000, // Frees margin / credit offset
        capitalRequired: 0,
        netDeltaShift: -0.28,
        maxUpsidePayoff: 14500,
        maxDownsideRisk: 8200,
        expectedValueR: 0.42,
        feasibilityScore: 92,
        approvalStatus: 'ELIGIBLE',
        rationale: 'Sell 1.5% OTM Call against existing long call. Converts uncapped theta decay into a capped debit spread, locking in intrinsic gain and financing time value.'
      });
    }

    // Conversion 2: Naked Short Put -> Bull Put Credit Spread (Define Tail Risk & Eliminate Margin Spike)
    if (currentStructure.toUpperCase().includes('SHORT_PUT') || currentStructure.toUpperCase().includes('PUT')) {
      const longPutStrike = Math.round((spotPrice * 0.985) / 50) * 50;
      plans.push({
        positionId,
        symbol,
        currentStructure: 'Naked Short Put',
        proposedStructure: 'Bull Put Defined Credit Spread',
        targetLegs: [
          {
            action: 'BUY',
            strike: longPutStrike,
            optionType: 'PE',
            lots: currentLots,
            estimatedPremium: 42
          }
        ],
        marginImpact: -65000, // Substantially cuts exchange margin for naked put
        capitalRequired: 4200,
        netDeltaShift: 0.18,
        maxUpsidePayoff: 9800,
        maxDownsideRisk: 12500,
        expectedValueR: 0.35,
        feasibilityScore: 88,
        approvalStatus: 'ELIGIBLE',
        rationale: 'Attach long put wing 150 points below short put strike. Caps tail risk and releases over ₹65,000 in exchange overnight margin.'
      });
    }

    // Conversion 3: Short Straddle -> Iron Fly (Wing Attachment on Volatility Expansion)
    if (currentStructure.toUpperCase().includes('STRADDLE') || currentStructure.toUpperCase().includes('NEUTRAL')) {
      const wingDistance = 300;
      const atmStrike = Math.round(spotPrice / 50) * 50;
      plans.push({
        positionId,
        symbol,
        currentStructure: 'Short Straddle (Unhedged)',
        proposedStructure: 'Defined Iron Fly',
        targetLegs: [
          {
            action: 'BUY',
            strike: atmStrike + wingDistance,
            optionType: 'CE',
            lots: currentLots,
            estimatedPremium: 35
          },
          {
            action: 'BUY',
            strike: atmStrike - wingDistance,
            optionType: 'PE',
            lots: currentLots,
            estimatedPremium: 38
          }
        ],
        marginImpact: -85000,
        capitalRequired: 5500,
        netDeltaShift: 0.02,
        maxUpsidePayoff: 18500,
        maxDownsideRisk: 14000,
        expectedValueR: 0.48,
        feasibilityScore: 94,
        approvalStatus: 'ELIGIBLE',
        rationale: 'Attach symmetric wings (+300 CE / -300 PE). Protects portfolio from breakout shock and lowers capital at risk by 75%.'
      });
    }

    return plans;
  }
}

export const conversionEngine = new ConversionEngine();
