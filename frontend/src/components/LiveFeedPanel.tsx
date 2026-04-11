'use client';

import type { ReactElement } from 'react';
import type { LiveFeedEntry } from '@/lib/useLiveVehicleStream';

function formatUtcTime(sec: number): string {
    const d = new Date(sec * 1000);
    return d.toISOString().slice(11, 19);
}

export interface LiveFeedPanelProps {
    entries: LiveFeedEntry[];
}

export function LiveFeedPanel({ entries }: LiveFeedPanelProps): ReactElement {
    return (
        <section
            className="mt-3 rounded-md border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-panel)] px-3 py-3"
            aria-label="Live location feed"
        >
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--cc-accent-secondary)]">
                Live feed
            </h2>
            <div className="max-h-[220px] overflow-y-auto pr-1">
                {entries.length === 0 ? (
                    <p className="cc-mono text-[10px] text-[color:var(--cc-text-muted)]">Awaiting SSE events…</p>
                ) : (
                    <ul className="space-y-1.5">
                        {entries.map((e) => (
                            <li key={e.id} className="live-feed-row">
                                <p className="cc-mono text-[10px] leading-snug text-[color:var(--cc-text-secondary)]">
                                    <span className="text-[color:var(--cc-accent-primary)]">
                                        [{formatUtcTime(e.timestamp)}]
                                    </span>{' '}
                                    <span className="text-[color:var(--cc-text-primary)]">{e.vehicleId}</span>
                                    <span className="text-[color:var(--cc-text-muted)]"> → </span>
                                    <span>
                                        {e.lat.toFixed(4)}, {e.lng.toFixed(4)}
                                    </span>
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="cc-mono mt-2 flex items-center gap-1.5 text-[9px] text-[color:var(--cc-text-muted)]">
                <span className="cc-feed-cursor font-semibold" aria-hidden>
                    █
                </span>
                <span>streaming…</span>
            </div>
        </section>
    );
}
