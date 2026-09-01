/**
 * AI Narration & Interpretation Layer ("Algo First, AI Second")
 * Uses server-side @google/genai (gemini-3.6-flash) with tool-calling
 * to explain pre-calculated option metrics without computing numbers directly.
 */

import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { globalMarketFeed } from '../engine/marketFeed.js';
import { globalBasketEngine } from '../engine/basketEngine.js';
import { calculateOrderAndBasketMargin } from '../engine/marginEngine.js';
import { AiNarrationResponse } from '../../types.js';

let aiInstance: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY environment variable is missing.');
    }
    aiInstance = new GoogleGenAI({
      apiKey: apiKey || 'dummy-key',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiInstance;
}

// Function Declarations for Gemini Tool Calling
const getOptionChainMetricsDecl: FunctionDeclaration = {
  name: 'getOptionChainMetrics',
  description: 'Fetches deterministic option chain metrics including Spot price, Max Pain, PCR, IV Rank, and Total OI for a given symbol.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: 'Underlying symbol e.g. NIFTY, BANKNIFTY, RELIANCE, TCS' }
    },
    required: ['symbol']
  }
};

const getUnusualOIAnomaliesDecl: FunctionDeclaration = {
  name: 'getUnusualOIAnomalies',
  description: 'Fetches statistically significant unusual Open Interest z-score anomalies (>2.0σ) for a symbol.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: 'Underlying symbol e.g. NIFTY' }
    },
    required: ['symbol']
  }
};

const getEventReactiveStateDecl: FunctionDeclaration = {
  name: 'getEventReactiveState',
  description: 'Fetches shock status, fast-poll mode, PE/CE IV skew divergence, and institutional bias for a symbol.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: 'Underlying symbol e.g. NIFTY' }
    },
    required: ['symbol']
  }
};

