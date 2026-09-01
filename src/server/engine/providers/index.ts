/**
 * Data Provider Factory and Global Instance Manager
 * Selected via DATA_PROVIDER env var ('practice' | 'upstox', default 'practice')
 */

import { IMarketDataProvider, DataProviderMode } from './types.js';
import { PracticeModeProvider } from './PracticeModeProvider.js';
import { UpstoxProvider } from './UpstoxProvider.js';

function createDataProvider(): IMarketDataProvider {
  const providerMode = (process.env.DATA_PROVIDER || '').toLowerCase().trim();
  const hasUpstoxToken = !!(process.env.UPSTOX_ACCESS_TOKEN || process.env.UPSTOX_TOKEN);

  // Live Upstox mode when requested or credentials available
  if (providerMode === 'upstox' || providerMode === 'live' || (hasUpstoxToken && providerMode !== 'practice')) {
    console.log('[PROVIDER FACTORY] Initializing LIVE Upstox API v2 Provider...');
    return new UpstoxProvider();
  }

  console.log('[PROVIDER FACTORY] Initializing Practice Engine (Calibrated NSE Spot + Black-Scholes Greek Surface)...');
  return new PracticeModeProvider();
}

export const activeProvider: IMarketDataProvider = createDataProvider();

export async function initActiveProvider() {
  const status = await activeProvider.connect();
  console.log(`[PROVIDER FACTORY] Data Provider Connected in [${status.mode}] mode:`, status.message);
  return status;
}

export * from './types.js';
