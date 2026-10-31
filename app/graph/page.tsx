'use client';

import { BarChart3, ZoomIn, ZoomOut, Users, Globe, RotateCcw, Clock3, Activity } from "lucide-react";
import { useEffect, useState, useMemo, useRef, useCallback, memo } from "react";
import { PageHeader, RefreshButton } from "@/components/layout/PageHeader";
import { useFriends } from "@/components/providers/FriendsProvider";
import {
    parseActivityLogTime,
    readActivityLogs,
    subscribeActivityLogs,
    type ActivityLog,
} from "@/lib/activityLog";
import { statusColorClass } from "@/lib/presence";

const STATUS_LEGEND = [
    { key: 'join me', label: 'Join Me', className: 'bg-blue-500' },
    { key: 'active', label: 'Active', className: 'bg-green-500' },
    { key: 'ask me', label: 'Ask Me', className: 'bg-orange-500' },
    { key: 'busy', label: 'Busy / DND', className: 'bg-red-500' },
    { key: 'offline', label: 'Offline / Other', className: 'bg-slate-500' },
] as const;

const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
const DAYS_TO_SHOW = 7;
const DAY_WIDTH_BASE = 800;

const formatStatusLabel = (status: string): string => {
    if (!status) return 'Unknown';
    return status
        .split(' ')
        .map(token => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ');
};

type TimelineEntry = {
    user: string;
    userId?: string;
    world: string;
    startTime: Date;
    endTime: Date;
    status: string;
    live: boolean;
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

type TooltipState = {
    entry: TimelineEntry;
    x: number;
    y: number;
};

type OpenSession = {
    user: string;
    userId?: string;
    world: string;
    start: Date;
    lastEvent: Date;
    status: string;
};

const formatDate = (date: Date): string => `${date.getMonth() + 1}/${date.getDate()}`;
const formatTime = (date: Date): string => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
const formatDateTime = (date: Date): string => `${formatDate(date)} ${formatTime(date)}`;
const formatNumber = (value: number): string => new Intl.NumberFormat('ja-JP').format(value);
const getEntryDurationMs = (entry: TimelineEntry): number => Math.max(0, entry.endTime.getTime() - entry.startTime.getTime());

const sessionKey = (log: ActivityLog) => log.userId || log.user;

const closeSession = (session: OpenSession, end: Date, entries: TimelineEntry[], live = false) => {
    if (end.getTime() < session.start.getTime()) return;
    entries.push({
        user: session.user,
        userId: session.userId,
        world: session.world,
        startTime: session.start,
        endTime: end,
        status: session.status,
        live,
    });
};

const TimelineChart = memo(function TimelineChart({
    scrollRef,
    timelines,
    labelKey,
    contentKey,
    onScroll,
    totalWidth,
    hourMarkers,
    timeToX,
    now,
    onEntryHover,
}: {
    scrollRef: React.RefObject<HTMLDivElement | null>;
    timelines: Array<UserTimeline | WorldTimeline>;
    labelKey: 'userName' | 'worldName';
    contentKey: 'user' | 'world';
    onScroll: () => void;
    totalWidth: number;
    hourMarkers: HourMarker[];
    timeToX: (date: Date) => number;
    now: Date;
    onEntryHover: (entry: TimelineEntry | null, x: number, y: number) => void;
}) {
    return (
        <div className="flex">
            <div className="shrink-0 w-32 md:w-40 pr-2 sticky left-0 bg-background/95 z-20">
                <div className="h-6 mb-1"></div>
                {timelines.map((tl, i: number) => {
                    const rowLabel = labelKey === 'userName' ? (tl as UserTimeline).userName : (tl as WorldTimeline).worldName;
                    return (
                    <div key={i} className="h-7 flex items-center mb-0.5">
                        <p className="text-xs text-slate-300 truncate" title={rowLabel}>{rowLabel}</p>
                    </div>
                )})}
            </div>

            <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-w-0 overflow-x-auto">
                <div className="relative" style={{ width: totalWidth, minHeight: 50 }}>
                    <div className="h-6 mb-1 relative">
                        {hourMarkers.map((m, i) => (
                            <span key={i} className={`absolute text-[9px] -translate-x-1/2 ${m.isDay ? 'text-purple-400 font-bold' : 'text-slate-600'}`} style={{ left: m.x }}>
                                {m.label}
                            </span>
                        ))}
                    </div>

                    {hourMarkers.filter(m => m.isDay).map((m, i) => (
                        <div key={i} className="absolute top-0 bottom-0 w-px bg-purple-500/40" style={{ left: m.x }} />
                    ))}

                    {timelines.map((tl, i: number) => (
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
                                        className={`absolute top-0.5 bottom-0.5 rounded ${statusColorClass(e.status)} cursor-pointer hover:brightness-110 transition-all`}
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

                    <div className="absolute top-6 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: timeToX(now) }}>
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-red-500 rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    );
});

export default function GraphPage() {
    const { onlineFriends } = useFriends();
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [zoom, setZoom] = useState(1);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
    const [now, setNow] = useState(() => new Date());
    const userScrollRef = useRef<HTMLDivElement>(null);
    const worldScrollRef = useRef<HTMLDivElement>(null);
    const zoomAnchorRef = useRef<number | null>(null);
    const initialScrollDoneRef = useRef(false);

    const dayWidth = DAY_WIDTH_BASE * zoom;
    const totalWidth = dayWidth * DAYS_TO_SHOW;
    const isSyncingRef = useRef(false);
    const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    const dateRange = useMemo(() => {
        const [year, month, date] = dayKey.split('-').map((part) => parseInt(part, 10));
        const end = new Date(year, month, date, 23, 59, 59, 999);
        const startDate = new Date(end);
        startDate.setDate(startDate.getDate() - DAYS_TO_SHOW + 1);
        startDate.setHours(0, 0, 0, 0);
        return { start: startDate, end };
    }, [dayKey]);

    const loadLogs = useCallback(() => {
        setLogs(readActivityLogs());
        setLastLoadedAt(new Date());
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(loadLogs, 0);
        const unsubscribe = subscribeActivityLogs(loadLogs);
        return () => {
            window.clearTimeout(timer);
            unsubscribe();
        };
    }, [loadLogs]);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(timer);
    }, []);

    const scrollToNow = useCallback(() => {
        const totalMs = dateRange.end.getTime() - dateRange.start.getTime();
        const currentMs = new Date().getTime() - dateRange.start.getTime();
        const scrollRatio = Math.min(1, Math.max(0, currentMs / totalMs));

        [userScrollRef.current, worldScrollRef.current].forEach(el => {
            if (!el) return;
            const targetScroll = totalWidth * scrollRatio - el.clientWidth / 2;
            el.scrollLeft = Math.max(0, targetScroll);
        });
    }, [dateRange, totalWidth]);

    const rememberViewportCenter = useCallback(() => {
        const el = userScrollRef.current;
        if (!el || totalWidth <= 0) return;
        const centerPx = el.scrollLeft + el.clientWidth / 2;
        const ratio = Math.min(1, Math.max(0, centerPx / totalWidth));
        const span = dateRange.end.getTime() - dateRange.start.getTime();
        zoomAnchorRef.current = dateRange.start.getTime() + ratio * span;
    }, [dateRange, totalWidth]);

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

    useEffect(() => {
        if (initialScrollDoneRef.current) return;
        const timer = setTimeout(() => {
            initialScrollDoneRef.current = true;
            scrollToNow();
        }, 100);
        return () => clearTimeout(timer);
    }, [scrollToNow]);

    useEffect(() => {
        if (!initialScrollDoneRef.current) return;
        const anchor = zoomAnchorRef.current;
        if (anchor == null) return;
        const span = dateRange.end.getTime() - dateRange.start.getTime();
        if (span <= 0) return;
        const ratio = (anchor - dateRange.start.getTime()) / span;
        [userScrollRef.current, worldScrollRef.current].forEach(el => {
            if (!el) return;
            el.scrollLeft = Math.max(0, totalWidth * ratio - el.clientWidth / 2);
        });
        zoomAnchorRef.current = null;
    }, [zoom, totalWidth, dateRange]);

    const allEntries = useMemo((): TimelineEntry[] => {
        const { start, end } = dateRange;
        const rangeLogs = logs
            .map(log => ({ log, time: parseActivityLogTime(log, now) }))
            .filter((item): item is { log: ActivityLog; time: Date } => item.time !== null && item.time >= start && item.time <= end)
            .sort((a, b) => a.time.getTime() - b.time.getTime());

        const sessions = new Map<string, OpenSession>();
        const entries: TimelineEntry[] = [];

        for (const { log, time } of rangeLogs) {
            const key = sessionKey(log);
            if (log.type === 'OnLine') {
                const prev = sessions.get(key);
                if (prev) {
                    const gap = time.getTime() - prev.lastEvent.getTime();
                    closeSession(prev, gap > SESSION_GAP_MS ? prev.lastEvent : time, entries);
                }
                sessions.set(key, {
                    user: log.user,
                    userId: log.userId,
                    world: log.detail || 'Unknown',
                    start: time,
                    lastEvent: time,
                    status: log.status || 'active',
                });
            } else if (log.type === 'GPS') {
                const prev = sessions.get(key);
                if (prev) closeSession(prev, time, entries);
                const parts = log.detail.split('→').map(s => s.trim());
                sessions.set(key, {
                    user: log.user,
                    userId: log.userId || prev?.userId,
                    world: parts[1] || log.detail,
                    start: time,
                    lastEvent: time,
                    status: log.status || prev?.status || 'active',
                });
            } else if (log.type === 'Offline') {
                const prev = sessions.get(key);
                if (prev) {
                    closeSession(prev, time, entries);
                    sessions.delete(key);
                }
            } else if (log.type === 'Status') {
                const prev = sessions.get(key);
                if (!prev) continue;
                closeSession(prev, time, entries);
                const parts = log.detail.split('→').map(s => s.trim());
                sessions.set(key, {
                    ...prev,
                    user: log.user,
                    userId: log.userId || prev.userId,
                    start: time,
                    lastEvent: time,
                    status: log.status || parts[1] || 'active',
                });
            }
        }

        const onlineIds = new Set(onlineFriends.map(friend => friend.id));
        const onlineNames = new Set(onlineFriends.map(friend => friend.displayName || friend.name));
        sessions.forEach((session) => {
            const live = session.userId ? onlineIds.has(session.userId) : onlineNames.has(session.user);
            closeSession(session, live ? now : session.lastEvent, entries, live);
        });

        return entries;
    }, [logs, dateRange, now, onlineFriends]);

    const userTimelines = useMemo((): UserTimeline[] => {
        const userMap = new Map<string, TimelineEntry[]>();
        allEntries.forEach(entry => {
            const key = entry.userId || entry.user;
            const arr = userMap.get(key) || [];
            arr.push(entry);
            userMap.set(key, arr);
        });

        const result: UserTimeline[] = [];
        userMap.forEach((entries) => {
            const sorted = entries.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
            result.push({ userName: sorted[sorted.length - 1]?.user || 'Unknown', entries: sorted });
        });
        return result.sort((a, b) => {
            const aDuration = a.entries.reduce((sum, entry) => sum + getEntryDurationMs(entry), 0);
            const bDuration = b.entries.reduce((sum, entry) => sum + getEntryDurationMs(entry), 0);
            return bDuration - aDuration;
        });
    }, [allEntries]);

    const worldTimelines = useMemo((): WorldTimeline[] => {
        const worldMap = new Map<string, TimelineEntry[]>();
        allEntries.forEach(entry => {
            const arr = worldMap.get(entry.world) || [];
            arr.push(entry);
            worldMap.set(entry.world, arr);
        });

        const result: WorldTimeline[] = [];
        worldMap.forEach((entries, worldName) => {
            result.push({ worldName, entries: entries.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()) });
        });
        return result.sort((a, b) => {
            const aDuration = a.entries.reduce((sum, entry) => sum + getEntryDurationMs(entry), 0);
            const bDuration = b.entries.reduce((sum, entry) => sum + getEntryDurationMs(entry), 0);
            return bDuration - aDuration;
        });
    }, [allEntries]);

    const timeToX = useCallback((date: Date): number => {
        const totalMs = dateRange.end.getTime() - dateRange.start.getTime();
        const ms = date.getTime() - dateRange.start.getTime();
        return (ms / totalMs) * dayWidth * DAYS_TO_SHOW;
    }, [dateRange, dayWidth]);

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

    const handleEntryHover = useCallback((entry: TimelineEntry | null, x: number, y: number) => {
        if (entry) {
            const tooltipWidth = 260;
            const tooltipHeight = 118;
            const safeX = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, x + 15));
            const safeY = Math.max(12, Math.min(window.innerHeight - tooltipHeight - 12, y + 15));
            setTooltip({ entry, x: safeX, y: safeY });
        } else {
            setTooltip(null);
        }
    }, []);

    const hasData = userTimelines.length > 0 || worldTimelines.length > 0;
    const minZoom = 0.5;
    const maxZoom = 2;
    const canZoomOut = zoom > minZoom;
    const canZoomIn = zoom < maxZoom;

    const changeZoom = (next: number) => {
        rememberViewportCenter();
        setZoom(next);
    };

    const handleUserScroll = useCallback(() => syncScroll('user'), [syncScroll]);
    const handleWorldScroll = useCallback(() => syncScroll('world'), [syncScroll]);

    const stats = useMemo(() => {
        const totalDurationHours = allEntries.reduce((sum, entry) => sum + getEntryDurationMs(entry), 0) / (1000 * 60 * 60);
        const uniqueUsers = new Set(allEntries.map(entry => entry.userId || entry.user)).size;
        const uniqueWorlds = new Set(allEntries.map(entry => entry.world)).size;
        const activeSessions = allEntries.filter(entry => entry.live).length;
        return { totalDurationHours, uniqueUsers, uniqueWorlds, activeSessions };
    }, [allEntries]);

    return (
        <div className="space-y-4">
            <PageHeader
                title="Graph"
                icon={BarChart3}
                iconClassName="text-purple-400"
                trailing={
                    <div className="space-y-0.5">
                        <p className="text-xs text-slate-500">{formatNumber(logs.length)} logs / 過去{DAYS_TO_SHOW}日</p>
                        <p className="text-[11px] text-slate-600">
                            最終更新: {lastLoadedAt ? formatDateTime(lastLoadedAt) : '-'}
                        </p>
                    </div>
                }
                actions={
                    <div className="flex items-center gap-2 shrink-0">
                        <RefreshButton onClick={loadLogs} label="更新" />
                        <button onClick={scrollToNow} className="icon-btn" title="現在時刻へ移動" aria-label="現在時刻へ移動">
                            <Clock3 className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-[var(--line)]"></div>
                        <button
                            onClick={() => changeZoom(Math.max(minZoom, zoom - 0.25))}
                            disabled={!canZoomOut}
                            className="icon-btn"
                            aria-label="ズームアウト"
                        >
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="font-meta text-xs text-[var(--faint)] w-10 text-center">{Math.round(zoom * 100)}%</span>
                        <button
                            onClick={() => changeZoom(Math.min(maxZoom, zoom + 0.25))}
                            disabled={!canZoomIn}
                            className="icon-btn"
                            aria-label="ズームイン"
                        >
                            <ZoomIn className="w-4 h-4" />
                        </button>
                        <button onClick={() => changeZoom(1)} className="icon-btn" title="ズームをリセット" aria-label="ズームをリセット">
                            <RotateCcw className="w-4 h-4" />
                        </button>
                    </div>
                }
            />

            <div className="flex flex-wrap justify-center gap-4 glass-panel rounded-xl p-2.5">
                {STATUS_LEGEND.map(({ className, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded ${className}`}></div>
                        <span className="text-xs text-slate-400">{label}</span>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="glass-panel rounded-xl px-3 py-2.5">
                    <p className="text-[11px] text-slate-500">Users</p>
                    <p className="text-lg font-semibold text-white">{formatNumber(stats.uniqueUsers)}</p>
                </div>
                <div className="glass-panel rounded-xl px-3 py-2.5">
                    <p className="text-[11px] text-slate-500">Worlds</p>
                    <p className="text-lg font-semibold text-white">{formatNumber(stats.uniqueWorlds)}</p>
                </div>
                <div className="glass-panel rounded-xl px-3 py-2.5">
                    <p className="text-[11px] text-slate-500">Total Time</p>
                    <p className="text-lg font-semibold text-white">{stats.totalDurationHours.toFixed(1)}h</p>
                </div>
                <div className="glass-panel rounded-xl px-3 py-2.5">
                    <p className="text-[11px] text-slate-500 flex items-center gap-1"><Activity className="w-3.5 h-3.5 text-emerald-400" /> Active Sessions</p>
                    <p className="text-lg font-semibold text-white">{formatNumber(stats.activeSessions)}</p>
                </div>
            </div>

            {!hasData ? (
                <section className="pt-10">
                    <h3 className="font-display text-3xl">データがありません</h3>
                    <p className="mt-4 text-sm text-[var(--muted)]">過去{DAYS_TO_SHOW}日間のログがありません</p>
                    <button onClick={loadLogs} className="paper-btn mt-6">再読み込み</button>
                </section>
            ) : (
                <>
                    <div className="glass-panel rounded-xl p-3">
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
                            now={now}
                            onEntryHover={handleEntryHover}
                        />
                    </div>

                    <div className="glass-panel rounded-xl p-3">
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
                            now={now}
                            onEntryHover={handleEntryHover}
                        />
                    </div>
                </>
            )}

            {tooltip && (
                <div className="fixed z-50 bg-slate-900 border border-white/10 rounded-lg p-2.5 shadow-xl pointer-events-none"
                    style={{ left: tooltip.x, top: tooltip.y }}>
                    <p className="text-sm font-bold text-white">{tooltip.entry.user}</p>
                    <p className="text-xs text-purple-400">{tooltip.entry.world}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2 h-2 rounded ${statusColorClass(tooltip.entry.status)}`} />
                        <span className="text-xs text-slate-300">{formatStatusLabel(tooltip.entry.status)}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                        {formatDateTime(tooltip.entry.startTime)} ~ {formatDateTime(tooltip.entry.endTime)}
                    </p>
                </div>
            )}

            <p className="text-center text-xs text-slate-600">← 横スクロールで過去{DAYS_TO_SHOW}日間を連続表示 / 両グラフは同期スクロール / 右上の時計アイコンで現在時刻にジャンプ →</p>
        </div>
    );
}
