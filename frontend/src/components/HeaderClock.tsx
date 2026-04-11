'use client';

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});

export function HeaderClock(): ReactElement {
    const [label, setLabel] = useState(() => `${formatter.format(new Date())} UTC`);

    useEffect(() => {
        const id = window.setInterval(() => {
            setLabel(`${formatter.format(new Date())} UTC`);
        }, 1000);
        return () => window.clearInterval(id);
    }, []);

    return (
        <time
            dateTime={new Date().toISOString()}
            className="cc-mono text-[11px] tabular-nums text-[color:var(--cc-text-secondary)]"
        >
            {label}
        </time>
    );
}
