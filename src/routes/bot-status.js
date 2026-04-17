// === Bot Status API ===
// Serves the bot's real-time status from bot_status.json for the Trading Dashboard.
// Also serves trade history for detailed views.

const fs = require('fs');
const path = require('path');

// Resolve the quant_agent data directory — look for it relative to the repo root
function findBotStatusFile() {
    // Common paths to check
    const candidates = [
        path.join(process.cwd(), '..', 'quant_agent', 'data_dump', 'bot_status.json'),
        path.join(process.cwd(), 'quant_agent', 'data_dump', 'bot_status.json'),
        // For when Deck runs from its own directory
        path.resolve(__dirname, '..', '..', 'quant_agent', 'data_dump', 'bot_status.json'),
        // Direct path for the ANTIGRAVITY workspace
        'C:\\Users\\luisg\\Music\\ANTIGRAVITY\\quant_agent\\data_dump\\bot_status.json',
    ];
    
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return candidates[2]; // Default to relative path
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
            status._stale = ageSeconds > 120; // Consider stale if > 2 min old
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
};
