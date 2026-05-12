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

            // Inyectar datos en tiempo real de la caché del backend para evitar latencia del Engine
            const poller = require('../poller');
            for (const id of Object.keys(filtered)) {
                try {
                    const cacheInfo = require('../step-cache').stepCache[id];
                    if (cacheInfo) {
                        const cacheTotal = (cacheInfo.baseIndex || 0) + cacheInfo.steps.length;
                        // Only override if cache has MORE steps (never regress)
                        if (cacheTotal > (filtered[id].stepCount || 0)) {
                            filtered[id].stepCount = cacheTotal;
                        }
                        if (cacheInfo.lastUpdateTime) {
                            filtered[id].lastModifiedTime = cacheInfo.lastUpdateTime;
                        }
                    } else {
                        // Fallback: use poller's step count map if no cache
                        const pollerCount = poller._lastCascadeStepCountMap?.[id];
                        if (pollerCount && pollerCount > (filtered[id].stepCount || 0)) {
                            filtered[id].stepCount = pollerCount;
                        }
                    }
                } catch { }
            }


            // Prevent browser/proxy caching — list must always be fresh
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
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
            
            // Inyectar datos en tiempo real de la caché del backend
            const pollerRef = require('../poller');
            for (const id of Object.keys(merged.trajectorySummaries)) {
                try {
                    const cacheInfo = require('../step-cache').stepCache[id];
                    if (cacheInfo) {
                        const cacheTotal = (cacheInfo.baseIndex || 0) + cacheInfo.steps.length;
                        if (cacheTotal > (merged.trajectorySummaries[id].stepCount || 0)) {
                            merged.trajectorySummaries[id].stepCount = cacheTotal;
                        }
                        if (cacheInfo.lastUpdateTime) {
                            merged.trajectorySummaries[id].lastModifiedTime = cacheInfo.lastUpdateTime;
                        }
                    } else {
                        const pollerCount = pollerRef._lastCascadeStepCountMap?.[id];
                        if (pollerCount && pollerCount > (merged.trajectorySummaries[id].stepCount || 0)) {
                            merged.trajectorySummaries[id].stepCount = pollerCount;
                        }
                    }
                } catch { }
            }

            // Prevent browser/proxy caching — list must always be fresh
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
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

    // User credits & subscription info (for dashboard monitoring)
    app.get('/api/user/credits', async (req, res) => {
        try {
            const inst = resolveInst(req);
            if (!inst) return res.status(503).json({ error: 'IDE not connected' });
            const [userStatus, subStatus, modelData] = await Promise.all([
                callApi('GetUserStatus', {}, inst).catch(() => null),
                callApi('GetSubscriptionStatus', {}, inst).catch(() => null),
                callApi('GetCascadeModelConfigData', {}, inst).catch(() => null),
            ]);

            const us = userStatus?.userStatus || {};
            const sub = subStatus?.user || {};
            const tier = us.userTier || sub.userTier || {};

            // ═══ AI CREDITS (REAL) — from userTier.availableCredits[] ═══
            // Structure: availableCredits: [{ creditType: "GOOGLE_ONE_AI", creditAmount: "1000", minimumCreditAmountForUsage: "50" }]
            const aiCreditEntry = (tier.availableCredits || []).find(c => c.creditType === 'GOOGLE_ONE_AI') || {};
            const availableCredits = aiCreditEntry.creditAmount ? parseInt(aiCreditEntry.creditAmount, 10) : null;
            const minCreditsForUsage = aiCreditEntry.minimumCreditAmountForUsage ? parseInt(aiCreditEntry.minimumCreditAmountForUsage, 10) : null;

            // Monthly prompt credits (internal budget — different from AI Credits)
            const planStatus = us.planStatus || sub.planStatus || {};
            const promptCredits = planStatus.availablePromptCredits ?? null;
            const monthlyPromptCredits = planStatus.planInfo?.monthlyPromptCredits ?? null;

            // Model quotas — sorted alphabetically by label for STABLE ordering
            const models = (modelData?.clientModelConfigs || []).map(m => ({
                label: m.label || m.name || '',
                modelId: m.modelOrAlias?.model || m.modelOrAlias?.alias || '',
                quota: m.quotaInfo?.remainingFraction ?? 1,
                resetTime: m.quotaInfo?.resetTime || null,
                isRecommended: !!m.isRecommended,
            })).sort((a, b) => a.label.localeCompare(b.label));

            res.json({
                // Account info
                email: sub.email || us.email || null,
                name: sub.name || us.name || null,
                tier: tier.name || null,
                plan: planStatus.planInfo?.planName || null,
                // AI Credits (REAL — from userTier, shown in Antigravity settings)
                availableCredits,
                minCreditsForUsage,
                // Prompt Credits (internal budget — secondary metric)
                promptCredits,
                monthlyPromptCredits,
                // Models with quotas (alphabetically sorted, stable order)
                models,
                // Timestamp
                fetchedAt: new Date().toISOString(),
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
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
