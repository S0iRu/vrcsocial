'use client';

import { Search, History, MapPin, Radio, RefreshCw, Trash2, Clock, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useFriends, ConnectionState } from "@/components/providers/FriendsProvider";

// Get WebSocket connection status display
const getWsStatusDisplay = (state: ConnectionState) => {
    switch (state) {
        case 'connected':
            return { icon: Wifi, color: 'text-green-400', label: 'Live' };
        case 'connecting':
        case 'reconnecting':
            return { icon: Wifi, color: 'text-yellow-400 animate-pulse', label: 'Connecting...' };
        case 'disconnected':
        default:
            return { icon: WifiOff, color: 'text-slate-500', label: 'Disconnected' };
    }
};

type LogEntry = {
    id: number;
    date: string;
    type: string;
    user: string;
    detail: string;
    color?: string;
};

export default function LogsPage() {
    const { wsConnectionState, isAuthenticated } = useFriends();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<string>('all');

    useEffect(() => {
        const loadLogs = () => {
            if (typeof window !== 'undefined') {
                const stored = localStorage.getItem('vrc_logs');
                if (stored) {
                    try {
                        setLogs(JSON.parse(stored));
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        };

        loadLogs();
        const interval = setInterval(loadLogs, 2000);
        return () => clearInterval(interval);
    }, []);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            // Filter by type
            if (filterType !== 'all' && log.type !== filterType) return false;
            // Filter by search query
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                return (
                    log.user.toLowerCase().includes(query) ||
                    log.detail.toLowerCase().includes(query)
                );
            }
            return true;
        });
    }, [logs, searchQuery, filterType]);

    const clearLogs = () => {
        if (confirm('ログを全て削除しますか？')) {
            localStorage.removeItem('vrc_logs');
            setLogs([]);
        }
    };

    const getLogStyle = (type: string) => {
        switch (type) {
            case 'OnLine': return { icon: Radio, color: 'text-green-400', bg: 'bg-green-500/10' };
            case 'GPS': return { icon: MapPin, color: 'text-orange-400', bg: 'bg-orange-500/10' };
            case 'Offline': return { icon: Radio, color: 'text-slate-500', bg: 'bg-slate-500/10' };
            default: return { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' };
        }
    };

    const logTypes = ['all', 'OnLine', 'GPS', 'Offline'];

    return (
        <div className="space-y-6 md:space-y-8 pb-24 md:pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2 md:gap-3">
                        <History className="w-6 h-6 md:w-8 md:h-8 text-blue-500" /> Logs
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                        <p className="text-sm md:text-base text-muted-foreground">Activity History</p>
                        {isAuthenticated && (
                            <span className={`text-xs flex items-center gap-1 ${getWsStatusDisplay(wsConnectionState).color}`}>
                                {(() => {
                                    const status = getWsStatusDisplay(wsConnectionState);
                                    const Icon = status.icon;
                                    return <Icon className="w-3 h-3" />;
                                })()}
                                <span className="hidden sm:inline">{getWsStatusDisplay(wsConnectionState).label}</span>
                            </span>
                        )}
                        <span className="text-xs text-slate-600">
                            {filteredLogs.length} / {logs.length} entries
                        </span>
                    </div>
                </div>

                {/* Clear Button */}
                {logs.length > 0 && (
                    <button
                        onClick={clearLogs}
                        className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Clear Logs</span>
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by name or world..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                </div>

                {/* Type Filter */}
                <div className="flex gap-2">
                    {logTypes.map(type => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                filterType === type
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                        >
                            {type === 'all' ? 'All' : type}
                        </button>
                    ))}
                </div>
            </div>

            {/* Logs List */}
            {filteredLogs.length === 0 ? (
                <div className="glass-card rounded-xl p-8 md:p-12 text-center">
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                        <History className="w-8 h-8 md:w-10 md:h-10 text-blue-400" />
                    </div>
                    <h3 className="text-lg md:text-xl font-bold text-white mb-2">No Logs Found</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto text-sm md:text-base">
                        {logs.length === 0
                            ? "Activity logs will appear here as your friends come online, go offline, or change worlds."
                            : "No logs match your current filter."}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredLogs.map((log) => {
                        const style = getLogStyle(log.type);
                        const Icon = style.icon;

                        return (
                            <div
                                key={log.id}
                                className="glass-card rounded-lg p-3 md:p-4 hover:border-indigo-500/30 transition-all duration-300"
                            >
                                <div className="flex items-center gap-3">
                                    {/* Icon */}
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
                                        <Icon className={`w-5 h-5 ${style.color}`} />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${style.bg} ${style.color}`}>
                                                    {log.type}
                                                </span>
                                                <span className="font-medium text-white truncate">
                                                    {log.user}
                                                </span>
                                            </div>
                                            <span className="text-xs text-slate-500 font-mono shrink-0">
                                                {log.date}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-400 mt-1 truncate">
                                            {log.detail}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
