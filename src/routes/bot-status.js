// === Bot Status API ===
// Serves the bot's real-time status, trade history, logs, and chat info for the Trading Dashboard.

const fs = require('fs');
const path = require('path');

// Resolve the quant_agent data directory — look for it relative to the repo root
function findBotStatusFile() {
    const candidates = [
        path.join(process.cwd(), '..', 'quant_agent', 'data_dump', 'bot_status.json'),
        path.join(process.cwd(), 'quant_agent', 'data_dump', 'bot_status.json'),
        path.resolve(__dirname, '..', '..', 'quant_agent', 'data_dump', 'bot_status.json'),
        'C:\\Users\\luisg\\Music\\ANTIGRAVITY\\quant_agent\\data_dump\\bot_status.json',
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
        'C:\\Users\\luisg\\Music\\ANTIGRAVITY\\quant_agent\\data_dump\\trade_history.jsonl',
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
        'C:\\Users\\luisg\\Music\\ANTIGRAVITY\\quant_agent\\logs\\centinela.log',
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
                });
            }
            
            const raw = fs.readFileSync(statusFile, 'utf8');
            const status = JSON.parse(raw);
            
            // Add staleness indicator (if last update > 60s ago)
            const lastUpdate = new Date(status.timestamp);
            const ageSeconds = (Date.now() - lastUpdate.getTime()) / 1000;
            status._stale = ageSeconds > 120;
            status._age_seconds = Math.round(ageSeconds);
            
            res.json(status);
        } catch (err) {
            console.error('[bot-status] Error reading status:', err.message);
            res.status(500).json({ error: 'Failed to read bot status' });
        }
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
                // Try to get live status from the poller's known summaries (updated every few seconds)
                const poller = require('../poller');
                const summary = poller._knownConvSummaries?.get(chatId);
                const liveStepCount = poller._lastCascadeStepCountMap?.[chatId];
                
                if (summary) {
                    info.exists = true;
                    // Provide accurately tracked live step count, bypassing the summary object which lacks it
                    info.stepCount = liveStepCount !== undefined ? liveStepCount : (summary.totalStepCount || 0);
                    info.lastUpdate = new Date().toISOString(); // It's live!
                    if (summary.trajectoryMetadata?.title) {
                        info.title = summary.trajectoryMetadata.title;
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
