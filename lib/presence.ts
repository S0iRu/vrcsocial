export function statusColorClass(status: string): string {
    const value = (status || '').toLowerCase();
    if (value === 'join me') return 'bg-blue-500';
    if (value === 'ask me') return 'bg-orange-500';
    if (value === 'busy' || value === 'do not disturb') return 'bg-red-500';
    if (value === 'active' || value === 'online') return 'bg-green-500';
    return 'bg-slate-500';
}

export function formatDuration(joinedAt: number | undefined): string {
    if (!joinedAt) return '';
    const totalSeconds = Math.max(0, Math.floor((Date.now() - joinedAt) / 1000));
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const totalHours = Math.floor(totalMinutes / 60);
    const hours = totalHours % 24;
    const days = Math.floor(totalHours / 24);
    const paddedMinutes = minutes.toString().padStart(2, '0');
    const paddedSeconds = seconds.toString().padStart(2, '0');
    const paddedHours = hours.toString().padStart(2, '0');

    if (days > 0) return `${days}d ${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
    if (hours > 0) return `${hours}:${paddedMinutes}:${paddedSeconds}`;
    return `${minutes}:${paddedSeconds}`;
}

export function instanceTypePillClass(instanceType: string): string {
    if (instanceType === 'Invite' || instanceType === 'Invite+') return 'text-rose-400 border-rose-500/30';
    if (instanceType === 'Friends+' || instanceType === 'Friends') return 'text-orange-400 border-orange-500/30';
    if (instanceType.startsWith('Group')) return 'text-cyan-400 border-cyan-500/30';
    return 'text-green-400 border-green-500/30';
}
