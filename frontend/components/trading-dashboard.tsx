'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import {
  Activity, TrendingUp, TrendingDown, Zap, Shield, Brain, Target,
  Clock, AlertTriangle, BarChart3, Wifi, WifiOff, RefreshCw,
  ChevronDown, ChevronUp, Trophy, Skull, MessageSquare, ExternalLink,
  Flame, X, Eye, Hash, Terminal, FileText, Database, Award,
  HeartPulse, Layers, ShieldAlert, Timer, Cpu, Radio,
  Landmark, DollarSign, Wallet, ArrowUpDown
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────

interface AccountData {
  equity: number; total_balance: number; free_balance: number;
  used_margin: number; unrealized_pnl: number; wallet_balance: number;
  last_update: number;
}
interface ExchangeTrade {
  id: string; datetime: string; side: string;
  price: number; amount: number; fee: number;
}
interface RotationRecord {
  old_chat_id: string; new_chat_id: string;
  steps_at_rotation: number; rotated_at: string; reason: string;
}
interface PreservationRecord {
  timestamp: string; chat_id: string; chars: number;
}
interface ChatRotatorData {
  enabled: boolean; chat_id: string | null; chat_link: string | null;
  current_steps: number; max_steps: number; preservation_threshold: number;
  usage_pct: number; rotations_total: number; needs_rotation: boolean;
  last_rotation: string | null; periodic_preservation_hours: number;
  hours_since_last_preservation: number; last_periodic_preservation: string | null;
  rotation_history?: RotationRecord[];
  preservation_history?: PreservationRecord[];
}
interface WeeklyRegime {
  day_type: string; day_label: string; current_mode: string;
  override: string | null; override_remaining_min: number;
  sunday_activation_utc: number; wednesday_deactivation_utc?: number;
  next_transition: string | null; auto_adapt_enabled: boolean;
  passive_cycle_counter: number; passive_opus_every_n: number;
}
interface ModelQuota {
  label: string; modelId: string; quota: number;
  resetTime: string | null; supportsImages?: boolean; isRecommended: boolean;
}
interface UserCredits {
  email: string | null; name: string | null;
  tier: string | null; plan: string | null;
  availableCredits: number | null; minCreditsForUsage: number | null;
  promptCredits: number | null; monthlyPromptCredits: number | null;
  models: ModelQuota[]; fetchedAt: string;
}
interface ClosedPnlTrade {
  order_id: string; side: string; qty: number;
  entry: number; exit: number; pnl: number;
  leverage: string; time: string;
}
interface ExchangeSummary {
  total_trades: number; wins: number; losses: number;
  win_rate_real: number; total_pnl_real: number; net_pnl: number;
  avg_win: number; avg_loss: number; best_trade: number; worst_trade: number;
  source: string; closed_pnl_trades: ClosedPnlTrade[];
}
interface BotStatus {
  timestamp: string; _stale: boolean; _age_seconds: number;
  version: string;
  bot: { mode: string; uptime_hours: number; is_revenge_active: boolean; consecutive_losses: number; kill_switch_active: boolean; cooldown_until: string | null; balance_usd: number; };
  account?: AccountData;
  market: { price: number; volume_24h: number; trend: string; regime: string; regime_confidence: number; regime_profile: string; volatility: string; atr_ratio: number; session: string; };
  l2: { obi: string; obi_ratio: number; taker_buy_pct: number; taker_signal: string; flow_toxicity: number; liquidation_cascade: boolean; };
  active_trade: { trade_id: string; side: string; entry_price: number; sl: number; tp: number; sl_current: number; leverage: number; size: number; profile: string; opened_at: string; } | null;
  stats: { today: PeriodStats; week: PeriodStats; month: PeriodStats; all_time: PeriodStats; };
  recent_trades: TradeEntry[];
  rankings: { best: RankEntry[]; worst: RankEntry[]; };
  bot_chats: { unified_id: string | null; active_count: number; };
  memory: Record<string, any>;
  v8?: V8Data;
  heartbeat?: HeartbeatData | null;
  exchange_trades?: ExchangeTrade[];
  chat_rotator?: ChatRotatorData;
  exchange_summary?: ExchangeSummary;
}
interface V8Data {
  circuit_breaker: { level: string; daily_pnl_pct: number; trades_today: number; blocked_until: string | null; };
  rolling_context: { total_events: number; window_hours: number; recent_types: string[]; compact_briefing: string; };
  consensus: { alignment_trend: string; last_score: number; evaluations_count: number; };
  supervision: { flash_interval_s: number; pro_interval_s: number; opus_interval_s: number; flash_model: string; pro_model: string; opus_model: string; version?: string; };
  metrics?: { sharpe_ratio: number; sortino_ratio: number; max_drawdown_pct: number; profit_factor: number; expectancy_usd: number; calmar_ratio: number; avg_rr: number; };
  multi_tf_fusion?: { score: number; level: string; factors: Record<string, number>; };
  order_flow?: { composite_bias: string; composite_confidence: number; spoofing_detected: boolean; iceberg_detected: boolean; cvd_divergence: string; absorption_detected: boolean; trades_processed: number; };
  decision_matrix?: { enabled: boolean; version: string; evaluations: number; last_score: { price_structure: number; capital_flow: number; momentum: number; context: number; total: number; tier: string; hard_kill: boolean; hard_kill_reason: string; } | null; last_summary: string; weights: Record<string, number>; thresholds: Record<string, number>; };
}
interface HeartbeatData {
  mode?: string; regime?: string; bybit_connected?: boolean; version?: string;
  circuit_breaker?: string; consensus_alignment?: string; rolling_context_events?: number;
  received_at?: string; weekly_regime?: WeeklyRegime;
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

function CbBadge({ level }: { level: string }) {
  const c: Record<string, string> = {
    'GREEN': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    'YELLOW': 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse',
    'RED': 'bg-red-500/15 text-red-400 border-red-500/30 animate-pulse',
    'BLACK': 'bg-red-900/30 text-red-300 border-red-700/50 animate-pulse',
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${c[level] || c['GREEN']}`}>{level}</span>;
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
  const [modelQuotas, setModelQuotas] = useState<ModelQuota[]>([]);
  const [userCredits, setUserCredits] = useState<UserCredits | null>(null);
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);

  const statusRef = useRef<BotStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bot-status`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
      statusRef.current = data;
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

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/models`, { headers: authHeaders() });
      if (res.ok) { const d = await res.json(); setModelQuotas(d.models || []); }
    } catch {}
  }, []);

  const fetchUserCredits = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/user/credits`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setUserCredits(d);
        if (d.models?.length) setModelQuotas(d.models);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const doFetch = () => {
      fetchStatus();
      fetchLogs();
      // fetchModels() REMOVED — fetchUserCredits() already provides sorted models
      fetchUserCredits();
      const st = statusRef.current;
      if (st?.bot_chats?.unified_id) fetchChatInfo(st.bot_chats.unified_id);
    };
    doFetch();
    refreshTimer.current = setInterval(doFetch, 5000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchStatus, fetchLogs, fetchChatInfo]);

  // Fetch chat info when unified chat available
  useEffect(() => {
    if (status?.bot_chats?.unified_id) fetchChatInfo(status.bot_chats.unified_id);
  }, [status?.bot_chats?.unified_id, fetchChatInfo]);

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="flex flex-col items-center gap-3"><RefreshCw className="w-8 h-8 text-purple-400 animate-spin" /><span className="text-sm text-muted-foreground">Conectando con Centinela V10.1 Decision Matrix...</span></div></div>;

  const s = status; const bot = s?.bot; const market = s?.market; const l2 = s?.l2; const v8 = s?.v8; const account = s?.account; const exTrades = s?.exchange_trades; const exSum = s?.exchange_summary;
  const cs = s?.stats?.[statsPeriod];
  const levelColor = (l: string) => l === 'ERRO' || l === 'ERROR' ? 'text-red-400' : l === 'WARN' || l === 'WARNING' ? 'text-amber-400' : 'text-zinc-400';
  const hb = s?.heartbeat;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-gradient-to-r from-purple-500/5 to-transparent shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20"><BarChart3 className="w-4.5 h-4.5 text-white" /></div>
          <div><h2 className="text-sm font-bold text-foreground/90">Centinela Quant <span className="text-purple-400">V10.1</span></h2><span className="text-[10px] text-muted-foreground/60">Decision Matrix — Opus-Only | Supervision Matrix</span></div>
          {bot && <ModeBadge mode={bot.mode} revenge={bot.is_revenge_active} killSwitch={bot.kill_switch_active} />}
        </div>
        <div className="flex items-center gap-2">
          {hb ? <span className="text-[10px] text-emerald-400 flex items-center gap-1"><HeartPulse className="w-3 h-3 animate-pulse" /> HB</span> : null}
          {s?._stale ? <span className="text-[10px] text-amber-400 flex items-center gap-1"><WifiOff className="w-3 h-3" /> Stale ({s._age_seconds}s)</span> : <span className="text-[10px] text-emerald-400 flex items-center gap-1"><Wifi className="w-3 h-3" /> Live</span>}
          <button onClick={() => { fetchStatus(); fetchLogs(); }} className="p-1 rounded hover:bg-muted/30"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-3">
        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <KpiCard icon={Activity} label="Modo" value={bot?.mode || 'OFF'} sub={bot ? `Uptime: ${bot.uptime_hours?.toFixed(1)}h` : undefined} color={bot?.mode === 'ACTIVE_TRADE' ? 'text-emerald-400' : bot?.mode === 'HUNTING' ? 'text-purple-400' : 'text-foreground'} pulse={bot?.mode === 'ACTIVE_TRADE'} onClick={() => setActiveModal('mode')} />
          <KpiCard icon={TrendingUp} label={`PnL ${statsPeriod === 'today' ? 'Hoy' : statsPeriod === 'week' ? 'Sem' : statsPeriod === 'month' ? 'Mes' : '∞'}`} value={`$${cs?.pnl?.toFixed(2) || '0.00'}`} sub={`${cs?.wins || 0}W / ${cs?.losses || 0}L`} color={(cs?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} onClick={() => setActiveModal('pnl')} />
          <KpiCard icon={Target} label="Win Rate" value={`${cs?.win_rate?.toFixed(1) || '0'}%`} sub={`${cs?.total || 0} trades`} color={(cs?.win_rate || 0) >= 60 ? 'text-emerald-400' : (cs?.win_rate || 0) >= 40 ? 'text-amber-400' : 'text-red-400'} onClick={() => setActiveModal('winrate')} />
          <KpiCard icon={Zap} label="Régimen" value={market?.regime || 'N/A'} sub={`${market?.regime_profile || '?'} | ATR: ${market?.atr_ratio?.toFixed(2) || '?'}`} color="text-cyan-400" onClick={() => setActiveModal('regime')} />
          <KpiCard icon={Shield} label="Balance" value={`$${bot?.balance_usd?.toFixed(2) || '0.00'}`} sub={market?.session || '—'} color="text-amber-400" onClick={() => setActiveModal('balance')} />
          <KpiCard icon={Landmark} label="Exchange" value={`$${account?.equity?.toFixed(2) || bot?.balance_usd?.toFixed(2) || '0.00'}`} sub={`Margen: $${account?.used_margin?.toFixed(2) || '0.00'}`} color="text-cyan-400" pulse={!!account?.used_margin && account.used_margin > 0} onClick={() => setActiveModal('exchange')} />
        </div>

        {/* ── Period Selector ── */}
        <div className="flex items-center gap-1">
          {(['today', 'week', 'month', 'all_time'] as const).map(p => (
            <button key={p} onClick={() => setStatsPeriod(p)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${statsPeriod === p ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'text-muted-foreground hover:bg-muted/30 border border-transparent'}`}>
              {p === 'today' ? 'Hoy' : p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Total'}
            </button>
          ))}
        </div>

        {/* ── V8 Systems Banner ── */}
        <Panel icon={Cpu} label="V8 Infinity — Sistemas Avanzados" color="text-pink-400" onClick={() => setActiveModal('v8')}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-black/20 border border-border/20">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Circuit Breaker</span>
              <CbBadge level={v8?.circuit_breaker?.level || 'GREEN'} />
              <span className="text-[10px] text-muted-foreground/60 font-mono">{v8?.circuit_breaker?.daily_pnl_pct?.toFixed(2) || '0.00'}% diario</span>
            </div>
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-black/20 border border-border/20">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Layers className="w-3 h-3" /> Consensus</span>
              <span className={`text-xs font-bold ${(v8?.consensus?.last_score || 0) >= 0.7 ? 'text-emerald-400' : (v8?.consensus?.last_score || 0) >= 0.4 ? 'text-amber-400' : 'text-red-400'}`}>{((v8?.consensus?.last_score || 0) * 100).toFixed(0)}%</span>
              <span className="text-[10px] text-muted-foreground/60">{v8?.consensus?.alignment_trend || 'N/A'}</span>
            </div>
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-black/20 border border-border/20">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Timer className="w-3 h-3" /> Rolling Context</span>
              <span className="text-xs font-bold text-cyan-400">{v8?.rolling_context?.total_events || 0} eventos</span>
              <span className="text-[10px] text-muted-foreground/60">Ventana: {v8?.rolling_context?.window_hours || 2}h</span>
            </div>
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-black/20 border border-border/20">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Radio className="w-3 h-3" /> Heartbeat</span>
              <span className={`text-xs font-bold ${hb ? 'text-emerald-400' : 'text-zinc-500'}`}>{hb ? '● VIVO' : '○ SIN HB'}</span>
              <span className="text-[10px] text-muted-foreground/60">{hb?.received_at ? new Date(hb.received_at).toLocaleTimeString() : '—'}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-black/20 border border-border/20">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">📊 Metrics</span>
              <span className="text-xs font-bold text-purple-400">Sharpe: {v8?.metrics?.sharpe_ratio?.toFixed(2) || '0.00'}</span>
              <span className="text-[10px] text-muted-foreground/60">PF: {v8?.metrics?.profit_factor?.toFixed(2) || '0.00'} | DD: {v8?.metrics?.max_drawdown_pct?.toFixed(1) || '0.0'}%</span>
            </div>
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-black/20 border border-border/20">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">🔗 Multi-TF</span>
              <span className={`text-xs font-bold ${(v8?.multi_tf_fusion?.score || 0) >= 0.7 ? 'text-emerald-400' : (v8?.multi_tf_fusion?.score || 0) >= 0.4 ? 'text-amber-400' : 'text-red-400'}`}>{((v8?.multi_tf_fusion?.score || 0) * 100).toFixed(0)}%</span>
              <span className="text-[10px] text-muted-foreground/60">{v8?.multi_tf_fusion?.level || 'N/A'}</span>
            </div>
            <div className="flex flex-col gap-1 p-2 rounded-lg bg-black/20 border border-border/20">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">🌊 Order Flow</span>
              <span className={`text-xs font-bold ${v8?.order_flow?.composite_bias === 'BULLISH' ? 'text-emerald-400' : v8?.order_flow?.composite_bias === 'BEARISH' ? 'text-red-400' : 'text-zinc-400'}`}>{v8?.order_flow?.composite_bias || 'NEUTRAL'}</span>
              <span className="text-[10px] text-muted-foreground/60">{v8?.order_flow?.spoofing_detected ? '⚠️ Spoof' : ''}{v8?.order_flow?.iceberg_detected ? ' 🧊 Ice' : ''}{v8?.order_flow?.absorption_detected ? ' 🛡️ Abs' : ''}{!v8?.order_flow?.spoofing_detected && !v8?.order_flow?.iceberg_detected && !v8?.order_flow?.absorption_detected ? 'Clean' : ''}</span>
            </div>
          </div>
        </Panel>

        {/* ── Decision Matrix V10.1 Widget ── */}
        {(() => {
          const dm = v8?.decision_matrix;
          if (!dm?.enabled) return null;
          const ls = dm.last_score;
          const tierColors: Record<string, string> = {
            'gold': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
            'silver': 'bg-zinc-300/15 text-zinc-300 border-zinc-300/30',
            'bronze': 'bg-orange-600/15 text-orange-400 border-orange-600/30',
            'none': 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30',
          };
          const tierLabels: Record<string, string> = { 'gold': '🥇 ORO', 'silver': '🥈 PLATA', 'bronze': '🥉 BRONCE', 'none': '❌ SIN SEÑAL' };
          const scoreColor = (score: number) => score >= 80 ? 'text-amber-400' : score >= 65 ? 'text-zinc-300' : score >= 50 ? 'text-orange-400' : 'text-red-400';
          const barColor = (score: number) => score >= 80 ? 'bg-amber-500' : score >= 65 ? 'bg-zinc-300' : score >= 50 ? 'bg-orange-500' : 'bg-red-500';
          const ClusterBar = ({ label, emoji, score, max }: { label: string; emoji: string; score: number; max: number }) => (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">{emoji} {label}</span>
                <span className={`font-mono font-bold ${scoreColor(score / max * 100)}`}>{score.toFixed(1)}/{max.toFixed(0)}</span>
              </div>
              <div className="h-2 rounded-full bg-black/30 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${barColor(score / max * 100)}`} style={{ width: `${Math.min(100, (score / max) * 100)}%` }} />
              </div>
            </div>
          );
          return (
            <Panel icon={Brain} label="Decision Matrix V10.1" color="text-amber-400" onClick={() => setActiveModal('decision_matrix')}>
              <div className="space-y-2">
                {/* Score principal + Tier */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold font-mono ${ls ? scoreColor(ls.total) : 'text-zinc-500'}`}>{ls ? ls.total.toFixed(0) : '—'}</span>
                    <span className="text-[10px] text-muted-foreground">/100</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${tierColors[ls?.tier || 'none']}`}>
                    {tierLabels[ls?.tier || 'none']}
                  </span>
                </div>
                {/* Barras por cluster */}
                {ls ? (
                  <div className="space-y-1.5">
                    <ClusterBar label="Estructura" emoji="📊" score={ls.price_structure} max={30} />
                    <ClusterBar label="Flujo L2" emoji="🌊" score={ls.capital_flow} max={35} />
                    <ClusterBar label="Momentum" emoji="⚡" score={ls.momentum} max={20} />
                    <ClusterBar label="Contexto" emoji="🌍" score={ls.context} max={15} />
                  </div>
                ) : (
                  <div className="text-center text-[11px] text-muted-foreground/50 py-2">Sin evaluaciones aún</div>
                )}
                {/* Hard Kill indicator */}
                {ls?.hard_kill && (
                  <div className="text-[10px] text-red-400 bg-red-500/10 px-2 py-1 rounded border border-red-500/20 animate-pulse">
                    🔴 {ls.hard_kill_reason}
                  </div>
                )}
                {/* Stats */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 pt-1 border-t border-border/10">
                  <span>Evaluaciones: {dm.evaluations}</span>
                  <span>{dm.version}</span>
                </div>
              </div>
            </Panel>
          );
        })()}

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

        {/* ── Exchange Account (Bybit Real-Time) ── */}
        <Panel icon={Landmark} label="Cuenta Exchange (Bybit)" color="text-cyan-400" onClick={() => setActiveModal('exchange')}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-black/20 border border-border/20">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3" /> Equity</span>
              <span className="text-sm font-bold font-mono text-amber-400">${account?.equity?.toFixed(2) || bot?.balance_usd?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-black/20 border border-border/20">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Wallet</span>
              <span className="text-sm font-bold font-mono text-foreground">${account?.wallet_balance?.toFixed(2) || bot?.balance_usd?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-black/20 border border-border/20">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Shield className="w-3 h-3" /> Margen Usado</span>
              <span className={`text-sm font-bold font-mono ${(account?.used_margin || 0) > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>${account?.used_margin?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-black/20 border border-border/20">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> PnL No Realizado</span>
              <span className={`text-sm font-bold font-mono ${(account?.unrealized_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(account?.unrealized_pnl || 0) >= 0 ? '+' : ''}${account?.unrealized_pnl?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        </Panel>

        {/* ── Exchange Trades (Bybit Real) ── */}
        {exTrades && exTrades.length > 0 && (
          <Panel icon={ArrowUpDown} label={`Trades Exchange Bybit (${exTrades.length})`} color="text-amber-400" onClick={() => setActiveModal('exchange')}>
            <div className="overflow-x-auto -mx-3 px-3">
              <table className="w-full text-[11px]">
                <thead><tr className="text-muted-foreground/60 border-b border-border/10"><th className="text-left px-2 py-1 font-medium">Fecha</th><th className="text-left px-2 py-1 font-medium">Side</th><th className="text-right px-2 py-1 font-medium">Precio</th><th className="text-right px-2 py-1 font-medium">Cantidad</th><th className="text-right px-2 py-1 font-medium">Fee</th></tr></thead>
                <tbody>
                  {exTrades.slice(0, 5).map((t, i) => (
                    <tr key={i} className="border-b border-border/5"><td className="px-2 py-1 text-muted-foreground font-mono">{t.datetime ? new Date(t.datetime).toLocaleTimeString() : '—'}</td><td className="px-2 py-1"><span className={`px-1 py-0.5 rounded text-[9px] font-bold ${t.side === 'buy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{t.side?.toUpperCase()}</span></td><td className="px-2 py-1 text-right font-mono">${t.price?.toFixed(2)}</td><td className="px-2 py-1 text-right font-mono">{t.amount?.toFixed(4)}</td><td className="px-2 py-1 text-right text-muted-foreground/70 font-mono">${typeof t.fee === 'number' ? t.fee.toFixed(4) : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* ── P&L Real Exchange (closed_pnl de Bybit) ── */}
        {exSum && exSum.total_trades > 0 && (
          <Panel icon={Award} label={`P&L Real Exchange — ${exSum.source === 'bybit_closed_pnl' ? '✓ Verificado' : '?'}`} color="text-emerald-400" onClick={() => setActiveModal('exchange')}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-black/20 border border-border/20">
                <span className="text-[10px] text-muted-foreground">PnL Total Real</span>
                <span className={`text-sm font-bold font-mono ${(exSum.net_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(exSum.net_pnl || 0) >= 0 ? '+' : ''}${exSum.net_pnl?.toFixed(4)}</span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-black/20 border border-border/20">
                <span className="text-[10px] text-muted-foreground">Win Rate Real</span>
                <span className={`text-sm font-bold font-mono ${(exSum.win_rate_real || 0) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{exSum.win_rate_real?.toFixed(1)}%</span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-black/20 border border-border/20">
                <span className="text-[10px] text-muted-foreground">Operaciones</span>
                <span className="text-sm font-bold font-mono text-foreground">{exSum.total_trades} <span className="text-[9px] text-muted-foreground">({exSum.wins}W / {exSum.losses}L)</span></span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-black/20 border border-border/20">
                <span className="text-[10px] text-muted-foreground">Mejor / Peor</span>
                <span className="text-[11px] font-mono"><span className="text-emerald-400">${exSum.best_trade?.toFixed(4)}</span> / <span className="text-red-400">${exSum.worst_trade?.toFixed(4)}</span></span>
              </div>
            </div>
            {/* Closed PnL Trades Table */}
            {exSum.closed_pnl_trades?.length > 0 && (
              <div className="mt-2 overflow-x-auto -mx-3 px-3">
                <table className="w-full text-[11px]">
                  <thead><tr className="text-muted-foreground/60 border-b border-border/10"><th className="text-left px-2 py-1">Side</th><th className="text-right px-2 py-1">Entry</th><th className="text-right px-2 py-1">Exit</th><th className="text-right px-2 py-1">Qty</th><th className="text-right px-2 py-1">PnL Real</th><th className="text-right px-2 py-1">Lev</th></tr></thead>
                  <tbody>{exSum.closed_pnl_trades.slice(0, 5).map((t, i) => (
                    <tr key={i} className="border-b border-border/5"><td className="px-2 py-1"><span className={`px-1 py-0.5 rounded text-[9px] font-bold ${t.side === 'Buy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{t.side}</span></td><td className="px-2 py-1 text-right font-mono">${t.entry?.toFixed(2)}</td><td className="px-2 py-1 text-right font-mono">${t.exit?.toFixed(2)}</td><td className="px-2 py-1 text-right font-mono">{t.qty}</td><td className={`px-2 py-1 text-right font-mono font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(4)}</td><td className="px-2 py-1 text-right text-muted-foreground">{t.leverage}x</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

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

        {/* ── Chat Unificado del Bot ── */}
        {(() => {
          const uid = s?.bot_chats?.unified_id;
          const info = uid ? chatInfos[uid] : null;
          const rotator = s?.chat_rotator;
          return (
            <Panel icon={MessageSquare} label="Chat Unificado" color="text-cyan-400">
              {uid ? (
                <button onClick={() => onOpenChat?.(uid)} className="w-full flex items-center gap-3 p-3 rounded-lg border transition-all group text-left bg-cyan-500/5 border-cyan-500/20 hover:border-cyan-500/40 hover:bg-cyan-500/10">
                  <div className="w-10 h-10 rounded-lg border bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border-cyan-500/30 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground/90">⚡ Chat Unificado</span>
                      {info && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-mono">{info.stepCount} steps</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Hash className="w-2.5 h-2.5" />{uid.substring(0, 16)}</span>
                      {info?.lastUpdate && <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{new Date(info.lastUpdate).toLocaleTimeString()}</span>}
                    </div>
                    {rotator && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-black/30 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${(rotator.usage_pct || 0) >= 90 ? 'bg-red-500' : (rotator.usage_pct || 0) >= 70 ? 'bg-amber-500' : 'bg-cyan-500'}`} style={{ width: `${Math.min(rotator.usage_pct || 0, 100)}%` }} />
                        </div>
                        <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">{rotator.current_steps || 0}/{rotator.max_steps || 1000}</span>
                      </div>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-cyan-400 transition-colors shrink-0" />
                </button>
              ) : (
                <div className="text-center py-3 text-[11px] text-muted-foreground/50">Sin chat vinculado — verificar bridge_config.json</div>
              )}
            </Panel>
          );
        })()}

        {/* ── Historial de Rotación de Chat ── */}
        {(() => {
          const rotator = s?.chat_rotator;
          if (!rotator) return null;
          const history = rotator.rotation_history || [];
          const lastRotation = rotator.last_rotation ? new Date(rotator.last_rotation) : null;
          return (
            <Panel icon={RefreshCw} label="Rotación de Chat" color="text-amber-400" onClick={() => setActiveModal('rotation')}>
              <div className="space-y-2">
                {/* Estado actual */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Estado</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${rotator.needs_rotation ? 'bg-red-500/15 text-red-400 border-red-500/30 animate-pulse' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'}`}>
                    {rotator.needs_rotation ? '⚠️ ROTACIÓN PENDIENTE' : '✓ ESTABLE'}
                  </span>
                </div>
                {/* Barra de steps */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-black/30 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${(rotator.usage_pct || 0) >= 90 ? 'bg-red-500' : (rotator.usage_pct || 0) >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(rotator.usage_pct || 0, 100)}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">{rotator.current_steps}/{rotator.max_steps}</span>
                </div>
                {/* Estadísticas rápidas */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="text-center p-1.5 rounded bg-black/20">
                    <div className="text-[10px] text-muted-foreground/50">Rotaciones</div>
                    <div className="text-sm font-bold font-mono text-amber-400">{rotator.rotations_total}</div>
                  </div>
                  <div className="text-center p-1.5 rounded bg-black/20">
                    <div className="text-[10px] text-muted-foreground/50">Preservación</div>
                    <div className="text-sm font-bold font-mono text-cyan-400">{rotator.periodic_preservation_hours}h</div>
                  </div>
                  <div className="text-center p-1.5 rounded bg-black/20">
                    <div className="text-[10px] text-muted-foreground/50">Última</div>
                    <div className="text-sm font-bold font-mono text-foreground/70">{lastRotation ? lastRotation.toLocaleDateString('es', { month: 'short', day: 'numeric' }) : '—'}</div>
                  </div>
                </div>
              </div>
            </Panel>
          );
        })()}
        {/* ── Panel de Régimen Semanal V4 ── */}
        {(() => {
          const wr: WeeklyRegime | null = s?.heartbeat?.weekly_regime || null;
          if (!wr) return null;
          const modeColors: Record<string, string> = {
            'STANDBY': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
            'STANDBY_PASSIVE': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
            'STANDBY_TRANSITION': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
            'AUTO_ACTIVE': 'bg-red-500/15 text-red-400 border-red-500/30',
            'AUTO_PASSIVE': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
            'ANOMALY_ALERT': 'bg-red-500/15 text-red-400 border-red-500/30 animate-pulse',
            'HIGH_CONVICTION': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
          };
          const modeClass = modeColors[wr.current_mode] || 'bg-gray-500/15 text-gray-400 border-gray-500/30';
          return (
            <Panel icon={Radio} label="Régimen Semanal" color="text-blue-400" onClick={() => setActiveModal('regime')}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{wr.day_label?.split(' — ')[0] || '?'}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${modeClass}`}>{wr.current_mode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Tipo</span>
                  <span className="text-[10px] font-mono text-foreground/70">{wr.day_type}{wr.override ? ` → ${wr.override}` : ''}</span>
                </div>
                {wr.override && <div className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">⚡ Override activo: {wr.override_remaining_min}min restantes</div>}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Auto-Adapt</span>
                  <span className={`text-[10px] font-bold ${wr.auto_adapt_enabled ? 'text-emerald-400' : 'text-muted-foreground/40'}`}>{wr.auto_adapt_enabled ? '✔ Activo' : '✖ Off'}</span>
                </div>
              </div>
            </Panel>
          );
        })()}

        {/* ── Panel de Cuota de Modelos ── */}
        {(modelQuotas.length > 0 || userCredits) && (
          <Panel icon={Cpu} label="Créditos & Cuota" color="text-violet-400" onClick={() => setActiveModal('quotas')}>
            <div className="space-y-1.5">
              {/* Account tier badge + AI Credits */}
              {userCredits && (
                <>
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground truncate max-w-[100px]">{userCredits.email?.split('@')[0] || '—'}</span>
                    <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/20 text-[9px] font-bold">{userCredits.tier || userCredits.plan || 'Free'}</span>
                  </div>
                  {userCredits.availableCredits !== null && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="text-muted-foreground">🪙 AI Credits</span>
                        <span className={`font-mono font-bold ${(userCredits.availableCredits ?? 0) < 100 ? 'text-red-400 animate-pulse' : (userCredits.availableCredits ?? 0) < 300 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {userCredits.availableCredits}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${(userCredits.availableCredits ?? 0) < 100 ? 'bg-red-500' : (userCredits.availableCredits ?? 0) < 300 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, ((userCredits.availableCredits ?? 0) / 1000) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </>
              )}
              {modelQuotas.filter(m => m.modelId.includes('opus') || m.modelId.includes('pro') || m.isRecommended).slice(0, 3).map((m, i) => {
                const rawPct = Math.round((m.quota ?? 1) * 100);
                // Cross-reference: if AI Credits are being consumed (< monthly max of 1000),
                // any model showing ≥80% is a FALSE positive (API jumps from 0% to 100% when switching to AI Credits)
                const aiCreditsConsumed = (userCredits?.availableCredits ?? 1000) < 500;
                const usingAiCredits = rawPct <= 5;
                const pct = usingAiCredits ? 0 : rawPct;
                const isLow = pct < 30;
                const isCritical = pct < 10 || usingAiCredits;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                      <span className="text-muted-foreground truncate max-w-[120px]">{m.label}</span>
                      {usingAiCredits ? (
                        <span className="font-mono font-bold text-amber-400">🪙 AI Credits</span>
                      ) : (
                        <span className={`font-mono font-bold ${isCritical ? 'text-red-400 animate-pulse' : isLow ? 'text-amber-400' : 'text-emerald-400'}`}>{pct}%</span>
                      )}
                    </div>
                    <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${isCritical ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-violet-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* ── Footer ── */}
        <div className="text-center text-[10px] text-muted-foreground/40 py-2">Centinela V10.1 Decision Matrix — Opus-Only Mode — Ciclo: ~210s{s?.timestamp && ` — ${new Date(s.timestamp).toLocaleTimeString()}`}</div>
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

      {activeModal === 'decision_matrix' && (() => {
        const dm = v8?.decision_matrix;
        const ls = dm?.last_score;
        const weights = dm?.weights || {};
        const thresholds = dm?.thresholds || {};
        const scoreColor = (score: number) => score >= 80 ? 'text-amber-400' : score >= 65 ? 'text-zinc-300' : score >= 50 ? 'text-orange-400' : 'text-red-400';
        return (
          <Modal title="Decision Matrix V10.1 — Detalle" icon={Brain} onClose={() => setActiveModal(null)} wide>
            <div className="space-y-4">
              {/* Score principal */}
              <div className="text-center py-3">
                <div className={`text-5xl font-bold font-mono ${ls ? scoreColor(ls.total) : 'text-zinc-500'}`}>{ls ? ls.total.toFixed(0) : '—'}</div>
                <div className="text-[11px] text-muted-foreground mt-1">Score Total / 100</div>
              </div>

              {/* Clusters detallados */}
              {ls && (
                <div className="space-y-3">
                  {[
                    { label: 'Estructura de Precio', emoji: '📊', score: ls.price_structure, max: 30, weight: weights.price_structure || 0.30, desc: 'Posición en rango, cruces, convergencia, estructura HL/LH, wicks, liquidez' },
                    { label: 'Flujo de Capital L2', emoji: '🌊', score: ls.capital_flow, max: 35, weight: weights.capital_flow || 0.35, desc: 'OBI, taker flow, toxicidad, cascadas, dead zone weighting' },
                    { label: 'Momentum y Volumen', emoji: '⚡', score: ls.momentum, max: 20, weight: weights.momentum || 0.20, desc: 'RSI, ATR percentile, volumen relativo, BB squeeze, divergencias' },
                    { label: 'Contexto de Mercado', emoji: '🌍', score: ls.context, max: 15, weight: weights.context || 0.15, desc: 'Régimen, sesión, ADX, EMA alignment' },
                  ].map((c, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-black/20 border border-border/20 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-foreground/80">{c.emoji} {c.label} ({(c.weight * 100).toFixed(0)}%)</span>
                        <span className={`font-mono font-bold text-sm ${scoreColor(c.score / c.max * 100)}`}>{c.score.toFixed(1)}/{c.max}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-black/30 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${c.score / c.max >= 0.8 ? 'bg-amber-500' : c.score / c.max >= 0.65 ? 'bg-zinc-300' : c.score / c.max >= 0.5 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, (c.score / c.max) * 100)}%` }} />
                      </div>
                      <div className="text-[9px] text-muted-foreground/50">{c.desc}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Thresholds */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="text-[10px] text-muted-foreground">🥇 Oro</div>
                  <div className="text-sm font-bold text-amber-400">≥{thresholds.gold || 80}</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-zinc-300/10 border border-zinc-300/20">
                  <div className="text-[10px] text-muted-foreground">🥈 Plata</div>
                  <div className="text-sm font-bold text-zinc-300">≥{thresholds.silver || 65}</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <div className="text-[10px] text-muted-foreground">🥉 Bronce</div>
                  <div className="text-sm font-bold text-orange-400">≥{thresholds.bronze || 50}</div>
                </div>
              </div>

              {/* Hard Kill info */}
              {ls?.hard_kill && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px]">
                  <strong className="text-red-400">🔴 HARD KILL:</strong> <span className="text-red-300">{ls.hard_kill_reason}</span>
                </div>
              )}

              {/* Info contextual */}
              <div className="p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/15 text-[11px] text-muted-foreground/70">
                <strong className="text-purple-300">ℹ️</strong> El Decision Matrix evalúa cada oportunidad con un scoring de 0-100 basado en 4 clusters ponderados. Solo señales con score ≥50 se escalan a Opus para parametrización. Hard Kills bloquean sin gastar créditos de IA.
              </div>

              <InfoRow label="Evaluaciones Totales" value={dm?.evaluations || 0} />
              <InfoRow label="Versión" value={dm?.version || 'N/A'} valueColor="text-purple-400" />
            </div>
          </Modal>
        );
      })()}

      {activeModal === 'balance' && (
        <Modal title="Balance & Sesión" icon={Shield} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <div className="text-center py-2">
              <div className="text-3xl font-bold font-mono text-amber-400">${bot?.balance_usd?.toFixed(2) || '0.00'}</div>
              <div className="text-[11px] text-muted-foreground mt-1">Balance Bybit (USDT)</div>
            </div>
            <InfoRow label="Sesión Activa" value={market?.session || '—'} valueColor="text-cyan-400" />
            <InfoRow label="Modo Bot" value={bot?.mode || 'N/A'} />
            <InfoRow label="Uptime" value={`${bot?.uptime_hours?.toFixed(1) || '0'}h`} />
            <InfoRow label="Versión" value={s?.version || '?'} valueColor="text-purple-400" />
            <InfoRow label="PnL Hoy" value={`$${s?.stats?.today?.pnl?.toFixed(2) || '0.00'}`} valueColor={(s?.stats?.today?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <InfoRow label="PnL Total" value={`$${s?.stats?.all_time?.pnl?.toFixed(2) || '0.00'}`} valueColor={(s?.stats?.all_time?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <InfoRow label="Trades Hoy" value={s?.stats?.today?.total || 0} />
            <InfoRow label="Kill Switch" value={bot?.kill_switch_active ? '⚠️ ACTIVO' : '✓ Normal'} valueColor={bot?.kill_switch_active ? 'text-red-400' : 'text-emerald-400'} />
            <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15 text-[11px] text-muted-foreground/70">
              <strong className="text-amber-300">ℹ️</strong> Balance se actualiza cada ciclo del bot (~210s). La sesión de mercado se calcula en base a hora UTC.
            </div>
          </div>
        </Modal>
      )}

      {activeModal === 'exchange' && (
        <Modal title="Exchange Bybit — Cuenta Completa" icon={Landmark} onClose={() => setActiveModal(null)} wide>
          <div className="space-y-4">
            {/* Account Overview */}
            <div className="text-center py-3">
              <div className="text-3xl font-bold font-mono text-amber-400">${account?.equity?.toFixed(2) || bot?.balance_usd?.toFixed(2) || '0.00'}</div>
              <div className="text-[11px] text-muted-foreground mt-1">Equity Total (USDT)</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <InfoRow label="Wallet Balance" value={`$${account?.wallet_balance?.toFixed(2) || '0.00'}`} valueColor="text-foreground" />
              <InfoRow label="Free Balance" value={`$${account?.free_balance?.toFixed(2) || '0.00'}`} valueColor="text-emerald-400" />
              <InfoRow label="Margen Usado" value={`$${account?.used_margin?.toFixed(2) || '0.00'}`} valueColor={(account?.used_margin || 0) > 0 ? 'text-amber-400' : 'text-zinc-400'} />
              <InfoRow label="PnL No Realizado" value={`${(account?.unrealized_pnl || 0) >= 0 ? '+' : ''}$${account?.unrealized_pnl?.toFixed(2) || '0.00'}`} valueColor={(account?.unrealized_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
              <InfoRow label="Total Balance" value={`$${account?.total_balance?.toFixed(2) || '0.00'}`} />
              <InfoRow label="Último Update" value={account?.last_update ? new Date(account.last_update).toLocaleTimeString() : '—'} />
            </div>
            <InfoRow label="PnL Hoy (Bot)" value={`$${s?.stats?.today?.pnl?.toFixed(2) || '0.00'}`} valueColor={(s?.stats?.today?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <InfoRow label="PnL Total (Bot)" value={`$${s?.stats?.all_time?.pnl?.toFixed(2) || '0.00'}`} valueColor={(s?.stats?.all_time?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <InfoRow label="Trades Hoy" value={s?.stats?.today?.total || 0} />
            
            {/* Exchange Trades Table */}
            {exTrades && exTrades.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-amber-400 flex items-center gap-1"><ArrowUpDown className="w-3.5 h-3.5" /> Últimas Operaciones Exchange ({exTrades.length})</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead><tr className="text-muted-foreground/60 border-b border-border/20"><th className="text-left px-2 py-1.5">ID</th><th className="text-left px-2 py-1.5">Fecha</th><th className="text-left px-2 py-1.5">Side</th><th className="text-right px-2 py-1.5">Precio</th><th className="text-right px-2 py-1.5">Cant.</th><th className="text-right px-2 py-1.5">Fee</th></tr></thead>
                    <tbody>{exTrades.map((t, i) => (
                      <tr key={i} className="border-b border-border/5 hover:bg-muted/10"><td className="px-2 py-1.5 font-mono text-muted-foreground">{t.id?.slice(-8) || '—'}</td><td className="px-2 py-1.5 text-muted-foreground">{t.datetime ? new Date(t.datetime).toLocaleString() : '—'}</td><td className="px-2 py-1.5"><span className={`px-1 py-0.5 rounded text-[9px] font-bold ${t.side === 'buy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{t.side?.toUpperCase()}</span></td><td className="px-2 py-1.5 text-right font-mono">${t.price?.toFixed(2)}</td><td className="px-2 py-1.5 text-right font-mono">{t.amount?.toFixed(4)}</td><td className="px-2 py-1.5 text-right text-muted-foreground/70 font-mono">${typeof t.fee === 'number' ? t.fee.toFixed(4) : '—'}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
            {/* P&L Real Exchange Summary */}
            {exSum && exSum.total_trades > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1"><Award className="w-3.5 h-3.5" /> P&L Real del Exchange ({exSum.source})</div>
                <div className="grid grid-cols-2 gap-2">
                  <InfoRow label="PnL Total Real" value={`${(exSum.net_pnl || 0) >= 0 ? '+' : ''}$${exSum.net_pnl?.toFixed(4)}`} valueColor={(exSum.net_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                  <InfoRow label="Win Rate Real" value={`${exSum.win_rate_real?.toFixed(1)}%`} valueColor={(exSum.win_rate_real || 0) >= 50 ? 'text-emerald-400' : 'text-red-400'} />
                  <InfoRow label="Operaciones" value={`${exSum.total_trades} (${exSum.wins}W/${exSum.losses}L)`} />
                  <InfoRow label="Avg Win/Loss" value={`$${exSum.avg_win?.toFixed(4)} / $${exSum.avg_loss?.toFixed(4)}`} />
                  <InfoRow label="Mejor Trade" value={`$${exSum.best_trade?.toFixed(4)}`} valueColor="text-emerald-400" />
                  <InfoRow label="Peor Trade" value={`$${exSum.worst_trade?.toFixed(4)}`} valueColor="text-red-400" />
                </div>
                {/* Closed PnL Trades Full Table */}
                {exSum.closed_pnl_trades?.length > 0 && (
                  <div className="overflow-x-auto">
                    <div className="text-[10px] text-muted-foreground mb-1">Posiciones Cerradas (closed_pnl de Bybit)</div>
                    <table className="w-full text-[11px]">
                      <thead><tr className="text-muted-foreground/60 border-b border-border/20"><th className="text-left px-2 py-1">Side</th><th className="text-right px-2 py-1">Entry</th><th className="text-right px-2 py-1">Exit</th><th className="text-right px-2 py-1">Qty</th><th className="text-right px-2 py-1">PnL Real</th><th className="text-right px-2 py-1">Lev</th></tr></thead>
                      <tbody>{exSum.closed_pnl_trades.map((t, i) => (
                        <tr key={i} className="border-b border-border/5 hover:bg-muted/10"><td className="px-2 py-1"><span className={`px-1 py-0.5 rounded text-[9px] font-bold ${t.side === 'Buy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{t.side}</span></td><td className="px-2 py-1 text-right font-mono">${t.entry?.toFixed(2)}</td><td className="px-2 py-1 text-right font-mono">${t.exit?.toFixed(2)}</td><td className="px-2 py-1 text-right font-mono">{t.qty}</td><td className={`px-2 py-1 text-right font-mono font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(4)}</td><td className="px-2 py-1 text-right text-muted-foreground">{t.leverage}x</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            <div className="p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/15 text-[11px] text-muted-foreground/70">
              <strong className="text-cyan-300">ℹ️</strong> Datos extraídos directamente de la API V5 de Bybit. Equity = Wallet + Unrealized PnL. P&L Real usa endpoint /v5/position/closed-pnl. Se actualiza cada ciclo (~210s).
            </div>
          </div>
        </Modal>
      )}

      {activeModal === 'market' && (
        <Modal title="Mercado — Detalle Completo" icon={BarChart3} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <div className="text-center py-2">
              <div className="text-2xl font-bold font-mono text-foreground">${market?.price?.toFixed(2) || '—'}</div>
              <div className="text-[11px] text-muted-foreground">ETH/USDT</div>
              <div className="text-[10px] text-purple-400 mt-1">{market?.session || '—'}</div>
            </div>
            <InfoRow label="Precio" value={`$${market?.price?.toFixed(2) || '—'}`} />
            <InfoRow label="Tendencia" value={market?.trend || '—'} valueColor={market?.trend === 'LONG' || market?.trend === 'ALCISTA' ? 'text-emerald-400' : 'text-red-400'} />
            <InfoRow label="Régimen" value={market?.regime || '—'} />
            <InfoRow label="Perfil Recomendado" value={market?.regime_profile || '—'} valueColor="text-purple-400" />
            <InfoRow label="Confianza Régimen" value={`${((market?.regime_confidence || 0) * 100).toFixed(0)}%`} />
            <InfoRow label="Volatilidad" value={market?.volatility || '—'} valueColor={market?.volatility === 'HIGH' ? 'text-red-400' : 'text-emerald-400'} />
            <InfoRow label="ATR Ratio" value={market?.atr_ratio?.toFixed(3) || '—'} />
            <InfoRow label="Sesión Activa" value={market?.session || '—'} valueColor="text-cyan-400" />
            <InfoRow label="Balance Bybit" value={`$${bot?.balance_usd?.toFixed(2) || '0.00'}`} valueColor="text-amber-400" />
            <InfoRow label="Pérdidas Consecutivas" value={bot?.consecutive_losses || 0} valueColor={(bot?.consecutive_losses || 0) >= 2 ? 'text-red-400' : 'text-emerald-400'} />
            <InfoRow label="Kill Switch" value={bot?.kill_switch_active ? '⚠️ ACTIVO' : '✓ Inactivo'} valueColor={bot?.kill_switch_active ? 'text-red-400' : 'text-emerald-400'} />
            <div className="p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/15 text-[11px] text-muted-foreground/70">
              <strong className="text-cyan-300">ℹ️</strong> Asia (00-07 UTC) · London (08-13) · NYC (14-17) · Overlaps = mayor volumen y oportunidades.
            </div>
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

      {activeModal === 'v8' && (
        <Modal title="V8 Infinity — Sistemas Avanzados" icon={Cpu} onClose={() => setActiveModal(null)} wide>
          <div className="space-y-4">
            {/* Circuit Breaker */}
            <div className="p-3 rounded-lg bg-card/30 border border-border/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold"><ShieldAlert className="w-4 h-4 text-amber-400" /> Circuit Breaker Multinivel</div>
              <div className="grid grid-cols-2 gap-2">
                <InfoRow label="Nivel Actual" value={v8?.circuit_breaker?.level || 'GREEN'} valueColor={v8?.circuit_breaker?.level === 'GREEN' ? 'text-emerald-400' : v8?.circuit_breaker?.level === 'BLACK' ? 'text-red-400' : 'text-amber-400'} />
                <InfoRow label="P&L Diario %" value={`${v8?.circuit_breaker?.daily_pnl_pct?.toFixed(2) || '0.00'}%`} valueColor={(v8?.circuit_breaker?.daily_pnl_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                <InfoRow label="Trades Hoy" value={v8?.circuit_breaker?.trades_today || 0} />
                <InfoRow label="Bloqueado Hasta" value={v8?.circuit_breaker?.blocked_until || '—'} />
              </div>
              <div className="text-[10px] text-muted-foreground/60 p-2 bg-black/20 rounded">GREEN (normal) → YELLOW (-1.5%, lev/2) → RED (-3%, ultra_def) → BLACK (-5%, STOP 24h)</div>
            </div>
            {/* Consensus */}
            <div className="p-3 rounded-lg bg-card/30 border border-border/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold"><Layers className="w-4 h-4 text-cyan-400" /> Consensus Engine</div>
              <InfoRow label="Alineamiento" value={`${((v8?.consensus?.last_score || 0) * 100).toFixed(0)}%`} valueColor={(v8?.consensus?.last_score || 0) >= 0.7 ? 'text-emerald-400' : 'text-amber-400'} />
              <InfoRow label="Tendencia" value={v8?.consensus?.alignment_trend || 'N/A'} />
              <InfoRow label="Evaluaciones" value={v8?.consensus?.evaluations_count || 0} />
              <div className="text-[10px] text-muted-foreground/60 p-2 bg-black/20 rounded">Mide acuerdo entre Flash, Pro y Opus. 100% = unanimidad. Conflictos activan trailing agresivo.</div>
            </div>
            {/* Rolling Context */}
            <div className="p-3 rounded-lg bg-card/30 border border-border/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold"><Timer className="w-4 h-4 text-purple-400" /> Rolling Context (Buffer 2h)</div>
              <InfoRow label="Eventos Totales" value={v8?.rolling_context?.total_events || 0} />
              <InfoRow label="Ventana" value={`${v8?.rolling_context?.window_hours || 2} horas`} />
              {v8?.rolling_context?.compact_briefing && <div className="text-[10px] text-muted-foreground/70 p-2 bg-black/20 rounded font-mono">{v8.rolling_context.compact_briefing}</div>}
            </div>
            {/* Supervision */}
            <div className="p-3 rounded-lg bg-card/30 border border-border/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold"><Brain className="w-4 h-4 text-pink-400" /> Modo Opus-Only (Cadena de Mando)</div>
              <InfoRow label="Flash (Capa 1.5)" value={`${v8?.supervision?.flash_model || 'Gemini 3 Flash'} — cada ${(v8?.supervision?.flash_interval_s || 60)}s`} />
              <InfoRow label="Pro (Capa 2)" value={`${v8?.supervision?.pro_model || 'Gemini 3.1 Pro High'} — cada ${((v8?.supervision?.pro_interval_s || 900) / 60)}min`} />
              <InfoRow label="Opus (Capa 3)" value={`${v8?.supervision?.opus_model || 'Claude Opus 4.6'} — cada ${((v8?.supervision?.opus_interval_s || 1800) / 60)}min`} valueColor="text-pink-400" />
              <div className="text-[10px] text-muted-foreground/60 p-2 bg-black/20 rounded">Opus tiene la DECISIÓN FINAL absoluta. Flash escala a Pro, Pro escala a Opus.</div>
            </div>
            {/* Heartbeat */}
            <div className="p-3 rounded-lg bg-card/30 border border-border/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold"><HeartPulse className={`w-4 h-4 ${hb ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} /> Heartbeat</div>
              <InfoRow label="Estado" value={hb ? '● VIVO' : '○ Sin heartbeat'} valueColor={hb ? 'text-emerald-400' : 'text-zinc-500'} />
              {hb?.bybit_connected !== undefined && <InfoRow label="Bybit" value={hb.bybit_connected ? '✓ Conectado' : '✗ Desconectado'} valueColor={hb.bybit_connected ? 'text-emerald-400' : 'text-red-400'} />}
              {hb?.received_at && <InfoRow label="Último HB" value={new Date(hb.received_at).toLocaleString()} />}
              {hb?.version && <InfoRow label="Versión Bot" value={hb.version} />}
            </div>
            {/* V8-INF: Metrics */}
            <div className="p-3 rounded-lg bg-card/30 border border-border/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold"><BarChart3 className="w-4 h-4 text-purple-400" /> 📊 Performance Metrics</div>
              <div className="grid grid-cols-2 gap-2">
                <InfoRow label="Sharpe Ratio" value={v8?.metrics?.sharpe_ratio?.toFixed(2) || '0.00'} valueColor={(v8?.metrics?.sharpe_ratio || 0) >= 1 ? 'text-emerald-400' : (v8?.metrics?.sharpe_ratio || 0) >= 0 ? 'text-amber-400' : 'text-red-400'} />
                <InfoRow label="Sortino Ratio" value={v8?.metrics?.sortino_ratio?.toFixed(2) || '0.00'} valueColor={(v8?.metrics?.sortino_ratio || 0) >= 1 ? 'text-emerald-400' : 'text-amber-400'} />
                <InfoRow label="Max Drawdown" value={`${v8?.metrics?.max_drawdown_pct?.toFixed(2) || '0.00'}%`} valueColor={(v8?.metrics?.max_drawdown_pct || 0) > -5 ? 'text-amber-400' : 'text-red-400'} />
                <InfoRow label="Profit Factor" value={v8?.metrics?.profit_factor?.toFixed(2) || '0.00'} valueColor={(v8?.metrics?.profit_factor || 0) >= 1.5 ? 'text-emerald-400' : (v8?.metrics?.profit_factor || 0) >= 1 ? 'text-amber-400' : 'text-red-400'} />
                <InfoRow label="Expectancy" value={`$${v8?.metrics?.expectancy_usd?.toFixed(2) || '0.00'}`} valueColor={(v8?.metrics?.expectancy_usd || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                <InfoRow label="Calmar Ratio" value={v8?.metrics?.calmar_ratio?.toFixed(2) || '0.00'} />
                <InfoRow label="Avg R:R Real" value={v8?.metrics?.avg_rr?.toFixed(2) || '0.00'} />
              </div>
              <div className="text-[10px] text-muted-foreground/60 p-2 bg-black/20 rounded">Métricas institucionales calculadas sobre el historial completo de trades.</div>
            </div>
            {/* V8-INF: Multi-TF Fusion */}
            <div className="p-3 rounded-lg bg-card/30 border border-border/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold"><Layers className="w-4 h-4 text-cyan-400" /> 🔗 Multi-Timeframe Fusion</div>
              <InfoRow label="Fusion Score" value={`${((v8?.multi_tf_fusion?.score || 0) * 100).toFixed(0)}%`} valueColor={(v8?.multi_tf_fusion?.score || 0) >= 0.7 ? 'text-emerald-400' : (v8?.multi_tf_fusion?.score || 0) >= 0.4 ? 'text-amber-400' : 'text-red-400'} />
              <InfoRow label="Nivel" value={v8?.multi_tf_fusion?.level || 'N/A'} />
              {v8?.multi_tf_fusion?.factors && Object.keys(v8.multi_tf_fusion.factors).length > 0 && (
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(v8.multi_tf_fusion.factors).map(([k, v_val]) => (
                    <div key={k} className="flex justify-between text-[10px] px-2 py-0.5 bg-black/20 rounded">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="text-foreground/80 font-mono">{typeof v_val === 'number' ? v_val.toFixed(2) : String(v_val)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground/60 p-2 bg-black/20 rounded">Fusión 15m (HTF) + 1m (LTF): Direction(35%) + Momentum(20%) + Volume(20%) + Structure(15%) + OBI(10%)</div>
            </div>
            {/* V8-INF: Order Flow */}
            <div className="p-3 rounded-lg bg-card/30 border border-border/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold"><Activity className="w-4 h-4 text-amber-400" /> 🌊 Order Flow Microstructure</div>
              <div className="grid grid-cols-2 gap-2">
                <InfoRow label="Bias Compuesto" value={v8?.order_flow?.composite_bias || 'NEUTRAL'} valueColor={v8?.order_flow?.composite_bias === 'BULLISH' ? 'text-emerald-400' : v8?.order_flow?.composite_bias === 'BEARISH' ? 'text-red-400' : 'text-zinc-400'} />
                <InfoRow label="Confianza" value={`${((v8?.order_flow?.composite_confidence || 0) * 100).toFixed(0)}%`} />
                <InfoRow label="Spoofing" value={v8?.order_flow?.spoofing_detected ? '⚠️ DETECTADO' : '✓ Limpio'} valueColor={v8?.order_flow?.spoofing_detected ? 'text-red-400' : 'text-emerald-400'} />
                <InfoRow label="Iceberg" value={v8?.order_flow?.iceberg_detected ? '🧊 DETECTADO' : '✓ Limpio'} valueColor={v8?.order_flow?.iceberg_detected ? 'text-amber-400' : 'text-emerald-400'} />
                <InfoRow label="CVD Divergence" value={v8?.order_flow?.cvd_divergence || 'NONE'} valueColor={v8?.order_flow?.cvd_divergence !== 'NONE' ? 'text-amber-400' : 'text-zinc-400'} />
                <InfoRow label="Absorption" value={v8?.order_flow?.absorption_detected ? '🛡️ DETECTADO' : '✓ Limpio'} valueColor={v8?.order_flow?.absorption_detected ? 'text-cyan-400' : 'text-emerald-400'} />
                <InfoRow label="Trades Procesados" value={v8?.order_flow?.trades_processed || 0} />
              </div>
              <div className="text-[10px] text-muted-foreground/60 p-2 bg-black/20 rounded">Análisis de microestructura: detecta manipulación (spoofing, icebergs), divergencias CVD y absorción de liquidez.</div>
            </div>
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
        <Modal title="Mem0 — Cerebro Semántico" icon={Database} onClose={() => setActiveModal(null)}>
          <div className="space-y-3">
            <InfoRow label="Modo" value={s?.memory?.mode || '?'} valueColor={s?.memory?.mem0_connected ? 'text-emerald-400' : 'text-amber-400'} />
            <InfoRow label="Cloud" value={s?.memory?.mem0_connected ? '✓ Conectado' : '✗ Desconectado'} valueColor={s?.memory?.mem0_connected ? 'text-emerald-400' : 'text-red-400'} />
            <InfoRow label="Memorias Locales" value={s?.memory?.local_memories || 0} />
            <InfoRow label="Categorías" value={s?.memory?.categories_configured ? '13 configuradas' : 'No configuradas'} valueColor={s?.memory?.categories_configured ? 'text-emerald-400' : 'text-zinc-400'} />
            <InfoRow label="Versión" value={s?.memory?.version || '?'} valueColor="text-purple-400" />
            <InfoRow label="Entidades" value={`${(s?.memory?.entity_agents as string[])?.length || 0} agentes`} />
            <div className="text-[10px] text-muted-foreground/60 p-2 bg-black/20 rounded">
              Entidades: postmortem, opus_decisions, flash, pro, regime, sensory, dashboard, kill_switch, pattern
            </div>
            <div className="p-2.5 rounded-lg bg-pink-500/5 border border-pink-500/15 text-[11px] text-muted-foreground/70">
              <strong className="text-pink-300">🧠</strong> Mem0 almacena lecciones de trades, patrones detectados, decisiones de Opus, y eventos de régimen. Se consulta antes de cada trade para evitar errores repetidos.
            </div>
          </div>
        </Modal>
      )}

      {activeModal === 'rotation' && (() => {
        const rotator = s?.chat_rotator;
        const history = (rotator?.rotation_history || []).slice().reverse();
        return (
          <Modal title="Rotación de Chat — Historial" icon={RefreshCw} onClose={() => setActiveModal(null)} wide>
            <div className="space-y-4">
              {/* Estado actual */}
              <div className="p-3 rounded-lg bg-gradient-to-r from-amber-500/5 to-purple-500/5 border border-amber-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground/80">Chat Activo</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${rotator?.needs_rotation ? 'bg-red-500/15 text-red-400 border-red-500/30 animate-pulse' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'}`}>
                    {rotator?.needs_rotation ? '⚠️ NECESITA ROTACIÓN' : '✓ ESTABLE'}
                  </span>
                </div>
                <InfoRow label="Chat ID" value={rotator?.chat_id?.substring(0, 16) || '—'} />
                <InfoRow label="Steps Actuales" value={`${rotator?.current_steps || 0} / ${rotator?.max_steps || 1000}`} valueColor={(rotator?.usage_pct || 0) >= 90 ? 'text-red-400' : (rotator?.usage_pct || 0) >= 70 ? 'text-amber-400' : 'text-emerald-400'} />
                <InfoRow label="Umbral Rotación" value={`${rotator?.preservation_threshold || 900} steps (${((rotator?.preservation_threshold || 900) / (rotator?.max_steps || 1000) * 100).toFixed(0)}%)`} />
                <InfoRow label="Uso" value={`${rotator?.usage_pct || 0}%`} valueColor={(rotator?.usage_pct || 0) >= 90 ? 'text-red-400' : 'text-foreground'} />
                {/* Barra visual */}
                <div className="mt-2 h-2 rounded-full bg-black/30 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${(rotator?.usage_pct || 0) >= 90 ? 'bg-red-500' : (rotator?.usage_pct || 0) >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(rotator?.usage_pct || 0, 100)}%` }} />
                </div>
              </div>

              {/* Estadísticas */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-card/30 border border-border/20 text-center">
                  <div className="text-[10px] text-muted-foreground/50">Rotaciones Totales</div>
                  <div className="text-lg font-bold font-mono text-amber-400">{rotator?.rotations_total || 0}</div>
                </div>
                <div className="p-2 rounded-lg bg-card/30 border border-border/20 text-center">
                  <div className="text-[10px] text-muted-foreground/50">Última Rotación</div>
                  <div className="text-sm font-bold font-mono text-foreground/70">{rotator?.last_rotation ? new Date(rotator.last_rotation).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                </div>
                <div className="p-2 rounded-lg bg-card/30 border border-border/20 text-center">
                  <div className="text-[10px] text-muted-foreground/50">Preservación Periódica</div>
                  <div className="text-sm font-bold font-mono text-cyan-400">cada {rotator?.periodic_preservation_hours || 4}h</div>
                </div>
                <div className="p-2 rounded-lg bg-card/30 border border-border/20 text-center">
                  <div className="text-[10px] text-muted-foreground/50">Hrs Sin Preservar</div>
                  <div className={`text-sm font-bold font-mono ${(rotator?.hours_since_last_preservation || 0) >= (rotator?.periodic_preservation_hours || 4) ? 'text-amber-400' : 'text-emerald-400'}`}>{rotator?.hours_since_last_preservation || 0}h</div>
                </div>
              </div>

              {/* Historial de rotaciones */}
              <div>
                <div className="text-xs font-semibold text-foreground/70 mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" /> Historial de Rotaciones ({history.length})
                </div>
                {history.length > 0 ? (
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {history.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-black/20 border border-border/10 text-[11px]">
                        <div className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-bold text-amber-400">#{history.length - i}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-muted-foreground/60">{r.old_chat_id?.substring(0, 8)}</span>
                            <span className="text-amber-400">→</span>
                            <span className="font-mono text-cyan-400">{r.new_chat_id?.substring(0, 8)}</span>
                            <span className="text-[10px] px-1 py-0 rounded bg-purple-500/15 text-purple-400 border border-purple-500/20 ml-auto shrink-0">{r.steps_at_rotation} steps</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground/40">{r.rotated_at ? new Date(r.rotated_at).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                            {r.reason && <span className="text-[9px] text-muted-foreground/30 truncate">{r.reason}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-muted-foreground/40 text-[11px]">Sin rotaciones registradas aún</div>
                )}
              </div>

              {/* Historial de preservaciones */}
              <div>
                <div className="text-xs font-semibold text-foreground/70 mb-2 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-cyan-400" /> Historial de Preservaciones ({(rotator?.preservation_history || []).length})
                </div>
                {(rotator?.preservation_history || []).length > 0 ? (
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {(rotator?.preservation_history || []).slice().reverse().map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-1.5 rounded bg-black/20 border border-border/10 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-cyan-400">🧠</span>
                          <span className="text-muted-foreground/60">{p.timestamp ? new Date(p.timestamp).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground/40">{p.chat_id}</span>
                          <span className="text-[9px] px-1 py-0 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">{p.chars} chars</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-2 text-center text-muted-foreground/40 text-[10px]">Sin preservaciones registradas aún</div>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15 text-[11px] text-muted-foreground/70">
                <strong className="text-amber-300">🔄</strong> La rotación preserva el conocimiento acumulado, crea un nuevo chat en el workspace ANTIGRAVITY, y transfiere el contexto. Se activa al superar {rotator?.preservation_threshold || 900} steps.
              </div>
            </div>
          </Modal>
        );
      })()}
      {/* ── Modal: Régimen Semanal ── */}
      {activeModal === 'regime' && (() => {
        const wr: WeeklyRegime | null = s?.heartbeat?.weekly_regime || null;
        const daySchedule = [
          { day: 'Domingo', type: 'TRANSITION', mult: '3.0x → 0.8x', note: `Activo desde ${wr?.sunday_activation_utc || 18}:00 UTC (${(wr?.sunday_activation_utc || 18) - 6}:00 CST)` },
          { day: 'Lunes', type: 'ACTIVE', mult: '0.7x', note: 'Ultra-activo' },
          { day: 'Martes', type: 'ACTIVE', mult: '0.7x', note: 'Ultra-activo' },
          { day: 'Miércoles', type: 'TRANSITION', mult: '1.0x → 1.5x', note: `Pasivo desde ${wr?.wednesday_deactivation_utc || 21}:00 UTC (${(wr?.wednesday_deactivation_utc || 21) - 6}:00 CST)` },
          { day: 'Jueves', type: 'PASSIVE', mult: '2.0x', note: 'Pasivo' },
          { day: 'Viernes', type: 'PASSIVE', mult: '3.0x', note: 'Mínimo' },
          { day: 'Sábado', type: 'PASSIVE', mult: '3.0x', note: 'Mínimo' },
        ];
        const typeColors: Record<string, string> = {
          'ACTIVE': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          'TRANSITION': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
          'PASSIVE': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        };
        // Use UTC day to match scheduler (which operates in UTC)
        const utcDay = new Date().getUTCDay();
        // daySchedule: [Domingo=0, Lunes=1, Martes=2, Miércoles=3, Jueves=4, Viernes=5, Sábado=6]
        // JS getUTCDay: Sunday=0, Monday=1, ..., Saturday=6 — matches directly!
        const todayIdx = utcDay;
        return (
          <Modal title="Régimen Semanal — V4.1" icon={Radio} onClose={() => setActiveModal(null)} wide>
            <div className="space-y-4">
              {/* Estado actual */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-black/20 border border-border/10">
                  <div className="text-[10px] text-muted-foreground/50">Modo Actual</div>
                  <div className="text-sm font-bold text-foreground/80">{wr?.current_mode || '—'}</div>
                </div>
                <div className="p-2 rounded bg-black/20 border border-border/10">
                  <div className="text-[10px] text-muted-foreground/50">Tipo de Día</div>
                  <div className="text-sm font-bold text-foreground/80">{wr?.day_type || '—'}{wr?.override ? ` → ${wr.override}` : ''}</div>
                </div>
              </div>
              {wr?.override && (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                  ⚡ <strong>Override activo:</strong> {wr.override} — {wr.override_remaining_min} min restantes
                </div>
              )}
              {wr?.next_transition && (
                <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300">
                  🔄 <strong>Próxima transición:</strong> {wr.next_transition}
                </div>
              )}
              {/* Tabla de días */}
              <div>
                <div className="text-xs font-semibold text-foreground/70 mb-2">Programación Semanal</div>
                <div className="space-y-1">
                  {daySchedule.map((d, i) => (
                    <div key={i} className={`flex items-center justify-between p-1.5 rounded text-[10px] border ${i === todayIdx ? 'bg-purple-500/10 border-purple-500/30 ring-1 ring-purple-500/20' : 'bg-black/20 border-border/10'}`}>
                      <div className="flex items-center gap-2">
                        {i === todayIdx && <span className="text-purple-400">▶</span>}
                        <span className={`font-semibold ${i === todayIdx ? 'text-purple-300' : 'text-foreground/70'}`}>{d.day}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground/50">{d.mult}</span>
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${typeColors[d.type] || ''}`}>{d.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Auto-adapt info */}
              <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/15 text-[11px] text-muted-foreground/70">
                <strong className="text-blue-300">🧠 Auto-Adapt:</strong> Si un día pasivo detecta volatilidad alta (vol &gt; 2.0x o vela &gt; 1.5%), activa override temporal a modo ACTIVO por 60 min. Si miércoles PM tiene vol baja (&lt; 0.6x), pasa a modo PASIVO automáticamente.
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ── Modal: Cuota de Modelos ── */}
      {activeModal === 'quotas' && (
        <Modal title="Créditos & Cuota — Detalle" icon={Cpu} onClose={() => setActiveModal(null)} wide>
          <div className="space-y-3">
            {/* Account info */}
            {userCredits && (
              <div className="p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/20">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div><span className="text-muted-foreground/50">Email:</span> <span className="text-foreground/70 font-mono">{userCredits.email || '—'}</span></div>
                  <div><span className="text-muted-foreground/50">Nombre:</span> <span className="text-foreground/70">{userCredits.name || '—'}</span></div>
                  <div><span className="text-muted-foreground/50">Tier:</span> <span className="text-violet-300 font-bold">{userCredits.tier || '—'}</span></div>
                  <div><span className="text-muted-foreground/50">Plan:</span> <span className="text-violet-300 font-bold">{userCredits.plan || '—'}</span></div>
                </div>
                {/* AI Credits section */}
                {userCredits.availableCredits !== null && (
                  <div className="mt-2 pt-2 border-t border-violet-500/10">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-muted-foreground/70">🪙 AI Credits Disponibles</span>
                      <span className={`font-mono font-bold text-sm ${(userCredits.availableCredits ?? 0) < 100 ? 'text-red-400 animate-pulse' : (userCredits.availableCredits ?? 0) < 300 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {userCredits.availableCredits}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-black/30 overflow-hidden mb-1">
                      <div className={`h-full rounded-full transition-all duration-500 ${(userCredits.availableCredits ?? 0) < 100 ? 'bg-red-500' : (userCredits.availableCredits ?? 0) < 300 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, ((userCredits.availableCredits ?? 0) / 1000) * 100)}%` }} />
                    </div>
                    {userCredits.minCreditsForUsage && (
                      <div className="text-[9px] text-muted-foreground/40">Mínimo para uso: {userCredits.minCreditsForUsage}</div>
                    )}
                    {(userCredits.availableCredits ?? 0) < 100 && (
                      <div className="mt-1 text-[9px] text-red-400">⚠️ Créditos bajos — considerar cambio de cuenta o compra</div>
                    )}
                  </div>
                )}
                {userCredits.fetchedAt && (
                  <div className="text-[9px] text-muted-foreground/30 mt-1">Actualizado: {new Date(userCredits.fetchedAt).toLocaleString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                )}
              </div>
            )}
            {modelQuotas.length === 0 ? (
              <div className="py-4 text-center text-muted-foreground/40 text-[11px]">Cargando información de modelos...</div>
            ) : (
              modelQuotas.map((m, i) => {
                const rawPct = Math.round((m.quota ?? 1) * 100);
                const aiCreditsConsumed = (userCredits?.availableCredits ?? 1000) < 500;
                const usingAiCredits = rawPct <= 5;
                const pct = usingAiCredits ? 0 : rawPct;
                const isLow = pct < 30;
                const isCritical = pct < 10 || usingAiCredits;
                const isOpus = m.modelId.toLowerCase().includes('opus');
                return (
                  <div key={i} className={`p-2.5 rounded-lg border ${isOpus ? 'bg-violet-500/5 border-violet-500/20' : 'bg-black/20 border-border/10'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${isOpus ? 'text-violet-300' : 'text-foreground/70'}`}>{m.label}</span>
                        {isOpus && <span className="text-[9px] px-1 py-0 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30">Principal</span>}
                        {m.isRecommended && <span className="text-[9px] px-1 py-0 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">★</span>}
                      </div>
                      {usingAiCredits ? (
                        <span className="text-sm font-bold font-mono text-amber-400">🪙 AI Credits</span>
                      ) : (
                        <span className={`text-sm font-bold font-mono ${isCritical ? 'text-red-400 animate-pulse' : isLow ? 'text-amber-400' : 'text-emerald-400'}`}>{pct}%</span>
                      )}
                    </div>
                    <div className="h-2 rounded-full bg-black/40 overflow-hidden mb-1">
                      <div className={`h-full rounded-full transition-all duration-700 ${isCritical ? 'bg-gradient-to-r from-red-600 to-red-400' : isLow ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-violet-600 to-violet-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground/50">
                      <span className="font-mono">{m.modelId}</span>
                      {m.resetTime && <span>Reset: {new Date(m.resetTime).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                    {usingAiCredits && <div className="mt-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">🪙 Cuota gratuita agotada — consumiendo AI Credits mensuales</div>}
                    {!usingAiCredits && isCritical && <div className="mt-1 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">⚠️ Cuota crítica — el bot reducirá llamadas automáticamente</div>}
                  </div>
                );
              })
            )}
            <div className="p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/15 text-[11px] text-muted-foreground/70">
              <strong className="text-violet-300">💎 Nota:</strong> La cuota se actualiza cada ciclo del dashboard (~15s). En días pasivos (Jue-Sáb) el consumo se reduce ~70-85% automáticamente gracias al Régimen Semanal V4.
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
