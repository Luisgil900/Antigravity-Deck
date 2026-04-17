// === Conversations Routes ===
// /api/workspaces/:name/conversations, /api/models, /api/conversations/*, /api/user, /api/cache

const { callApi, callApiOnInstance } = require('../api');
const { callApiBinary } = require('../api');
const { countBinarySteps, decodeBinarySteps } = require('../protobuf');
const { STEP_LOAD_CHUNK } = require('../config');
const { lsInstances } = require('../config');
const { stepCache } = require('../cache');
const { getInstanceByName } = require('../detector');
const { resolveInst } = require('./route-helpers');

// Private helper — clear all step cache
function clearCache() {
    const { cleanupAll } = require('../cleanup');
    return cleanupAll();
}

module.exports = function setupConversationsRoutes(app) {
    // Conversations for a specific workspace (filtered by workspace URI)
    // Fix: search ALL LS instances to find cascades matching this workspace,
    // because a chat can be created on a different LS instance while still
    // having the correct workspaceFolderAbsoluteUri in its metadata.
    app.get('/api/workspaces/:name/conversations', async (req, res) => {
        const targetInst = getInstanceByName(decodeURIComponent(req.params.name));
        if (!targetInst) return res.status(400).json({ error: 'Unknown workspace' });

        try {
            const wsUri = targetInst.workspaceFolderUri;
            const filtered = {};

            // Search ALL LS instances for cascades matching this workspace URI
            for (const inst of lsInstances) {
                try {
                    const trajData = await callApiOnInstance(inst, 'GetAllCascadeTrajectories');
                    if (!trajData?.trajectorySummaries) continue;

                    for (const [id, info] of Object.entries(trajData.trajectorySummaries)) {
                        if (filtered[id]) continue; // already found via another instance

                        // Check cascade's workspace URIs
                        const cascadeWs = info.workspaces || [];
                        const cascadeWsUris = (Array.isArray(cascadeWs) ? cascadeWs : [])
                            .map(w => w.workspaceFolderAbsoluteUri)
                            .filter(Boolean);

                        // Also check trajectoryMetadata.workspaceUris (may contain encoded URIs)
                        const metaUris = [];
                        if (info.trajectoryMetadata) {
                            const meta = info.trajectoryMetadata;
                            const rawUris = meta.workspaceUris;
                            if (rawUris) {
                                const uriList = Array.isArray(rawUris) ? rawUris : [rawUris];
                                for (const u of uriList) {
                                    if (typeof u === 'string') metaUris.push(decodeURIComponent(u));
                                }
                            }
                        }

                        const allUris = [...cascadeWsUris, ...metaUris];

                        // Match: any URI matches the target workspace URI (case-insensitive for Windows)
                        if (wsUri && allUris.some(uri => uri.toLowerCase() === wsUri.toLowerCase())) {
                            filtered[id] = info;
                        }
                    }
                } catch { /* skip unreachable instances */ }
            }

            res.json({ trajectorySummaries: filtered });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Available models for cascade
    app.get('/api/models', async (req, res) => {
        try {
            const inst = resolveInst(req);
            if (!inst) return res.status(503).json({ error: 'IDE not connected' });
            const data = await callApi('GetCascadeModelConfigData', {}, inst);
            const models = (data.clientModelConfigs || []).map(m => ({
                label: m.label,
                modelId: m.modelOrAlias?.model || m.modelOrAlias?.alias || '',
                supportsImages: !!m.supportsImages,
                isRecommended: !!m.isRecommended,
                quota: m.quotaInfo?.remainingFraction ?? 1,
                resetTime: m.quotaInfo?.resetTime || null,
            }));
            const defaultModel = data.defaultOverrideModelConfig?.modelOrAlias?.model || '';
            res.json({ models, defaultModel });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Conversations list — merge from ALL LS instances
    app.get('/api/conversations', async (req, res) => {
        try {
            const { lsInstances } = require('../config');
            const merged = { trajectorySummaries: {} };
            for (const inst of lsInstances) {
                try {
                    const data = await callApiOnInstance(inst, 'GetAllCascadeTrajectories');
                    if (data?.trajectorySummaries) {
                        Object.assign(merged.trajectorySummaries, data.trajectorySummaries);
                    }
                } catch { }
            }
            res.json(merged);
        }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Conversation steps
    app.get('/api/conversations/:id/steps', async (req, res) => {
        try {
            const inst = resolveInst(req);
            const cascadeId = req.params.id;
            const startIndex = parseInt(req.query.start) || 0;
            const endIndex = parseInt(req.query.end) || 999999;
            
            // Try binary first to prevent JSON truncation on large conversations
            try {
                const { callApiBinary } = require('../api');
                const binBuf = await callApiBinary(cascadeId, startIndex, endIndex, inst);
                const binCount = countBinarySteps(binBuf);
                if (binCount >= 0) { // Can be 0 if empty
                    const steps = decodeBinarySteps(binBuf);
                    return res.json({ steps });
                }
            } catch (binErr) {
                console.log(`[Conversations] Binary steps failed for ${cascadeId}: ${binErr.message}, falling back to JSON`);
            }

            // Fallback to JSON API
            res.json(await callApi('GetCascadeTrajectorySteps', {
                cascadeId,
                startIndex,
                endIndex
            }, inst));
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Load older steps for scroll-up pagination (binary protobuf for reliability)
    app.get('/api/conversations/:id/steps/older', async (req, res) => {
        try {
            const { STEP_LOAD_CHUNK } = require('../config');
            const cascadeId = req.params.id;
            const cache = stepCache[cascadeId];
            if (!cache || (cache.baseIndex || 0) === 0) {
                return res.json({ steps: [], baseIndex: 0, hasMore: false });
            }

            const currentBase = cache.baseIndex || 0;
            const loadFrom = Math.max(0, currentBase - STEP_LOAD_CHUNK);
            const loadTo = currentBase;

            // Use binary protobuf for reliable pagination
            const inst = resolveInst(req);
            const binBuf = await callApiBinary(cascadeId, loadFrom, loadTo, inst);
            const binCount = countBinarySteps(binBuf);
            let olderSteps = [];
            if (binCount > 0) {
                olderSteps = decodeBinarySteps(binBuf);
            }

            // Prepend to cache (allow temporary expansion, next poll trim will restore)
            if (olderSteps.length > 0) {
                cache.steps.unshift(...olderSteps);
                cache.baseIndex = loadFrom;
            }

            res.json({
                steps: olderSteps,
                baseIndex: loadFrom,
                hasMore: loadFrom > 0,
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // User info
    app.get('/api/user', async (req, res) => {
        try { res.json(await callApi('GetUserStatus', {}, resolveInst(req))); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Cache management
    app.delete('/api/cache', (req, res) => {
        const count = clearCache();
        console.log(`[*] Cache cleared (${count} conversations)`);
        res.json({ cleared: count });
    });

    app.delete('/api/cache/:id', (req, res) => {
        const id = req.params.id;
        if (stepCache[id]) {
            const { cleanupCascade } = require('../cleanup');
            cleanupCascade(id);
            console.log(`[*] Cache cleared for ${id.substring(0, 8)}`);
            res.json({ cleared: true, id });
        } else {
            res.json({ cleared: false, id, message: 'not cached' });
        }
    });
};
