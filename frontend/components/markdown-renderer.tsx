'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useState, useCallback, memo, useEffect, useRef, useMemo } from 'react';
import { X, FileCode2, ExternalLink, Loader2, Copy, Check, Info, Lightbulb, AlertTriangle, ShieldAlert, OctagonAlert, Maximize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import dynamic from 'next/dynamic';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';

// Lazy-load syntax highlighter (heavy)
const SyntaxHighlighter = dynamic(
    () => import('react-syntax-highlighter').then(m => m.Prism),
    { ssr: false, loading: () => <div className="p-4 text-xs text-muted-foreground/50">Loading…</div> }
);

// ── Diagram Zoom Modal (smooth pinch + crisp SVG) ────────────────────────────
function DiagramZoomModal({ svg, onClose }: { svg: string; onClose: () => void }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Process SVG: only modify the ROOT <svg> tag for crisp scaling, never touch internals
    const processedSvg = useMemo(() => {
        // Match only the first/root <svg ...> opening tag
        return svg.replace(/^([\s\S]*?)(<svg\b)([\s\S]*?)(>)/, (_full, before, svgOpen, attrs, close) => {
            let a = attrs;
            // Extract original dimensions for viewBox
            const wMatch = a.match(/\bwidth="([\d.]+)"/);
            const hMatch = a.match(/\bheight="([\d.]+)"/);
            const hasViewBox = /viewBox/.test(a);
            // Add viewBox if missing (preserves vector scaling)
            let viewBoxAttr = '';
            if (wMatch && hMatch && !hasViewBox) {
                viewBoxAttr = ` viewBox="0 0 ${wMatch[1]} ${hMatch[1]}"`;
            }
            // Remove only the root SVG's width/height so it fills container
            a = a.replace(/\bwidth="[\d.]+[a-z]*"/, 'width="100%"');
            a = a.replace(/\bheight="[\d.]+[a-z]*"/, 'height="100%"');
            return `${before}${svgOpen}${a}${viewBoxAttr} style="max-width:none;max-height:none;shape-rendering:geometricPrecision;text-rendering:optimizeLegibility"${close}`;
        });
    }, [svg]);

    const stateRef = useRef({
        scale: 1, tx: 0, ty: 0,
        dragging: false,
        lastX: 0, lastY: 0,
        lastPinchDist: 0,
        pinchMidX: 0, pinchMidY: 0,
        pinching: false,
        touchCount: 0,
        velocityX: 0, velocityY: 0,
        lastMoveTime: 0,
    });
    const [displayScale, setDisplayScale] = useState(1);
    const rafRef = useRef<number>(0);
    const scaleUpdateRef = useRef<number>(0); // throttle scale display updates

    const applyTransform = useCallback(() => {
        const s = stateRef.current;
        if (contentRef.current) {
            contentRef.current.style.transform = `translate(${s.tx}px, ${s.ty}px) scale(${s.scale})`;
        }
        // Throttle React state updates to avoid re-render jank during gestures
        const now = Date.now();
        if (now - scaleUpdateRef.current > 100) {
            scaleUpdateRef.current = now;
            setDisplayScale(s.scale);
        }
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const getPinchData = (t: TouchList) => ({
            dist: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY),
            midX: (t[0].clientX + t[1].clientX) / 2,
            midY: (t[0].clientY + t[1].clientY) / 2,
        });

        // --- Touch Start ---
        const onTouchStart = (e: TouchEvent) => {
            e.preventDefault();
            const s = stateRef.current;
            cancelAnimationFrame(rafRef.current);
            s.velocityX = 0;
            s.velocityY = 0;
            s.touchCount = e.touches.length;

            if (e.touches.length >= 2) {
                const p = getPinchData(e.touches);
                s.pinching = true;
                s.dragging = false;
                s.lastPinchDist = p.dist;
                s.pinchMidX = p.midX;
                s.pinchMidY = p.midY;
            } else if (e.touches.length === 1) {
                s.dragging = true;
                s.pinching = false;
                s.lastX = e.touches[0].clientX;
                s.lastY = e.touches[0].clientY;
                s.lastMoveTime = Date.now();
            }
        };

        // --- Touch Move ---
        const onTouchMove = (e: TouchEvent) => {
            e.preventDefault();
            const s = stateRef.current;

            if (e.touches.length >= 2) {
                // Handle transition from 1 finger → 2 fingers
                if (!s.pinching) {
                    s.pinching = true;
                    s.dragging = false;
                    const p = getPinchData(e.touches);
                    s.lastPinchDist = p.dist;
                    s.pinchMidX = p.midX;
                    s.pinchMidY = p.midY;
                    return; // Use this frame to initialize, apply from next
                }

                const p = getPinchData(e.touches);
                if (s.lastPinchDist > 0) {
                    const ratio = p.dist / s.lastPinchDist;
                    const newScale = Math.max(0.2, Math.min(15, s.scale * ratio));

                    // Zoom toward pinch midpoint
                    const dx = p.midX - s.pinchMidX;
                    const dy = p.midY - s.pinchMidY;
                    s.tx += dx;
                    s.ty += dy;
                    s.scale = newScale;
                }
                s.lastPinchDist = p.dist;
                s.pinchMidX = p.midX;
                s.pinchMidY = p.midY;
                applyTransform();
            } else if (e.touches.length === 1 && s.dragging && !s.pinching) {
                const now = Date.now();
                const dx = e.touches[0].clientX - s.lastX;
                const dy = e.touches[0].clientY - s.lastY;
                const dt = Math.max(1, now - s.lastMoveTime);
                s.velocityX = dx / dt * 16;
                s.velocityY = dy / dt * 16;
                s.tx += dx;
                s.ty += dy;
                s.lastX = e.touches[0].clientX;
                s.lastY = e.touches[0].clientY;
                s.lastMoveTime = now;
                applyTransform();
            }
        };

        // --- Touch End (with momentum) ---
        const onTouchEnd = (e: TouchEvent) => {
            const s = stateRef.current;
            s.touchCount = e.touches.length;

            if (e.touches.length === 0) {
                if (s.dragging && (Math.abs(s.velocityX) > 0.5 || Math.abs(s.velocityY) > 0.5)) {
                    const animate = () => {
                        s.velocityX *= 0.92;
                        s.velocityY *= 0.92;
                        if (Math.abs(s.velocityX) < 0.1 && Math.abs(s.velocityY) < 0.1) return;
                        s.tx += s.velocityX;
                        s.ty += s.velocityY;
                        applyTransform();
                        rafRef.current = requestAnimationFrame(animate);
                    };
                    rafRef.current = requestAnimationFrame(animate);
                }
                s.dragging = false;
                s.pinching = false;
                s.lastPinchDist = 0;
            } else if (e.touches.length === 1) {
                // Transition from pinch → single finger drag
                s.pinching = false;
                s.dragging = true;
                s.lastPinchDist = 0;
                s.lastX = e.touches[0].clientX;
                s.lastY = e.touches[0].clientY;
                s.lastMoveTime = Date.now();
                s.velocityX = 0;
                s.velocityY = 0;
            }
        };

        // --- Mouse (desktop) ---
        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            const s = stateRef.current;
            s.dragging = true;
            s.lastX = e.clientX;
            s.lastY = e.clientY;
            cancelAnimationFrame(rafRef.current);
        };
        const onMouseMove = (e: MouseEvent) => {
            const s = stateRef.current;
            if (!s.dragging) return;
            s.tx += e.clientX - s.lastX;
            s.ty += e.clientY - s.lastY;
            s.lastX = e.clientX;
            s.lastY = e.clientY;
            applyTransform();
        };
        const onMouseUp = () => { stateRef.current.dragging = false; };

        // --- Wheel zoom (desktop) ---
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const s = stateRef.current;
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            s.scale = Math.max(0.2, Math.min(15, s.scale * factor));
            applyTransform();
        };

        el.addEventListener('touchstart', onTouchStart, { passive: false });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd, { passive: false });
        el.addEventListener('mousedown', onMouseDown);
        el.addEventListener('mousemove', onMouseMove);
        el.addEventListener('mouseup', onMouseUp);
        el.addEventListener('mouseleave', onMouseUp);
        el.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            cancelAnimationFrame(rafRef.current);
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            el.removeEventListener('mousedown', onMouseDown);
            el.removeEventListener('mousemove', onMouseMove);
            el.removeEventListener('mouseup', onMouseUp);
            el.removeEventListener('mouseleave', onMouseUp);
            el.removeEventListener('wheel', onWheel);
        };
    }, [applyTransform]);

    const reset = () => {
        cancelAnimationFrame(rafRef.current);
        const s = stateRef.current;
        s.scale = 1; s.tx = 0; s.ty = 0;
        applyTransform();
        setDisplayScale(1);
    };

    const zoomIn = () => { stateRef.current.scale = Math.min(15, stateRef.current.scale * 1.3); applyTransform(); setDisplayScale(stateRef.current.scale); };
    const zoomOut = () => { stateRef.current.scale = Math.max(0.2, stateRef.current.scale * 0.7); applyTransform(); setDisplayScale(stateRef.current.scale); };

    return (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 backdrop-blur-sm">
            {/* Controls bar */}
            <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
                <div className="flex items-center gap-2">
                    <button onClick={zoomOut} className="p-2 rounded-lg bg-white/5 active:bg-white/20 text-white/70 transition-colors">
                        <ZoomOut className="h-4 w-4" />
                    </button>
                    <span className="text-xs text-white/50 min-w-[3rem] text-center font-mono">{Math.round(displayScale * 100)}%</span>
                    <button onClick={zoomIn} className="p-2 rounded-lg bg-white/5 active:bg-white/20 text-white/70 transition-colors">
                        <ZoomIn className="h-4 w-4" />
                    </button>
                    <button onClick={reset} className="p-2 rounded-lg bg-white/5 active:bg-white/20 text-white/70 transition-colors ml-1">
                        <RotateCcw className="h-4 w-4" />
                    </button>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg bg-white/10 active:bg-white/25 text-white/80 transition-colors">
                    <X className="h-5 w-5" />
                </button>
            </div>
            {/* Diagram area */}
            <div
                ref={containerRef}
                className="flex-1 overflow-hidden select-none"
                style={{ cursor: 'grab', touchAction: 'none' }}
            >
                <div
                    ref={contentRef}
                    className="w-full h-full flex items-center justify-center will-change-transform"
                    style={{ transform: 'translate(0px, 0px) scale(1)', transformOrigin: 'center center' }}
                    dangerouslySetInnerHTML={{ __html: processedSvg }}
                />
            </div>
            {/* Hint */}
            <div className="text-center py-2 text-[10px] text-white/25 shrink-0">
                Pinch to zoom · Drag to pan
            </div>
        </div>
    );
}

