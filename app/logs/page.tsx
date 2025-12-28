'use client';

import { ChevronRight, Search, Filter, History, MapPin, Globe, User, Radio, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";

export default function LogsPage() {
    const [logs, setLogs] = useState<any[]>([]);

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
        // Update logs view periodically as they might be updated by the main dashboard loop
        const interval = setInterval(loadLogs, 2000);
        return () => clearInterval(interval);
    }, []);

    const getLogStyle = (type: string) => {
        switch (type) {
            case 'OnLine': return { icon: Radio, color: 'text-green-400' };
            case 'GPS': return { icon: MapPin, color: 'text-orange-400' };
            case 'Offline': return { icon: Radio, color: 'text-slate-500' };
            case 'Status': return { icon: RefreshCcw, color: 'text-yellow-400' };
            default: return { icon: User, color: 'text-blue-400' };
        }
    };

    return (
        <div className="space-y-6 pb-20 h-full flex flex-col">
            {/* Header & Controls */}
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                    <History className="w-8 h-8 text-blue-500" /> Logs
                </h2>

                <div className="flex gap-4">
                    {/* Filter Button */}
                    <button className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-lg shadow-indigo-500/20 text-sm justify-center min-w-[40px] md:w-32">
                        <Filter className="w-4 h-4" /> <span className="hidden md:inline">Filter</span>
                    </button>

                    {/* Search Bar */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search logs..."
                            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                    </div>
                </div>
            </div>

            {/* Logs Table Area */}
            <div className="flex-1 glass-card rounded-xl overflow-hidden flex flex-col min-h-[500px]">
                {/* Table Header (Desktop Only) */}
                <div className="hidden md:grid grid-cols-[40px_100px_80px_120px_1fr] gap-4 px-4 py-3 border-b border-white/10 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-800/50">
                    <div></div>
                    <div>Date</div>
                    <div>Type</div>
                    <div>User</div>
                    <div>Detail</div>
                </div>

                {/* Table Body (Scrollable) */}
                <div className="overflow-y-auto flex-1 custom-scrollbar">
                    {logs.length === 0 ? (
                        <div className="p-10 text-center text-slate-500 text-sm">
                            Waiting for activity logs...
                        </div>
                    ) : (
                        logs.map((log) => {
                            const style = getLogStyle(log.type);
                            const Icon = style.icon;

                            return (
                                <div key={log.id} className="
                                    grid grid-cols-1 md:grid-cols-[40px_100px_80px_120px_1fr] 
                                    gap-y-2 gap-x-4 px-4 py-3 md:py-2.5 
                                    border-b border-white/5 items-start md:items-center 
                                    hover:bg-white/5 transition-colors text-sm group cursor-pointer
                                ">
                                    {/* Expand Icon */}
                                    <div className="hidden md:flex justify-center text-slate-500 group-hover:text-white">
                                        <ChevronRight className="w-4 h-4" />
                                    </div>

                                    {/* Mobile View */}
                                    <div className="md:contents">
                                        <div className="flex md:hidden items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-bold ${log.color || style.color}`}>{log.type}</span>
                                                <span className="text-white font-bold">{log.user}</span>
                                            </div>
                                            <span className="text-xs text-slate-500 font-mono">{log.date}</span>
                                        </div>

                                        {/* Desktop View */}
                                        <div className="hidden md:block text-slate-300 font-mono text-xs">{log.date}</div>
                                        <div className={`hidden md:flex font-medium ${log.color || style.color} items-center gap-1.5`}>
                                            <Icon className="w-3.5 h-3.5" />
                                            {log.type}
                                        </div>
                                        <div className="hidden md:block text-white font-medium truncate">{log.user}</div>
                                    </div>

                                    {/* Detail */}
                                    <div className="text-slate-300 break-words md:truncate flex items-start md:items-center gap-2 text-xs md:text-sm leading-relaxed">
                                        {log.detail}
                                        {typeof log.detail === 'string' && log.detail.includes("🇯🇵") && <span className="text-[10px] bg-slate-700 px-1 rounded text-slate-300 shrink-0">JP</span>}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>


                {/* Footer / Pagination */}
                <div className="p-3 border-t border-white/10 bg-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                        <span className="sm:hidden">Rows:</span>
                        <select className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-300 focus:outline-none">
                            <option>20/page</option>
                            <option>50</option>
                        </select>
                        <span className="sm:hidden ml-auto">Total 957</span>
                    </div>

                    <div className="flex items-center gap-1 w-full sm:w-auto justify-center">
                        <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-50 border border-white/10" disabled>&lt;</button>
                        <button className="w-8 h-8 flex items-center justify-center rounded bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">1</button>
                        <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 border border-transparent">2</button>
                        <button className="hidden sm:flex w-8 h-8 items-center justify-center rounded hover:bg-white/10">3</button>
                        <span className="px-1 text-slate-600">...</span>
                        <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 border border-transparent">&gt;</button>
                    </div>

                    <div className="hidden sm:block">Total 957</div>
                </div>
            </div>
        </div>
    );
}
