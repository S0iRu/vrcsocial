export const LOGS_STORAGE_KEY = 'vrc_logs';
export const LOGS_CHANGED_EVENT = 'vrc-logs-changed';
const LOG_LIMIT = 500;

export type ActivityLog = {
    id: number;
    date: string;
    timestamp?: number;
    type: string;
    user: string;
    userId?: string;
    detail: string;
    status?: string;
    color?: string;
};

const canUseStorage = () => typeof window !== 'undefined';

const isActivityLog = (value: unknown): value is ActivityLog => {
    if (typeof value !== 'object' || value === null) return false;
    const log = value as Partial<ActivityLog>;
    return typeof log.id === 'number'
        && typeof log.date === 'string'
        && typeof log.type === 'string'
        && typeof log.user === 'string'
        && typeof log.detail === 'string';
};

const formatStamp = (date: Date): string => {
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function formatActivityLogTime(log: Pick<ActivityLog, 'date' | 'timestamp'>): string {
    if (typeof log.timestamp === 'number' && Number.isFinite(log.timestamp)) {
        return formatStamp(new Date(log.timestamp));
    }
    return log.date;
}

export function parseActivityLogTime(log: Pick<ActivityLog, 'date' | 'timestamp'>, now = new Date()): Date | null {
    if (typeof log.timestamp === 'number' && Number.isFinite(log.timestamp)) {
        return new Date(log.timestamp);
    }
    const match = log.date.match(/(\d+)\/(\d+)\s+(\d+):(\d+)/);
    if (!match) return null;
    const parsed = new Date(
        now.getFullYear(),
        parseInt(match[1], 10) - 1,
        parseInt(match[2], 10),
        parseInt(match[3], 10),
        parseInt(match[4], 10)
    );
    if (parsed.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
        parsed.setFullYear(parsed.getFullYear() - 1);
    }
    return parsed;
}

const notifyLogsChanged = () => {
    if (!canUseStorage()) return;
    window.dispatchEvent(new CustomEvent(LOGS_CHANGED_EVENT));
};

export function readActivityLogs(): ActivityLog[] {
    if (!canUseStorage()) return [];
    try {
        const raw: unknown = JSON.parse(localStorage.getItem(LOGS_STORAGE_KEY) || '[]');
        if (!Array.isArray(raw)) return [];
        return raw.filter(isActivityLog);
    } catch (error: unknown) {
        console.error('Log read error', error);
        return [];
    }
}

export function writeActivityLogs(logs: ActivityLog[]) {
    if (!canUseStorage()) return;
    try {
        localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, LOG_LIMIT)));
        notifyLogsChanged();
    } catch (error: unknown) {
        console.error('Log save error', error);
    }
}

export function subscribeActivityLogs(listener: () => void): () => void {
    if (!canUseStorage()) return () => {};
    const onCustom = () => listener();
    const onStorage = (event: StorageEvent) => {
        if (event.key === LOGS_STORAGE_KEY) listener();
    };
    window.addEventListener(LOGS_CHANGED_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(LOGS_CHANGED_EVENT, onCustom);
        window.removeEventListener('storage', onStorage);
    };
}

type NewActivityLog = {
    type: string;
    user: string;
    userId?: string;
    detail: string;
    status?: string;
    color?: string;
};

export function appendActivityLog(entry: NewActivityLog) {
    const now = new Date();
    const log: ActivityLog = {
        id: Date.now() + Math.random(),
        date: formatStamp(now),
        timestamp: now.getTime(),
        type: entry.type,
        user: entry.user,
        userId: entry.userId,
        detail: entry.detail,
        status: entry.status,
        color: entry.color,
    };
    writeActivityLogs([log, ...readActivityLogs()]);
}

const placeholderDestination = /→\s*(Online|Unknown)\s*$/;

const isPlacePlaceholder = (log: ActivityLog): boolean => {
    if (log.type === 'OnLine') return log.detail === 'Online' || log.detail === 'Unknown';
    if (log.type === 'GPS') return placeholderDestination.test(log.detail);
    return false;
};

export function replaceLatestPlacePlaceholder(userId: string, worldName: string) {
    if (!worldName || worldName === 'Online' || worldName === 'Unknown') return;
    const logs = readActivityLogs();
    const index = logs.findIndex((log) =>
        log.userId === userId && (log.type === 'OnLine' || log.type === 'GPS')
    );
    if (index < 0) return;
    const log = logs[index];
    if (!isPlacePlaceholder(log)) return;

    const detail = log.type === 'OnLine'
        ? worldName
        : log.detail.replace(placeholderDestination, `→ ${worldName}`);
    const next = logs.slice();
    next[index] = { ...log, detail };
    writeActivityLogs(next);
}
