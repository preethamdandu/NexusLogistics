'use client';

import dynamic from 'next/dynamic';

const MapInner = dynamic(() => import('./MapInner'), {
    ssr: false,
    loading: () => (
        <div className="h-[600px] w-full rounded-xl bg-muted/50 animate-pulse flex items-center justify-center text-muted-foreground">
            Loading Map...
        </div>
    ),
});

export default MapInner;
