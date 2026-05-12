// === Bot Status API — V8 Infinity ===
// Serves the bot's real-time status, trade history, logs, heartbeat and chat info.

const fs = require('fs');
const path = require('path');

// V8: In-memory heartbeat store (latest from bot)
let _lastHeartbeat = null;

// Resolve files relative to repo root — NO absolute paths
function findBotStatusFile() {
    const candidates = [
        path.join(process.cwd(), '..', 'quant_agent', 'data_dump', 'bot_status.json'),
        path.join(process.cwd(), 'quant_agent', 'data_dump', 'bot_status.json'),
        path.resolve(__dirname, '..', '..', 'quant_agent', 'data_dump', 'bot_status.json'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return candidates[2];
}

function findTradeHistoryFile() {
    const candidates = [
        path.join(process.cwd(), '..', 'quant_agent', 'data_dump', 'trade_history.jsonl'),
        path.join(process.cwd(), 'quant_agent', 'data_dump', 'trade_history.jsonl'),
        path.resolve(__dirname, '..', '..', 'quant_agent', 'data_dump', 'trade_history.jsonl'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return candidates[2];
}

function findLogFile() {
    const candidates = [
        path.join(process.cwd(), '..', 'quant_agent', 'logs', 'centinela.log'),
        path.join(process.cwd(), 'quant_agent', 'logs', 'centinela.log'),
        path.resolve(__dirname, '..', '..', 'quant_agent', 'logs', 'centinela.log'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return candidates[2];
}

module.exports = function (app) {
    // GET /api/bot-status — Full bot status snapshot
    app.get('/api/bot-status', (req, res) => {
        try {
            const statusFile = findBotStatusFile();
            if (!fs.existsSync(statusFile)) {
                return res.json({
                    timestamp: new Date().toISOString(),
                    bot: { mode: 'OFFLINE', uptime_hours: 0 },
                    market: {},
                    l2: {},
                    active_trade: null,
                    stats: { today: { total: 0, pnl: 0 }, week: { total: 0, pnl: 0 }, month: { total: 0, pnl: 0 }, all_time: { total: 0, pnl: 0 } },
                    recent_trades: [],
                    rankings: { best: [], worst: [] },
                    bot_chats: {},
                    memory: {},
                    v8: {},
                    heartbeat: null,
                });
            }
            
            const raw = fs.readFileSync(statusFile, 'utf8');
            const status = JSON.parse(raw);
            
            // Add staleness indicator (if last update > 60s ago)
            const lastUpdate = new Date(status.timestamp);
            const ageSeconds = (Date.now() - lastUpdate.getTime()) / 1000;
            status._stale = ageSeconds > 300;  // V8-INF: 300s (ciclo bot ~210s)
            status._age_seconds = Math.round(ageSeconds);
            
            // V8: Inject latest heartbeat data
            status.heartbeat = _lastHeartbeat;
            
            res.json(status);
        } catch (err) {
            console.error('[bot-status] Error reading status:', err.message);
            res.status(500).json({ error: 'Failed to read bot status' });
        }
    });
    
    // POST /api/bot-heartbeat — V8: Receive heartbeat from bot
    app.post('/api/bot-heartbeat', (req, res) => {
        try {
            _lastHeartbeat = {
                ...req.body,
                received_at: new Date().toISOString(),
            };
            res.json({ ok: true });
        } catch (err) {
            console.error('[bot-heartbeat] Error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });
    
    // GET /api/bot-heartbeat — V8: Get latest heartbeat
    app.get('/api/bot-heartbeat', (req, res) => {
        res.json(_lastHeartbeat || { status: 'no_heartbeat_yet' });
    });
    
    // GET /api/bot-trades — Full trade history
    app.get('/api/bot-trades', (req, res) => {
        try {
            const histFile = findTradeHistoryFile();
            if (!fs.existsSync(histFile)) {
                return res.json({ trades: [], total: 0 });
            }
            
            const raw = fs.readFileSync(histFile, 'utf8');
            const trades = raw.split('\n')
                .filter(l => l.trim())
                .map(l => { try { return JSON.parse(l); } catch { return null; } })
                .filter(Boolean);
            
            const limit = parseInt(req.query.limit) || 50;
            const recent = trades.slice(-limit).reverse();
            
            res.json({ trades: recent, total: trades.length });
        } catch (err) {
            console.error('[bot-trades] Error:', err.message);
            res.status(500).json({ error: 'Failed to read trade history' });
        }
    });

    // GET /api/bot-logs — Tail of centinela.log
    app.get('/api/bot-logs', (req, res) => {
        try {
            const logFile = findLogFile();
            if (!fs.existsSync(logFile)) {
                return res.json({ logs: [], total: 0, file: logFile });
            }
            
            const raw = fs.readFileSync(logFile, 'utf8');
            const allLines = raw.split('\n').filter(l => l.trim());
            const limit = Math.min(parseInt(req.query.limit) || 80, 500);
            const tail = allLines.slice(-limit);
            
            // Parse each log line into structured data
            const logs = tail.map(line => {
                // Format: [2026-04-16 22:02:16] [INFO] [MODULE] message
                const match = line.match(/^\[?(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})[,.]?\d*\]?\s*\[(\w+)\s*\]\s*(?:\[(\w+)\s*\])?\s*(.*)/);
                if (match) {
                    return {
                        timestamp: match[1],
                        level: match[2].trim(),
                        module: (match[3] || '').trim(),
                        message: match[4],
                    };
                }
                return { timestamp: '', level: 'INFO', module: '', message: line };
            });
            
            res.json({ logs: logs.reverse(), total: allLines.length, file: logFile });
        } catch (err) {
            console.error('[bot-logs] Error:', err.message);
            res.status(500).json({ error: 'Failed to read logs' });
        }
    });

    // GET /api/bot-chat-info/:chatId — Chat metadata from conversations API
    app.get('/api/bot-chat-info/:chatId', (req, res) => {
        try {
            const chatId = req.params.chatId;
            let info = {
                id: chatId,
                exists: false,
                stepCount: 0,
                lastUpdate: null,
                title: chatId.substring(0, 8) + '...',
            };

            try {
                // Try to get live status from the poller's known summaries and step cache
                const poller = require('../poller');
                const { stepCache } = require('../step-cache');
                const signature = poller._knownConvSummaries?.get(chatId);
                const liveStepCount = poller._lastCascadeStepCountMap?.[chatId];
                const cache = stepCache[chatId];
                
                if (signature || cache) {
                    info.exists = true;
                    
                    // Priority 1: stepCache (most accurate — real-time)
                    if (cache) {
                        info.stepCount = (cache.baseIndex || 0) + cache.steps.length;
                        info.lastUpdate = cache.lastUpdateTime || new Date().toISOString();
                    }
                    // Priority 2: poller's live step count map
                    else if (liveStepCount !== undefined) {
                        info.stepCount = liveStepCount;
                        info.lastUpdate = new Date().toISOString();
                    }
                    
                    // Parse the pipe-delimited signature: "title|stepCount|lastModifiedTime"
                    if (signature && typeof signature === 'string') {
                        const parts = signature.split('|');
                        if (parts[0]) info.title = parts[0];
                        // Use signature stepCount only if we have nothing better
                        if (!info.stepCount && parts[1]) info.stepCount = parseInt(parts[1]) || 0;
                        if (!info.lastUpdate && parts[2]) info.lastUpdate = parts[2];
                    }
                    
                    return res.json(info);
                }
            } catch (err) {
                console.error('[bot-chat-info] poller error:', err.message);
            }

            // Fallback to local cascade_data only if poller has no info yet
            const stateDir = path.join(process.cwd(), 'cascade_data');
            const chatDir = path.join(stateDir, chatId);
            
            if (fs.existsSync(chatDir)) {
                info.exists = true;
                const files = fs.readdirSync(chatDir);
                // Count step files
                const stepFiles = files.filter(f => f.endsWith('.json') && f.startsWith('step_'));
                info.stepCount = stepFiles.length;
                
                // Get last modification time
                const stat = fs.statSync(chatDir);
                info.lastUpdate = stat.mtime.toISOString();
                
                // Try to read title from meta
                try {
                    const metaPath = path.join(chatDir, 'meta.json');
                    if (fs.existsSync(metaPath)) {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        info.title = meta.title || info.title;
                    }
                } catch {}
            }
            
            res.json(info);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};
