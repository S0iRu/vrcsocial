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
            case 'Status': return { icon: Clock, color: 'text-cyan-400', bg: 'bg-cyan-500/10' };
            case 'StatusMsg': return { icon: Clock, color: 'text-purple-400', bg: 'bg-purple-500/10' };
            default: return { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' };
        }
    };

    const logTypes = ['all', 'OnLine', 'GPS', 'Offline', 'Status', 'StatusMsg'];

    return (
        <div className="space-y-4 md:space-y-6 pb-24 md:pb-20">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2 md:gap-3">
                    <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                        <History className="w-5 h-5 md:w-6 md:h-6 text-blue-500" /> Logs
                    </h2>
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
                        {filteredLogs.length}/{logs.length}
                    </span>
                </div>

                {/* Clear Button */}
                {logs.length > 0 && (
                    <button
                        onClick={clearLogs}
                        className="flex items-center gap-1.5 px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-xs transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Clear</span>
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

            {/* Logs Table */}
            {filteredLogs.length === 0 ? (
                <div className="glass-card rounded-xl p-6 md:p-8 text-center">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                        <History className="w-6 h-6 md:w-7 md:h-7 text-blue-400" />
                    </div>
                    <h3 className="text-base md:text-lg font-bold text-white mb-1">No Logs Found</h3>
                    <p className="text-muted-foreground text-xs md:text-sm">
                        {logs.length === 0
                            ? "Activity logs will appear here."
                            : "No logs match your filter."}
                    </p>
                </div>
            ) : (
                <div className="glass-card rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/10 text-slate-400 text-xs">
                                <th className="text-left px-3 py-2 font-medium w-28">Date</th>
                                <th className="text-left px-3 py-2 font-medium w-20">Type</th>
                                <th className="text-left px-3 py-2 font-medium w-36">User</th>
                                <th className="text-left px-3 py-2 font-medium">Detail</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredLogs.map((log) => {
                                const style = getLogStyle(log.type);
                                return (
                                    <tr
                                        key={log.id}
                                        className="hover:bg-white/5 transition-colors"
                                    >
                                        <td className="px-3 py-2 text-slate-500 font-mono text-xs whitespace-nowrap">
                                            {log.date}
                                        </td>
                                        <td className={`px-3 py-2 ${style.color} text-xs`}>
                                            {log.type}
                                        </td>
                                        <td className="px-3 py-2 text-white font-medium truncate max-w-36">
                                            {log.user}
                                        </td>
                                        <td className="px-3 py-2 text-slate-400 truncate">
                                            {log.detail}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
