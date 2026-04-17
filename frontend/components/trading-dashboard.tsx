'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import {
  Activity, TrendingUp, TrendingDown, Zap, Shield, Brain, Target,
  Clock, AlertTriangle, BarChart3, ArrowUpCircle, ArrowDownCircle,
  Wifi, WifiOff, RefreshCw, ChevronDown, ChevronUp, Trophy, Skull,
  MessageSquare, ExternalLink, Flame, X, Eye, Hash, Bell
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

interface ChatPreview {
  id: string;
  label: string;
  stepCount: number;
  lastUpdate: string;
  status: string;
}

// ── Utility Components ──────────────────────────────────────────────

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
    'HIGH_VOLATILITY': 'bg-red-500/15 text-red-400 border-red-500/30',
    'LOW_LIQ': 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    'BREAKOUT': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${colors[regime] || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'}`}>
      {regime || 'N/A'}
    </span>
  );
}

// ── Modal Component ─────────────────────────────────────────────────

function DetailModal({ title, icon: Icon, onClose, children }: {
  title: string; icon: any; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-md mx-4 p-5 rounded-2xl bg-[#1a1a2e] border border-purple-500/30 shadow-2xl shadow-purple-500/10 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Icon className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/30 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── KPI Card (Clickable) ────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color = 'text-foreground', pulse = false, onClick }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string; pulse?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col gap-1 p-3 rounded-xl bg-card/50 border border-border/40 backdrop-blur-sm overflow-hidden group transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 hover:shadow-lg hover:shadow-purple-500/10 active:scale-[0.97]' : ''
      }`}
    >
      {pulse && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
      {onClick && <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Eye className="w-3 h-3 text-purple-400" />
      </div>}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/60">{sub}</div>}
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────

export function TradingDashboard({ onOpenChat }: { onOpenChat?: (chatId: string) => void }) {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<'today' | 'week' | 'month' | 'all_time'>('today');
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [chatPreviews, setChatPreviews] = useState<ChatPreview[]>([]);
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

  // Fetch chat previews from conversations API
  const fetchChatPreviews = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/conversations`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const summaries = data.trajectorySummaries || {};
      
      // Get bot chat IDs from status
      const botChatIds = [
        status?.bot_chats?.cognitive_id,
        status?.bot_chats?.operative_id,
      ].filter(Boolean) as string[];
      
      const previews: ChatPreview[] = botChatIds.map(id => {
        const summary = summaries[id];
        return {
          id,
          label: id === status?.bot_chats?.cognitive_id ? '🧠 Chat Cognitivo' : '⚡ Chat Operativo',
          stepCount: summary?.stepCount || 0,
          lastUpdate: summary?.lastStepTimestamp || '',
          status: summary?.cascadeStatus || 'unknown',
        };
      });
      
      setChatPreviews(previews);
    } catch { /* ignore */ }
  }, [status?.bot_chats?.cognitive_id, status?.bot_chats?.operative_id]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    fetchStatus();
    refreshTimer.current = setInterval(() => {
      fetchStatus();
      fetchChatPreviews();
    }, 5000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchStatus, fetchChatPreviews]);

  // Fetch chat previews when bot_chats change
  useEffect(() => {
    if (status?.bot_chats) fetchChatPreviews();
  }, [status?.bot_chats?.cognitive_id, status?.bot_chats?.operative_id, fetchChatPreviews]);

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
        {/* ── KPI Cards (Clickable) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KpiCard
            icon={Activity}
            label="Modo"
            value={bot?.mode || 'OFFLINE'}
            sub={bot ? `Uptime: ${bot.uptime_hours}h` : undefined}
            color={bot?.mode === 'ACTIVE_TRADE' ? 'text-emerald-400' : bot?.mode === 'HUNTING' ? 'text-purple-400' : 'text-foreground'}
            pulse={bot?.mode === 'ACTIVE_TRADE'}
            onClick={() => setActiveModal('mode')}
          />
          <KpiCard
            icon={TrendingUp}
            label={`PnL ${statsPeriod === 'today' ? 'Hoy' : statsPeriod === 'week' ? 'Semana' : statsPeriod === 'month' ? 'Mes' : 'Total'}`}
            value={`$${currentStats?.pnl?.toFixed(2) || '0.00'}`}
            sub={`${currentStats?.wins || 0}W / ${currentStats?.losses || 0}L`}
            color={(currentStats?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}
            onClick={() => setActiveModal('pnl')}
          />
          <KpiCard
            icon={Target}
            label="Win Rate"
            value={`${currentStats?.win_rate?.toFixed(1) || '0'}%`}
            sub={`${currentStats?.total || 0} trades`}
            color={(currentStats?.win_rate || 0) >= 60 ? 'text-emerald-400' : (currentStats?.win_rate || 0) >= 40 ? 'text-amber-400' : 'text-red-400'}
            onClick={() => setActiveModal('winrate')}
          />
          <KpiCard
            icon={Zap}
            label="Régimen"
            value={market?.regime || 'N/A'}
            sub={`${market?.regime_profile || '?'} | ATR: ${market?.atr_ratio?.toFixed(2) || '?'}`}
            color="text-cyan-400"
            onClick={() => setActiveModal('regime')}
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

        {/* ── Live Chat Preview (Bot's Active Chats) ── */}
        <div className="p-3 rounded-xl bg-card/30 border border-purple-500/20 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground/70">
            <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
            Chats Activos del Bot
            <span className="ml-auto text-[10px] text-muted-foreground/50">Auto-refresh 5s</span>
          </div>
          
          {chatPreviews.length > 0 ? (
            <div className="space-y-2">
              {chatPreviews.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => onOpenChat?.(chat.id)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-[#1a1a2e]/50 border border-border/20 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all group text-left"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    chat.id === status?.bot_chats?.cognitive_id
                      ? 'bg-purple-500/15 border border-purple-500/30'
                      : 'bg-cyan-500/15 border border-cyan-500/30'
                  }`}>
                    {chat.id === status?.bot_chats?.cognitive_id
                      ? <Brain className="w-4 h-4 text-purple-400" />
                      : <Zap className="w-4 h-4 text-cyan-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground/90 truncate">{chat.label}</span>
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60 font-mono shrink-0">
                        <Hash className="w-2.5 h-2.5" />{chat.id.substring(0, 8)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Activity className="w-2.5 h-2.5" />{chat.stepCount} steps
                      </span>
                      {chat.lastUpdate && (
                        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(chat.lastUpdate).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-purple-400 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            // Fallback: show chat buttons if API preview not available
            s?.bot_chats && (s.bot_chats.cognitive_id || s.bot_chats.operative_id) ? (
              <div className="space-y-2">
                {s.bot_chats.cognitive_id && (
                  <button
                    onClick={() => onOpenChat?.(s.bot_chats.cognitive_id!)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20 hover:bg-purple-500/10 hover:border-purple-500/40 transition-all group text-left"
                  >
                    <Brain className="w-5 h-5 text-purple-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-purple-300">🧠 Chat Cognitivo</span>
                      <div className="text-[10px] text-muted-foreground/60 font-mono truncate">{s.bot_chats.cognitive_id.substring(0, 16)}...</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-purple-400 transition-colors shrink-0" />
                  </button>
                )}
                {s.bot_chats.operative_id && (
                  <button
                    onClick={() => onOpenChat?.(s.bot_chats.operative_id!)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/20 hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-all group text-left"
                  >
                    <Zap className="w-5 h-5 text-cyan-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-cyan-300">⚡ Chat Operativo</span>
                      <div className="text-[10px] text-muted-foreground/60 font-mono truncate">{s.bot_chats.operative_id.substring(0, 16)}...</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-cyan-400 transition-colors shrink-0" />
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-3 text-[11px] text-muted-foreground/50">
                Sin chats activos vinculados
              </div>
            )
          )}
        </div>

        {/* ── Footer ── */}
        <div className="text-center text-[10px] text-muted-foreground/40 py-2">
          Centinela Quant V7 — Dashboard actualizado cada 5s
          {s?.timestamp && ` — Último: ${new Date(s.timestamp).toLocaleTimeString()}`}
        </div>
      </div>

      {/* ── MODALS ── */}
      
      {/* Mode Detail Modal */}
      {activeModal === 'mode' && (
        <DetailModal title="Detalle del Modo" icon={Activity} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <div className="flex items-center justify-center py-3">
              <ModeBadge mode={bot?.mode || 'OFFLINE'} revenge={bot?.is_revenge_active || false} killSwitch={bot?.kill_switch_active || false} />
            </div>
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between py-1.5 border-b border-border/10">
                <span className="text-muted-foreground">Modo Actual</span>
                <span className="font-semibold text-foreground">{bot?.mode || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/10">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-mono text-foreground">{bot?.uptime_hours || 0}h</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/10">
                <span className="text-muted-foreground">Revenge Active</span>
                <span className={bot?.is_revenge_active ? 'text-amber-400 font-semibold' : 'text-zinc-400'}>{bot?.is_revenge_active ? 'SÍ' : 'No'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/10">
                <span className="text-muted-foreground">Pérdidas Consecutivas</span>
                <span className={`font-mono ${(bot?.consecutive_losses || 0) >= 3 ? 'text-red-400' : 'text-foreground'}`}>{bot?.consecutive_losses || 0}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/10">
                <span className="text-muted-foreground">Kill Switch</span>
                <span className={bot?.kill_switch_active ? 'text-red-400 font-bold animate-pulse' : 'text-emerald-400'}>
                  {bot?.kill_switch_active ? '⚠️ ACTIVO' : '✓ Normal'}
                </span>
              </div>
              {bot?.cooldown_until && (
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Cooldown Hasta</span>
                  <span className="font-mono text-amber-400 text-[11px]">{bot.cooldown_until}</span>
                </div>
              )}
            </div>
            <div className="mt-3 p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/15 text-[11px] text-muted-foreground/70">
              <strong className="text-purple-300">ℹ️ Modos:</strong> HUNTING = buscando señales · ACTIVE_TRADE = trade abierto · COOLDOWN = pausa post-trade · KILL_SWITCH = pausado por pérdidas
            </div>
          </div>
        </DetailModal>
      )}

      {/* PnL Detail Modal */}
      {activeModal === 'pnl' && (
        <DetailModal title="Análisis de PnL" icon={TrendingUp} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <div className="text-center py-2">
              <div className={`text-3xl font-bold font-mono ${(currentStats?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(currentStats?.pnl || 0) >= 0 ? '+' : ''}${currentStats?.pnl?.toFixed(2) || '0.00'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {statsPeriod === 'today' ? 'Hoy' : statsPeriod === 'week' ? 'Esta Semana' : statsPeriod === 'month' ? 'Este Mes' : 'Total Histórico'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['today', 'week', 'month', 'all_time'] as const).map(p => {
                const ps = s?.stats?.[p];
                return (
                  <div key={p} className={`p-2.5 rounded-lg border text-center ${
                    statsPeriod === p ? 'bg-purple-500/10 border-purple-500/30' : 'bg-card/30 border-border/20'
                  }`}>
                    <div className="text-[10px] text-muted-foreground mb-1">
                      {p === 'today' ? 'Hoy' : p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Total'}
                    </div>
                    <div className={`text-sm font-bold font-mono ${(ps?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${ps?.pnl?.toFixed(2) || '0.00'}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60">{ps?.total || 0} trades</div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-1.5 text-[12px]">
              <div className="flex justify-between py-1 border-b border-border/10">
                <span className="text-muted-foreground">Avg PnL/trade</span>
                <span className="font-mono">${currentStats?.avg_pnl?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/10">
                <span className="text-muted-foreground">Mejor Trade</span>
                <span className="font-mono text-emerald-400">+${currentStats?.max_win?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Peor Trade</span>
                <span className="font-mono text-red-400">-${Math.abs(currentStats?.max_loss || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </DetailModal>
      )}

      {/* Win Rate Detail Modal */}
      {activeModal === 'winrate' && (
        <DetailModal title="Análisis Win Rate" icon={Target} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <div className="text-center py-2">
              <div className={`text-4xl font-bold font-mono ${
                (currentStats?.win_rate || 0) >= 60 ? 'text-emerald-400' : (currentStats?.win_rate || 0) >= 40 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {currentStats?.win_rate?.toFixed(1) || '0'}%
              </div>
            </div>
            {/* Visual bar */}
            <div className="w-full h-4 rounded-full bg-red-500/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(currentStats?.win_rate || 0, 100)}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-lg font-bold text-emerald-400">{currentStats?.wins || 0}</div>
                <div className="text-[10px] text-muted-foreground">Ganados</div>
              </div>
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="text-lg font-bold text-red-400">{currentStats?.losses || 0}</div>
                <div className="text-[10px] text-muted-foreground">Perdidos</div>
              </div>
              <div className="p-2 rounded-lg bg-zinc-500/10 border border-zinc-500/20">
                <div className="text-lg font-bold text-zinc-400">{currentStats?.be || 0}</div>
                <div className="text-[10px] text-muted-foreground">Break Even</div>
              </div>
            </div>
            <div className="text-[11px] text-center text-muted-foreground/60">
              Total: {currentStats?.total || 0} operaciones
            </div>
          </div>
        </DetailModal>
      )}

      {/* Regime Detail Modal */}
      {activeModal === 'regime' && (
        <DetailModal title="Detalle del Régimen" icon={Zap} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <div className="flex items-center justify-center py-3">
              <RegimeBadge regime={market?.regime || ''} />
            </div>
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between py-1.5 border-b border-border/10">
                <span className="text-muted-foreground">Régimen</span>
                <span className="font-semibold text-foreground">{market?.regime || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/10">
                <span className="text-muted-foreground">Confianza</span>
                <span className="font-mono text-foreground">{market?.regime_confidence || 0}%</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/10">
                <span className="text-muted-foreground">Perfil Recomendado</span>
                <span className="font-semibold text-purple-400">{market?.regime_profile || '?'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/10">
                <span className="text-muted-foreground">ATR Ratio</span>
                <span className="font-mono text-foreground">{market?.atr_ratio?.toFixed(3) || '?'}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-muted-foreground">Volatilidad</span>
                <span className={`font-semibold ${market?.volatility === 'HIGH' ? 'text-red-400' : market?.volatility === 'LOW' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {market?.volatility || '?'}
                </span>
              </div>
            </div>
            <div className="mt-3 p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/15 text-[11px] text-muted-foreground/70">
              <strong className="text-cyan-300">ℹ️ Regímenes:</strong> TRENDING = tendencia definida · RANGING = lateral · HIGH_VOL = alta volatilidad · LOW_LIQ = poca liquidez · BREAKOUT = ruptura
            </div>
          </div>
        </DetailModal>
      )}
    </div>
  );
}