// ── Mermaid Diagram Component ────────────────────────────────────────────────
function MermaidDiagram({ code }: { code: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [showZoom, setShowZoom] = useState(false);
    const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 10)}`);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const mermaid = (await import('mermaid')).default;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'dark',
                    themeVariables: {
                        primaryColor: '#7c3aed',
                        primaryTextColor: '#e2e8f0',
                        primaryBorderColor: '#6d28d9',
                        lineColor: '#64748b',
                        secondaryColor: '#1e1b4b',
                        tertiaryColor: '#0f172a',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: '14px',
                        noteTextColor: '#e2e8f0',
                        noteBkgColor: '#1e1b4b',
                    },
                    flowchart: { htmlLabels: false, curve: 'basis' },
                    securityLevel: 'loose',
                });
                const { svg: rendered } = await mermaid.render(idRef.current, code.trim());
                if (!cancelled) setSvg(rendered);
            } catch (e: any) {
                if (!cancelled) setError(e.message || 'Mermaid render error');
            }
        })();
        return () => { cancelled = true; };
    }, [code]);

    if (error) {
        return (
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 my-3">
                <div className="text-xs text-amber-400/80 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Diagram render error
                </div>
                <pre className="text-[10px] text-muted-foreground/50 mt-1 whitespace-pre-wrap">{error}</pre>
            </div>
        );
    }

    if (!svg) {
        return (
            <div className="flex items-center justify-center py-8 text-muted-foreground/30">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-xs">Rendering diagram…</span>
            </div>
        );
    }

    return (
        <>
            <div
                ref={containerRef}
                onClick={() => setShowZoom(true)}
                className="my-4 flex justify-center overflow-x-auto rounded-lg bg-slate-950/40 border border-border/20 p-4 cursor-pointer group relative"
            >
                <div dangerouslySetInnerHTML={{ __html: svg }} />
                {/* Zoom hint overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-all rounded-lg pointer-events-none">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white/80 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
                        <Maximize2 className="h-3 w-3" />
                        Click to zoom
                    </div>
                </div>
            </div>
            {showZoom && <DiagramZoomModal svg={svg} onClose={() => setShowZoom(false)} />}
        </>
    );
}

// ── GitHub-style Alert Component ─────────────────────────────────────────────
const ALERT_STYLES: Record<string, { icon: any; border: string; bg: string; title: string; titleColor: string }> = {
    NOTE: {
        icon: Info,
        border: 'border-blue-500/30',
        bg: 'bg-blue-950/15',
        title: 'Note',
        titleColor: 'text-blue-400',
    },
    TIP: {
        icon: Lightbulb,
        border: 'border-emerald-500/30',
        bg: 'bg-emerald-950/15',
        title: 'Tip',
        titleColor: 'text-emerald-400',
    },
    IMPORTANT: {
        icon: AlertTriangle,
        border: 'border-violet-500/30',
        bg: 'bg-violet-950/15',
        title: 'Important',
        titleColor: 'text-violet-400',
    },
    WARNING: {
        icon: ShieldAlert,
        border: 'border-amber-500/30',
        bg: 'bg-amber-950/15',
        title: 'Warning',
        titleColor: 'text-amber-400',
    },
    CAUTION: {
        icon: OctagonAlert,
        border: 'border-red-500/30',
        bg: 'bg-red-950/15',
        title: 'Caution',
        titleColor: 'text-red-400',
    },
};

function GitHubAlert({ type, children }: { type: string; children: React.ReactNode }) {
    const style = ALERT_STYLES[type] || ALERT_STYLES.NOTE;
    const Icon = style.icon;
    return (
        <div className={`my-3 rounded-lg border ${style.border} ${style.bg} p-3.5`}>
            <div className={`flex items-center gap-1.5 font-semibold text-xs ${style.titleColor} mb-1.5`}>
                <Icon className="h-4 w-4 shrink-0" />
                {style.title}
            </div>
            <div className="text-sm text-foreground/80 leading-relaxed [&>p]:m-0 [&>p+p]:mt-1.5">
                {children}
            </div>
        </div>
    );
}

// ── CCI link parser ──────────────────────────────────────────────────────────
// Format: cci:1://file:///C:/path/to/file.tsx:startLine:startCol-endLine:endCol

interface CciTarget {
    path: string;      // absolute fs path
    startLine: number; // 1-based
    endLine: number;
    ext: string;
}

function parseCciUrl(href: string): CciTarget | null {
    try {
        // cci:1://file:///C:/some/path.tsx:257:0-472:1
        const m = href.match(/^cci:\d+:\/\/file:\/\/\/(.*?)(?::(\d+):(\d+)-(\d+):(\d+))?$/);
        if (!m) return null;
        let path = decodeURIComponent(m[1]);
        // Windows: ensure drive letter casing
        if (/^[a-zA-Z]:/.test(path)) path = path[0].toUpperCase() + path.slice(1);
        const ext = path.split('.').pop()?.toLowerCase() || '';
        return {
            path,
            startLine: m[2] ? parseInt(m[2]) + 1 : 1, // convert 0-based to 1-based
            endLine: m[4] ? parseInt(m[4]) + 1 : 0,
            ext,
        };
    } catch { return null; }
}

const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    kt: 'kotlin', cs: 'csharp', cpp: 'cpp', c: 'c',
    rb: 'ruby', php: 'php', sh: 'bash', md: 'markdown',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    css: 'css', scss: 'scss', html: 'html', sql: 'sql',
};

// ── File Viewer Modal ─────────────────────────────────────────────────────────

function FileViewerModal({ target, onClose }: { target: CciTarget; onClose: () => void }) {
    const [content, setContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const lineRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setContent(null);
        setError(null);
        fetch(`${API_BASE}/api/file/read`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: target.path }),
        })
            .then(r => r.json())
            .then(d => {
                if (d.content !== undefined) setContent(d.content);
                else setError(d.error || 'Failed to load');
            })
            .catch(e => setError(e.message));
    }, [target.path]);

    // Scroll to target line after render
    useEffect(() => {
        if (content && lineRef.current) {
            setTimeout(() => lineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100);
        }
    }, [content]);

    const filename = target.path.split(/[/\\]/).pop() || target.path;
    const lang = EXT_TO_LANG[target.ext] || 'text';

    // Highlight only target lines using custom line props
    const lineStart = target.startLine;
    const lineEnd = target.endLine || target.startLine;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative flex flex-col bg-background border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 shrink-0">
                    <FileCode2 className="w-4 h-4 text-primary/60 shrink-0" />
                    <span className="text-xs font-mono text-foreground/70 truncate flex-1 min-w-0" title={target.path}>
                        {filename}
                        {target.startLine > 0 && (
                            <span className="text-muted-foreground/50 ml-2">
                                :{target.startLine}{target.endLine && target.endLine !== target.startLine ? `–${target.endLine}` : ''}
                            </span>
                        )}
                    </span>
                    <a
                        href={`vscode://file/${target.path}:${target.startLine}`}
                        className="p-1 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground/70 transition-all"
                        title="Open in VS Code"
                        onClick={e => e.stopPropagation()}
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground/70 transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto">
                    {!content && !error && (
                        <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground/40">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-xs">Loading…</span>
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center justify-center h-32">
                            <span className="text-xs text-red-400/70">{error}</span>
                        </div>
                    )}
                    {content && (
                        <SyntaxHighlighter
                            language={lang}
                            style={vscDarkPlus}
                            showLineNumbers
                            startingLineNumber={1}
                            wrapLines
                            lineProps={(lineNumber: number) => {
                                const isHighlighted = lineNumber >= lineStart && lineNumber <= lineEnd;
                                return {
                                    ref: lineNumber === lineStart ? lineRef : undefined,
                                    style: {
                                        display: 'block',
                                        backgroundColor: isHighlighted ? 'rgba(255,220,100,0.08)' : undefined,
                                        borderLeft: isHighlighted ? '2px solid rgba(255,220,100,0.5)' : '2px solid transparent',
                                    },
                                };
                            }}
                            customStyle={{
                                margin: 0,
                                borderRadius: 0,
                                background: 'transparent',
                                fontSize: '12px',
                                lineHeight: '1.6',
                            }}
                            codeTagProps={{ style: { fontFamily: 'var(--font-mono, monospace)' } }}
                        >
                            {content}
                        </SyntaxHighlighter>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── CCI Link component ────────────────────────────────────────────────────────

function CciLink({ href, children }: { href: string; children: React.ReactNode }) {
    const [target, setTarget] = useState<CciTarget | null>(null);

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const parsed = parseCciUrl(href);
        if (parsed) setTarget(parsed);
    }, [href]);

    return (
        <>
            <button
                onClick={handleClick}
                className="inline-flex items-center gap-0.5 text-primary/80 hover:text-primary underline decoration-dotted underline-offset-2 transition-colors cursor-pointer"
                title={`View file: ${href}`}
            >
                <FileCode2 className="w-3 h-3 opacity-60 shrink-0" />
                {children}
            </button>
            {target && <FileViewerModal target={target} onClose={() => setTarget(null)} />}
        </>
    );
}

