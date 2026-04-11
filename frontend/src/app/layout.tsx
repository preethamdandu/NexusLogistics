import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
    title: 'Nexus Logistics',
    description: 'Real-time Vehicle Tracking System',
    icons: {
        icon: '/favicon.svg',
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <body
                className={cn(
                    inter.variable,
                    'min-h-screen bg-[var(--cc-bg-primary)] font-sans antialiased'
                )}
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
