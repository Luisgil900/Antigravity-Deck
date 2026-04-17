'use client';
import { useState } from 'react';
import { Step } from '@/lib/types';
import { ArtifactPreview } from './agent-response';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Layers, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ArtifactGroupProps {
    steps: { step: Step; originalIndex: number; artifactData?: { path: string; name?: string } }[];
    onStepClick?: (i: number) => void;
    bookmarkedSteps?: Set<number>;
}

export function ArtifactGroup({ steps: groupSteps, onStepClick, bookmarkedSteps }: ArtifactGroupProps) {
    const [expanded, setExpanded] = useState(false);
    const hasBookmarks = groupSteps.some(({ originalIndex }) => bookmarkedSteps?.has(originalIndex));
    const first = groupSteps[0].originalIndex + 1;
    const last = groupSteps[groupSteps.length - 1].originalIndex + 1;

    return (
        <div className="mb-3 mx-1">
            <button
                onClick={() => setExpanded(!expanded)}
                className={cn(
                    'w-full flex items-center gap-2.5 px-4 py-2 rounded-lg text-xs transition-all duration-200',
                    'bg-purple-950/20 hover:bg-purple-950/40 border border-purple-500/20 hover:border-purple-500/40',
                    expanded && 'rounded-b-none'
                )}
            >
                <span className={cn('transition-transform duration-200 text-purple-400', expanded && 'rotate-90')}><ChevronRight className="w-3 h-3" /></span>
                <span className="text-purple-400"><Layers className="h-3 w-3" /></span>
                <span className="font-semibold text-purple-300">
                    {groupSteps.length} {groupSteps.length === 1 ? 'Artifact' : 'Artifacts'}
                </span>
                <span className="text-[10px] text-purple-400/50 truncate flex-1 text-left font-mono">
                    {groupSteps.map(g => g.artifactData?.name || g.artifactData?.path?.split(/[\\/]/).pop()).join(' · ')}
                </span>
                {hasBookmarks && <span className="text-[10px]"><Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500" /></span>}
                <Badge variant="outline" className="text-[9px] font-mono text-purple-400/60 border-purple-500/30">
                    #{first}{first !== last ? `–${last}` : ''}
                </Badge>
            </button>

            {expanded && (
                <div className="border border-t-0 border-purple-500/20 rounded-b-lg bg-purple-950/10 py-1.5 px-3 space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                    {groupSteps.map(({ step, originalIndex, artifactData }) => {
                        if (!artifactData) return null;
                        return (
                            <div key={originalIndex} className="relative group/art pb-1">
                                <ArtifactPreview uri={'file:///' + artifactData.path} displayName={artifactData.name} />
                                <div className="absolute right-0 top-0 opacity-0 group-hover/art:opacity-100 transition-opacity">
                                    <Badge
                                        variant="outline"
                                        className="text-[8px] font-mono opacity-50 cursor-pointer hover:bg-muted"
                                        onClick={() => onStepClick?.(originalIndex)}
                                    >
                                        #{originalIndex + 1}
                                    </Badge>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
