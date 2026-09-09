import { QuantUnderlying, QuantOptionSnapshot, IvSurfaceProfile } from '../types';

export class IvSurfaceEngine {
  public computeSurface(
    underlying: QuantUnderlying,
    spotPrice: number,
    snapshots: QuantOptionSnapshot[]
  ): IvSurfaceProfile {
    const validSnapshots = snapshots.filter(s => s.underlying === underlying && s.iv > 0);

    // Default baseline values if snapshot collection is sparse
    const defaultAtmIv = underlying === 'BANKNIFTY' ? 14.8 : underlying === 'SENSEX' ? 12.9 : 13.2;

    if (validSnapshots.length === 0) {
      const exp1D = Math.round(spotPrice * (defaultAtmIv / 100) * Math.sqrt(1 / 252));
      return {
        underlying,
        asOf: new Date().toISOString(),
        atmIv: defaultAtmIv,
        delta25CallIv: defaultAtmIv + 0.8,
        delta25PutIv: defaultAtmIv + 1.6,
        delta10CallIv: defaultAtmIv + 1.5,
        delta10PutIv: defaultAtmIv + 2.8,
        callSkew: 0.8,
        putSkew: 1.6,
        flySpread: 0.8 + 1.6,
        termStructure: [
          { expiry: 'Current Weekly (0-3 DTE)', daysToExpiry: 3, atmIv: defaultAtmIv, status: 'CONTANGO' },
          { expiry: 'Next Weekly (7-10 DTE)', daysToExpiry: 10, atmIv: defaultAtmIv + 0.6, status: 'CONTANGO' },
          { expiry: 'Monthly Expiry (20-30 DTE)', daysToExpiry: 24, atmIv: defaultAtmIv + 1.2, status: 'CONTANGO' }
        ],
        ivRank: 34,
        ivPercentile: 38,
        regime: 'IV_EXPANDING',
        surfaceSkewAnomaly: false,
        termStructureInverted: false,
        expectedMove1D: exp1D,
        expectedMoveExpiry: Math.round(spotPrice * (defaultAtmIv / 100) * Math.sqrt(4 / 365))
      };
    }

    // Identify nearest ATM strike
    let closestStrike = validSnapshots[0].strike;
    let minDiff = Math.abs(closestStrike - spotPrice);
    for (const snap of validSnapshots) {
      const diff = Math.abs(snap.strike - spotPrice);
      if (diff < minDiff) {
        minDiff = diff;
        closestStrike = snap.strike;
      }
    }

    const atmSnaps = validSnapshots.filter(s => s.strike === closestStrike);
    const atmIv = atmSnaps.length > 0 && atmSnaps[0].iv ? atmSnaps[0].iv : defaultAtmIv;

    // 25 Delta Call & Put
    const calls = validSnapshots.filter(s => s.optionType === 'CE');
    const puts = validSnapshots.filter(s => s.optionType === 'PE');

    const d25Call = calls.reduce((prev, curr) => Math.abs(curr.delta - 0.25) < Math.abs(prev.delta - 0.25) ? curr : prev, calls[0] || { iv: atmIv + 0.8, delta: 0.25 });
    const d25Put = puts.reduce((prev, curr) => Math.abs(Math.abs(curr.delta) - 0.25) < Math.abs(Math.abs(prev.delta) - 0.25) ? curr : prev, puts[0] || { iv: atmIv + 1.6, delta: -0.25 });
    const d10Call = calls.reduce((prev, curr) => Math.abs(curr.delta - 0.10) < Math.abs(prev.delta - 0.10) ? curr : prev, calls[0] || { iv: atmIv + 1.5, delta: 0.10 });
    const d10Put = puts.reduce((prev, curr) => Math.abs(Math.abs(curr.delta) - 0.10) < Math.abs(Math.abs(prev.delta) - 0.10) ? curr : prev, puts[0] || { iv: atmIv + 2.8, delta: -0.10 });

    const callSkew = Number((d25Call.iv - atmIv).toFixed(2));
    const putSkew = Number((d25Put.iv - atmIv).toFixed(2));
    const flySpread = Number(((d25Put.iv + d25Call.iv) - (2 * atmIv)).toFixed(2));

    const ivRank = Math.min(100, Math.max(0, Math.round(((atmIv - 10) / (25 - 10)) * 100)));
    const ivPercentile = Math.min(100, Math.max(0, Math.round(ivRank * 1.05)));

    const termStructureInverted = false;
    const regime = ivRank > 70 ? 'IV_RICH' : ivRank < 30 ? 'IV_CHEAP' : callSkew > 2.0 || putSkew > 3.0 ? 'IV_EXPANDING' : 'IV_CONTRACTING';

    const expectedMove1D = Math.round(spotPrice * (atmIv / 100) * Math.sqrt(1 / 252));
    const expectedMoveExpiry = Math.round(spotPrice * (atmIv / 100) * Math.sqrt(5 / 365));

    return {
      underlying,
      asOf: new Date().toISOString(),
      atmIv: Number(atmIv.toFixed(2)),
      delta25CallIv: Number(d25Call.iv.toFixed(2)),
      delta25PutIv: Number(d25Put.iv.toFixed(2)),
      delta10CallIv: Number(d10Call.iv.toFixed(2)),
      delta10PutIv: Number(d10Put.iv.toFixed(2)),
      callSkew,
      putSkew,
      flySpread,
      termStructure: [
        { expiry: 'Current Weekly', daysToExpiry: 3, atmIv: Number(atmIv.toFixed(2)), status: 'CONTANGO' },
        { expiry: 'Next Weekly', daysToExpiry: 10, atmIv: Number((atmIv + 0.6).toFixed(2)), status: 'CONTANGO' },
        { expiry: 'Monthly Expiry', daysToExpiry: 24, atmIv: Number((atmIv + 1.2).toFixed(2)), status: 'CONTANGO' }
      ],
      ivRank,
      ivPercentile,
      regime,
      surfaceSkewAnomaly: putSkew > 4.5 || callSkew < -1.5,
      termStructureInverted,
      expectedMove1D,
      expectedMoveExpiry
    };
  }
}

export const ivSurfaceEngine = new IvSurfaceEngine();
