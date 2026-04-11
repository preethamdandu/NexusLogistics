'use client';

import type { ReactElement } from 'react';
import { useCallback, useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
    const el = document.documentElement;
    const obs = new MutationObserver(onChange);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
}

function getDarkSnapshot(): boolean {
    return document.documentElement.classList.contains('dark');
}

/** Toggles standard (light) UI vs tactical command-center (dark). */
export function StandardUiToggle(): ReactElement {
    const dark = useSyncExternalStore(subscribe, getDarkSnapshot, () => true);

    const toggle = useCallback(() => {
        document.documentElement.classList.toggle('dark');
    }, []);

    return (
        <button
            type="button"
            onClick={toggle}
            className="cc-mono rounded border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-secondary)] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--cc-text-secondary)] hover:bg-[color:var(--cc-bg-panel-hover)]"
            title={dark ? 'Switch to standard (light) UI' : 'Switch to tactical command center'}
            aria-label={dark ? 'Switch to standard light UI' : 'Switch to tactical dark UI'}
        >
            {dark ? 'Std' : 'CC'}
        </button>
    );
}
