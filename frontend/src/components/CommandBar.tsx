'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import {
    BarChart2,
    Filter,
    MapPin,
    MessageSquare,
    Route,
    Sparkles,
    X,
    Zap,
} from 'lucide-react';
import type { FleetAiAction } from '@/lib/fleetAiTypes';
import type { FleetAiHistoryEntry } from '@/lib/fleetAiTypes';
import { cn } from '@/lib/utils';

interface CommandBarProps {
    isAvailable: boolean;
    isChecking: boolean;
    isLoading: boolean;
    lastAction: FleetAiAction | null;
    history: FleetAiHistoryEntry[];
    clearAction: () => void;
    dismissAutoMessage: () => void;
    submitQuery: (query: string) => Promise<void>;
}

function actionLabel(a: FleetAiAction): string {
    switch (a.type) {
        case 'zoom_to':
            return 'zoom';
        case 'filter_by_type':
        case 'filter_by_speed':
            return 'filter';
        case 'highlight_vehicles':
            return 'highlight';
        case 'show_stat':
            return 'stat';
        case 'route_vehicle':
            return 'route';
        case 'clear_filters':
            return 'reset';
        default:
            return 'answer';
    }
}

function HistoryIcon({ action }: { action: FleetAiAction }): ReactElement {
    const cls = 'h-3.5 w-3.5 shrink-0 text-[color:var(--cc-text-muted)]';
    switch (action.type) {
        case 'zoom_to':
            return <MapPin className={cls} aria-hidden />;
        case 'filter_by_type':
        case 'filter_by_speed':
            return <Filter className={cls} aria-hidden />;
        case 'highlight_vehicles':
            return <Zap className={cls} aria-hidden />;
        case 'show_stat':
            return <BarChart2 className={cls} aria-hidden />;
        case 'route_vehicle':
            return <Route className={cls} aria-hidden />;
        case 'clear_filters':
            return <MessageSquare className={cls} aria-hidden />;
        default:
            return <MessageSquare className={cls} aria-hidden />;
    }
}

const SUGGESTIONS = [
    'Show slow vehicles',
    'Zoom to San Francisco',
    'How many trucks?',
    'Highlight aircraft',
] as const;

