import { Step } from '@/lib/types';
import { extractStepContent, getStepConfig } from '@/lib/step-utils';
import { useState } from 'react';

// === Helpers ===

export function isUserInput(step: Step): boolean {
    return step.type === 'CORTEX_STEP_TYPE_USER_INPUT';
}

export function isAgentResponse(step: Step): boolean {
    if (step.type === 'CORTEX_STEP_TYPE_NOTIFY_USER') return true;
    if (step.type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
        return !!step.plannerResponse?.modifiedResponse;
    }
    return false;
}

export function isGenerateImage(step: Step): boolean {
    // Prevent write_to_file / code actions from mis-triggering as empty generateImage
    if (step.type === 'CORTEX_STEP_TYPE_CODE_ACTION') return false;
    if (step.type === 'CORTEX_STEP_TYPE_GENERATE_IMAGE') return true;
    // Only treat as image if generateImage has real content (not empty protobuf object)
    const gi = step.generateImage;
    if (!gi) return false;
    return !!(gi.prompt || gi.imageName || gi.generatedMedia?.uri || gi.generatedMedia?.inlineData);
}

/**
 * Detect artifact steps from write_to_file calls with IsArtifact=true.
 * Checks ALL known locations where tool arguments can live:
 *   1. metadata.toolCall.argumentsJson (JSON API primary)
 *   2. metadata.argumentsJson (fallback)
 *   3. codeAction fields (binary protobuf decoded)
 */
export function getArtifactData(step: Step): { path: string; name?: string } | null {
    // Helper: try to extract artifact data from a JSON string
    const tryParse = (json: string | undefined | null): { path: string; name?: string } | null => {
        if (!json) return null;
        try {
            const args = JSON.parse(json);
            if (args.IsArtifact === true || args.ArtifactMetadata) {
                return {
                    path: args.TargetFile || '',
                    name: args.ArtifactMetadata?.Summary?.split('\n')[0] || undefined,
                };
            }
        } catch { /* ignore */ }
        return null;
    };

    // Source 1: metadata.toolCall.argumentsJson (Gemini Pro primary location)
    const r1 = tryParse(step.metadata?.toolCall?.argumentsJson);
    if (r1) return r1;

    // Source 2: metadata.argumentsJson (fallback for some step types)
    const r2 = tryParse(step.metadata?.argumentsJson);
    if (r2) return r2;

    // Source 3: plannerResponse.toolCalls (Claude, Opus, and other models)
    // These models store write_to_file args in the PLANNER_RESPONSE step's toolCalls array
    if (step.plannerResponse?.toolCalls) {
        for (const tc of step.plannerResponse.toolCalls) {
            if (tc.name === 'write_to_file' || tc.name === 'multi_replace_file_content') {
                const r3 = tryParse(tc.argumentsJson);
                if (r3) return r3;
            }
            // Also check unnamed tool calls (binary protobuf may omit name)
            if (!tc.name && tc.argumentsJson) {
                const r3 = tryParse(tc.argumentsJson);
                if (r3) return r3;
            }
        }
    }

    // Source 4: Binary protobuf fallback — check codeAction.targetFile for .gemini/brain paths
    if (step.codeAction?.targetFile || step.codeAction?.filePath) {
        const filePath = step.codeAction.targetFile || step.codeAction.filePath || '';
        if (filePath.includes('.gemini') && filePath.includes('brain')) {
            return { path: filePath, name: filePath.split(/[\\/]/).pop() };
        }
    }

    return null;
}

// === Types ===
export interface StepGroup {
    type: 'user' | 'response' | 'processing' | 'image' | 'artifacts';
    steps: { step: Step; originalIndex: number; artifactData?: { path: string; name?: string } }[];
}

// === Grouping ===
export function groupSteps(steps: Step[]): StepGroup[] {
    const groups: StepGroup[] = [];
    let proc: { step: Step; originalIndex: number }[] = [];
    let arts: { step: Step; originalIndex: number; artifactData: { path: string; name?: string } }[] = [];

    const flushProc = () => {
        if (proc.length > 0) { groups.push({ type: 'processing', steps: [...proc] }); proc = []; }
    };
    const flushArts = () => {
        if (arts.length > 0) { groups.push({ type: 'artifacts', steps: [...arts] }); arts = []; }
    };
    const flushAll = () => { flushProc(); flushArts(); };

    steps.forEach((step, idx) => {
        const artData = getArtifactData(step);
        if (isUserInput(step)) { flushAll(); groups.push({ type: 'user', steps: [{ step, originalIndex: idx }] }); }
        else if (isAgentResponse(step)) { flushAll(); groups.push({ type: 'response', steps: [{ step, originalIndex: idx }] }); }
        else if (isGenerateImage(step)) { flushAll(); groups.push({ type: 'image', steps: [{ step, originalIndex: idx }] }); }
        else if (artData && artData.path) { flushProc(); arts.push({ step, originalIndex: idx, artifactData: artData }); }
        else { flushArts(); proc.push({ step, originalIndex: idx }); }
    });
    flushAll();
    return groups;
}

// === Copy hook ===
export function useCopy() {
    const [copied, setCopied] = useState(false);
    const copy = async (text: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return { copied, copy };
}
