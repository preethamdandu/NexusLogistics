'use client';

import type { ReactElement } from 'react';
import { ExternalLink } from 'lucide-react';

const LINKS: { label: string; href: string }[] = [
    { label: 'Grafana', href: 'http://localhost:3001' },
    { label: 'Prometheus', href: 'http://localhost:9090' },
    { label: 'Kafka UI', href: 'http://localhost:8080' },
];

export function LinksPanel(): ReactElement {
    return (
        <section
            className="mt-3 rounded-md border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-panel)] px-3 py-3"
            aria-label="External tools"
        >
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--cc-text-muted)]">
                Links
            </h2>
            <ul className="space-y-1.5">
                {LINKS.map((l) => (
                    <li key={l.href}>
                        <a
                            href={l.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cc-mono inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--cc-accent-secondary)] hover:underline"
                        >
                            {l.label}
                            <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}
