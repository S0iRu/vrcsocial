'use client';

import { Search, History, MapPin, Radio, Trash2, Clock, MessageSquare } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useFriends } from "@/components/providers/FriendsProvider";
import { ConnectionBadge, PageHeader } from "@/components/layout/PageHeader";
import {
    formatActivityLogTime,
    readActivityLogs,
    subscribeActivityLogs,
    writeActivityLogs,
    type ActivityLog,
} from "@/lib/activityLog";

const getLogStyle = (type: string) => {
    switch (type) {
        case 'OnLine': return { icon: Radio, color: 'text-green-400', bg: 'bg-green-500/10' };
        case 'GPS': return { icon: MapPin, color: 'text-orange-400', bg: 'bg-orange-500/10' };
        case 'Offline': return { icon: Radio, color: 'text-slate-400', bg: 'bg-slate-500/10' };
        case 'Status': return { icon: Clock, color: 'text-cyan-400', bg: 'bg-cyan-500/10' };
        case 'StatusMsg': return { icon: MessageSquare, color: 'text-purple-400', bg: 'bg-purple-500/10' };
        default: return { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' };
    }
};

const logTypes = ['all', 'OnLine', 'GPS', 'Offline', 'Status', 'StatusMsg'];

export default function LogsPage() {
    const { wsConnectionState, isAuthenticated } = useFriends();
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<string>('all');

    useEffect(() => {
        const loadLogs = () => setLogs(readActivityLogs());
        const timer = window.setTimeout(loadLogs, 0);
        const unsubscribe = subscribeActivityLogs(loadLogs);
        return () => {
            window.clearTimeout(timer);
            unsubscribe();
        };
    }, []);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            if (filterType !== 'all' && log.type !== filterType) return false;
            if (!searchQuery) return true;
            const query = searchQuery.toLowerCase();
            return log.user.toLowerCase().includes(query) || log.detail.toLowerCase().includes(query);
        });
    }, [logs, searchQuery, filterType]);

    const clearLogs = () => {
        if (confirm('ログを全て削除しますか？')) {
            writeActivityLogs([]);
        }
    };

    return (
        <div className="space-y-4 md:space-y-6">
            <PageHeader
                title="Logs"
                icon={History}
                iconClassName="text-blue-400"
                trailing={
                    <>
                        {isAuthenticated && <ConnectionBadge state={wsConnectionState} />}
                        <span className="text-xs text-slate-500">
                            {filteredLogs.length}/{logs.length}
                        </span>
                    </>
                }
                actions={logs.length > 0 ? (
                    <button
                        onClick={clearLogs}
                        className="flex items-center gap-1.5 px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-xs transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Clear</span>
                    </button>
                ) : undefined}
            />

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by name or world..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full ink-field pl-10 pr-4 py-2.5 text-sm"
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    {logTypes.map(type => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            className={`px-3 py-2 text-xs tracking-wide transition-colors ${
                                filterType === type
                                    ? 'bg-[var(--paper)] text-[var(--bg)]'
                                    : 'text-[var(--faint)] hover:text-[var(--hover)]'
                            }`}
                        >
                            {type === 'all' ? 'All' : type}
                        </button>
                    ))}
                </div>
            </div>

            {filteredLogs.length === 0 ? (
                <section className="pt-10">
                    <h3 className="font-display text-3xl">No logs found</h3>
                    <p className="mt-4 text-sm text-[var(--muted)]">
                        {logs.length === 0
                            ? "Activity logs will appear here."
                            : "No logs match your filter."}
                    </p>
                </section>
            ) : (
                <div className="glass-panel rounded-xl divide-y divide-white/5">
                    {filteredLogs.map((log) => {
                        const style = getLogStyle(log.type);
                        const Icon = style.icon;
                        const name = log.userId ? (
                            <Link href={`/friends/${log.userId}`} className="text-sm font-medium text-white hover:text-indigo-300 truncate">
                                {log.user}
                            </Link>
                        ) : (
                            <span className="text-sm font-medium text-white truncate">{log.user}</span>
                        );
                        return (
                            <div key={log.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors">
                                <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.bg}`}>
                                    <Icon className={`w-4 h-4 ${style.color}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-[11px] text-slate-500">{formatActivityLogTime(log)}</span>
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${style.bg} ${style.color}`}>{log.type}</span>
                                        {name}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5 break-words">{log.detail}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