export default function CommandBar({
    isAvailable,
    isChecking,
    isLoading,
    lastAction,
    history,
    clearAction,
    dismissAutoMessage,
    submitQuery,
}: CommandBarProps): ReactElement {
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState('');
    const [focused, setFocused] = useState(false);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const chipVisible =
        lastAction != null &&
        (lastAction.type === 'filter_by_type' ||
            lastAction.type === 'filter_by_speed' ||
            lastAction.type === 'highlight_vehicles');

    const autoMessageText =
        lastAction?.type === 'answer_text' || lastAction?.type === 'show_stat' ? lastAction.text : null;

    useEffect(() => {
        const onKey = (e: globalThis.KeyboardEvent): void => {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            const t = e.target as Node | null;
            if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
            if (t instanceof HTMLElement && t.isContentEditable) return;
            e.preventDefault();
            inputRef.current?.focus();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    const filterChipText = useCallback((): string | null => {
        if (!lastAction) return null;
        if (lastAction.type === 'filter_by_type') {
            return `Showing: ${lastAction.types.join(', ')} only`;
        }
        if (lastAction.type === 'filter_by_speed') {
            return `Speed: ${lastAction.min_kmh}–${lastAction.max_kmh} km/h`;
        }
        if (lastAction.type === 'highlight_vehicles') {
            const ids = lastAction.vehicle_ids.slice(0, 3).join(', ');
            const more = lastAction.vehicle_ids.length > 3 ? ` +${lastAction.vehicle_ids.length - 3}` : '';
            return `Highlighting: ${ids}${more}`;
        }
        return null;
    }, [lastAction]);

    const chipText = filterChipText();

    const onSubmit = useCallback(async (): Promise<void> => {
        const q = value.trim();
        if (q.length === 0) return;
        setValue('');
        setHistoryIndex(-1);
        await submitQuery(q);
    }, [value, submitQuery]);

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void onSubmit();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            clearAction();
            inputRef.current?.blur();
            return;
        }
        if (e.key === 'ArrowUp' && history.length > 0) {
            e.preventDefault();
            setHistoryIndex((i) => {
                const next = i < 0 ? 0 : Math.min(i + 1, history.length - 1);
                const entry = history[next];
                if (entry) setValue(entry.query);
                return next;
            });
        }
        if (e.key === 'ArrowDown' && historyIndex >= 0) {
            e.preventDefault();
            setHistoryIndex((i) => {
                const next = i - 1;
                if (next < 0) {
                    setValue('');
                    return -1;
                }
                const entry = history[next];
                if (entry) setValue(entry.query);
                return next;
            });
        }
    };

    const disabledInput = !isAvailable || isLoading || isChecking;
    const placeholder = isAvailable
        ? "Query your fleet... 'show slow trucks', 'zoom to Seattle', 'how many buses?'"
        : 'AI unavailable — start Ollama to enable fleet queries';

    return (
        <div className="relative w-full">
            <div
                className={cn(
                    'flex h-11 w-full items-center gap-3 rounded-lg border border-[color:var(--cc-border)] bg-[color:var(--cc-bg-panel)] px-4 transition-[border-color,box-shadow] duration-200',
                    isLoading && 'cc-cmd-bar-loading',
                    !disabledInput && !isLoading && 'focus-within:border-[color:var(--cc-border)]'
                )}
            >
                <Sparkles
                    className={cn(
                        'h-4 w-4 shrink-0',
                        isAvailable ? 'text-[color:var(--cc-accent-primary)]' : 'text-[color:var(--cc-text-muted)]'
                    )}
                    aria-hidden
                />
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    disabled={disabledInput}
                    onChange={(ev) => {
                        setValue(ev.target.value);
                        setHistoryIndex(-1);
                    }}
                    onKeyDown={onKeyDown}
                    onFocus={() => setFocused(true)}
                    onBlur={() => {
                        window.setTimeout(() => setFocused(false), 120);
                    }}
                    placeholder={placeholder}
                    className="cc-mono min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-[color:var(--cc-text-primary)] outline-none placeholder:text-[color:var(--cc-text-muted)] disabled:cursor-not-allowed disabled:opacity-70"
                    aria-label="Fleet AI query"
                />
                <span
                    className={cn(
                        'cc-mono shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                        'border-[color:var(--cc-accent-secondary)] text-[color:var(--cc-accent-secondary)]',
                        isLoading && 'cc-ai-badge-thinking'
                    )}
                >
                    {isLoading ? 'thinking…' : 'AI'}
                </span>
            </div>

            {history.length > 0 && value.length === 0 && (
                <div
                    className={cn(
                        'cc-mono absolute left-0 right-0 top-full z-[1200] mt-1 overflow-hidden rounded-md border border-[color:var(--cc-border-subtle)] bg-[color:var(--cc-bg-secondary)] text-xs shadow-lg transition-opacity duration-200',
                        focused ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                    )}
                    aria-label="Query history"
                >
                    {history.map((h) => (
                        <button
                            key={h.query}
                            type="button"
                            className="flex w-full items-center justify-between gap-2 border-b border-[color:var(--cc-border-subtle)] px-3 py-2 text-left text-[color:var(--cc-text-primary)] last:border-b-0 hover:bg-[color:var(--cc-bg-panel-hover)]"
                            onMouseDown={(ev) => {
                                ev.preventDefault();
                                void submitQuery(h.query);
                                setFocused(false);
                            }}
                        >
                            <span className="min-w-0 flex-1 truncate">{h.query}</span>
                            <span className="flex shrink-0 items-center gap-1.5 text-[color:var(--cc-text-muted)]">
                                <HistoryIcon action={h.action} />
                                <span className="text-[10px] uppercase">{actionLabel(h.action)}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {focused && value.length === 0 && history.length === 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                        <button
                            key={s}
                            type="button"
                            className="cc-mono rounded-full border border-[color:var(--cc-border)] px-2.5 py-1 text-[11px] text-[color:var(--cc-text-secondary)] hover:bg-[color:var(--cc-bg-panel-hover)]"
                            onMouseDown={(ev) => {
                                ev.preventDefault();
                                void submitQuery(s);
                                setFocused(false);
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {(autoMessageText != null || (chipText != null && chipVisible)) && (
                <div
                    key={autoMessageText ?? chipText ?? 'chip'}
                    className="cc-cmd-result-panel cc-mono mt-2 rounded-md border border-[color:var(--cc-border-subtle)] bg-[color:var(--cc-bg-secondary)] px-3 py-2 text-[13px] text-[color:var(--cc-text-primary)]"
                >
                    {autoMessageText != null ? (
                        <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 flex-1">{autoMessageText}</span>
                            <button
                                type="button"
                                className="shrink-0 rounded p-0.5 text-[color:var(--cc-text-muted)] hover:bg-[color:var(--cc-bg-panel-hover)] hover:text-[color:var(--cc-text-primary)]"
                                aria-label="Dismiss"
                                onClick={() => dismissAutoMessage()}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ) : chipText != null ? (
                        <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 flex-1">{chipText}</span>
                            <button
                                type="button"
                                className="shrink-0 rounded p-0.5 text-[color:var(--cc-text-muted)] hover:bg-[color:var(--cc-bg-panel-hover)] hover:text-[color:var(--cc-text-primary)]"
                                aria-label="Clear map filter"
                                onClick={() => clearAction()}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
