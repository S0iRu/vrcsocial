'use client';

import { RefreshCw, Wifi, WifiOff, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ConnectionState } from '@/components/providers/FriendsProvider';

export function connectionDisplay(state: ConnectionState): { icon: typeof Wifi; color: string; label: string; pulse: boolean } {
    switch (state) {
        case 'connected':
            return { icon: Wifi, color: 'text-green-400', label: 'Live', pulse: false };
        case 'connecting':
        case 'reconnecting':
            return { icon: Wifi, color: 'text-[#5b9dff]', label: 'Connecting...', pulse: true };
        default:
            return { icon: WifiOff, color: 'text-[var(--faint)]', label: 'Polling', pulse: false };
    }
}

export function ConnectionBadge({ state }: { state: ConnectionState }) {
    const status = connectionDisplay(state);
    const Icon = status.icon;
    return (
        <span className={`kicker inline-flex items-center gap-1 ${status.color}`} title={`Connection: ${state}`}>
            <Icon className={`w-3 h-3 ${status.pulse ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">{status.label}</span>
        </span>
    );
}

export function RefreshButton({
    onClick,
    spinning = false,
    label = 'Refresh Now',
}: {
    onClick: () => void;
    spinning?: boolean;
    label?: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={spinning}
            className="icon-btn"
            title={label}
        >
            <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} />
        </button>
    );
}

export function PageHeader({
    title,
    icon: Icon,
    trailing,
    actions,
}: {
    title: string;
    icon?: LucideIcon;
    iconClassName?: string;
    trailing?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
            <div className="min-w-0">
                {Icon && (
                    <p className="kicker inline-flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5" />
                        VRC Social
                    </p>
                )}
                <h2 className="font-display text-[clamp(2rem,5vw,3.25rem)] mt-2">{title}</h2>
                {trailing && <div className="mt-3 flex items-center gap-3 text-[var(--faint)]">{trailing}</div>}
            </div>
            {actions}
        </div>
    );
}
