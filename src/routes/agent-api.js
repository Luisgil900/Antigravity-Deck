// === Agent API Routes ===
// HTTP REST endpoints for external AI agents.
// /api/agent/* — connect, send (blocking + SSE), status, accept, reject, disconnect

const { z } = require('zod');
const sessionManager = require('../agent-session-manager');
const { resolveLsInst } = require('../ls-utils');

const ConnectSchema = z.object({
    workspace: z.string().max(200).optional(),
    cascadeId: z.string().max(200).optional(),
    stepSoftLimit: z.number().int().min(1).max(10000).optional(),
}).strict();

const SendSchema = z.object({
    message: z.string().min(1).max(100000),
    action: z.enum(['accept', 'reject']).optional(),
    authorName: z.string().max(200).optional(),
    modelId: z.string().max(100).optional(),
}).strict();

const SwitchWorkspaceSchema = z.object({
    workspace: z.string().min(1).max(200),
}).strict();

module.exports = function setupAgentApiRoutes(app) {

    app.get('/api/models', async (req, res) => {
        try {
            const { callApi } = require('../api');
            const { resolveLsInst } = require('../ls-utils');
            const inst = resolveLsInst('ANTIGRAVITY');
            const result = await callApi('GetAvailableModels', {}, inst);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ── Connect — create a new agent session ─────────────────────────────────

    app.post('/api/agent/connect', (req, res) => {
        try {
            const body = ConnectSchema.parse(req.body || {});

            const session = sessionManager.createSession({
                workspace: body.workspace,
                cascadeId: body.cascadeId,
                stepSoftLimit: body.stepSoftLimit,
                transport: 'http',
            });

            res.json({
                sessionId: session.id,
                cascadeId: session.cascadeId,
                workspace: session.workspace,
                state: session.state,
            });
        } catch (e) {
            if (e instanceof z.ZodError) {
                return res.status(400).json({ error: 'Invalid request', details: e.issues });
            }
            res.status(500).json({ error: e.message });
        }
    });

    // ── Send — send message and wait for response ────────────────────────────

    app.post('/api/agent/:sessionId/send', async (req, res) => {
        const session = sessionManager.getSession(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        let body;
        try {
            body = SendSchema.parse(req.body || {});
        } catch (e) {
            if (e instanceof z.ZodError) {
                return res.status(400).json({ error: 'Invalid request', details: e.issues });
            }
            return res.status(400).json({ error: e.message });
        }

        // Check if client wants SSE streaming
        const wantsSSE = req.headers.accept === 'text/event-stream';

        if (wantsSSE) {
            // SSE mode — stream events as they happen
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });

            const onLog = (data) => {
                res.write(`event: log\ndata: ${JSON.stringify(data)}\n\n`);
            };
            const onBusy = (data) => {
                res.write(`event: busy\ndata: ${JSON.stringify(data)}\n\n`);
            };
            const onTransition = (data) => {
                res.write(`event: cascade_transition\ndata: ${JSON.stringify(data)}\n\n`);
            };

            session.on('log', onLog);
            session.on('busy_change', onBusy);
            session.on('cascade_transition', onTransition);

            try {
                const result = await session.sendMessage(body.message, {
                    action: body.action || null,
                    authorName: body.authorName || null,
                    modelId: body.modelId || null,
                });

                res.write(`event: response\ndata: ${JSON.stringify(result)}\n\n`);
                res.write(`event: done\ndata: {}\n\n`);
            } catch (e) {
                res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`);
            } finally {
                session.removeListener('log', onLog);
                session.removeListener('busy_change', onBusy);
                session.removeListener('cascade_transition', onTransition);
                res.end();
            }
        } else {
            // Blocking mode — wait for full response
            try {
                const result = await session.sendMessage(body.message, {
                    action: body.action || null,
                    authorName: body.authorName || null,
                    modelId: body.modelId || null,
                });

                if (result.busy) {
                    return res.status(429).json({
                        error: 'Session busy — previous message still processing',
                        ...result,
                    });
                }

                res.json(result);
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        }
    });

    // ── Status — get session state ───────────────────────────────────────────

    app.get('/api/agent/:sessionId/status', (req, res) => {
        const session = sessionManager.getSession(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session.getStatus());
    });

    // ── Switch workspace ─────────────────────────────────────────────────────

    app.post('/api/agent/:sessionId/switch-workspace', async (req, res) => {
        const session = sessionManager.getSession(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        try {
            const body = SwitchWorkspaceSchema.parse(req.body || {});
            const lsInst = resolveLsInst(body.workspace);
            await session.switchWorkspace(body.workspace, lsInst);
            res.json({
                workspace: session.workspace,
                cascadeId: session.cascadeId,
            });
        } catch (e) {
            if (e instanceof z.ZodError) {
                return res.status(400).json({ error: 'Invalid request', details: e.issues });
            }
            res.status(500).json({ error: e.message });
        }
    });

    // ── Accept / Reject pending code changes ─────────────────────────────────

    app.post('/api/agent/:sessionId/accept', async (req, res) => {
        const session = sessionManager.getSession(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        try {
            await session.accept();
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/agent/:sessionId/reject', async (req, res) => {
        const session = sessionManager.getSession(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        try {
            await session.reject();
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── Disconnect — destroy session ─────────────────────────────────────────

    app.delete('/api/agent/:sessionId', (req, res) => {
        const session = sessionManager.getSession(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        sessionManager.destroySession(req.params.sessionId);
        res.json({ ok: true });
    });

    // ── List all active sessions ─────────────────────────────────────────────

    app.get('/api/agent/sessions', (req, res) => {
        res.json({ sessions: sessionManager.listSessions() });
    });

    // ── Agent API Settings ──────────────────────────────────────────────────

    app.get('/api/agent-api/settings', (req, res) => {
        try {
            const { getAgentApiSettings } = require('../config');
            res.json(getAgentApiSettings());
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.put('/api/agent-api/settings', (req, res) => {
        try {
            const { saveAgentApiSettings } = require('../config');
            const body = req.body || {};

            // Validate types
            if (body.maxConcurrentSessions != null && (typeof body.maxConcurrentSessions !== 'number' || body.maxConcurrentSessions < 1 || body.maxConcurrentSessions > 20)) {
                return res.status(400).json({ error: 'maxConcurrentSessions must be 1-20' });
            }
            if (body.sessionTimeoutMs != null && (typeof body.sessionTimeoutMs !== 'number' || body.sessionTimeoutMs < 60000 || body.sessionTimeoutMs > 86400000)) {
                return res.status(400).json({ error: 'sessionTimeoutMs must be 60000-86400000' });
            }
            if (body.defaultStepSoftLimit != null && (typeof body.defaultStepSoftLimit !== 'number' || body.defaultStepSoftLimit < 10 || body.defaultStepSoftLimit > 10000)) {
                return res.status(400).json({ error: 'defaultStepSoftLimit must be 10-10000' });
            }

            const updated = saveAgentApiSettings(body);

            // Apply to running SessionManager immediately
            const sessionManager = require('../agent-session-manager');
            sessionManager.configure(body);

            res.json(updated);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ── Active Conversation ──────────────────────────────────────────────
    // Get the current conversation ID the user is looking at.
    // Used by agents to anchor themselves to the "Chat of the Day".
    // Fallback: if no frontend is open, find the most active RUNNING cascade.
    app.get('/api/agent/active-conversation', (req, res) => {
        try {
            const { clientConvMap } = require('../ws');
            const values = Array.from(clientConvMap.values()).filter(Boolean);

            if (values.length > 0) {
                // Frontend connected — use the conversation the user is viewing
                return res.json({ cascadeId: values[0], source: 'frontend' });
            }

            // Fallback: no frontend — find the active user conversation
            // Strategy: the user's active conversation has the most steps AND is RUNNING
            // Agent cascades are small (< 50 steps). The user's chat has 100+ steps.
            const { stepCache } = require('../step-cache');
            const candidates = [];

            for (const [cid, cache] of Object.entries(stepCache)) {
                const count = cache.stepCount || cache.steps?.length || 0;
                // Only consider conversations with significant step counts (user chats)
                if (count >= 50) {
                    candidates.push({ cid, count });
                }
            }

            // Sort by step count descending — most active conversation first
            candidates.sort((a, b) => b.count - a.count);

            // Allow query param override: ?cascadeId=xxx
            const overrideCid = req.query.cascadeId;
            if (overrideCid) {
                return res.json({ cascadeId: overrideCid, source: 'override' });
            }

            if (candidates.length > 0) {
                // Return the most active (highest step count) user conversation
                const best = candidates[0];
                return res.json({
                    cascadeId: best.cid,
                    source: 'fallback_most_active',
                    steps: best.count,
                    candidates: candidates.length,
                });
            }

            res.json({ cascadeId: null, source: 'none' });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ── Tunnel Info ─────────────────────────────────────────────────────────

    app.get('/api/tunnel-info', (req, res) => {
        try {
            const fs = require('fs');
            const path = require('path');
            // .tunnel-info.txt lives at project root (parent of src/)
            const infoPath = path.join(__dirname, '..', '..', '.tunnel-info.txt');
            if (!fs.existsSync(infoPath)) {
                return res.json({ active: false });
            }
            const raw = fs.readFileSync(infoPath, 'utf-8');
            const lines = raw.split('\n').filter(Boolean);
            const parsed = {};
            for (const line of lines) {
                const [key, ...rest] = line.split(/:\s+/);
                const val = rest.join(': ').trim();
                const k = key.trim().toLowerCase().replace(/\s+/g, '');
                if (k === 'frontend') parsed.frontend = val;
                else if (k === 'backend') parsed.backend = val;
                else if (k === 'authkey') parsed.authKey = val;
                else if (k === 'qrurl') parsed.qrUrl = val;
                else if (k === 'localfe') parsed.localFe = val;
                else if (k === 'localbe') parsed.localBe = val;
                else if (k === 'started') parsed.started = val;
            }
            // Derive Agent WS URL from backend
            if (parsed.backend) {
                const wsUrl = parsed.backend.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
                parsed.wsAgent = `${wsUrl}/ws/agent`;
            }
            parsed.active = !!(parsed.backend && parsed.frontend);
            res.json(parsed);
        } catch (e) {
            res.json({ active: false, error: e.message });
        }
    });

    // ── Inject to Chat — send agent report as "user message" to active cascade ──

    app.post('/api/agent/inject-to-chat', async (req, res) => {
        try {
            const { cascadeId, message, modelId } = req.body || {};

            if (!cascadeId || !message) {
                return res.status(400).json({ error: 'cascadeId and message are required' });
            }

            const { sendMessage } = require('../cascade');
            const inst = resolveLsInst('ANTIGRAVITY');

            // Send as user message to the active cascade
            // The model in that chat will see this and respond automatically
            const result = await sendMessage(cascadeId, message, {
                modelId: modelId || undefined,
                timeoutMs: 30000,
                inst,
            });
            // Force a poll tick to update frontend steps instantly
            try {
                const poller = require('../poller');
                if (poller.pollNow) {
                    setTimeout(() => poller.pollNow(), 500); // 500ms delay to ensure LS has updated
                }
            } catch (pollErr) {
                console.error('[inject-to-chat] Error forcing poll:', pollErr.message);
            }

            res.json({ ok: true, cascadeId, result: result || {} });

        } catch (e) {
            console.error('[inject-to-chat] Error:', e.message);
            res.status(500).json({ error: e.message });
        }
    });
};
