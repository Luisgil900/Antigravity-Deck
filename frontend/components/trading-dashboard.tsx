'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import {
  Activity, TrendingUp, TrendingDown, Zap, Shield, Brain, Target,
  Clock, AlertTriangle, BarChart3, Wifi, WifiOff, RefreshCw,
  ChevronDown, ChevronUp, Trophy, Skull, MessageSquare, ExternalLink,
  Flame, X, Eye, Hash, Terminal, FileText, Database, Award
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────

interface BotStatus {
  timestamp: string; _stale: boolean; _age_seconds: number;
  bot: { mode: string; uptime_hours: number; is_revenge_active: boolean; consecutive_losses: number; kill_switch_active: boolean; cooldown_until: string | null; };
  market: { price: number; volume_24h: number; trend: string; regime: string; regime_confidence: number; regime_profile: string; volatility: string; atr_ratio: number; };
  l2: { obi: string; obi_ratio: number; taker_buy_pct: number; taker_signal: string; flow_toxicity: number; liquidation_cascade: boolean; };
  active_trade: { trade_id: string; side: string; entry_price: number; sl: number; tp: number; sl_current: number; leverage: number; size: number; profile: string; opened_at: string; } | null;
  stats: { today: PeriodStats; week: PeriodStats; month: PeriodStats; all_time: PeriodStats; };
  recent_trades: TradeEntry[];
  rankings: { best: RankEntry[]; worst: RankEntry[]; };
  bot_chats: { cognitive_id: string | null; operative_id: string | null; active_count: number; };
  memory: Record<string, any>;
}
interface PeriodStats { total: number; wins: number; losses: number; be: number; pnl: number; win_rate: number; avg_pnl: number; max_win: number; max_loss: number; }
interface TradeEntry { trade_id: string; side: string; entry: number; exit: number; pnl: number; pnl_pct: number; duration: number; reason: string; leverage: number; profile: string; timestamp: string; }
interface RankEntry { trade_id: string; side: string; pnl: number; entry: number; exit: number; timestamp: string; }
interface LogEntry { timestamp: string; level: string; module: string; message: string; }
interface ChatInfo { id: string; exists: boolean; stepCount: number; lastUpdate: string | null; title: string; }

// ── Utility Components ──────────────────────────────────────────────

function PnlBadge({ pnl }: { pnl: number }) {
  const pos = pnl >= 0;
  return <span className={`inline-flex items-center gap-0.5 font-mono text-xs font-semibold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>{pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{pos ? '+' : ''}${pnl.toFixed(2)}</span>;
}

function ModeBadge({ mode, revenge, killSwitch }: { mode: string; revenge: boolean; killSwitch: boolean }) {
  if (killSwitch) return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse"><AlertTriangle className="w-3.5 h-3.5" /> KILL SWITCH</span>;
  if (revenge) return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30"><Flame className="w-3.5 h-3.5" /> REVENGE</span>;
  const cfg: Record<string, { bg: string; text: string; icon: any }> = {
    'HUNTING': { bg: 'bg-purple-500/15 border-purple-500/30', text: 'text-purple-400', icon: Target },
    'ACTIVE_TRADE': { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-400', icon: Activity },
    'WAITING_FILL': { bg: 'bg-blue-500/15 border-blue-500/30', text: 'text-blue-400', icon: Clock },
    'COOLDOWN': { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-400', icon: Shield },
    'OFFLINE': { bg: 'bg-zinc-500/15 border-zinc-500/30', text: 'text-zinc-400', icon: WifiOff },
  };
  const c = cfg[mode] || cfg['OFFLINE']; const Ic = c.icon;
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text} border`}><Ic className="w-3.5 h-3.5" /> {mode}</span>;
}

