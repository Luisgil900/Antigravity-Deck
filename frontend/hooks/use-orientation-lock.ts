'use client';

import { useState, useEffect, useCallback } from 'react';

interface ScreenOrientationExt extends ScreenOrientation {
    lock(orientation: string): Promise<void>;
    unlock(): void;
}

/**
 * Hook to manage screen orientation lock for PWAs.
 * Default: LOCKED at current orientation on launch.
 * User can toggle via the sidebar button.
 */
export function useOrientationLock() {
    const [isLocked, setIsLocked] = useState(true); // Auto-lock by default
    const [currentType, setCurrentType] = useState<string>('portrait-primary');
    const [isPWA, setIsPWA] = useState(false);
    const [supported, setSupported] = useState(false);

    useEffect(() => {
        const standalonePWA = 
            window.matchMedia('(display-mode: standalone)').matches ||
            (navigator as any).standalone === true;
        setIsPWA(standalonePWA);

        const ori = screen.orientation as ScreenOrientationExt | undefined;
        const hasAPI = !!ori && typeof ori.lock === 'function';
        setSupported(hasAPI);

        if (ori) setCurrentType(ori.type);

        // Auto-lock on PWA launch
        if (standalonePWA && hasAPI && ori) {
            ori.lock(ori.type).catch(() => {});
        }
    }, []);

    useEffect(() => {
        const ori = screen.orientation;
        if (!ori) return;
        const handler = () => setCurrentType(ori.type);
        ori.addEventListener('change', handler);
        return () => ori.removeEventListener('change', handler);
    }, []);

    const toggleLock = useCallback(async () => {
        if (!supported) return;
        const ori = screen.orientation as ScreenOrientationExt;
        if (isLocked) {
            try { ori.unlock(); setIsLocked(false); } catch {}
        } else {
            try { await ori.lock(ori.type); setIsLocked(true); } catch {}
        }
    }, [isLocked, supported]);

    return {
        isLocked,
        currentType,
        isPWA,
        supported: supported && isPWA,
        toggleLock,
        isPortrait: currentType.includes('portrait'),
    };
}
