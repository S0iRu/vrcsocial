'use client';

import { BarChart3, ZoomIn, ZoomOut, Users, Globe, RefreshCw } from "lucide-react";
import { useEffect, useState, useMemo, useRef, useCallback, memo } from "react";

// ステータスの色
const getStatusBgClass = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'join me') return 'bg-blue-500';
    if (s === 'ask me') return 'bg-orange-500';
    if (s === 'busy' || s === 'do not disturb') return 'bg-red-500';
    if (s === 'active' || s === 'online') return 'bg-green-500';
    return 'bg-slate-500';
};

// 型定義
type LogEntry = {
    id: number;
    date: string;
    timestamp?: number;
    type: string;
    user: string;
    detail: string;
    status?: string;
};

type TimelineEntry = {
    user: string;
    world: string;
    startTime: Date;
    endTime: Date;
    status: string;
};

type UserTimeline = {
    userName: string;
    entries: TimelineEntry[];
};

type WorldTimeline = {
    worldName: string;
    entries: TimelineEntry[];
};

type HourMarker = {
    date: Date;
    x: number;
    label: string;
    isDay: boolean;
};

// 日付フォーマット
const formatDate = (date: Date): string => `${date.getMonth() + 1}/${date.getDate()}`;
const formatTime = (date: Date): string => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
const formatDateTime = (date: Date): string => `${formatDate(date)} ${formatTime(date)}`;

// ログの日付をパース
const parseLogTime = (log: LogEntry): Date | null => {
    if (log.timestamp) return new Date(log.timestamp);
    const m = log.date.match(/(\d+)\/(\d+)\s+(\d+):(\d+)/);
    if (!m) return null;
    const now = new Date();
    return new Date(now.getFullYear(), parseInt(m[1]) - 1, parseInt(m[2]), parseInt(m[3]), parseInt(m[4]));
};

const DAYS_TO_SHOW = 7;
const DAY_WIDTH_BASE = 800;

