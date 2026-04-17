'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import {
  Activity, TrendingUp, TrendingDown, Zap, Shield, Brain, Target,
  Clock, AlertTriangle, BarChart3, ArrowUpCircle, ArrowDownCircle,
  Wifi, WifiOff, RefreshCw, ChevronDown, ChevronUp, Trophy, Skull,
  MessageSquare, ExternalLink, Flame
} from 'lucide-react';

interface BotStatus {
  timestamp: string;
  _stale: boolean;
  _age_seconds: number;
  bot: {
    mode: string;
    uptime_hours: number;
    is_revenge_active: boolean;
    consecutive_losses: number;
    kill_switch_active: boolean;
    cooldown_until: string | null;
  };
  market: {
    price: number;
    volume_24h: number;
    trend: string;
    regime: string;
    regime_confidence: number;
    regime_profile: string;
    volatility: string;
    atr_ratio: number;
  };
  l2: {
    obi: string;
    obi_ratio: number;
    taker_buy_pct: number;
    taker_signal: string;
    flow_toxicity: number;
    liquidation_cascade: boolean;
  };
  active_trade: {
    trade_id: string;
    side: string;
    entry_price: number;
    sl: number;
    tp: number;
    sl_current: number;
    leverage: number;
    size: number;
    profile: string;
    opened_at: string;
  } | null;
  stats: {
    today: PeriodStats;
    week: PeriodStats;
    month: PeriodStats;
    all_time: PeriodStats;
  };
  recent_trades: TradeEntry[];
  rankings: {
    best: RankEntry[];
    worst: RankEntry[];
  };
  bot_chats: {
    cognitive_id: string | null;
    operative_id: string | null;
    active_count: number;
  };
  memory: Record<string, any>;
}

interface PeriodStats {
  total: number;
  wins: number;
  losses: number;
  be: number;
  pnl: number;
  win_rate: number;
  avg_pnl: number;
  max_win: number;
  max_loss: number;
}

interface TradeEntry {
  trade_id: string;
  side: string;
  entry: number;
  exit: number;
  pnl: number;
  pnl_pct: number;
  duration: number;
  reason: string;
  leverage: number;
  profile: string;
  timestamp: string;
}

interface RankEntry {
  trade_id: string;
  side: string;
  pnl: number;
  entry: number;
  exit: number;
  timestamp: string;
}

// ── Utility Components ──────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = 'text-foreground', pulse = false }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string; pulse?: boolean;
}) {
  return (
    <div className="relative flex flex-col gap-1 p-3 rounded-xl bg-card/50 border border-border/40 backdrop-blur-sm overflow-hidden group hover:border-purple-500/30 transition-all duration-300">
      {pulse && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/60">{sub}</div>}
    </div>
  );
}

function PnlBadge({ pnl }: { pnl: number }) {
  const isPositive = pnl >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-xs font-semibold ${
      isPositive ? 'text-emerald-400' : 'text-red-400'
    }`}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isPositive ? '+' : ''}${pnl.toFixed(2)}
    </span>
  );
}

function ModeBadge({ mode, revenge, killSwitch }: { mode: string; revenge: boolean; killSwitch: boolean }) {
  if (killSwitch) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse">
      <AlertTriangle className="w-3.5 h-3.5" /> KILL SWITCH
    </span>
  );
  if (revenge) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
      <Flame className="w-3.5 h-3.5" /> REVENGE HUNT
    </span>
  );
  
  const config: Record<string, { bg: string; text: string; icon: any }> = {
    'HUNTING': { bg: 'bg-purple-500/15 border-purple-500/30', text: 'text-purple-400', icon: Target },
    'ACTIVE_TRADE': { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-400', icon: Activity },
    'WAITING_FILL': { bg: 'bg-blue-500/15 border-blue-500/30', text: 'text-blue-400', icon: Clock },
    'COOLDOWN': { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-400', icon: Shield },
    'OFFLINE': { bg: 'bg-zinc-500/15 border-zinc-500/30', text: 'text-zinc-400', icon: WifiOff },
  };
  
  const c = config[mode] || config['OFFLINE'];
  const IconComp = c.icon;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text} border`}>
      <IconComp className="w-3.5 h-3.5" /> {mode}
    </span>
  );
}