function RegimeBadge({ regime }: { regime: string }) {
  const c: Record<string, string> = { 'TRENDING': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', 'RANGING': 'bg-amber-500/15 text-amber-400 border-amber-500/30', 'HIGH_VOL': 'bg-red-500/15 text-red-400 border-red-500/30', 'HIGH_VOLATILITY': 'bg-red-500/15 text-red-400 border-red-500/30', 'LOW_LIQ': 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30', 'BREAKOUT': 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${c[regime] || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'}`}>{regime || 'N/A'}</span>;
}

// ── Modal ────────────────────────────────────────────────────────────

function Modal({ title, icon: Icon, onClose, children, wide = false }: { title: string; icon: any; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={`relative ${wide ? 'max-w-2xl' : 'max-w-md'} w-full mx-4 max-h-[80vh] flex flex-col rounded-2xl bg-[#1a1a2e] border border-purple-500/30 shadow-2xl shadow-purple-500/10`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border/20 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><Icon className="w-3.5 h-3.5 text-white" /></div>
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/30"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// ── Clickable Panel ─────────────────────────────────────────────────

function Panel({ icon: Icon, label, color = 'text-foreground/70', onClick, children }: { icon: any; label: string; color?: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClick} className={`p-3 rounded-xl bg-card/30 border border-border/30 space-y-2 transition-all duration-200 ${onClick ? 'cursor-pointer hover:border-purple-500/40 hover:bg-purple-500/5 group' : ''}`}>
      <div className="flex items-center gap-2 text-xs font-semibold">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-foreground/70">{label}</span>
        {onClick && <Eye className="w-3 h-3 ml-auto text-muted-foreground/30 group-hover:text-purple-400 transition-colors" />}
      </div>
      {children}
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color = 'text-foreground', pulse = false, onClick }: { icon: any; label: string; value: string | number; sub?: string; color?: string; pulse?: boolean; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`relative flex flex-col gap-1 p-3 rounded-xl bg-card/50 border border-border/40 backdrop-blur-sm overflow-hidden group transition-all duration-300 ${onClick ? 'cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 hover:shadow-lg hover:shadow-purple-500/10 active:scale-[0.97]' : ''}`}>
      {pulse && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
      {onClick && !pulse && <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"><Eye className="w-3 h-3 text-purple-400" /></div>}
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5" /><span>{label}</span></div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/60">{sub}</div>}
    </div>
  );
}

// ── Row helper ──────────────────────────────────────────────────────

function InfoRow({ label, value, valueColor = 'text-foreground' }: { label: string; value: string | number; valueColor?: string }) {
  return <div className="flex justify-between py-1.5 border-b border-border/10 text-[12px]"><span className="text-muted-foreground">{label}</span><span className={`font-mono font-semibold ${valueColor}`}>{value}</span></div>;
}

// ══════════════════════════════════════════════════════════════════════
// ── MAIN DASHBOARD ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

export function TradingDashboard({ onOpenChat }: { onOpenChat?: (chatId: string) => void }) {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsPeriod, setStatsPeriod] = useState<'today' | 'week' | 'month' | 'all_time'>('today');
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chatInfos, setChatInfos] = useState<Record<string, ChatInfo>>({});
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bot-status`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bot-logs?limit=80`, { headers: authHeaders() });
      if (res.ok) { const d = await res.json(); setLogs(d.logs || []); }
    } catch {}
  }, []);

  const fetchChatInfo = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/bot-chat-info/${chatId}`, { headers: authHeaders() });
      if (res.ok) {
        const info = await res.json();
        setChatInfos(prev => ({ ...prev, [chatId]: info }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus(); fetchLogs();
    refreshTimer.current = setInterval(() => { fetchStatus(); fetchLogs(); }, 5000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchStatus, fetchLogs]);

  // Fetch chat info when bot_chats available
  useEffect(() => {
    if (status?.bot_chats?.cognitive_id) fetchChatInfo(status.bot_chats.cognitive_id);
    if (status?.bot_chats?.operative_id) fetchChatInfo(status.bot_chats.operative_id);
  }, [status?.bot_chats?.cognitive_id, status?.bot_chats?.operative_id, fetchChatInfo]);

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="flex flex-col items-center gap-3"><RefreshCw className="w-8 h-8 text-purple-400 animate-spin" /><span className="text-sm text-muted-foreground">Conectando con Centinela V7...</span></div></div>;

  const s = status; const bot = s?.bot; const market = s?.market; const l2 = s?.l2;
  const cs = s?.stats?.[statsPeriod];
  const levelColor = (l: string) => l === 'ERRO' || l === 'ERROR' ? 'text-red-400' : l === 'WARN' || l === 'WARNING' ? 'text-amber-400' : 'text-zinc-400';

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-gradient-to-r from-purple-500/5 to-transparent shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20"><BarChart3 className="w-4.5 h-4.5 text-white" /></div>
          <div><h2 className="text-sm font-bold text-foreground/90">Centinela Quant V7</h2><span className="text-[10px] text-muted-foreground/60">Trading Dashboard — Élite</span></div>
          {bot && <ModeBadge mode={bot.mode} revenge={bot.is_revenge_active} killSwitch={bot.kill_switch_active} />}
        </div>
        <div className="flex items-center gap-2">
          {s?._stale ? <span className="text-[10px] text-amber-400 flex items-center gap-1"><WifiOff className="w-3 h-3" /> Stale ({s._age_seconds}s)</span> : <span className="text-[10px] text-emerald-400 flex items-center gap-1"><Wifi className="w-3 h-3" /> Live</span>}
          <button onClick={() => { fetchStatus(); fetchLogs(); }} className="p-1 rounded hover:bg-muted/30"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-3">
        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KpiCard icon={Activity} label="Modo" value={bot?.mode || 'OFF'} sub={bot ? `Uptime: ${bot.uptime_hours}h` : undefined} color={bot?.mode === 'ACTIVE_TRADE' ? 'text-emerald-400' : bot?.mode === 'HUNTING' ? 'text-purple-400' : 'text-foreground'} pulse={bot?.mode === 'ACTIVE_TRADE'} onClick={() => setActiveModal('mode')} />
          <KpiCard icon={TrendingUp} label={`PnL ${statsPeriod === 'today' ? 'Hoy' : statsPeriod === 'week' ? 'Sem' : statsPeriod === 'month' ? 'Mes' : '∞'}`} value={`$${cs?.pnl?.toFixed(2) || '0.00'}`} sub={`${cs?.wins || 0}W / ${cs?.losses || 0}L`} color={(cs?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} onClick={() => setActiveModal('pnl')} />
          <KpiCard icon={Target} label="Win Rate" value={`${cs?.win_rate?.toFixed(1) || '0'}%`} sub={`${cs?.total || 0} trades`} color={(cs?.win_rate || 0) >= 60 ? 'text-emerald-400' : (cs?.win_rate || 0) >= 40 ? 'text-amber-400' : 'text-red-400'} onClick={() => setActiveModal('winrate')} />
          <KpiCard icon={Zap} label="Régimen" value={market?.regime || 'N/A'} sub={`${market?.regime_profile || '?'} | ATR: ${market?.atr_ratio?.toFixed(2) || '?'}`} color="text-cyan-400" onClick={() => setActiveModal('regime')} />
        </div>

        {/* ── Period Selector ── */}
        <div className="flex items-center gap-1">
          {(['today', 'week', 'month', 'all_time'] as const).map(p => (
            <button key={p} onClick={() => setStatsPeriod(p)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${statsPeriod === p ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'text-muted-foreground hover:bg-muted/30 border border-transparent'}`}>
              {p === 'today' ? 'Hoy' : p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Total'}
            </button>
          ))}
        </div>

        {/* ── Active Trade ── */}
        {s?.active_trade && (
          <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
            <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400 animate-pulse" /><span className="text-sm font-semibold text-emerald-400">Trade Activo</span><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.active_trade.side === 'long' || s.active_trade.side === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{s.active_trade.side?.toUpperCase()}</span></div>
            <div className="grid grid-cols-4 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">Entry:</span> <span className="font-mono">${s.active_trade.entry_price}</span></div>
              <div><span className="text-muted-foreground">SL:</span> <span className="font-mono text-red-400">${s.active_trade.sl_current}</span></div>
              <div><span className="text-muted-foreground">TP:</span> <span className="font-mono text-emerald-400">${s.active_trade.tp}</span></div>
              <div><span className="text-muted-foreground">Lev:</span> <span className="font-mono">{s.active_trade.leverage}x</span></div>
            </div>
          </div>
        )}

        {/* ── Market + L2 ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Panel icon={BarChart3} label="Mercado" color="text-purple-400" onClick={() => setActiveModal('market')}>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Precio</span><span className="font-mono font-semibold">${market?.price?.toFixed(2) || '—'}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Tendencia</span><span className={`font-semibold ${market?.trend === 'LONG' || market?.trend === 'ALCISTA' ? 'text-emerald-400' : market?.trend === 'SHORT' || market?.trend === 'BAJISTA' ? 'text-red-400' : 'text-amber-400'}`}>{market?.trend || '—'}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Régimen</span><RegimeBadge regime={market?.regime || ''} /></div>
              <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Volatilidad</span><span>{market?.volatility || '—'}</span></div>
            </div>
          </Panel>
          <Panel icon={Zap} label="Telemetría L2" color="text-cyan-400" onClick={() => setActiveModal('l2')}>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">OBI</span><span className={`font-semibold ${l2?.obi === 'BULLISH_PRESSURE' || l2?.obi === 'BULLISH_PRESS' ? 'text-emerald-400' : l2?.obi === 'BEARISH_PRESSURE' || l2?.obi === 'BEARISH_PRESS' ? 'text-red-400' : 'text-zinc-400'}`}>{l2?.obi || '—'}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Taker Buy</span><span className="font-mono">{l2?.taker_buy_pct?.toFixed(1) || '—'}%</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Flow Toxicity</span><span className={`font-mono ${(l2?.flow_toxicity || 0) > 50 ? 'text-red-400' : 'text-emerald-400'}`}>{l2?.flow_toxicity?.toFixed(1) || '—'}%</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Cascade</span><span className={l2?.liquidation_cascade ? 'text-red-400 font-bold' : 'text-zinc-400'}>{l2?.liquidation_cascade ? '⚠️ ACTIVE' : 'No'}</span></div>
            </div>
          </Panel>
        </div>

        {/* ── Rankings ── */}
        {(s?.rankings?.best?.length || s?.rankings?.worst?.length) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Panel icon={Trophy} label="Mejores Trades" color="text-emerald-400" onClick={() => setActiveModal('rankings')}>
              {s?.rankings?.best?.map((t, i) => <div key={i} className="flex justify-between text-[11px]"><span className="text-muted-foreground">{t.trade_id} <span className={t.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.side?.toUpperCase()}</span></span><PnlBadge pnl={t.pnl} /></div>)}
            </Panel>
            <Panel icon={Skull} label="Peores Trades" color="text-red-400" onClick={() => setActiveModal('rankings')}>
              {s?.rankings?.worst?.map((t, i) => <div key={i} className="flex justify-between text-[11px]"><span className="text-muted-foreground">{t.trade_id} <span className={t.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.side?.toUpperCase()}</span></span><PnlBadge pnl={t.pnl} /></div>)}
            </Panel>
          </div>
        ) : null}

        {/* ── Trade History ── */}
        <Panel icon={BarChart3} label="Historial de Trades" color="text-purple-400" onClick={() => setActiveModal('trades')}>
          <div className="overflow-x-auto -mx-3 px-3">
            <table className="w-full text-[11px]">
              <thead><tr className="text-muted-foreground/60 border-b border-border/10"><th className="text-left px-2 py-1 font-medium">ID</th><th className="text-left px-2 py-1 font-medium">Side</th><th className="text-right px-2 py-1 font-medium">PnL</th><th className="text-left px-2 py-1 font-medium hidden sm:table-cell">Razón</th></tr></thead>
              <tbody>
                {(showAllTrades ? s?.recent_trades : s?.recent_trades?.slice(0, 4))?.map((t, i) => (
                  <tr key={i} className="border-b border-border/5"><td className="px-2 py-1 font-mono text-muted-foreground">{t.trade_id}</td><td className="px-2 py-1"><span className={`px-1 py-0.5 rounded text-[9px] font-bold ${t.side === 'long' || t.side === 'buy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{t.side?.toUpperCase()}</span></td><td className="px-2 py-1 text-right"><PnlBadge pnl={t.pnl} /></td><td className="px-2 py-1 text-muted-foreground/70 truncate max-w-[100px] hidden sm:table-cell">{t.reason}</td></tr>
                ))}
                {(!s?.recent_trades?.length) && <tr><td colSpan={4} className="px-2 py-4 text-center text-muted-foreground/50">Sin trades</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* ── Live Logs ── */}
        <Panel icon={Terminal} label={`Logs en Vivo (${logs.length})`} color="text-amber-400" onClick={() => setActiveModal('logs')}>
          <div className="max-h-32 overflow-y-auto space-y-0.5 font-mono text-[10px] bg-black/30 rounded-lg p-2 -mx-1">
            {logs.slice(0, 8).map((l, i) => (
              <div key={i} className="flex gap-2 leading-4">
                <span className="text-muted-foreground/50 shrink-0">{l.timestamp?.split(' ')[1] || ''}</span>
                <span className={`shrink-0 ${levelColor(l.level)}`}>[{l.level}]</span>
                <span className="text-foreground/70 truncate">{l.message}</span>
              </div>
            ))}
            {!logs.length && <div className="text-muted-foreground/50 text-center py-2">Sin logs disponibles</div>}
          </div>
        </Panel>

        {/* ── Mem0 Status ── */}
        <Panel icon={Brain} label="Mem0 Status" color="text-pink-400" onClick={() => setActiveModal('memory')}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div><span className="text-muted-foreground">Modo:</span> <span className={`font-semibold ${s?.memory?.mem0_connected ? 'text-emerald-400' : 'text-amber-400'}`}>{s?.memory?.mode || '?'}</span></div>
            <div><span className="text-muted-foreground">Local:</span> <span className="font-mono">{s?.memory?.local_memories || 0}</span></div>
            <div><span className="text-muted-foreground">Categorías:</span> <span className={s?.memory?.categories_configured ? 'text-emerald-400' : 'text-zinc-400'}>{s?.memory?.categories_configured ? '✓ 13' : '—'}</span></div>
            <div><span className="text-muted-foreground">Versión:</span> <span>{s?.memory?.version || '?'}</span></div>
          </div>
        </Panel>

        {/* ── Bot Active Chats ── */}
        <Panel icon={MessageSquare} label="Chats Activos del Bot" color="text-purple-400">
          <div className="space-y-2">
            {[
              { id: s?.bot_chats?.cognitive_id, label: '🧠 Chat Cognitivo', icon: Brain, color: 'purple' },
              { id: s?.bot_chats?.operative_id, label: '⚡ Chat Operativo', icon: Zap, color: 'cyan' },
            ].map(chat => {
              if (!chat.id) return null;
              const info = chatInfos[chat.id];
              return (
                <button key={chat.id} onClick={() => onOpenChat?.(chat.id!)} className={`w-full flex items-center gap-3 p-2.5 rounded-lg bg-${chat.color}-500/5 border border-${chat.color}-500/20 hover:border-${chat.color}-500/40 hover:bg-${chat.color}-500/10 transition-all group text-left`}>
                  <div className={`w-8 h-8 rounded-lg bg-${chat.color}-500/15 border border-${chat.color}-500/30 flex items-center justify-center shrink-0`}>
                    <chat.icon className={`w-4 h-4 text-${chat.color}-400`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="text-xs font-semibold text-foreground/90">{chat.label}</span></div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Hash className="w-2.5 h-2.5" />{chat.id.substring(0, 12)}</span>
                      {info && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Activity className="w-2.5 h-2.5" />{info.stepCount} steps</span>}
                      {info?.lastUpdate && <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{new Date(info.lastUpdate).toLocaleTimeString()}</span>}
                    </div>
                  </div>
                  <ExternalLink className={`w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-${chat.color}-400 transition-colors shrink-0`} />
                </button>
              );
            })}
            {!s?.bot_chats?.cognitive_id && !s?.bot_chats?.operative_id && <div className="text-center py-3 text-[11px] text-muted-foreground/50">Sin chats vinculados — verificar bridge_config.json</div>}
          </div>
        </Panel>

        {/* ── Footer ── */}
        <div className="text-center text-[10px] text-muted-foreground/40 py-2">Centinela V7 — Actualizado cada ciclo{s?.timestamp && ` — ${new Date(s.timestamp).toLocaleTimeString()}`}</div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── MODALS ── */}

      {activeModal === 'mode' && (
        <Modal title="Detalle del Modo" icon={Activity} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <div className="flex justify-center py-3"><ModeBadge mode={bot?.mode || 'OFF'} revenge={bot?.is_revenge_active || false} killSwitch={bot?.kill_switch_active || false} /></div>
            <InfoRow label="Modo" value={bot?.mode || 'N/A'} /><InfoRow label="Uptime" value={`${bot?.uptime_hours || 0}h`} /><InfoRow label="Revenge" value={bot?.is_revenge_active ? 'SÍ ⚠️' : 'No'} valueColor={bot?.is_revenge_active ? 'text-amber-400' : 'text-emerald-400'} /><InfoRow label="Pérdidas Consecutivas" value={bot?.consecutive_losses || 0} valueColor={(bot?.consecutive_losses || 0) >= 3 ? 'text-red-400' : 'text-foreground'} /><InfoRow label="Kill Switch" value={bot?.kill_switch_active ? '⚠️ ACTIVO' : '✓ Normal'} valueColor={bot?.kill_switch_active ? 'text-red-400' : 'text-emerald-400'} />
            {bot?.cooldown_until && <InfoRow label="Cooldown Hasta" value={bot.cooldown_until} valueColor="text-amber-400" />}
            <div className="mt-3 p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/15 text-[11px] text-muted-foreground/70"><strong className="text-purple-300">ℹ️</strong> HUNTING=buscando · ACTIVE_TRADE=abierto · COOLDOWN=pausa · KILL_SWITCH=detenido</div>
          </div>
        </Modal>
      )}

      {activeModal === 'pnl' && (
        <Modal title="Análisis de PnL" icon={TrendingUp} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <div className="text-center py-2"><div className={`text-3xl font-bold font-mono ${(cs?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(cs?.pnl || 0) >= 0 ? '+' : ''}${cs?.pnl?.toFixed(2) || '0.00'}</div></div>
            <div className="grid grid-cols-2 gap-2">
              {(['today', 'week', 'month', 'all_time'] as const).map(p => { const ps = s?.stats?.[p]; return (
                <div key={p} className={`p-2.5 rounded-lg border text-center ${statsPeriod === p ? 'bg-purple-500/10 border-purple-500/30' : 'bg-card/30 border-border/20'}`}><div className="text-[10px] text-muted-foreground mb-1">{p === 'today' ? 'Hoy' : p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Total'}</div><div className={`text-sm font-bold font-mono ${(ps?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${ps?.pnl?.toFixed(2) || '0.00'}</div><div className="text-[10px] text-muted-foreground/60">{ps?.total || 0} trades</div></div>
              ); })}
            </div>
            <InfoRow label="Avg PnL/trade" value={`$${cs?.avg_pnl?.toFixed(2) || '0.00'}`} /><InfoRow label="Mejor Trade" value={`+$${cs?.max_win?.toFixed(2) || '0.00'}`} valueColor="text-emerald-400" /><InfoRow label="Peor Trade" value={`-$${Math.abs(cs?.max_loss || 0).toFixed(2)}`} valueColor="text-red-400" />
          </div>
        </Modal>
      )}

      {activeModal === 'winrate' && (
        <Modal title="Win Rate" icon={Target} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <div className="text-center py-2"><div className={`text-4xl font-bold font-mono ${(cs?.win_rate || 0) >= 60 ? 'text-emerald-400' : (cs?.win_rate || 0) >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{cs?.win_rate?.toFixed(1) || '0'}%</div></div>
            <div className="w-full h-4 rounded-full bg-red-500/20 overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500" style={{ width: `${Math.min(cs?.win_rate || 0, 100)}%` }} /></div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20"><div className="text-lg font-bold text-emerald-400">{cs?.wins || 0}</div><div className="text-[10px] text-muted-foreground">Ganados</div></div>
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20"><div className="text-lg font-bold text-red-400">{cs?.losses || 0}</div><div className="text-[10px] text-muted-foreground">Perdidos</div></div>
              <div className="p-2 rounded-lg bg-zinc-500/10 border border-zinc-500/20"><div className="text-lg font-bold text-zinc-400">{cs?.be || 0}</div><div className="text-[10px] text-muted-foreground">Break Even</div></div>
            </div>
          </div>
        </Modal>
      )}

      {activeModal === 'regime' && (
        <Modal title="Régimen de Mercado" icon={Zap} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <div className="flex justify-center py-3"><RegimeBadge regime={market?.regime || ''} /></div>
            <InfoRow label="Régimen" value={market?.regime || 'N/A'} /><InfoRow label="Confianza" value={`${market?.regime_confidence || 0}%`} /><InfoRow label="Perfil" value={market?.regime_profile || '?'} valueColor="text-purple-400" /><InfoRow label="ATR Ratio" value={market?.atr_ratio?.toFixed(3) || '?'} /><InfoRow label="Volatilidad" value={market?.volatility || '?'} valueColor={market?.volatility === 'HIGH' ? 'text-red-400' : 'text-emerald-400'} />
            <div className="p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/15 text-[11px] text-muted-foreground/70"><strong className="text-cyan-300">ℹ️</strong> TRENDING=tendencia · RANGING=lateral · HIGH_VOLATILITY=volátil · LOW_LIQ=poca liquidez · BREAKOUT=ruptura</div>
          </div>
        </Modal>
      )}

      {activeModal === 'market' && (
        <Modal title="Mercado — Detalle" icon={BarChart3} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <div className="text-center py-2"><div className="text-2xl font-bold font-mono text-foreground">${market?.price?.toFixed(2) || '—'}</div><div className="text-[11px] text-muted-foreground">ETH/USDT</div></div>
            <InfoRow label="Precio" value={`$${market?.price?.toFixed(2) || '—'}`} /><InfoRow label="Tendencia" value={market?.trend || '—'} valueColor={market?.trend === 'LONG' || market?.trend === 'ALCISTA' ? 'text-emerald-400' : 'text-red-400'} /><InfoRow label="Régimen" value={market?.regime || '—'} /><InfoRow label="Perfil" value={market?.regime_profile || '—'} valueColor="text-purple-400" /><InfoRow label="Confianza" value={`${market?.regime_confidence || 0}%`} /><InfoRow label="Volatilidad" value={market?.volatility || '—'} /><InfoRow label="ATR Ratio" value={market?.atr_ratio?.toFixed(3) || '—'} />
          </div>
        </Modal>
      )}

      {activeModal === 'l2' && (
        <Modal title="Telemetría L2 — Detalle" icon={Zap} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <InfoRow label="OrderBook Imbalance (OBI)" value={l2?.obi || '—'} valueColor={l2?.obi?.includes('BULL') ? 'text-emerald-400' : l2?.obi?.includes('BEAR') ? 'text-red-400' : 'text-zinc-400'} />
            <InfoRow label="OBI Ratio" value={l2?.obi_ratio?.toFixed(2) || '—'} /><InfoRow label="Taker Buy %" value={`${l2?.taker_buy_pct?.toFixed(1) || '—'}%`} /><InfoRow label="Taker Signal" value={l2?.taker_signal || '—'} /><InfoRow label="Flow Toxicity" value={`${l2?.flow_toxicity?.toFixed(1) || '—'}%`} valueColor={(l2?.flow_toxicity || 0) > 50 ? 'text-red-400' : 'text-emerald-400'} /><InfoRow label="Liquidation Cascade" value={l2?.liquidation_cascade ? '⚠️ ACTIVE' : 'No'} valueColor={l2?.liquidation_cascade ? 'text-red-400' : 'text-emerald-400'} />
            <div className="p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/15 text-[11px] text-muted-foreground/70"><strong className="text-cyan-300">ℹ️</strong> OBI mide presión compradores vs vendedores. Taker Buy &gt;55% = bullish. Flow Toxicity alta = peligro.</div>
          </div>
        </Modal>
      )}

      {activeModal === 'rankings' && (
        <Modal title="Rankings de Trades" icon={Award} onClose={() => setActiveModal(null)}>
          <div className="space-y-4">
            <div><div className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1"><Trophy className="w-3.5 h-3.5" /> Top 3 Mejores</div>
              {s?.rankings?.best?.map((t, i) => <div key={i} className="flex justify-between text-[12px] py-1.5 border-b border-border/10"><span><span className="text-muted-foreground mr-1">#{i+1}</span> {t.trade_id} <span className={t.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.side?.toUpperCase()}</span> <span className="text-muted-foreground/50">${t.entry?.toFixed(0)}→${t.exit?.toFixed(0)}</span></span><PnlBadge pnl={t.pnl} /></div>)}
            </div>
            <div><div className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1"><Skull className="w-3.5 h-3.5" /> Top 3 Peores</div>
              {s?.rankings?.worst?.map((t, i) => <div key={i} className="flex justify-between text-[12px] py-1.5 border-b border-border/10"><span><span className="text-muted-foreground mr-1">#{i+1}</span> {t.trade_id} <span className={t.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.side?.toUpperCase()}</span></span><PnlBadge pnl={t.pnl} /></div>)}
            </div>
          </div>
        </Modal>
      )}

      {activeModal === 'trades' && (
        <Modal title="Historial Completo" icon={FileText} onClose={() => setActiveModal(null)} wide>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-muted-foreground/60 border-b border-border/20"><th className="text-left px-2 py-1.5">ID</th><th className="text-left px-2 py-1.5">Side</th><th className="text-right px-2 py-1.5">Entry</th><th className="text-right px-2 py-1.5">Exit</th><th className="text-right px-2 py-1.5">PnL</th><th className="text-right px-2 py-1.5">Dur.</th><th className="text-left px-2 py-1.5">Perfil</th><th className="text-left px-2 py-1.5">Razón</th></tr></thead>
              <tbody>{s?.recent_trades?.map((t, i) => (
                <tr key={i} className="border-b border-border/5 hover:bg-muted/10"><td className="px-2 py-1.5 font-mono text-muted-foreground">{t.trade_id}</td><td className="px-2 py-1.5"><span className={`px-1 py-0.5 rounded text-[9px] font-bold ${t.side === 'long' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{t.side?.toUpperCase()}</span></td><td className="px-2 py-1.5 text-right font-mono">${t.entry?.toFixed(2)}</td><td className="px-2 py-1.5 text-right font-mono">${t.exit?.toFixed(2)}</td><td className="px-2 py-1.5 text-right"><PnlBadge pnl={t.pnl} /></td><td className="px-2 py-1.5 text-right text-muted-foreground">{t.duration}m</td><td className="px-2 py-1.5 text-muted-foreground/70">{t.profile}</td><td className="px-2 py-1.5 text-muted-foreground/70 truncate max-w-[120px]">{t.reason}</td></tr>
              ))}</tbody>
            </table>
            {(!s?.recent_trades?.length) && <div className="py-6 text-center text-muted-foreground/50">Sin trades registrados</div>}
          </div>
        </Modal>
      )}

      {activeModal === 'logs' && (
        <Modal title="Logs del Bot (Tiempo Real)" icon={Terminal} onClose={() => setActiveModal(null)} wide>
          <div className="space-y-1 font-mono text-[10px] bg-black/40 rounded-lg p-3 max-h-[60vh] overflow-y-auto">
            {logs.map((l, i) => (
              <div key={i} className={`flex gap-2 leading-4 py-0.5 ${i === 0 ? 'bg-purple-500/5 rounded px-1' : ''}`}>
                <span className="text-muted-foreground/50 shrink-0 w-16">{l.timestamp?.split(' ')[1] || ''}</span>
                <span className={`shrink-0 w-10 ${levelColor(l.level)}`}>[{l.level}]</span>
                <span className="text-blue-400/60 shrink-0 w-16 truncate">{l.module}</span>
                <span className="text-foreground/80">{l.message}</span>
              </div>
            ))}
            {!logs.length && <div className="text-center py-8 text-muted-foreground/50">Sin logs disponibles — Esperando primer ciclo...</div>}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground/40 text-right">{logs.length} líneas — Auto-refresh cada 5s</div>
        </Modal>
      )}

      {activeModal === 'memory' && (
        <Modal title="Mem0 — Memoria Semántica" icon={Database} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <InfoRow label="Modo" value={s?.memory?.mode || '?'} valueColor={s?.memory?.mem0_connected ? 'text-emerald-400' : 'text-amber-400'} />
            <InfoRow label="Conectado a Cloud" value={s?.memory?.mem0_connected ? '✓ Sí' : '✗ No'} valueColor={s?.memory?.mem0_connected ? 'text-emerald-400' : 'text-red-400'} />
            <InfoRow label="Memorias Locales" value={s?.memory?.local_memories || 0} />
            <InfoRow label="Categorías Configuradas" value={s?.memory?.categories_configured ? '13 categorías' : 'No'} valueColor={s?.memory?.categories_configured ? 'text-emerald-400' : 'text-zinc-400'} />
            <InfoRow label="Versión" value={s?.memory?.version || '?'} />
            <div className="mt-3 p-2.5 rounded-lg bg-pink-500/5 border border-pink-500/15 text-[11px] space-y-1">
              <div className="text-pink-300 font-semibold">📦 9 Entidades de Memoria:</div>
              <div className="text-muted-foreground/70 grid grid-cols-2 gap-x-4 gap-y-0.5">
                <span>• postmortem</span><span>• opus_decision</span>
                <span>• market_pattern</span><span>• regime_transition</span>
                <span>• session_insight</span><span>• anti_pattern</span>
                <span>• antigravity_workspace</span><span>• dashboard_stats</span>
                <span>• bot_event</span>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/15 text-[11px] space-y-1">
              <div className="text-purple-300 font-semibold">🏷️ 13 Categorías:</div>
              <div className="text-muted-foreground/70 text-[10px]">trade_entry · trade_exit · risk_management · market_regime · trade_pattern · anti_pattern · session_insight · bot_lifecycle · performance_metric · strategy_decision · emotional_flag · market_structure · system_config</div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
