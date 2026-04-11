'use client';

import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import type { MapInnerProps } from './MapInner';

const DynamicMapInner = dynamic(() => import('./MapInner'), {
    ssr: false,
    loading: () => (
        <div className="flex min-h-[300px] w-full flex-1 items-center justify-center rounded-md border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-secondary)] text-[color:var(--cc-text-muted)]">
            <span className="cc-mono text-[11px] uppercase tracking-wide">Loading map…</span>
        </div>
    ),
});

export type { MapInnerProps } from './MapInner';

export default function MapComponent(props: MapInnerProps): ReactElement {
    return <DynamicMapInner {...props} />;
}