// ── Markdown Preprocessing ────────────────────────────────────────────────────

// Hoist plugin arrays to module scope — prevents re-creation on every render
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

// Preprocess markdown: encode cci:// links as safe https:// so react-markdown doesn't strip them
const CCI_VIEWER_BASE = 'https://cci-viewer.internal/';
function preprocessCciLinks(content: string): string {
    return content.replace(
        /\[([^\]]+)\]\((cci:[^)]+)\)/g,
        (_match, text, cciUrl) => `[${text}](${CCI_VIEWER_BASE}${encodeURIComponent(cciUrl)})`
    );
}

// Preprocess GitHub-style alerts: > [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]
// Converts them to custom HTML markers that we can pick up in the blockquote renderer
function preprocessAlerts(content: string): string {
    return content.replace(
        /^(>\s*)\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n/gim,
        `$1<!-- gh-alert:$2 -->\n`
    );
}

// ── Component Map ─────────────────────────────────────────────────────────────

// Hoist component map to module scope — prevents ReactMarkdown from re-rendering
const MD_COMPONENTS = {
    a({ href, children, ...props }: any) {
        // Recover encoded cci:// links
        if (href?.startsWith(CCI_VIEWER_BASE)) {
            const cciUrl = decodeURIComponent(href.slice(CCI_VIEWER_BASE.length));
            return <CciLink href={cciUrl}>{children}</CciLink>;
        }
        // file:/// links — open in file viewer
        if (href?.startsWith('file:///')) {
            const path = decodeURIComponent(href.replace('file:///', ''));
            const ext = path.split('.').pop()?.toLowerCase() || '';
            const target: CciTarget = { path, startLine: 1, endLine: 0, ext };
            return <CciLink href={`cci:1://file:///${encodeURIComponent(path)}`}>{children}</CciLink>;
        }
        // Regular links
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
            </a>
        );
    },
    img({ src, alt, ...props }: any) {
        if (!src) return null;
        return <img src={src} alt={alt || ''} {...props} />;
    },
    pre({ children }: any) {
        return <pre className="code-block">{children}</pre>;
    },
    code({ className, children, ...props }: any) {
        const isBlock = className?.includes('hljs') || className?.includes('language-');
        const language = className?.replace(/language-/, '').replace(/hljs\s*/, '') || '';

        // Mermaid diagram
        if (language === 'mermaid' && isBlock) {
            return <MermaidDiagram code={String(children).replace(/\n$/, '')} />;
        }

        if (!isBlock) {
            return <code className="inline-code" {...props}>{children}</code>;
        }
        return (
            <div className="code-block-wrapper">
                {language && <span className="code-lang-label">{language}</span>}
                <CopyButton text={String(children).replace(/\n$/, '')} />
                <code className={className} {...props}>{children}</code>
            </div>
        );
    },
    // GitHub-style alerts via blockquote
    blockquote({ children, ...props }: any) {
        // Check if the blockquote contains our alert marker
        const childArray = Array.isArray(children) ? children : [children];
        let alertType: string | null = null;
        const filteredChildren: React.ReactNode[] = [];

        for (const child of childArray) {
            if (child === null || child === undefined) continue;
            // Check for raw HTML comment marker in paragraph children
            if (typeof child === 'object' && child?.props?.children) {
                const innerChildren = Array.isArray(child.props.children) ? child.props.children : [child.props.children];
                let hasMarker = false;
                const cleanedInner: React.ReactNode[] = [];
                for (const ic of innerChildren) {
                    if (typeof ic === 'string') {
                        const markerMatch = ic.match(/<!--\s*gh-alert:(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\s*-->/);
                        if (markerMatch) {
                            alertType = markerMatch[1];
                            hasMarker = true;
                            const rest = ic.replace(/<!--\s*gh-alert:\w+\s*-->/, '').trim();
                            if (rest) cleanedInner.push(rest);
                            continue;
                        }
                    }
                    cleanedInner.push(ic);
                }
                if (hasMarker && cleanedInner.length > 0) {
                    filteredChildren.push(<p key="cleaned">{cleanedInner}</p>);
                } else if (!hasMarker) {
                    filteredChildren.push(child);
                }
            } else {
                filteredChildren.push(child);
            }
        }

        if (alertType) {
            return <GitHubAlert type={alertType}>{filteredChildren}</GitHubAlert>;
        }

        // Regular blockquote
        return <blockquote {...props}>{children}</blockquote>;
    },
    // Better table styling for mobile
    table({ children, ...props }: any) {
        return (
            <div className="my-3 overflow-x-auto rounded-lg border border-border/30">
                <table className="w-full text-sm" {...props}>{children}</table>
            </div>
        );
    },
    th({ children, ...props }: any) {
        return (
            <th className="px-3 py-2 text-left text-xs font-semibold text-foreground/80 bg-muted/20 border-b border-border/30 whitespace-nowrap" {...props}>
                {children}
            </th>
        );
    },
    td({ children, ...props }: any) {
        return (
            <td className="px-3 py-2 text-xs text-foreground/70 border-b border-border/10" {...props}>
                {children}
            </td>
        );
    },
};

interface Props {
    content: string;
    className?: string;
}

// Memoized: only re-renders when content or className actually change
export const MarkdownRenderer = memo(function MarkdownRenderer({ content, className }: Props) {
    let processed = preprocessCciLinks(content);
    processed = preprocessAlerts(processed);
    return (
        <div className={`markdown-body ${className || ''}`}>
            <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={MD_COMPONENTS}
            >
                {processed}
            </ReactMarkdown>
        </div>
    );
});

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [text]);
    return (
        <button onClick={handleCopy} className="copy-btn" title="Copy code">
            {copied ? <><Check className="h-3 w-3 mr-1 inline" />Copied</> : <><Copy className="h-3 w-3 mr-1 inline" />Copy</>}
        </button>
    );
}
