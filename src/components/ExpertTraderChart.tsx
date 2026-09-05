/**
 * Expert Trader Pro Candlestick & Technical Indicator Terminal
 * High-performance interactive financial charting engine for NIFTY, BANK NIFTY & SENSEX.
 * Features:
 * - 23 EMA & 50 EMA Dynamic Trend Cloud
 * - Multi-timeframe switching (1m, 3m, 5m, 15m, 1h, 1d)
 * - Flexible Time-Range Selector: Days (1D, 2D, 3D, 4D, 5D, 6D), Periods (1W, 1M, 3M, 6M, 1Y, ALL), and Custom Date Range
 * - Multiple chart styles (Japanese Candlesticks, Heikin-Ashi, Hollow, Area Mountain)
 * - Intraday VWAP, Bollinger Bands (20, 2), Classic Pivot Points (CPR)
 * - Volume Histogram & RSI (14) Oscillator Sub-Panels
 * - Pixel-perfect Interactive Crosshair, Magnetic Indicator Snap, Price Badges, and Laser Price Line
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  RefreshCw,
  Activity,
  Sliders,
  Calendar,
  Clock,
  Zap,
  Info,
  ChevronDown,
  Check,
  X
} from 'lucide-react';
import { Ema15mCandle, Ema15mInstrument, Ema15mSignal } from '../types.js';

interface ExpertTraderChartProps {
  symbol: Ema15mInstrument;
  candles: Ema15mCandle[];
  signals?: Ema15mSignal[];
  currentPrice: number;
  timeframe?: string;
  onTimeframeChange?: (tf: string) => void;
  onRefreshData?: () => Promise<void>;
  isLoading?: boolean;
  selectedRange?: string;
  onRangeChange?: (range: string) => void;
  customStartDate?: string;
  customEndDate?: string;
  onCustomDateChange?: (start: string, end: string) => void;
  isMarketOpen?: boolean;
}

export type ChartStyle = 'CANDLESTICK' | 'HEIKIN_ASHI' | 'HOLLOW' | 'AREA';

// Helper to format volume compactly
const formatVolNumber = (num?: number): string => {
  if (!num || num === 0) return '0';
  if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `${(num / 100000).toFixed(1)} L`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

export const ExpertTraderChart: React.FC<ExpertTraderChartProps> = ({
  symbol,
  candles,
  signals = [],
  currentPrice,
  timeframe = '15m',
  onTimeframeChange,
  onRefreshData,
  isLoading = false,
  selectedRange = '5D',
  onRangeChange,
  customStartDate = '',
  customEndDate = '',
  onCustomDateChange,
  isMarketOpen = true
}) => {
  // Chart Display Options
  const [chartStyle, setChartStyle] = useState<ChartStyle>('CANDLESTICK');
  const [showEmaCloud, setShowEmaCloud] = useState<boolean>(true);
  const [showVwap, setShowVwap] = useState<boolean>(true);
  const [showBollinger, setShowBollinger] = useState<boolean>(false);
  const [showPivots, setShowPivots] = useState<boolean>(false);
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [showRsi, setShowRsi] = useState<boolean>(true);
  const [showSignals, setShowSignals] = useState<boolean>(true);
  const [showCrosshair, setShowCrosshair] = useState<boolean>(true);

  // Pan and Zoom state
  const [visibleCount, setVisibleCount] = useState<number>(150);
  const [panOffset, setPanOffset] = useState<number>(0); // 0 = latest candles
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragStartPan, setDragStartPan] = useState<number>(0);

  // Synchronize visibleCount to display all candles returned for the requested range
  useEffect(() => {
    if (candles && candles.length > 0) {
      setVisibleCount(candles.length);
      setPanOffset(0);
    }
  }, [candles.length, selectedRange, customStartDate, customEndDate]);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Custom Date Picker Modal state
  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false);
  const [tempStartDate, setTempStartDate] = useState<string>(customStartDate);
  const [tempEndDate, setTempEndDate] = useState<string>(customEndDate);

  // Hover & Crosshair position
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Syncing state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Candle close countdown timer (IST 15m / custom slot calculation)
  const [countdownStr, setCountdownStr] = useState<string>('--:--');

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const mins = now.getMinutes();
      const secs = now.getSeconds();

      const tfMinutes = timeframe === '1m' ? 1 : timeframe === '3m' ? 3 : timeframe === '5m' ? 5 : timeframe === '1h' ? 60 : 15;
      const passedInSlot = (mins % tfMinutes) * 60 + secs;
      const totalSlotSecs = tfMinutes * 60;
      const remainingSecs = Math.max(0, totalSlotSecs - passedInSlot);

      const rMins = Math.floor(remainingSecs / 60);
      const rSecs = remainingSecs % 60;
      setCountdownStr(`${String(rMins).padStart(2, '0')}:${String(rSecs).padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [timeframe]);

  // Convert raw candles to Heikin-Ashi if selected and ensure complete continuous indicator coverage
  const displayCandles = useMemo(() => {
    if (candles.length === 0) return [];

    // Ensure all technical indicators (EMA 23, EMA 50, Bollinger, RSI, Signals) have complete coverage
    const enriched = candles.map(c => ({ ...c }));
    let needsEnrichment = false;
    for (const c of enriched) {
      if (c.ema23 === undefined || c.ema50 === undefined || c.bbUpper === undefined || c.rsi14 === undefined) {
        needsEnrichment = true;
        break;
      }
    }

    if (needsEnrichment) {
      let e23 = enriched[0].close;
      let e50 = enriched[0].close;
      for (let i = 0; i < enriched.length; i++) {
        const cl = enriched[i].close;
        if (i === 0) {
          e23 = cl;
          e50 = cl;
        } else {
          const k23 = i < 23 ? 2 / (i + 2) : 2 / 24;
          const k50 = i < 50 ? 2 / (i + 2) : 2 / 51;
          e23 = (cl - e23) * k23 + e23;
          e50 = (cl - e50) * k50 + e50;
        }
        if (enriched[i].ema23 === undefined) enriched[i].ema23 = Number(e23.toFixed(2));
        if (enriched[i].ema50 === undefined) enriched[i].ema50 = Number(e50.toFixed(2));
        if (enriched[i].emaDifference === undefined) enriched[i].emaDifference = Number((e23 - e50).toFixed(2));
      }

      // Bollinger Bands fallback
      for (let i = 0; i < enriched.length; i++) {
        if (enriched[i].bbUpper === undefined) {
          const w = Math.min(i + 1, 20);
          const sl = enriched.slice(Math.max(0, i - w + 1), i + 1);
          const m = sl.reduce((a, b) => a + b.close, 0) / w;
          const v = sl.reduce((a, b) => a + Math.pow(b.close - m, 2), 0) / w;
          const s = Math.sqrt(v) || m * 0.002;
          enriched[i].bbMiddle = Number(m.toFixed(2));
          enriched[i].bbUpper = Number((m + 2 * s).toFixed(2));
          enriched[i].bbLower = Number((m - 2 * s).toFixed(2));
        }
      }

      // RSI fallback
      let sG = 0;
      let sL = 0;
      for (let i = 0; i < enriched.length; i++) {
        if (enriched[i].rsi14 === undefined) {
          if (i === 0) {
            enriched[i].rsi14 = 50;
            continue;
          }
          const ch = enriched[i].close - enriched[i - 1].close;
          sG += ch > 0 ? ch : 0;
          sL += ch < 0 ? -ch : 0;
          const r = sL === 0 ? 100 : (sG / i) / (sL / i);
          enriched[i].rsi14 = Number((100 - 100 / (1 + r)).toFixed(2));
        }
      }

      // Signal Crossovers fallback
      for (let i = 1; i < enriched.length; i++) {
        if (!enriched[i].signal || enriched[i].signal === 'NONE') {
          const p = enriched[i - 1];
          const c = enriched[i];
          if (p.ema23 !== undefined && p.ema50 !== undefined && c.ema23 !== undefined && c.ema50 !== undefined) {
            if (p.ema23 < p.ema50 && c.ema23 >= c.ema50) {
              c.signal = 'BULLISH';
            } else if (p.ema23 > p.ema50 && c.ema23 <= c.ema50) {
              c.signal = 'BEARISH';
            }
          }
        }
      }
    }

    if (chartStyle !== 'HEIKIN_ASHI') return enriched;

    const haCandles: Ema15mCandle[] = [];
    for (let i = 0; i < enriched.length; i++) {
      const c = enriched[i];
      if (i === 0) {
        haCandles.push({
          ...c,
          open: Number(((c.open + c.close) / 2).toFixed(2)),
          close: Number(((c.open + c.high + c.low + c.close) / 4).toFixed(2)),
          high: c.high,
          low: c.low
        });
      } else {
        const prevHa = haCandles[i - 1];
        const haClose = Number(((c.open + c.high + c.low + c.close) / 4).toFixed(2));
        const haOpen = Number(((prevHa.open + prevHa.close) / 2).toFixed(2));
        const haHigh = Number(Math.max(c.high, haOpen, haClose).toFixed(2));
        const haLow = Number(Math.min(c.low, haOpen, haClose).toFixed(2));

        haCandles.push({
          ...c,
          open: haOpen,
          high: haHigh,
          low: haLow,
          close: haClose
        });
      }
    }
    return haCandles;
  }, [candles, chartStyle]);

  // Calculate slice based on visibleCount and panOffset
  const slicedCandles = useMemo(() => {
    if (displayCandles.length === 0) return [];
    const count = Math.min(displayCandles.length, visibleCount);
    const endIndex = displayCandles.length - panOffset;
    const startIndex = Math.max(0, endIndex - count);
    return displayCandles.slice(startIndex, endIndex);
  }, [displayCandles, visibleCount, panOffset]);

  // Hovered candle reference for HUD
  const activeHoverCandle = useMemo(() => {
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < slicedCandles.length) {
      return slicedCandles[hoverIndex];
    }
    return slicedCandles[slicedCandles.length - 1] || null;
  }, [hoverIndex, slicedCandles]);

  // Layout Constants
  const containerWidth = 1100;
  const mainHeight = 360;
  const volumeHeight = showVolume ? 70 : 0;
  const rsiHeight = showRsi ? 90 : 0;
  const totalSvgHeight = mainHeight + volumeHeight + rsiHeight + 35; // +35 for bottom X-axis
  const padding = { top: 25, right: 85, bottom: 25, left: 15 };
  const plotWidth = containerWidth - padding.left - padding.right;

  // Pre-calculate SVG coordinates and technical indicator paths
  const geometry = useMemo(() => {
    if (slicedCandles.length === 0) {
      return null;
    }

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 1000;

    slicedCandles.forEach(c => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.ema23 && c.ema23 < minPrice) minPrice = c.ema23;
      if (c.ema23 && c.ema23 > maxPrice) maxPrice = c.ema23;
      if (c.ema50 && c.ema50 < minPrice) minPrice = c.ema50;
      if (c.ema50 && c.ema50 > maxPrice) maxPrice = c.ema50;
      if (showVwap && c.vwap) {
        if (c.vwap < minPrice) minPrice = c.vwap;
        if (c.vwap > maxPrice) maxPrice = c.vwap;
      }
      if (showBollinger) {
        if (c.bbLower && c.bbLower < minPrice) minPrice = c.bbLower;
        if (c.bbUpper && c.bbUpper > maxPrice) maxPrice = c.bbUpper;
      }
      if (c.volume && c.volume > maxVolume) maxVolume = c.volume;
    });

    if (currentPrice > 0) {
      if (currentPrice < minPrice) minPrice = currentPrice;
      if (currentPrice > maxPrice) maxPrice = currentPrice;
    }

    // Safety margins (0.4% padding)
    const priceRange = maxPrice - minPrice || 50;
    const paddedMin = minPrice - priceRange * 0.05;
    const paddedMax = maxPrice + priceRange * 0.05;

    const candleCount = slicedCandles.length;
    const candleWidth = Math.max(3, Math.min(22, (plotWidth / candleCount) * 0.7));
    const slotStep = plotWidth / Math.max(1, candleCount);

    const getX = (index: number) => padding.left + (index + 0.5) * slotStep;
    const getY = (price: number) => {
      const ratio = (price - paddedMin) / (paddedMax - paddedMin || 1);
      return padding.top + (mainHeight - padding.top - padding.bottom) * (1 - ratio);
    };

    const getVolumeY = (vol: number) => {
      const volRatio = Math.min(1, Math.max(0.04, vol / (maxVolume || 1)));
      const volPlotTop = mainHeight + 8;
      const volPlotHeight = volumeHeight - 16;
      return volPlotTop + volPlotHeight * (1 - volRatio);
    };

    const getRsiY = (rsiVal: number) => {
      const rsiPlotTop = mainHeight + volumeHeight;
      const rsiPlotHeight = rsiHeight - 15;
      const ratio = Math.max(0, Math.min(100, rsiVal)) / 100;
      return rsiPlotTop + rsiPlotHeight * (1 - ratio);
    };

    // Volume 20 SMA Path
    let volMaPath = '';
    const volMaPeriod = 20;
    slicedCandles.forEach((c, idx) => {
      const start = Math.max(0, idx - volMaPeriod + 1);
      const subset = slicedCandles.slice(start, idx + 1);
      const avgVol = subset.reduce((acc, curr) => acc + (curr.volume || 0), 0) / subset.length;
      const x = getX(idx);
      const y = getVolumeY(avgVol);
      volMaPath += volMaPath === '' ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });

    // Volume Axis Ticks
    const volTicks = [
      { label: maxVolume >= 1000 ? `${Math.round(maxVolume / 1000)}K` : `${Math.round(maxVolume)}`, y: getVolumeY(maxVolume) },
      { label: maxVolume >= 2000 ? `${Math.round(maxVolume / 2000)}K` : `${Math.round(maxVolume / 2)}`, y: getVolumeY(maxVolume / 2) }
    ];

    // EMA Paths & Ribbon Cloud Fill
    let ema23Path = '';
    let ema50Path = '';
    let vwapPath = '';
    let bbUpperPath = '';
    let bbLowerPath = '';
    let ribbonBullPath = '';

    const validEmaPoints: { x: number; y23: number; y50: number; isBull: boolean }[] = [];

    slicedCandles.forEach((c, idx) => {
      const x = getX(idx);
      if (c.ema23 !== undefined) {
        const y23 = getY(c.ema23);
        ema23Path += ema23Path === '' ? `M ${x} ${y23}` : ` L ${x} ${y23}`;
      }
      if (c.ema50 !== undefined) {
        const y50 = getY(c.ema50);
        ema50Path += ema50Path === '' ? `M ${x} ${y50}` : ` L ${x} ${y50}`;
      }
      if (c.vwap !== undefined && showVwap) {
        const yV = getY(c.vwap);
        const prev = idx > 0 ? slicedCandles[idx - 1] : null;
        const isNewDay = prev && c.timestamp.split('T')[0] !== prev.timestamp.split('T')[0];
        vwapPath += (vwapPath === '' || isNewDay) ? ` M ${x} ${yV}` : ` L ${x} ${yV}`;
      }
      if (showBollinger && c.bbUpper && c.bbLower) {
        const yU = getY(c.bbUpper);
        const yL = getY(c.bbLower);
        bbUpperPath += bbUpperPath === '' ? `M ${x} ${yU}` : ` L ${x} ${yU}`;
        bbLowerPath += bbLowerPath === '' ? `M ${x} ${yL}` : ` L ${x} ${yL}`;
      }

      if (c.ema23 !== undefined && c.ema50 !== undefined) {
        validEmaPoints.push({
          x,
          y23: getY(c.ema23),
          y50: getY(c.ema50),
          isBull: c.ema23 >= c.ema50
        });
      }
    });

    // Construct polygon ribbon cloud between EMA 23 & EMA 50
    if (validEmaPoints.length >= 2) {
      let forward = '';
      let backward = '';
      for (let i = 0; i < validEmaPoints.length; i++) {
        forward += (i === 0 ? 'M ' : ' L ') + `${validEmaPoints[i].x} ${validEmaPoints[i].y23}`;
      }
      for (let i = validEmaPoints.length - 1; i >= 0; i--) {
        backward += ` L ${validEmaPoints[i].x} ${validEmaPoints[i].y50}`;
      }
      ribbonBullPath = forward + backward + ' Z';
    }

    // RSI Path
    let rsiPath = '';
    if (showRsi) {
      slicedCandles.forEach((c, idx) => {
        if (c.rsi14 !== undefined) {
          const x = getX(idx);
          const y = getRsiY(c.rsi14);
          rsiPath += rsiPath === '' ? `M ${x} ${y}` : ` L ${x} ${y}`;
        }
      });
    }

    // Price Horizontal Grid Lines (5 clean ticks)
    const priceTicks: { price: number; y: number }[] = [];
    const tickCount = 5;
    const step = (paddedMax - paddedMin) / tickCount;
    for (let i = 0; i <= tickCount; i++) {
      const p = paddedMin + i * step;
      priceTicks.push({
        price: Math.round(p),
        y: getY(p)
      });
    }

    // Classic Central Pivot Range (CPR) & Daily Pivot Points calculation
    let pivotLevels: { label: string; price: number; y: number; color: string }[] = [];
    if (showPivots && (slicedCandles.length > 0 || candles.length > 0)) {
      const activeCandle = slicedCandles[slicedCandles.length - 1] || candles[candles.length - 1];
      let P = activeCandle?.cprP;
      let BC = activeCandle?.cprBC;
      let TC = activeCandle?.cprTC;
      let R1 = activeCandle?.cprR1;
      let S1 = activeCandle?.cprS1;
      let R2 = activeCandle?.cprR2;
      let S2 = activeCandle?.cprS2;

      // Fallback calculation if candle doesn't have precalculated CPR
      if (P === undefined) {
        const sourceCandles = candles.length >= 5 ? candles : slicedCandles;
        const distinctDates = Array.from(new Set(sourceCandles.map(c => c.timestamp.split('T')[0]))).sort();
        let prevDayCandles: Ema15mCandle[] = [];

        if (distinctDates.length >= 2) {
          const prevDate = distinctDates[distinctDates.length - 2];
          prevDayCandles = sourceCandles.filter(c => c.timestamp.split('T')[0] === prevDate);
        } else {
          prevDayCandles = sourceCandles.slice(0, Math.max(1, Math.floor(sourceCandles.length / 2)));
        }

        if (prevDayCandles.length > 0) {
          const pH = Math.max(...prevDayCandles.map(c => c.high));
          const pL = Math.min(...prevDayCandles.map(c => c.low));
          const pC = prevDayCandles[prevDayCandles.length - 1].close;

          P = Number(((pH + pL + pC) / 3).toFixed(2));
          BC = Number(((pH + pL) / 2).toFixed(2));
          TC = Number(((P - BC) + P).toFixed(2));
          R1 = Number((2 * P - pL).toFixed(2));
          S1 = Number((2 * P - pH).toFixed(2));
          R2 = Number((P + (pH - pL)).toFixed(2));
          S2 = Number((P - (pH - pL)).toFixed(2));
        }
      }

      if (P !== undefined && BC !== undefined && TC !== undefined && R1 !== undefined && S1 !== undefined && R2 !== undefined && S2 !== undefined) {
        const allLevels = [
          { label: 'R2', price: Number(R2.toFixed(1)), y: getY(R2), color: '#ef4444' },
          { label: 'R1', price: Number(R1.toFixed(1)), y: getY(R1), color: '#f87171' },
          { label: 'TC', price: Number(TC.toFixed(1)), y: getY(TC), color: '#0284c7' },
          { label: 'CPR (P)', price: Number(P.toFixed(1)), y: getY(P), color: '#38bdf8' },
          { label: 'BC', price: Number(BC.toFixed(1)), y: getY(BC), color: '#0284c7' },
          { label: 'S1', price: Number(S1.toFixed(1)), y: getY(S1), color: '#4ade80' },
          { label: 'S2', price: Number(S2.toFixed(1)), y: getY(S2), color: '#22c55e' }
        ];
        // Only include levels whose y is inside the main chart area
        pivotLevels = allLevels.filter(lvl => lvl.y >= padding.top - 5 && lvl.y <= mainHeight - padding.bottom + 5);
      }
    }

    return {
      minPrice: paddedMin,
      maxPrice: paddedMax,
      maxVolume,
      candleWidth,
      slotStep,
      getX,
      getY,
      getVolumeY,
      getRsiY,
      ema23Path,
      ema50Path,
      vwapPath,
      bbUpperPath,
      bbLowerPath,
      ribbonBullPath,
      rsiPath,
      volMaPath,
      volTicks,
      priceTicks,
      pivotLevels
    };
  }, [slicedCandles, currentPrice, mainHeight, volumeHeight, rsiHeight, plotWidth, padding, showVwap, showBollinger, showRsi, showPivots]);

  // Handle Mouse Dragging & Precise Pixel Mapping
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartPan(panOffset);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !geometry) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // Convert mouse client coordinates to SVG viewBox coordinate system
    const scaleX = containerWidth / rect.width;
    const scaleY = totalSvgHeight / rect.height;
    const x = Math.max(0, Math.min(containerWidth, (e.clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(totalSvgHeight, (e.clientY - rect.top) * scaleY));

    setMousePos({ x, y });

    // Precise candle index lookup
    if (x >= padding.left && x <= containerWidth - padding.right && geometry.slotStep > 0) {
      const idx = Math.floor((x - padding.left) / geometry.slotStep);
      if (idx >= 0 && idx < slicedCandles.length) {
        setHoverIndex(idx);
      } else {
        setHoverIndex(null);
      }
    } else {
      setHoverIndex(null);
    }

    if (isDragging) {
      const deltaX = (e.clientX - dragStartX) * scaleX;
      const candleShift = Math.round(deltaX / geometry.slotStep);
      const maxPan = Math.max(0, displayCandles.length - visibleCount);
      const newPan = Math.max(0, Math.min(maxPan, dragStartPan + candleShift));
      setPanOffset(newPan);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoverIndex(null);
    setMousePos(null);
  };

  // Mouse Wheel Zoom: scroll up = zoom in, scroll down = zoom out
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      // Zoom In
      setVisibleCount(prev => Math.max(15, Math.round(prev * 0.85)));
    } else if (e.deltaY > 0) {
      // Zoom Out
      setVisibleCount(prev => Math.min(displayCandles.length, Math.round(prev * 1.18)));
    }
  };

  // Zoom In / Out Handlers
  const handleZoomIn = () => {
    setVisibleCount(prev => Math.max(15, Math.round(prev * 0.75)));
  };

  const handleZoomOut = () => {
    setVisibleCount(prev => Math.min(displayCandles.length, Math.round(prev * 1.35)));
  };

  const handleResetZoom = () => {
    setVisibleCount(displayCandles.length || 150);
    setPanOffset(0);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!chartContainerRef.current) return;
    if (!isFullscreen) {
      if (chartContainerRef.current.requestFullscreen) {
        chartContainerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  // Force Sync Market Data
  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/ema15m/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      if (res.ok && onRefreshData) {
        await onRefreshData();
      }
    } catch (err) {
      console.error('Failed to sync market data:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Preset Time Ranges
  const RANGE_OPTIONS = [
    { label: '1D', value: '1D', desc: 'Today (1 Day)' },
    { label: '2D', value: '2D', desc: 'Last 2 Days' },
    { label: '3D', value: '3D', desc: 'Last 3 Days' },
    { label: '4D', value: '4D', desc: 'Last 4 Days' },
    { label: '5D', value: '5D', desc: 'Last 5 Days (Default)' },
    { label: '6D', value: '6D', desc: 'Last 6 Days' },
    { label: '1W', value: '1W', desc: '1 Week' },
    { label: '1M', value: '1M', desc: '1 Month' },
    { label: '3M', value: '3M', desc: '3 Months' },
    { label: '6M', value: '6M', desc: '6 Months' },
    { label: '1Y', value: '1Y', desc: '1 Year' },
    { label: 'ALL', value: 'ALL', desc: 'All Historical Records' }
  ];

  // Helper date formatter - strictly formatted in Indian Standard Time (IST)
  const formatIstTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '--:--';
    }
  };

  const formatIstDate = (isoString?: string) => {
    if (!isoString) return '--';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' });
    } catch {
      return '--';
    }
  };

  return (
    <div
      ref={chartContainerRef}
      className={`bg-slate-950 border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
      }`}
    >
      {/* 1. TOP TOOLBAR & CONTROLS STRIP */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 gap-3">
        {/* Left: Symbol, Real-time Price, Trend, Countdown */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-black text-slate-100 tracking-wider bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
              {symbol}
            </span>

            <div className="text-sm font-mono font-bold text-slate-200">
              ₹{currentPrice > 0 ? currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '--'}
            </div>

            {/* Market Status Tag */}
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono border ${
                isMarketOpen
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {isMarketOpen ? '● LIVE' : '● MARKET CLOSED'}
            </span>

            {/* Candle Countdown Timer */}
            <div
              className="flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-slate-950/90 px-2 py-0.5 rounded border border-slate-800"
              title="Time until current candle slot closes"
            >
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>Next Close:</span>
              <strong className="text-cyan-300">{countdownStr}</strong>
            </div>
          </div>

          {/* Multi-Timeframe Selector */}
          <div className="flex items-center bg-slate-950/90 rounded-lg p-0.5 border border-slate-800">
            {(['1m', '3m', '5m', '15m', '1h', '1d'] as const).map(tf => {
              const isSelected = timeframe.toLowerCase() === tf;
              const isCoreStrategy = tf === '15m';
              return (
                <button
                  key={tf}
                  id={`tf-btn-${tf}`}
                  onClick={() => onTimeframeChange?.(tf)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {tf.toUpperCase()}
                  {isCoreStrategy && <span className="ml-1 text-[9px] text-amber-400 font-bold">★</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Chart Style, Indicator Toggles, Sync, Fullscreen */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Chart Style Selector */}
          <div className="flex items-center bg-slate-950/90 rounded-lg p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setChartStyle('CANDLESTICK')}
              className={`px-2 py-1 rounded ${chartStyle === 'CANDLESTICK' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400'}`}
              title="Standard Japanese Candlesticks"
            >
              Candles
            </button>
            <button
              onClick={() => setChartStyle('HEIKIN_ASHI')}
              className={`px-2 py-1 rounded ${chartStyle === 'HEIKIN_ASHI' ? 'bg-slate-800 text-cyan-400 font-semibold' : 'text-slate-400'}`}
              title="Smoothed Heikin-Ashi Candles"
            >
              Heikin-Ashi
            </button>
            <button
              onClick={() => setChartStyle('HOLLOW')}
              className={`px-2 py-1 rounded ${chartStyle === 'HOLLOW' ? 'bg-slate-800 text-amber-400 font-semibold' : 'text-slate-400'}`}
              title="Hollow Candlesticks"
            >
              Hollow
            </button>
            <button
              onClick={() => setChartStyle('AREA')}
              className={`px-2 py-1 rounded ${chartStyle === 'AREA' ? 'bg-slate-800 text-blue-400 font-semibold' : 'text-slate-400'}`}
              title="Area Mountain Line"
            >
              Area
            </button>
          </div>

          {/* Sync Real Market Feed Button */}
          <button
            id="sync-real-market-btn"
            onClick={handleForceSync}
            disabled={isSyncing || isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-emerald-950/50 border border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60 transition-all disabled:opacity-50"
            title="Fetch live market candles from exchange"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing || isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync Exchange</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
            title={isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. SECONDARY INDICATOR TOGGLE STRIP */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950 border-b border-slate-900 text-xs overflow-x-auto gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Sliders className="w-3 h-3 text-slate-400" /> Overlays:
          </span>

          {/* EMA Cloud Toggle */}
          <button
            onClick={() => setShowEmaCloud(v => !v)}
            className={`px-2 py-0.5 rounded flex items-center gap-1.5 transition-all ${
              showEmaCloud ? 'bg-cyan-950/80 border border-cyan-700/70 text-cyan-300 font-semibold' : 'bg-slate-900 text-slate-400'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            23/50 EMA Ribbon
          </button>

          {/* VWAP Toggle */}
          <button
            onClick={() => setShowVwap(v => !v)}
            className={`px-2 py-0.5 rounded flex items-center gap-1.5 transition-all ${
              showVwap ? 'bg-amber-950/80 border border-amber-700/70 text-amber-300 font-semibold' : 'bg-slate-900 text-slate-400'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            VWAP
          </button>

          {/* Bollinger Bands Toggle */}
          <button
            onClick={() => setShowBollinger(v => !v)}
            className={`px-2 py-0.5 rounded flex items-center gap-1.5 transition-all ${
              showBollinger ? 'bg-blue-950/80 border border-blue-700/70 text-blue-300 font-semibold' : 'bg-slate-900 text-slate-400'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            Bollinger (20,2)
          </button>

          {/* Classic Pivots Toggle */}
          <button
            onClick={() => setShowPivots(v => !v)}
            className={`px-2 py-0.5 rounded flex items-center gap-1.5 transition-all ${
              showPivots ? 'bg-purple-950/80 border border-purple-700/70 text-purple-300 font-semibold' : 'bg-slate-900 text-slate-400'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            CPR Pivots
          </button>

          {/* Volume Sub-chart Toggle */}
          <button
            onClick={() => setShowVolume(v => !v)}
            className={`px-2 py-0.5 rounded flex items-center gap-1.5 transition-all ${
              showVolume ? 'bg-slate-800 border border-slate-700 text-slate-200 font-semibold' : 'bg-slate-900 text-slate-400'
            }`}
          >
            Volume
          </button>

          {/* RSI (14) Sub-chart Toggle */}
          <button
            onClick={() => setShowRsi(v => !v)}
            className={`px-2 py-0.5 rounded flex items-center gap-1.5 transition-all ${
              showRsi ? 'bg-violet-950/80 border border-violet-700/70 text-violet-300 font-semibold' : 'bg-slate-900 text-slate-400'
            }`}
          >
            RSI (14)
          </button>

          {/* Signals Toggle */}
          <button
            onClick={() => setShowSignals(v => !v)}
            className={`px-2 py-0.5 rounded flex items-center gap-1.5 transition-all ${
              showSignals ? 'bg-emerald-950/80 border border-emerald-700/70 text-emerald-300 font-semibold' : 'bg-slate-900 text-slate-400'
            }`}
          >
            Crossover Signals
          </button>
        </div>

        {/* Zoom & Pan Navigation Controls */}
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={handleZoomIn}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            title="Reset View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. DYNAMIC PRECISION HUD METRIC BAR */}
      <div className="px-4 py-2 bg-slate-950/90 border-b border-slate-900 text-[11px] font-mono flex items-center justify-between gap-4 overflow-x-auto">
        {activeHoverCandle ? (
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-slate-400">
              TIME: <strong className="text-slate-200">{formatIstDate(activeHoverCandle.timestamp)} {formatIstTime(activeHoverCandle.timestamp)}</strong>
            </span>
            <span className="text-slate-400">
              O: <strong className="text-slate-200">₹{activeHoverCandle.open.toFixed(2)}</strong>
            </span>
            <span className="text-slate-400">
              H: <strong className="text-slate-200">₹{activeHoverCandle.high.toFixed(2)}</strong>
            </span>
            <span className="text-slate-400">
              L: <strong className="text-slate-200">₹{activeHoverCandle.low.toFixed(2)}</strong>
            </span>
            <span className="text-slate-400">
              C: <strong className={activeHoverCandle.close >= activeHoverCandle.open ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                ₹{activeHoverCandle.close.toFixed(2)}
              </strong>
            </span>

            {/* 23 & 50 EMA */}
            {activeHoverCandle.ema23 !== undefined && (
              <span className="text-cyan-400 flex items-center gap-1 font-semibold">
                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                EMA 23: ₹{activeHoverCandle.ema23.toFixed(2)}
              </span>
            )}
            {activeHoverCandle.ema50 !== undefined && (
              <span className="text-amber-400 flex items-center gap-1 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                EMA 50: ₹{activeHoverCandle.ema50.toFixed(2)}
              </span>
            )}

            {/* Difference */}
            {activeHoverCandle.ema23 !== undefined && activeHoverCandle.ema50 !== undefined && (
              <span className={activeHoverCandle.ema23 >= activeHoverCandle.ema50 ? 'text-emerald-400' : 'text-rose-400'}>
                DIFF: {activeHoverCandle.ema23 >= activeHoverCandle.ema50 ? '+' : ''}{(activeHoverCandle.ema23 - activeHoverCandle.ema50).toFixed(2)}
              </span>
            )}

            {/* VWAP */}
            {showVwap && activeHoverCandle.vwap !== undefined && (
              <span className="text-yellow-400">
                VWAP: ₹{activeHoverCandle.vwap.toFixed(2)}
              </span>
            )}

            {/* Bollinger Bands */}
            {showBollinger && activeHoverCandle.bbUpper !== undefined && activeHoverCandle.bbLower !== undefined && (
              <span className="text-blue-400">
                BB: ₹{activeHoverCandle.bbUpper.toFixed(1)} / ₹{activeHoverCandle.bbLower.toFixed(1)}
              </span>
            )}

            {/* CPR Pivots */}
            {showPivots && activeHoverCandle.cprP !== undefined && (
              <span className="text-purple-300">
                CPR: ₹{activeHoverCandle.cprP.toFixed(1)} [R1: ₹{activeHoverCandle.cprR1?.toFixed(1)} S1: ₹{activeHoverCandle.cprS1?.toFixed(1)}]
              </span>
            )}

            {/* RSI */}
            {showRsi && activeHoverCandle.rsi14 !== undefined && (
              <span className="text-violet-400">
                RSI (14): {activeHoverCandle.rsi14.toFixed(1)}
              </span>
            )}

            {/* Volume */}
            <span className="text-slate-400">
              VOL: <strong className="text-slate-200">{formatVolNumber(activeHoverCandle.volume)}</strong>
            </span>
          </div>
        ) : (
          <div className="text-slate-500 italic">Hover over chart candles for instant microstructure metrics</div>
        )}
      </div>

      {/* 4. MAIN SVG CHART CANVAS */}
      <div
        onWheel={handleWheel}
        className={`relative select-none bg-slate-950 overflow-hidden ${
          isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
        }`}
      >
        {geometry && slicedCandles.length > 0 ? (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${containerWidth} ${totalSvgHeight}`}
            className="w-full h-auto block"
            style={{ minHeight: '440px', maxHeight: '580px' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              {/* Main Price Chart Clip Boundary to prevent spillover */}
              <clipPath id="mainPriceClip">
                <rect
                  x={padding.left}
                  y={padding.top}
                  width={plotWidth}
                  height={mainHeight - padding.top - padding.bottom}
                />
              </clipPath>

              {/* EMA Ribbon Shading Gradient */}
              <linearGradient id="bullRibbonGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.10" />
              </linearGradient>

              {/* Area Mountain Chart Gradient */}
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#0369a1" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* GRID BACKGROUND */}
            <g className="grid-lines" opacity="0.35">
              {/* Day Boundary Vertical Delimiter Lines */}
              {slicedCandles.map((c, idx) => {
                if (idx === 0) return null;
                const prev = slicedCandles[idx - 1];
                const isDayBoundary = c.timestamp.split('T')[0] !== prev.timestamp.split('T')[0];
                if (!isDayBoundary) return null;
                const x = geometry.getX(idx) - geometry.slotStep / 2;
                return (
                  <g key={`day-boundary-${idx}`}>
                    <line
                      x1={x}
                      y1={padding.top}
                      x2={x}
                      y2={mainHeight + volumeHeight + rsiHeight}
                      stroke="#475569"
                      strokeWidth="1.2"
                      strokeDasharray="4 3"
                      opacity="0.75"
                    />
                  </g>
                );
              })}

              {/* Horizontal Price Grid Lines */}
              {geometry.priceTicks.map((tick, i) => (
                <g key={`ptick-${i}`}>
                  <line
                    x1={padding.left}
                    y1={tick.y}
                    x2={containerWidth - padding.right}
                    y2={tick.y}
                    stroke="#334155"
                    strokeDasharray="3 3"
                    strokeWidth="0.8"
                  />
                  {/* Right Axis Price Label */}
                  <text
                    x={containerWidth - padding.right + 6}
                    y={tick.y + 3.5}
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="500"
                  >
                    ₹{tick.price.toLocaleString()}
                  </text>
                </g>
              ))}

              {/* Volume Separator */}
              {showVolume && (
                <line
                  x1={padding.left}
                  y1={mainHeight}
                  x2={containerWidth - padding.right}
                  y2={mainHeight}
                  stroke="#475569"
                  strokeWidth="1"
                />
              )}

              {/* RSI Separator */}
              {showRsi && (
                <line
                  x1={padding.left}
                  y1={mainHeight + volumeHeight}
                  x2={containerWidth - padding.right}
                  y2={mainHeight + volumeHeight}
                  stroke="#475569"
                  strokeWidth="1"
                />
              )}
            </g>

            {/* MAIN PRICE SERIES (CLIPPED TO MAIN CHART PLOT AREA) */}
            <g id="main-price-series" clipPath="url(#mainPriceClip)">
            {/* CLASSIC PIVOT POINT LEVELS */}
            {showPivots &&
              geometry.pivotLevels.map((p, i) => (
                <g key={`pivot-${i}`} opacity="0.6">
                  <line
                    x1={padding.left}
                    y1={p.y}
                    x2={containerWidth - padding.right}
                    y2={p.y}
                    stroke={p.color}
                    strokeWidth="1"
                    strokeDasharray="2 4"
                  />
                  <text
                    x={padding.left + 5}
                    y={p.y - 3}
                    fill={p.color}
                    fontSize="9"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {p.label} (₹{p.price})
                  </text>
                </g>
              ))}

            {/* Bollinger Bands Envelope Shading */}
            {showBollinger && geometry.bbUpperPath && geometry.bbLowerPath && (
              <g opacity="0.15">
                <path d={geometry.bbUpperPath} stroke="#60a5fa" strokeWidth="1" fill="none" />
                <path d={geometry.bbLowerPath} stroke="#60a5fa" strokeWidth="1" fill="none" />
              </g>
            )}

            {/* 23/50 EMA Ribbon Cloud */}
            {showEmaCloud && geometry.ribbonBullPath && (
              <path d={geometry.ribbonBullPath} fill="url(#bullRibbonGradient)" opacity="0.9" />
            )}

            {/* AREA CHART MODE */}
            {chartStyle === 'AREA' && (
              <path
                d={
                  slicedCandles.reduce((acc, c, idx) => {
                    const x = geometry.getX(idx);
                    const y = geometry.getY(c.close);
                    return acc === '' ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                  }, '') +
                  ` L ${geometry.getX(slicedCandles.length - 1)} ${mainHeight - padding.bottom} L ${geometry.getX(0)} ${mainHeight - padding.bottom} Z`
                }
                fill="url(#areaGradient)"
                stroke="#3b82f6"
                strokeWidth="2"
              />
            )}

            {/* CANDLESTICK / HEIKIN-ASHI / HOLLOW RENDERING */}
            {chartStyle !== 'AREA' &&
              slicedCandles.map((c, idx) => {
                const x = geometry.getX(idx);
                const openY = geometry.getY(c.open);
                const closeY = geometry.getY(c.close);
                const highY = geometry.getY(c.high);
                const lowY = geometry.getY(c.low);

                const isBull = c.close >= c.open;
                const candleColor = isBull ? '#089981' : '#f23645'; // Pro TradingView Emerald / Ruby

                const bodyTop = Math.min(openY, closeY);
                const bodyHeight = Math.max(1.5, Math.abs(openY - closeY));
                const halfWidth = geometry.candleWidth / 2;

                return (
                  <g key={`candle-${idx}`} opacity={hoverIndex !== null && hoverIndex !== idx ? 0.75 : 1}>
                    {/* Upper & Lower Wick */}
                    <line
                      x1={x}
                      y1={highY}
                      x2={x}
                      y2={lowY}
                      stroke={candleColor}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />

                    {/* Candle Real Body */}
                    {chartStyle === 'HOLLOW' && isBull ? (
                      <rect
                        x={x - halfWidth}
                        y={bodyTop}
                        width={geometry.candleWidth}
                        height={bodyHeight}
                        fill="#030712"
                        stroke={candleColor}
                        strokeWidth="1.5"
                        rx="1"
                      />
                    ) : (
                      <rect
                        x={x - halfWidth}
                        y={bodyTop}
                        width={geometry.candleWidth}
                        height={bodyHeight}
                        fill={candleColor}
                        stroke={candleColor}
                        strokeWidth="1"
                        rx="1"
                      />
                    )}
                  </g>
                );
              })}

            {/* 23 EMA LINE (Fast Cyan) */}
            {showEmaCloud && geometry.ema23Path && (
              <path
                d={geometry.ema23Path}
                fill="none"
                stroke="#00e5ff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* 50 EMA LINE (Slow Amber Orange) */}
            {showEmaCloud && geometry.ema50Path && (
              <path
                d={geometry.ema50Path}
                fill="none"
                stroke="#ff9800"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* INTRADAY VWAP LINE (Gold Dash) */}
            {showVwap && geometry.vwapPath && (
              <path
                d={geometry.vwapPath}
                fill="none"
                stroke="#ffd600"
                strokeWidth="1.8"
                strokeDasharray="4 3"
                strokeLinecap="round"
              />
            )}

            {/* CROSSOVER SIGNAL MARKERS ON CHART */}
            {showSignals &&
              slicedCandles.map((c, idx) => {
                let sigType = c.signal;
                if (!sigType || sigType === 'NONE') {
                  const matchingSig = signals.find(s => s.instrument === symbol && s.candleTimestamp === c.timestamp && s.signalType !== 'NONE');
                  if (matchingSig) {
                    sigType = matchingSig.signalType;
                  }
                }
                if (!sigType || sigType === 'NONE') return null;
                const x = geometry.getX(idx);
                const isBull = sigType === 'BULLISH';
                const y = isBull
                  ? Math.min(mainHeight - padding.bottom - 12, geometry.getY(c.low) + 18)
                  : Math.max(padding.top + 12, geometry.getY(c.high) - 18);

                return (
                  <g key={`sig-marker-${idx}`} className="cursor-pointer">
                    <title>{`${sigType} Crossover @ ₹${c.close} (${formatIstDate(c.timestamp)} ${formatIstTime(c.timestamp)})`}</title>
                    <circle
                      cx={x}
                      cy={y}
                      r="9"
                      fill={isBull ? '#059669' : '#dc2626'}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <text
                      x={x}
                      y={y + 3.5}
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {isBull ? '▲' : '▼'}
                    </text>
                  </g>
                );
              })}

            {/* LIVE LASER PRICE LINE ACROSS CANVAS */}
            {currentPrice > 0 && (
              <line
                x1={padding.left}
                y1={geometry.getY(currentPrice)}
                x2={containerWidth - padding.right}
                y2={geometry.getY(currentPrice)}
                stroke="#38bdf8"
                strokeWidth="1.2"
                strokeDasharray="4 3"
                opacity="0.85"
              />
            )}
            </g>

            {/* Live Price Tag on Right Axis (outside clip) */}
            {currentPrice > 0 && (
              <g>
                <rect
                  x={containerWidth - padding.right + 2}
                  y={geometry.getY(currentPrice) - 9}
                  width="78"
                  height="18"
                  fill="#0284c7"
                  rx="3"
                />
                <text
                  x={containerWidth - padding.right + 6}
                  y={geometry.getY(currentPrice) + 3.5}
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  ₹{currentPrice.toFixed(1)}
                </text>
              </g>
            )}

            {/* VOLUME HISTOGRAM SUB-PANEL */}
            {showVolume && (
              <g className="volume-histogram">
                {/* Volume Reference Grid Lines & Axis Scale */}
                {geometry.volTicks?.map((tick, tIdx) => (
                  <g key={`vol-tick-${tIdx}`}>
                    <line
                      x1={padding.left}
                      y1={tick.y}
                      x2={containerWidth - padding.right}
                      y2={tick.y}
                      stroke="#1e293b"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={containerWidth - padding.right + 5}
                      y={tick.y + 3}
                      fill="#64748b"
                      fontSize="9"
                      fontFamily="monospace"
                    >
                      {tick.label}
                    </text>
                  </g>
                ))}

                {/* Subpanel Header Tag */}
                <text
                  x={padding.left + 5}
                  y={mainHeight + 14}
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  VOL (20 SMA)
                </text>

                {/* Volume Bars */}
                {slicedCandles.map((c, idx) => {
                  const x = geometry.getX(idx);
                  const y = geometry.getVolumeY(c.volume || 100);
                  const h = mainHeight + volumeHeight - 6 - y;
                  const isBull = c.close >= c.open;
                  const barColor = isBull ? '#089981' : '#f23645';

                  return (
                    <rect
                      key={`vol-${idx}`}
                      x={x - geometry.candleWidth / 2}
                      y={y}
                      width={geometry.candleWidth}
                      height={Math.max(2, h)}
                      fill={barColor}
                      opacity={hoverIndex === idx ? '1' : '0.65'}
                      rx="0.5"
                    />
                  );
                })}

                {/* Volume 20 SMA Line (Amber Yellow) */}
                {geometry.volMaPath && (
                  <path
                    d={geometry.volMaPath}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.9"
                  />
                )}
              </g>
            )}

            {/* RSI (14) OSCILLATOR SUB-PANEL */}
            {showRsi && (
              <g className="rsi-oscillator">
                <text
                  x={padding.left + 5}
                  y={mainHeight + volumeHeight + 14}
                  fill="#a78bfa"
                  fontSize="9.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  RSI (14) OSCILLATOR
                </text>

                {/* 30-70 Envelope Shading */}
                <rect
                  x={padding.left}
                  y={geometry.getRsiY(70)}
                  width={plotWidth}
                  height={Math.max(0, geometry.getRsiY(30) - geometry.getRsiY(70))}
                  fill="#8b5cf6"
                  fillOpacity="0.06"
                />

                {/* Overbought (70) and Oversold (30) Reference Lines */}
                <line
                  x1={padding.left}
                  y1={geometry.getRsiY(70)}
                  x2={containerWidth - padding.right}
                  y2={geometry.getRsiY(70)}
                  stroke="#ef4444"
                  strokeDasharray="2 3"
                  strokeWidth="0.8"
                  opacity="0.6"
                />
                <text
                  x={containerWidth - padding.right + 6}
                  y={geometry.getRsiY(70) + 3}
                  fill="#ef4444"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  70 OB
                </text>

                {/* 50 Midline */}
                <line
                  x1={padding.left}
                  y1={geometry.getRsiY(50)}
                  x2={containerWidth - padding.right}
                  y2={geometry.getRsiY(50)}
                  stroke="#475569"
                  strokeDasharray="1 3"
                  strokeWidth="0.8"
                  opacity="0.4"
                />

                <line
                  x1={padding.left}
                  y1={geometry.getRsiY(30)}
                  x2={containerWidth - padding.right}
                  y2={geometry.getRsiY(30)}
                  stroke="#22c55e"
                  strokeDasharray="2 3"
                  strokeWidth="0.8"
                  opacity="0.6"
                />
                <text
                  x={containerWidth - padding.right + 6}
                  y={geometry.getRsiY(30) + 3}
                  fill="#22c55e"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  30 OS
                </text>

                {/* RSI Line */}
                {geometry.rsiPath && (
                  <path
                    d={geometry.rsiPath}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                )}
              </g>
            )}

            {/* X-AXIS TIMESTAMPS & DATES */}
            <g className="x-axis-labels">
              {/* Horizontal baseline */}
              <line
                x1={padding.left}
                y1={mainHeight + volumeHeight + rsiHeight}
                x2={containerWidth - padding.right}
                y2={mainHeight + volumeHeight + rsiHeight}
                stroke="#334155"
                strokeWidth="1"
              />

              {(() => {
                const totalCandles = slicedCandles.length;
                const approxStep = Math.max(1, Math.round(totalCandles / 8));
                let lastRenderedX = -999;

                return slicedCandles.map((c, idx) => {
                  const prev = slicedCandles[idx - 1];
                  const isDayBoundary = prev && c.timestamp.split('T')[0] !== prev.timestamp.split('T')[0];
                  const isRegularInterval = idx % approxStep === 0;

                  if (!isDayBoundary && !isRegularInterval && idx !== totalCandles - 1) return null;

                  const x = geometry.getX(idx);
                  if (x - lastRenderedX < 60 && !isDayBoundary) return null;
                  lastRenderedX = x;

                  const y = totalSvgHeight - 12;

                  return (
                    <g key={`x-time-${idx}`}>
                      <line
                        x1={x}
                        y1={mainHeight + volumeHeight + rsiHeight}
                        x2={x}
                        y2={mainHeight + volumeHeight + rsiHeight + 5}
                        stroke={isDayBoundary ? '#38bdf8' : '#475569'}
                        strokeWidth={isDayBoundary ? '1.5' : '1'}
                      />
                      <text
                        x={x}
                        y={y}
                        fill={isDayBoundary ? '#38bdf8' : '#94a3b8'}
                        fontSize="9.5"
                        fontFamily="monospace"
                        fontWeight={isDayBoundary ? '700' : '500'}
                        textAnchor="middle"
                      >
                        {isDayBoundary
                          ? `${formatIstDate(c.timestamp)} ${formatIstTime(c.timestamp)}`
                          : formatIstTime(c.timestamp)}
                      </text>
                    </g>
                  );
                });
              })()}
            </g>

            {/* INTERACTIVE CROSSHAIR & MAGNETIC INDICATOR TRACKERS */}
            {showCrosshair && mousePos && hoverIndex !== null && hoverIndex < slicedCandles.length && (
              <g pointerEvents="none">
                {/* 1. Vertical Cursor Line aligned exactly to candle slot */}
                <line
                  x1={geometry.getX(hoverIndex)}
                  y1={padding.top}
                  x2={geometry.getX(hoverIndex)}
                  y2={mainHeight + volumeHeight + rsiHeight}
                  stroke="#94a3b8"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  opacity="0.85"
                />

                {/* 2. Horizontal Cursor Line on Main Chart */}
                {mousePos.y >= padding.top && mousePos.y <= mainHeight && (
                  <g>
                    <line
                      x1={padding.left}
                      y1={mousePos.y}
                      x2={containerWidth - padding.right}
                      y2={mousePos.y}
                      stroke="#94a3b8"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                      opacity="0.85"
                    />
                    {/* Hover Price Badge on Right Y-Axis */}
                    {(() => {
                      const ratio = (mainHeight - padding.bottom - mousePos.y) / (mainHeight - padding.top - padding.bottom);
                      const priceAtMouse = geometry.minPrice + ratio * (geometry.maxPrice - geometry.minPrice);
                      return (
                        <g>
                          <rect
                            x={containerWidth - padding.right + 2}
                            y={mousePos.y - 9}
                            width="78"
                            height="18"
                            fill="#334155"
                            rx="3"
                          />
                          <text
                            x={containerWidth - padding.right + 6}
                            y={mousePos.y + 3.5}
                            fill="#ffffff"
                            fontSize="10"
                            fontWeight="bold"
                            fontFamily="monospace"
                          >
                            ₹{priceAtMouse.toFixed(1)}
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                )}

                {/* 3. Hover Time Badge on Bottom X-Axis */}
                <g>
                  <rect
                    x={geometry.getX(hoverIndex) - 48}
                    y={totalSvgHeight - 30}
                    width="96"
                    height="18"
                    fill="#334155"
                    rx="3"
                  />
                  <text
                    x={geometry.getX(hoverIndex)}
                    y={totalSvgHeight - 17}
                    fill="#ffffff"
                    fontSize="9.5"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {formatIstDate(slicedCandles[hoverIndex].timestamp)} {formatIstTime(slicedCandles[hoverIndex].timestamp)}
                  </text>
                </g>

                {/* 4. Magnetic Snapping Points on Active Indicators */}
                {/* Candle Close Point */}
                <circle
                  cx={geometry.getX(hoverIndex)}
                  cy={geometry.getY(slicedCandles[hoverIndex].close)}
                  r="4"
                  fill="#ffffff"
                  stroke="#38bdf8"
                  strokeWidth="2"
                />

                {/* 23 EMA Point */}
                {showEmaCloud && slicedCandles[hoverIndex].ema23 !== undefined && (
                  <circle
                    cx={geometry.getX(hoverIndex)}
                    cy={geometry.getY(slicedCandles[hoverIndex].ema23!)}
                    r="4"
                    fill="#06b6d4"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                )}

                {/* 50 EMA Point */}
                {showEmaCloud && slicedCandles[hoverIndex].ema50 !== undefined && (
                  <circle
                    cx={geometry.getX(hoverIndex)}
                    cy={geometry.getY(slicedCandles[hoverIndex].ema50!)}
                    r="4"
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                )}

                {/* VWAP Point */}
                {showVwap && slicedCandles[hoverIndex].vwap !== undefined && (
                  <circle
                    cx={geometry.getX(hoverIndex)}
                    cy={geometry.getY(slicedCandles[hoverIndex].vwap!)}
                    r="3.5"
                    fill="#eab308"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                )}

                {/* RSI Point */}
                {showRsi && slicedCandles[hoverIndex].rsi14 !== undefined && (
                  <circle
                    cx={geometry.getX(hoverIndex)}
                    cy={geometry.getRsiY(slicedCandles[hoverIndex].rsi14!)}
                    r="3.5"
                    fill="#a855f7"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            )}
          </svg>
        ) : (
          <div className="h-96 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Activity className="w-8 h-8 animate-pulse text-blue-400" />
            <p className="text-sm font-medium">Synchronizing Real-time Exchange Candlesticks...</p>
          </div>
        )}
      </div>

      {/* 5. PROFESSIONAL TIME-RANGE SELECTOR TOOLBAR (DAYS, WEEKS, MONTHS, YEARS, CUSTOM) */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-slate-900 border-t border-slate-800 gap-3">
        {/* Left: Range Selectors */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-mono text-slate-400 font-semibold mr-1 flex items-center gap-1">
            <Calendar className="w-3 h-3 text-cyan-400" /> Range:
          </span>

          {/* Days buttons: 1D, 2D, 3D, 4D, 5D, 6D */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            {['1D', '2D', '3D', '4D', '5D', '6D'].map(r => {
              const isSelected = selectedRange === r && !customStartDate;
              return (
                <button
                  key={r}
                  onClick={() => {
                    onRangeChange?.(r);
                    setPanOffset(0);
                  }}
                  className={`px-2.5 py-1 text-xs font-mono font-bold rounded transition-all ${
                    isSelected
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  title={`${r} Trading Sessions`}
                >
                  {r}
                </button>
              );
            })}
          </div>

          {/* Macro Periods: 1W, 1M, 3M, 6M, 1Y, ALL */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            {['1W', '1M', '3M', '6M', '1Y', 'ALL'].map(r => {
              const isSelected = selectedRange === r && !customStartDate;
              return (
                <button
                  key={r}
                  onClick={() => {
                    onRangeChange?.(r);
                    setPanOffset(0);
                  }}
                  className={`px-2.5 py-1 text-xs font-mono font-bold rounded transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>

          {/* Custom Date Range Button */}
          <button
            onClick={() => setIsDatePickerOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-bold rounded-lg border transition-all ${
              customStartDate && customEndDate
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/50'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>
              {customStartDate && customEndDate
                ? `${customStartDate} → ${customEndDate}`
                : 'Custom Dates...'}
            </span>
          </button>
        </div>

        {/* Right: Exchange feed badge & candle count */}
        <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
          <span>Candles: <strong className="text-slate-200">{slicedCandles.length}</strong></span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Authentic Exchange Feed
          </span>
        </div>
      </div>

      {/* 6. CUSTOM DATE RANGE PICKER MODAL */}
      {isDatePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100">Select Custom Date Range</h3>
              </div>
              <button
                onClick={() => setIsDatePickerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Start Date</label>
                <input
                  type="date"
                  value={tempStartDate}
                  onChange={e => setTempStartDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">End Date</label>
                <input
                  type="date"
                  value={tempEndDate}
                  onChange={e => setTempEndDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setTempStartDate('');
                  setTempEndDate('');
                  onCustomDateChange?.('', '');
                  setIsDatePickerOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                Clear / Reset
              </button>
              <button
                onClick={() => {
                  if (tempStartDate && tempEndDate) {
                    onCustomDateChange?.(tempStartDate, tempEndDate);
                    setIsDatePickerOpen(false);
                  }
                }}
                disabled={!tempStartDate || !tempEndDate}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Range</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