// タイムライン描画コンポーネント（メモ化）
const TimelineChart = memo(function TimelineChart({ 
    scrollRef, 
    timelines, 
    labelKey, 
    contentKey,
    onScroll,
    totalWidth,
    hourMarkers,
    timeToX,
    onEntryHover,
}: { 
    scrollRef: React.RefObject<HTMLDivElement | null>;
    timelines: (UserTimeline | WorldTimeline)[];
    labelKey: 'userName' | 'worldName';
    contentKey: 'user' | 'world';
    onScroll: () => void;
    totalWidth: number;
    hourMarkers: HourMarker[];
    timeToX: (date: Date) => number;
    onEntryHover: (entry: TimelineEntry | null, x: number, y: number) => void;
}) {
    return (
        <div className="flex">
            {/* 固定ラベル列 */}
            <div className="shrink-0 w-32 md:w-40 pr-2 sticky left-0 bg-[#0f172a]/95 z-20">
                <div className="h-6 mb-1"></div>
                {timelines.map((tl: any, i: number) => (
                    <div key={i} className="h-7 flex items-center mb-0.5">
                        <p className="text-xs text-slate-300 truncate" title={tl[labelKey]}>{tl[labelKey]}</p>
                    </div>
                ))}
            </div>

            {/* スクロール可能なタイムライン */}
            <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                <div className="relative" style={{ width: totalWidth, minHeight: 50 }}>
                    {/* 時間軸 */}
                    <div className="h-6 mb-1 relative">
                        {hourMarkers.map((m, i) => (
                            <span key={i} className={`absolute text-[9px] -translate-x-1/2 ${m.isDay ? 'text-purple-400 font-bold' : 'text-slate-600'}`} style={{ left: m.x }}>
                                {m.label}
                            </span>
                        ))}
                    </div>

                    {/* 日付境界線 */}
                    {hourMarkers.filter(m => m.isDay).map((m, i) => (
                        <div key={i} className="absolute top-0 bottom-0 w-px bg-purple-500/40" style={{ left: m.x }} />
                    ))}

                    {/* 行 */}
                    {timelines.map((tl: any, i: number) => (
                        <div key={i} className="h-7 mb-0.5 relative">
                            <div className="absolute inset-0 bg-slate-800/20 rounded" />
                            {hourMarkers.map((m, j) => (
                                <div key={j} className={`absolute top-0 bottom-0 w-px ${m.isDay ? 'bg-purple-500/20' : 'bg-slate-700/10'}`} style={{ left: m.x }} />
                            ))}
                            {tl.entries.map((e: TimelineEntry, j: number) => {
                                const left = timeToX(e.startTime);
                                const width = Math.max(timeToX(e.endTime) - left, 3);
                                const label = contentKey === 'user' ? e.world : e.user;
                                return (
                                    <div key={j}
                                        className={`absolute top-0.5 bottom-0.5 rounded ${getStatusBgClass(e.status)} cursor-pointer hover:brightness-110 transition-all`}
                                        style={{ left, width }}
                                        onMouseEnter={(ev) => onEntryHover(e, ev.clientX, ev.clientY)}
                                        onMouseLeave={() => onEntryHover(null, 0, 0)}>
                                        {width > 50 && (
                                            <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white truncate px-0.5">{label}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    {/* 現在時刻 */}
                    <div className="absolute top-6 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: timeToX(new Date()) }}>
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-red-500 rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    );
});

export default function GraphPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [zoom, setZoom] = useState(1);
    const [tooltip, setTooltip] = useState<{ entry: TimelineEntry; x: number; y: number } | null>(null);
    const userScrollRef = useRef<HTMLDivElement>(null);
    const worldScrollRef = useRef<HTMLDivElement>(null);

    const dayWidth = DAY_WIDTH_BASE * zoom;
    const isSyncingRef = useRef(false);
    const initialScrollDoneRef = useRef(false);

    // 表示範囲
    const dateRange = useMemo(() => {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - DAYS_TO_SHOW + 1);
        startDate.setHours(0, 0, 0, 0);
        return { start: startDate, end: today };
    }, []);

    // ログ読み込み（手動のみ）
    const loadLogs = useCallback(() => {
        try {
            const data = localStorage.getItem('vrc_logs');
            if (data) setLogs(JSON.parse(data));
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    // スクロール同期
    const syncScroll = useCallback((source: 'user' | 'world') => {
        if (isSyncingRef.current) return;
        const userEl = userScrollRef.current;
        const worldEl = worldScrollRef.current;
        if (!userEl || !worldEl) return;
        
        isSyncingRef.current = true;
        if (source === 'user') {
            worldEl.scrollLeft = userEl.scrollLeft;
        } else {
            userEl.scrollLeft = worldEl.scrollLeft;
        }
        requestAnimationFrame(() => {
            isSyncingRef.current = false;
        });
    }, []);

    // 初期スクロール位置
    useEffect(() => {
        if (initialScrollDoneRef.current) return;
        initialScrollDoneRef.current = true;
        
        const timer = setTimeout(() => {
            const now = new Date();
            const end = new Date();
            end.setHours(23, 59, 59, 999);
            const start = new Date(end);
            start.setDate(start.getDate() - DAYS_TO_SHOW + 1);
            start.setHours(0, 0, 0, 0);
            
            const totalMs = end.getTime() - start.getTime();
            const currentMs = now.getTime() - start.getTime();
            const scrollRatio = currentMs / totalMs;
            const totalWidth = DAY_WIDTH_BASE * DAYS_TO_SHOW;
            
            [userScrollRef, worldScrollRef].forEach(ref => {
                if (ref.current) {
                    const targetScroll = totalWidth * scrollRatio - ref.current.clientWidth / 2;
                    ref.current.scrollLeft = Math.max(0, targetScroll);
                }
            });
        }, 100);
        
        return () => clearTimeout(timer);
    }, []);

    // エントリデータ構築
    const allEntries = useMemo((): TimelineEntry[] => {
        const { start, end } = dateRange;
        const rangeLogs = logs
            .map(log => ({ log, time: parseLogTime(log) }))
            .filter(({ time }) => time && time >= start && time <= end)
            .sort((a, b) => a.time!.getTime() - b.time!.getTime());

        const sessions = new Map<string, { world: string; start: Date; status: string }>();
        const entries: TimelineEntry[] = [];

        for (const { log, time } of rangeLogs) {
            if (!time) continue;

            if (log.type === 'OnLine') {
                sessions.set(log.user, { world: log.detail || 'Unknown', start: time, status: log.status || 'active' });
            } else if (log.type === 'GPS') {
                const prev = sessions.get(log.user);
                if (prev) {
                    entries.push({ user: log.user, world: prev.world, startTime: prev.start, endTime: time, status: prev.status });
                }
                const parts = log.detail.split('→').map(s => s.trim());
                const newWorld = parts[1] || log.detail;
                sessions.set(log.user, { world: newWorld, start: time, status: log.status || prev?.status || 'active' });
            } else if (log.type === 'Offline') {
                const prev = sessions.get(log.user);
                if (prev) {
                    entries.push({ user: log.user, world: prev.world, startTime: prev.start, endTime: time, status: prev.status });
                    sessions.delete(log.user);
                }
            } else if (log.type === 'Status') {
                const prev = sessions.get(log.user);
                if (prev) {
                    entries.push({ user: log.user, world: prev.world, startTime: prev.start, endTime: time, status: prev.status });
                    const parts = log.detail.split('→').map(s => s.trim());
                    const newStatus = log.status || parts[1] || 'active';
                    sessions.set(log.user, { world: prev.world, start: time, status: newStatus });
                }
            }
        }

        const now = new Date();
        sessions.forEach((session, user) => {
            entries.push({ user, world: session.world, startTime: session.start, endTime: now, status: session.status });
        });

        return entries;
    }, [logs, dateRange]);

    // ユーザーごとのタイムライン
    const userTimelines = useMemo((): UserTimeline[] => {
        const userMap = new Map<string, TimelineEntry[]>();
        allEntries.forEach(e => {
            const arr = userMap.get(e.user) || [];
            arr.push(e);
            userMap.set(e.user, arr);
        });

        const result: UserTimeline[] = [];
        userMap.forEach((entries, userName) => {
            result.push({ userName, entries: entries.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()) });
        });
        return result.sort((a, b) => (a.entries[0]?.startTime.getTime() || 0) - (b.entries[0]?.startTime.getTime() || 0));
    }, [allEntries]);

    // ワールドごとのタイムライン
    const worldTimelines = useMemo((): WorldTimeline[] => {
        const worldMap = new Map<string, TimelineEntry[]>();
        allEntries.forEach(e => {
            const arr = worldMap.get(e.world) || [];
            arr.push(e);
            worldMap.set(e.world, arr);
        });

        const result: WorldTimeline[] = [];
        worldMap.forEach((entries, worldName) => {
            result.push({ worldName, entries: entries.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()) });
        });
        return result.sort((a, b) => (a.entries[0]?.startTime.getTime() || 0) - (b.entries[0]?.startTime.getTime() || 0));
    }, [allEntries]);

    // 時間をX座標に変換
    const timeToX = useCallback((date: Date): number => {
        const totalMs = dateRange.end.getTime() - dateRange.start.getTime();
        const ms = date.getTime() - dateRange.start.getTime();
        return (ms / totalMs) * dayWidth * DAYS_TO_SHOW;
    }, [dateRange, dayWidth]);

    // 時間マーカー
    const hourMarkers = useMemo((): HourMarker[] => {
        const markers: HourMarker[] = [];
        const current = new Date(dateRange.start);
        while (current <= dateRange.end) {
            if (current.getHours() % 6 === 0) {
                markers.push({
                    date: new Date(current),
                    x: timeToX(current),
                    label: current.getHours() === 0 ? formatDate(current) : `${current.getHours()}:00`,
                    isDay: current.getHours() === 0
                });
            }
            current.setHours(current.getHours() + 1);
        }
        return markers;
    }, [dateRange, timeToX]);

    // ツールチップ表示（useCallbackでメモ化）
    const handleEntryHover = useCallback((entry: TimelineEntry | null, x: number, y: number) => {
        if (entry) {
            setTooltip({ entry, x, y });
        } else {
            setTooltip(null);
        }
    }, []);

    // テストデータ生成
    const addTestData = useCallback(() => {
        const testLogs: LogEntry[] = [];
        const now = new Date();
        const users = ['Alice', 'Bob', 'Charlie'];
        const worlds = ['World Alpha', 'World Beta', 'World Gamma', 'World Delta'];
        const statuses = ['active', 'join me', 'ask me', 'busy'];

        for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
            const baseDate = new Date(now);
            baseDate.setDate(baseDate.getDate() - dayOffset);
            
            users.forEach((user, userIdx) => {
                const startHour = 8 + userIdx * 2;
                const start = new Date(baseDate); start.setHours(startHour, 0, 0, 0);
                const mid = new Date(baseDate); mid.setHours(startHour + 4, 30, 0, 0);
                const world1 = worlds[(userIdx + dayOffset) % worlds.length];
                const world2 = worlds[(userIdx + dayOffset + 1) % worlds.length];

                testLogs.push(
                    { id: Date.now() + userIdx * 100 + dayOffset * 10, date: '', timestamp: start.getTime(), type: 'OnLine', user, detail: world1, status: statuses[userIdx % 4] },
                    { id: Date.now() + userIdx * 100 + dayOffset * 10 + 1, date: '', timestamp: mid.getTime(), type: 'GPS', user, detail: `${world1} → ${world2}`, status: statuses[(userIdx + 1) % 4] },
                );
                if (dayOffset > 0) {
                    const end = new Date(baseDate); end.setHours(22, 0, 0, 0);
                    testLogs.push({ id: Date.now() + userIdx * 100 + dayOffset * 10 + 2, date: '', timestamp: end.getTime(), type: 'Offline', user, detail: 'Offline', status: 'offline' });
                }
            });
        }

        const existing = JSON.parse(localStorage.getItem('vrc_logs') || '[]');
        localStorage.setItem('vrc_logs', JSON.stringify([...testLogs, ...existing].slice(0, 500)));
        setLogs([...testLogs, ...existing].slice(0, 500));
    }, []);

    const totalWidth = dayWidth * DAYS_TO_SHOW;
    const hasData = userTimelines.length > 0 || worldTimelines.length > 0;

    // スクロールハンドラー
    const handleUserScroll = useCallback(() => syncScroll('user'), [syncScroll]);
    const handleWorldScroll = useCallback(() => syncScroll('world'), [syncScroll]);

    return (
        <div className="space-y-4 pb-24 md:pb-8">
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-purple-500" /> Graph
                    </h2>
                    <span className="text-xs text-slate-500">({logs.length} logs)</span>
                </div>
                
                <div className="flex items-center gap-2">
                    <button onClick={loadLogs} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title="更新">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-slate-700"></div>
                    <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
                        <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
                        <ZoomIn className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* 凡例 */}
            <div className="flex flex-wrap justify-center gap-4">
                {[['bg-blue-500', 'Join Me'], ['bg-green-500', 'Active'], ['bg-orange-500', 'Ask Me'], ['bg-red-500', 'Busy']].map(([bg, label]) => (
                    <div key={label} className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded ${bg}`}></div>
                        <span className="text-xs text-slate-400">{label}</span>
                    </div>
                ))}
            </div>

            {!hasData ? (
                <div className="glass-card rounded-xl p-4 text-center py-16">
                    <BarChart3 className="w-12 h-12 text-purple-400 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-bold text-white mb-2">データがありません</h3>
                    <p className="text-slate-400 text-sm mb-6">過去{DAYS_TO_SHOW}日間のログがありません</p>
                    <button onClick={addTestData} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm">
                        テストデータを追加
                    </button>
                </div>
            ) : (
                <>
                    {/* ユーザーごとのグラフ */}
                    <div className="glass-card rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2 px-1">
                            <Users className="w-4 h-4 text-cyan-400" />
                            <h3 className="text-sm font-bold text-white">Users</h3>
                            <span className="text-xs text-slate-500">({userTimelines.length})</span>
                        </div>
                        <TimelineChart
                            scrollRef={userScrollRef}
                            timelines={userTimelines}
                            labelKey="userName"
                            contentKey="user"
                            onScroll={handleUserScroll}
                            totalWidth={totalWidth}
                            hourMarkers={hourMarkers}
                            timeToX={timeToX}
                            onEntryHover={handleEntryHover}
                        />
                    </div>

                    {/* ワールドごとのグラフ */}
                    <div className="glass-card rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2 px-1">
                            <Globe className="w-4 h-4 text-emerald-400" />
                            <h3 className="text-sm font-bold text-white">Worlds</h3>
                            <span className="text-xs text-slate-500">({worldTimelines.length})</span>
                        </div>
                        <TimelineChart
                            scrollRef={worldScrollRef}
                            timelines={worldTimelines}
                            labelKey="worldName"
                            contentKey="world"
                            onScroll={handleWorldScroll}
                            totalWidth={totalWidth}
                            hourMarkers={hourMarkers}
                            timeToX={timeToX}
                            onEntryHover={handleEntryHover}
                        />
                    </div>
                </>
            )}

            {/* ツールチップ */}
            {tooltip && (
                <div className="fixed z-50 bg-slate-900 border border-slate-700 rounded-lg p-2.5 shadow-xl pointer-events-none"
                    style={{ left: tooltip.x + 15, top: tooltip.y + 15 }}>
                    <p className="text-sm font-bold text-white">{tooltip.entry.user}</p>
                    <p className="text-xs text-purple-400">{tooltip.entry.world}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2 h-2 rounded ${getStatusBgClass(tooltip.entry.status)}`} />
                        <span className="text-xs text-slate-300">{tooltip.entry.status}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                        {formatDateTime(tooltip.entry.startTime)} ~ {formatDateTime(tooltip.entry.endTime)}
                    </p>
                </div>
            )}

            <p className="text-center text-xs text-slate-600">← 横スクロールで過去{DAYS_TO_SHOW}日間を連続表示 / 両グラフは同期スクロール →</p>
        </div>
    );
}
