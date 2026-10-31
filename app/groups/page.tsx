'use client';

import { ChevronDown, ChevronRight, Loader2, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { InstanceCard, type InstanceCardModel } from '@/components/instances/InstanceCard';
import { ConnectionBadge, PageHeader, RefreshButton } from '@/components/layout/PageHeader';
import { useFriends, type Friend } from '@/components/providers/FriendsProvider';

type GroupInstance = {
    location: string;
    worldId: string;
    worldName: string;
    worldImageUrl?: string;
    instanceType: string;
    region?: string;
    userCount?: number;
    capacity?: number;
    displayName?: string;
    description?: string;
    category?: string;
    vibes?: string[];
    languages?: string[];
    ownerId?: string;
};

type GroupSection = {
    id: string;
    name: string;
    shortCode?: string;
    iconUrl?: string;
    instances: GroupInstance[];
};

const isGroupInstance = (value: unknown): value is GroupInstance => {
    if (typeof value !== 'object' || value === null) return false;
    const instance = value as Partial<GroupInstance>;
    return typeof instance.location === 'string' && typeof instance.worldName === 'string';
};

const isGroupSection = (value: unknown): value is GroupSection => {
    if (typeof value !== 'object' || value === null) return false;
    const group = value as Partial<GroupSection>;
    return typeof group.id === 'string'
        && typeof group.name === 'string'
        && Array.isArray(group.instances)
        && group.instances.every(isGroupInstance);
};

const parsePayload = (value: unknown): GroupSection[] => {
    if (typeof value !== 'object' || value === null) return [];
    const groups = (value as { groups?: unknown }).groups;
    if (!Array.isArray(groups)) return [];
    return groups.filter(isGroupSection);
};

const sortFriends = (friends: Friend[], ownerId?: string) => {
    return [...friends].sort((a, b) => {
        const aOwner = Boolean(ownerId && a.id === ownerId);
        const bOwner = Boolean(ownerId && b.id === ownerId);
        if (aOwner && !bOwner) return -1;
        if (!aOwner && bOwner) return 1;
        return (a.joinedAt ?? Number.MAX_SAFE_INTEGER) - (b.joinedAt ?? Number.MAX_SAFE_INTEGER);
    });
};

export default function GroupInstancesPage() {
    const { onlineFriends, isAuthenticated, wsConnectionState } = useFriends();
    const [groups, setGroups] = useState<GroupSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [signedIn, setSignedIn] = useState(false);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState<string[]>([]);
    const [, setTick] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => setTick((value) => value + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            try {
                const raw = localStorage.getItem('vrc_expanded_groups');
                const parsed: unknown = raw ? JSON.parse(raw) : [];
                if (Array.isArray(parsed)) {
                    setExpanded(parsed.filter((id): id is string => typeof id === 'string'));
                }
            } catch (err: unknown) {
                console.error(err);
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    const toggleGroup = (groupId: string) => {
        setExpanded((current) => {
            const next = current.includes(groupId)
                ? current.filter((id) => id !== groupId)
                : [...current, groupId];
            localStorage.setItem('vrc_expanded_groups', JSON.stringify(next));
            return next;
        });
    };

    const load = useCallback(async (manual = false) => {
        if (manual) setRefreshing(true);
        try {
            const res = await fetch('/api/groups/instances', { credentials: 'include' });
            if (res.status === 401) {
                setSignedIn(false);
                setGroups([]);
                setError('');
                return;
            }
            if (!res.ok) {
                const body: unknown = await res.json().catch(() => null);
                const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
                    ? body.error
                    : 'Failed to load group instances';
                setError(message);
                return;
            }
            setGroups(parsePayload(await res.json()));
            setSignedIn(true);
            setError('');
        } catch (err: unknown) {
            console.error(err);
            setError('Failed to load group instances');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const run = () => {
            if (!cancelled) void load();
        };
        run();
        const intervalId = setInterval(run, 60_000);
        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [load]);

    const sections = useMemo(() => {
        const friendsAt = (location: string) => onlineFriends.filter((friend) => friend.location === location);
        return groups
            .map((group) => {
                const instances = group.instances
                    .map((instance) => {
                        const here = friendsAt(instance.location);
                        const friends = sortFriends(here.filter((friend) => friend.isFavorite), instance.ownerId);
                        const otherFriends = sortFriends(here.filter((friend) => !friend.isFavorite), instance.ownerId);
                        const owner = here.find((friend) => friend.id === instance.ownerId);
                        const card: InstanceCardModel = {
                            id: instance.location,
                            worldName: instance.worldName,
                            worldImageUrl: instance.worldImageUrl,
                            instanceType: instance.instanceType,
                            region: instance.region,
                            instanceDisplayName: instance.displayName,
                            instanceDescription: instance.description,
                            instanceCategory: instance.category,
                            instanceVibes: instance.vibes,
                            instanceLanguages: instance.languages,
                            groupName: group.name,
                            ownerName: owner?.name,
                            favoriteCount: friends.length,
                            trackedFriends: friends.length + otherFriends.length,
                            occupantCount: instance.userCount,
                            capacity: instance.capacity,
                            friends,
                            otherFriends,
                        };
                        return card;
                    })
                    .sort((a, b) => {
                        if (a.trackedFriends !== b.trackedFriends) return b.trackedFriends - a.trackedFriends;
                        return (b.occupantCount ?? 0) - (a.occupantCount ?? 0);
                    });
                const friendCount = instances.reduce((sum, instance) => sum + instance.trackedFriends, 0);
                return { ...group, instances, friendCount };
            })
            .sort((a, b) => b.friendCount - a.friendCount || a.name.localeCompare(b.name));
    }, [groups, onlineFriends]);

    return (
        <div className="space-y-4 md:space-y-6">
            <PageHeader
                title="Group Instances"
                icon={Users}
                trailing={(signedIn || isAuthenticated) ? <ConnectionBadge state={wsConnectionState} /> : undefined}
                actions={(signedIn || isAuthenticated) ? (
                    <RefreshButton onClick={() => void load(true)} spinning={loading || refreshing} />
                ) : (
                    <Link href="/login" className="paper-btn text-sm">
                        Login
                    </Link>
                )}
            />

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                    <Loader2 className="w-8 h-8 md:w-10 md:h-10 animate-spin text-indigo-500" />
                    <p className="text-sm md:text-base animate-pulse">Checking group instances...</p>
                </div>
            ) : !signedIn && !error ? (
                <section className="pt-10">
                    <p className="kicker">Groups</p>
                    <h3 className="font-display text-3xl mt-3">Log in to see open instances</h3>
                    <p className="mt-4 max-w-md text-sm text-[var(--muted)]">
                        Instances from the groups you belong to appear here, with friends shown the same way as Favorites.
                    </p>
                    <Link href="/login" className="paper-btn mt-6">
                        Get Started <span aria-hidden>→</span>
                    </Link>
                </section>
            ) : error ? (
                <section className="pt-10">
                    <h3 className="font-display text-3xl">Could not load instances</h3>
                    <p className="mt-4 text-sm text-[var(--faint)]">{error}</p>
                    <button onClick={() => void load(true)} className="paper-btn mt-6">Try again</button>
                </section>
            ) : sections.length === 0 ? (
                <section className="pt-10">
                    <p className="kicker">Groups</p>
                    <h3 className="font-display text-3xl mt-3">No open instances</h3>
                    <p className="mt-4 max-w-md text-sm text-[var(--muted)]">
                        None of your groups have an instance open right now.
                    </p>
                </section>
            ) : (
                <div>
                    {sections.map((group) => {
                        const isOpen = expanded.includes(group.id);
                        return (
                        <section key={group.id} className="border-t border-[var(--line)]">
                            <button
                                type="button"
                                onClick={() => toggleGroup(group.id)}
                                aria-expanded={isOpen}
                                className="w-full flex items-center gap-4 py-4 text-left"
                            >
                                <div className="w-11 h-11 overflow-hidden border border-[var(--line)] flex items-center justify-center shrink-0">
                                    {group.iconUrl ? (
                                        <Image src={group.iconUrl} alt="" width={44} height={44} className="w-full h-full object-cover" unoptimized />
                                    ) : (
                                        <Users className="w-5 h-5 text-[var(--faint)]" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-base md:text-lg truncate">{group.name}</h3>
                                    <p className="font-meta text-xs text-[var(--faint)] mt-0.5">
                                        {group.shortCode || group.id}
                                        <span> · {group.instances.length} {group.instances.length === 1 ? 'instance' : 'instances'}</span>
                                        {group.friendCount > 0 && <span> · {group.friendCount} friends</span>}
                                    </p>
                                </div>
                                {isOpen ? <ChevronDown className="w-4 h-4 text-[var(--faint)]" /> : <ChevronRight className="w-4 h-4 text-[var(--faint)]" />}
                            </button>
                            {isOpen && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 pb-6">
                                    {group.instances.map((instance) => (
                                        <InstanceCard key={instance.id} group={instance} />
                                    ))}
                                </div>
                            )}
                        </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