export async function generateAiNarration(
  symbol: string = 'NIFTY',
  userPrompt?: string
): Promise<AiNarrationResponse> {
  // Always fetch pre-computed deterministic metrics first
  const snapshot = globalMarketFeed.getSnapshot(symbol);
  const anomalies = globalMarketFeed.getAnomalies(symbol);
  const reactiveState = globalMarketFeed.getEventReactiveState(symbol);

  const partialInfo = snapshot.isPartialData ? ` [NOTE: Partial data mode - ${snapshot.unavailableStrikeCount} option contract fields unavailable]` : '';

  const fallbackResponse: AiNarrationResponse = {
    summary: `${symbol} is trading at ${snapshot.spotPrice} (${snapshot.underlyingPChange > 0 ? '+' : ''}${snapshot.underlyingPChange}%). Max Pain is established at ${snapshot.maxPainStrike}, with Put-Call Ratio (OI) at ${snapshot.pcrOI}.${partialInfo}`,
    marketStructure: snapshot.pcrOI > 1.2 
      ? `Bullish market structure supported by aggressive Put writing (PCR: ${snapshot.pcrOI}). Major support built at Max Pain ${snapshot.maxPainStrike}.${partialInfo}`
      : (snapshot.pcrOI < 0.8 
        ? `Bearish tilt with Call writing dominance (PCR: ${snapshot.pcrOI}). Resistance capping spot near ${snapshot.maxPainStrike}.${partialInfo}`
        : `Balanced/Consolidation structure with PCR at ${snapshot.pcrOI}.${partialInfo}`),
    greeksAssessment: `IV Rank is at ${snapshot.ivRank}th percentile (India VIX: ${snapshot.indiaVix}). Theta decay acceleration is active for ${snapshot.selectedExpiry} expiry.`,
    actionableInsights: [
      `Max Pain strike at ${snapshot.maxPainStrike} provides key intraday anchor level.`,
      `IV Rank of ${snapshot.ivRank}% favours ${snapshot.ivRank > 50 ? 'Option Selling / Credit Spreads' : 'Option Buying / Debit Spreads'}.`,
      snapshot.isPartialData ? `Data warning: ${snapshot.unavailableStrikeCount} contract fields are unavailable; metrics calculated on partial data.` : (anomalies.length > 0 
        ? `Institutional activity detected: ${anomalies[0].description}`
        : 'OI distribution indicates steady institutional positioning without outlier spikes.')
    ],
    keyRiskLevels: {
      support: Math.round(snapshot.spotPrice * 0.985),
      resistance: Math.round(snapshot.spotPrice * 1.015),
      maxPain: snapshot.maxPainStrike
    }
  };

  if (!process.env.GEMINI_API_KEY) {
    return fallbackResponse;
  }

  try {
    const ai = getAiClient();
    const systemPrompt = `You are an elite quantitative option analyst and institutional risk manager. 
Explain pre-calculated deterministic option engine metrics for ${symbol}. 
CRITICAL RULE: Never calculate financial numbers yourself. Rely strictly on tools or provided pre-calculated metrics.
If snapshot indicated partial data (${snapshot.isPartialData}), acknowledge that some contracts/fields were unavailable.
Return your narrative structured clearly.`;

    const contextData = {
      snapshot: {
        symbol: snapshot.symbol,
        spotPrice: snapshot.spotPrice,
        maxPainStrike: snapshot.maxPainStrike,
        pcrOI: snapshot.pcrOI,
        ivRank: snapshot.ivRank,
        indiaVix: snapshot.indiaVix,
        underlyingPChange: snapshot.underlyingPChange,
        selectedExpiry: snapshot.selectedExpiry,
        isPartialData: snapshot.isPartialData,
        unavailableStrikeCount: snapshot.unavailableStrikeCount
      },
      anomalies: anomalies.map(a => ({ strikePrice: a.strikePrice, type: a.type, description: a.description, zScore: a.zScore })),
      eventReactiveState: {
        isFastPollActive: reactiveState.isFastPollActive,
        lastShockMagnitude: reactiveState.lastShockMagnitude,
        institutionalBias: reactiveState.institutionalBias,
        peCeSkewDivergence: reactiveState.peCeSkewDivergence
      }
    };

    const promptText = userPrompt 
      ? `${userPrompt}\n\nPre-calculated Market Data: ${JSON.stringify(contextData)}`
      : `Provide institutional market narration and greeks analysis for ${symbol}.\n\nPre-calculated Market Data: ${JSON.stringify(contextData)}${partialInfo}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: promptText,
      config: {
        systemInstruction: systemPrompt,
        tools: [{
          functionDeclarations: [getOptionChainMetricsDecl, getUnusualOIAnomaliesDecl, getEventReactiveStateDecl]
        }],
        temperature: 0.3
      }
    });

    let finalAiText = response.text || '';

    // Check if AI requested function execution
    if (response.functionCalls && response.functionCalls.length > 0) {
      const modelContent = response.candidates?.[0]?.content;
      const functionResponseParts: any[] = [];

      for (const call of response.functionCalls) {
        const fnName = call.name;
        const fnArgs = (call.args || {}) as any;
        let fnResult: any = null;

        if (fnName === 'getOptionChainMetrics') {
          fnResult = globalMarketFeed.getSnapshot(fnArgs.symbol || symbol);
        } else if (fnName === 'getUnusualOIAnomalies') {
          fnResult = globalMarketFeed.getAnomalies(fnArgs.symbol || symbol);
        } else if (fnName === 'getEventReactiveState') {
          fnResult = globalMarketFeed.getEventReactiveState(fnArgs.symbol || symbol);
        }

        functionResponseParts.push({
          functionResponse: { name: fnName, response: { result: fnResult } }
        });
      }

      if (modelContent && functionResponseParts.length > 0) {
        const secondResponse = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: [
            { role: 'user', parts: [{ text: promptText }] },
            modelContent,
            { role: 'user', parts: functionResponseParts }
          ],
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.3
          }
        });

        finalAiText = secondResponse.text || finalAiText;
      }
    }

    if (finalAiText && finalAiText.length > 20) {
      const paragraphs = finalAiText.split('\n\n').map(p => p.trim()).filter(Boolean);
      const summaryText = paragraphs[0] || finalAiText;
      const marketStructText = paragraphs.length > 1 ? paragraphs.slice(1).join('\n\n') : fallbackResponse.marketStructure;

      return {
        ...fallbackResponse,
        summary: summaryText,
        marketStructure: marketStructText
      };
    }
  } catch (err) {
    console.error('Error generating AI narration with Gemini API:', err);
  }

  return fallbackResponse;
}