function RegimeBadge({ regime }: { regime: string }) {
  const colors: Record<string, string> = {
    'TRENDING': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    'RANGING': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'HIGH_VOL': 'bg-red-500/15 text-red-400 border-red-500/30',
    'LOW_LIQ': 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    'BREAKOUT': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${colors[regime] || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'}`}>
      {regime || 'N/A'}
    </span>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────

export function TradingDashboard({ onOpenChat }: { onOpenChat?: (chatId: string) => void }) {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<'today' | 'week' | 'month' | 'all_time'>('today');
  const [showAllTrades, setShowAllTrades] = useState(false);
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bot-status`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    fetchStatus();
    refreshTimer.current = setInterval(fetchStatus, 5000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchStatus]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
        <span className="text-sm text-muted-foreground">Conectando con Centinela V7...</span>
      </div>
    </div>
  );

  const s = status;
  const bot = s?.bot;
  const market = s?.market;
  const l2 = s?.l2;
  const currentStats = s?.stats?.[statsPeriod];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-gradient-to-r from-purple-500/5 to-transparent shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <BarChart3 className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground/90">Centinela Quant V7</h2>
              <span className="text-[10px] text-muted-foreground/60">Trading Dashboard</span>
            </div>
          </div>
          {bot && <ModeBadge mode={bot.mode} revenge={bot.is_revenge_active} killSwitch={bot.kill_switch_active} />}
        </div>
        <div className="flex items-center gap-2">
          {s?._stale ? (
            <span className="text-[10px] text-amber-400 flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> Stale ({s._age_seconds}s)
            </span>
          ) : (
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              <Wifi className="w-3 h-3" /> Live
            </span>
          )}
          <button onClick={fetchStatus} className="p-1 rounded hover:bg-muted/30 transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-4">
        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard
            icon={Activity}
            label="Modo"
            value={bot?.mode || 'OFFLINE'}
            sub={bot ? `Uptime: ${bot.uptime_hours}h` : undefined}
            color={bot?.mode === 'ACTIVE_TRADE' ? 'text-emerald-400' : bot?.mode === 'HUNTING' ? 'text-purple-400' : 'text-foreground'}
            pulse={bot?.mode === 'ACTIVE_TRADE'}
          />
          <StatCard
            icon={TrendingUp}
            label={`PnL ${statsPeriod === 'today' ? 'Hoy' : statsPeriod === 'week' ? 'Semana' : statsPeriod === 'month' ? 'Mes' : 'Total'}`}
            value={`$${currentStats?.pnl?.toFixed(2) || '0.00'}`}
            sub={`${currentStats?.wins || 0}W / ${currentStats?.losses || 0}L`}
            color={(currentStats?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          <StatCard
            icon={Target}
            label="Win Rate"
            value={`${currentStats?.win_rate?.toFixed(1) || '0'}%`}
            sub={`${currentStats?.total || 0} trades`}
            color={(currentStats?.win_rate || 0) >= 60 ? 'text-emerald-400' : (currentStats?.win_rate || 0) >= 40 ? 'text-amber-400' : 'text-red-400'}
          />
          <StatCard
            icon={Zap}
            label="Régimen"
            value={market?.regime || 'N/A'}
            sub={`${market?.regime_profile || '?'} | ATR: ${market?.atr_ratio?.toFixed(2) || '?'}`}
            color="text-cyan-400"
          />
        </div>

        {/* ── Period Selector ── */}
        <div className="flex items-center gap-1">
          {(['today', 'week', 'month', 'all_time'] as const).map(p => (
            <button
              key={p}
              onClick={() => setStatsPeriod(p)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                statsPeriod === p
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-muted-foreground hover:bg-muted/30 border border-transparent'
              }`}
            >
              {p === 'today' ? 'Hoy' : p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Total'}
            </button>
          ))}
        </div>

        {/* ── Active Trade Banner ── */}
        {s?.active_trade && (
          <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="text-sm font-semibold text-emerald-400">Trade Activo</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  s.active_trade.side === 'long' || s.active_trade.side === 'buy'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {s.active_trade.side?.toUpperCase()}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">{s.active_trade.trade_id}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">Entry:</span> <span className="font-mono text-foreground">${s.active_trade.entry_price}</span></div>
              <div><span className="text-muted-foreground">SL:</span> <span className="font-mono text-red-400">${s.active_trade.sl_current}</span></div>
              <div><span className="text-muted-foreground">TP:</span> <span className="font-mono text-emerald-400">${s.active_trade.tp}</span></div>
              <div><span className="text-muted-foreground">Lev:</span> <span className="font-mono text-foreground">{s.active_trade.leverage}x</span></div>
            </div>
          </div>
        )}

        {/* ── Market + L2 Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Market Panel */}
          <div className="p-3 rounded-xl bg-card/30 border border-border/30 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground/70">
              <BarChart3 className="w-3.5 h-3.5 text-purple-400" /> Mercado
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Precio</span>
                <span className="font-mono font-semibold text-foreground">${market?.price?.toFixed(2) || '—'}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Tendencia</span>
                <span className={`font-semibold ${market?.trend === 'LONG' || market?.trend === 'ALCISTA' ? 'text-emerald-400' : market?.trend === 'SHORT' || market?.trend === 'BAJISTA' ? 'text-red-400' : 'text-amber-400'}`}>
                  {market?.trend || '—'}
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Régimen</span>
                <RegimeBadge regime={market?.regime || ''} />
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Volatilidad</span>
                <span className="text-foreground/80">{market?.volatility || '—'}</span>
              </div>
            </div>
          </div>

          {/* L2 Panel */}
          <div className="p-3 rounded-xl bg-card/30 border border-border/30 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground/70">
              <Zap className="w-3.5 h-3.5 text-cyan-400" /> Telemetría L2
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">OBI</span>
                <span className={`font-semibold ${l2?.obi === 'BULLISH_PRESSURE' ? 'text-emerald-400' : l2?.obi === 'BEARISH_PRESSURE' ? 'text-red-400' : 'text-zinc-400'}`}>
                  {l2?.obi || '—'}
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Taker Buy</span>
                <span className="font-mono text-foreground">{l2?.taker_buy_pct?.toFixed(1) || '—'}%</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Flow Toxicity</span>
                <span className={`font-mono ${(l2?.flow_toxicity || 0) > 50 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {l2?.flow_toxicity?.toFixed(1) || '—'}%
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Cascade</span>
                <span className={l2?.liquidation_cascade ? 'text-red-400 font-bold' : 'text-zinc-400'}>
                  {l2?.liquidation_cascade ? '⚠️ ACTIVE' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Rankings: Best & Worst ── */}
        {(s?.rankings?.best?.length || s?.rankings?.worst?.length) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Best Trades */}
            <div className="p-3 rounded-xl bg-card/30 border border-border/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400/80">
                <Trophy className="w-3.5 h-3.5" /> Mejores Trades
              </div>
              {s?.rankings?.best?.map((t, i) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">{t.trade_id} <span className={t.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.side?.toUpperCase()}</span></span>
                  <PnlBadge pnl={t.pnl} />
                </div>
              ))}
            </div>
            {/* Worst Trades */}
            <div className="p-3 rounded-xl bg-card/30 border border-border/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-red-400/80">
                <Skull className="w-3.5 h-3.5" /> Peores Trades
              </div>
              {s?.rankings?.worst?.map((t, i) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">{t.trade_id} <span className={t.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.side?.toUpperCase()}</span></span>
                  <PnlBadge pnl={t.pnl} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* ── Trade History Table ── */}
        <div className="rounded-xl bg-card/30 border border-border/30 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground/70">
              <BarChart3 className="w-3.5 h-3.5 text-purple-400" /> Historial de Trades
            </div>
            <button
              onClick={() => setShowAllTrades(v => !v)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAllTrades ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showAllTrades ? 'Colapsar' : 'Ver todos'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-muted-foreground/60 border-b border-border/10">
                  <th className="text-left px-3 py-1.5 font-medium">ID</th>
                  <th className="text-left px-2 py-1.5 font-medium">Side</th>
                  <th className="text-right px-2 py-1.5 font-medium">Entry</th>
                  <th className="text-right px-2 py-1.5 font-medium">Exit</th>
                  <th className="text-right px-2 py-1.5 font-medium">PnL</th>
                  <th className="text-right px-2 py-1.5 font-medium hidden sm:table-cell">Dur.</th>
                  <th className="text-left px-2 py-1.5 font-medium hidden sm:table-cell">Razón</th>
                </tr>
              </thead>
              <tbody>
                {(showAllTrades ? s?.recent_trades : s?.recent_trades?.slice(0, 5))?.map((t, i) => (
                  <tr key={i} className="border-b border-border/5 hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{t.trade_id}</td>
                    <td className="px-2 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        t.side === 'long' || t.side === 'buy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        {t.side?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-foreground/80">${t.entry?.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-foreground/80">${t.exit?.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right"><PnlBadge pnl={t.pnl} /></td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground hidden sm:table-cell">{t.duration}m</td>
                    <td className="px-2 py-1.5 text-muted-foreground/70 truncate max-w-[120px] hidden sm:table-cell">{t.reason}</td>
                  </tr>
                ))}
                {(!s?.recent_trades || s.recent_trades.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground/50">
                      Sin trades registrados aún
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Bot Chats ── */}
        {s?.bot_chats && (s.bot_chats.cognitive_id || s.bot_chats.operative_id) && (
          <div className="p-3 rounded-xl bg-card/30 border border-border/30 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground/70">
              <MessageSquare className="w-3.5 h-3.5 text-purple-400" /> Chats Activos del Bot
            </div>
            <div className="flex flex-wrap gap-2">
              {s.bot_chats.cognitive_id && (
                <button
                  onClick={() => onOpenChat?.(s.bot_chats.cognitive_id!)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 hover:bg-purple-500/20 transition-colors"
                >
                  <Brain className="w-3.5 h-3.5" /> Chat Cognitivo
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </button>
              )}
              {s.bot_chats.operative_id && (
                <button
                  onClick={() => onOpenChat?.(s.bot_chats.operative_id!)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 hover:bg-cyan-500/20 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" /> Chat Operativo
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Memory Status ── */}
        {s?.memory && Object.keys(s.memory).length > 0 && (
          <div className="p-3 rounded-xl bg-card/30 border border-border/30 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground/70">
              <Brain className="w-3.5 h-3.5 text-pink-400" /> Mem0 Status
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="text-muted-foreground">Modo:</span>{' '}
                <span className={`font-semibold ${s.memory.mem0_connected ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {s.memory.mode || '?'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Local:</span>{' '}
                <span className="font-mono text-foreground">{s.memory.local_memories || 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Categorías:</span>{' '}
                <span className={`font-semibold ${s.memory.categories_configured ? 'text-emerald-400' : 'text-zinc-400'}`}>
                  {s.memory.categories_configured ? '✓' : '—'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Versión:</span>{' '}
                <span className="text-foreground">{s.memory.version || '?'}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="text-center text-[10px] text-muted-foreground/40 py-2">
          Centinela Quant V7 — Dashboard actualizado cada 5s
          {s?.timestamp && ` — Último: ${new Date(s.timestamp).toLocaleTimeString()}`}
        </div>
      </div>
    </div>
  );
}
