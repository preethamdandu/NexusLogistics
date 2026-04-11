'use client';

import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

export interface CountUpNumberProps {
    value: number;
    className?: string;
}

export function CountUpNumber({ value, className }: CountUpNumberProps): ReactElement {
    const [display, setDisplay] = useState(0);
    const introDone = useRef(false);

    useEffect(() => {
        if (introDone.current) {
            const id = requestAnimationFrame(() => {
                setDisplay(value);
            });
            return () => cancelAnimationFrame(id);
        }

        if (value === 0) {
            const id = requestAnimationFrame(() => {
                setDisplay(0);
            });
            return () => cancelAnimationFrame(id);
        }

        const start = performance.now();
        const duration = 500;
        let raf = 0;

        const tick = (now: number): void => {
            const t = Math.min((now - start) / duration, 1);
            setDisplay(Math.round(value * t));
            if (t < 1) {
                raf = requestAnimationFrame(tick);
            } else {
                introDone.current = true;
            }
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [value]);

    return <span className={className}>{display}</span>;
}
