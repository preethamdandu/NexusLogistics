'use client';

import { Moon, Sun } from 'lucide-react';
import { useCallback, useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
    const el = document.documentElement;
    const obs = new MutationObserver(onChange);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
}

function getDarkSnapshot(): boolean {
    return document.documentElement.classList.contains('dark');
}

export function ThemeToggle() {
    const dark = useSyncExternalStore(subscribe, getDarkSnapshot, () => false);

    const toggle = useCallback(() => {
        document.documentElement.classList.toggle('dark');
    }, []);

    return (
        <button
            type="button"
            onClick={toggle}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
        </button>
    );
}
