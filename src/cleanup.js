// === Centralized Cascade State Cleanup ===
// Prevents memory leaks by ensuring all 4 global structures are cleaned in sync.
// All modules call into this instead of doing ad-hoc `delete stepCache[id]`.
// V10.2f: Preserves metadata (step count + timestamp) during instance cleanup
//         to prevent data regression when LS restarts.

const { stepCache, fetchingSet, persistStepCounts } = require('./step-cache');

// Lazy imports to avoid circular deps (poller.js -> cleanup.js -> poller.js)
function _getPollerState() {
    const poller = require('./poller');
    return {
        knownConvIds: poller._knownConvIds,
        knownConvSummaries: poller._knownConvSummaries,
        lastCascadeStatusMap: poller._lastCascadeStatusMap,
        lastCascadeStepCountMap: poller._lastCascadeStepCountMap,
        cascadeInstanceMap: poller._cascadeInstanceMap,
    };
}

/**
 * Remove a single cascade from all global state.
 * Call from: DELETE /api/cascade/:id, DELETE /api/cache/:id
 */
function cleanupCascade(cascadeId) {
    const { knownConvIds, lastCascadeStatusMap, cascadeInstanceMap } = _getPollerState();

    delete stepCache[cascadeId];
    fetchingSet.delete(cascadeId);
    knownConvIds.delete(cascadeId);
    delete lastCascadeStatusMap[cascadeId];
    cascadeInstanceMap.delete(cascadeId);
}

/**
 * V10.2f: Remove cascades owned by a specific LS instance — PRESERVING metadata.
 * 
 * When LS restarts (new PID), we need to clear stale content but KEEP:
 * - Step counts (so UI doesn't show 0)
 * - Timestamps (so sidebar ordering is preserved)
 * - knownConvIds (so conversations stay visible)
 * - lastCascadeStatusMap (so status tracking continues)
 * 
 * Content is marked for refresh (_needsContentRefresh) — next poll will refetch.
 * 
 * @param {object} inst - the LS instance object being removed
 */
function cleanupByInstance(inst) {
    const { cascadeInstanceMap, knownConvIds, lastCascadeStatusMap, lastCascadeStepCountMap } = _getPollerState();

    const cascadeIds = [];
    for (const [cascadeId, ownerInst] of cascadeInstanceMap.entries()) {
        // Match by object identity first, then fallback to PID
        if (ownerInst === inst || ownerInst.pid === inst.pid) {
            cascadeIds.push(cascadeId);
        }
    }

    let preservedCount = 0;
    for (const id of cascadeIds) {
        const entry = stepCache[id];
        if (entry) {
            // PRESERVE metadata — only clear content for refetch
            const stepCount = (entry.baseIndex || 0) + entry.steps.length;
            const lastUpdateTime = entry.lastUpdateTime;
            
            // Replace with skeleton entry that preserves metadata
            stepCache[id] = {
                steps: [],
                stepCount: stepCount,
                baseIndex: stepCount, // empty window starting at end
                lastUpdateTime: lastUpdateTime,
                _needsContentRefresh: true, // will refetch on next poll
            };
            
            // Ensure step count map stays accurate
            if (lastCascadeStepCountMap) {
                lastCascadeStepCountMap[id] = Math.max(
                    lastCascadeStepCountMap[id] || 0,
                    stepCount
                );
            }
            
            preservedCount++;
        }
        
        fetchingSet.delete(id);
        // DON'T delete from knownConvIds — keep conversation visible in sidebar
        // DON'T delete from lastCascadeStatusMap — keep status tracking
        cascadeInstanceMap.delete(id); // instance mapping is stale, must rebuild
    }

    if (cascadeIds.length > 0) {
        console.log(`[Cleanup] Instance PID ${inst.pid}: ${cascadeIds.length} cascades — ${preservedCount} metadata preserved, content cleared for refetch`);
        // Persist step counts immediately before they could be lost
        try { persistStepCounts(); } catch { }
    }
}

/**
 * Clear ALL cached state. Call from: DELETE /api/cache, agent-bridge workspace switch
 * V10.2f: Persists step counts to disk BEFORE clearing.
 */
function cleanupAll() {
    const { knownConvIds, knownConvSummaries, lastCascadeStatusMap, cascadeInstanceMap } = _getPollerState();

    // V10.2f: Persist step counts to disk BEFORE clearing in-memory cache
    try { persistStepCounts(); } catch { }

    const count = Object.keys(stepCache).length;
    Object.keys(stepCache).forEach(k => delete stepCache[k]);
    fetchingSet.clear();
    knownConvIds.clear();
    if (knownConvSummaries) knownConvSummaries.clear();
    Object.keys(lastCascadeStatusMap).forEach(k => delete lastCascadeStatusMap[k]);
    cascadeInstanceMap.clear();

    console.log(`[Cleanup] All cleared (${count} conversations). Step counts persisted to disk.`);
    return count;
}

module.exports = { cleanupCascade, cleanupByInstance, cleanupAll };
