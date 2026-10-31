'use client';

import { Users, Loader2, WifiOff, Lock, Plane, Star } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useFriends } from "@/components/providers/FriendsProvider";
import { useState, useEffect } from "react";
import { InstanceCard, toInstanceCardModel } from "@/components/instances/InstanceCard";
import { FriendRow } from "@/components/instances/FriendRow";
import { ConnectionBadge, PageHeader, RefreshButton } from "@/components/layout/PageHeader";

export default function FavoritesPage() {
    const { instances, offlineFriends, loading, isAuthenticated, lastUpdated, wsConnectionState, refresh } = useFriends();

    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    const visibleInstances = instances.filter(g => g.id !== 'private' && g.worldName !== 'Private World' && g.id !== 'traveling');

    return (
        <div className="space-y-4 md:space-y-6">
            <PageHeader
                title="Favorites"
                icon={Star}
                iconClassName="text-yellow-500 fill-yellow-500"
                trailing={isAuthenticated ? (
                    <>
                        <ConnectionBadge state={wsConnectionState} />
                        {lastUpdated && (
                            <span className="text-xs text-slate-500 hidden sm:inline-block">
                                {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                        <RefreshButton onClick={() => refresh()} spinning={loading} />
                    </>
                ) : undefined}
                actions={!loading && !isAuthenticated ? (
                    <Link href="/login" className="paper-btn text-sm">
                        Login
                    </Link>
                ) : isAuthenticated && visibleInstances.length > 0 ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 rounded-lg text-[11px] md:text-xs text-slate-400 shrink-0 border border-white/5">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span><span className="text-yellow-400">★Favorites</span> / Friends / Users / Capacity</span>
                    </div>
                ) : undefined}
            />

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                    <Loader2 className="w-8 h-8 md:w-10 md:h-10 animate-spin text-indigo-500" />
                    <p className="text-sm md:text-base animate-pulse">Checking friends location...</p>
                </div>
            ) : !isAuthenticated || (instances.length === 0 && offlineFriends.length === 0) ? (
                <section className="pt-10">
                    <p className="kicker">Favorites</p>
                    <h3 className="font-display text-3xl mt-3">No active favorites</h3>
                    <p className="mt-4 max-w-md text-sm text-[var(--muted)]">
                        {isAuthenticated
                            ? "None of your favorite friends seem to be online right now."
                            : "Log in to see your VRChat friends activity."}
                    </p>
                    {!isAuthenticated && (
                        <Link href="/login" className="paper-btn mt-6">
                            Get Started <span aria-hidden>→</span>
                        </Link>
                    )}
                </section>
            ) : (
                <>
                    {visibleInstances.length > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                            {visibleInstances.map((group) => (
                                <InstanceCard key={group.id} group={toInstanceCardModel(group)} />
                            ))}
                        </div>
                    )}

                    {(() => {
                        const travelingInstance = instances.find(g => g.id === 'traveling');
                        if (!travelingInstance || travelingInstance.friends.length === 0) return null;

                        return (
                            <div className="mt-6">
                                <div className="flex items-center gap-3 mb-4 px-1">
                                    <div className="flex-1 h-px bg-white/10"></div>
                                    <h3 className="text-sm font-medium text-amber-400 flex items-center gap-2">
                                        <Plane className="w-4 h-4 animate-pulse" />
                                        Traveling ({travelingInstance.friends.length})
                                    </h3>
                                    <div className="flex-1 h-px bg-white/10"></div>
                                </div>
                                <div className="glass-panel rounded-xl p-3 md:p-4 border-amber-500/20">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
                                        {travelingInstance.friends.map((friend) => (
                                            <Link
                                                key={friend.id}
                                                href={`/friends/${friend.id}`}
                                                className="flex flex-col items-center p-2 rounded-lg hover:bg-white/5 transition-colors group/friend"
                                            >
                                                <div className="relative mb-2">
                                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-slate-700 overflow-hidden ring-2 ring-amber-500/30 group-hover/friend:ring-amber-400/50 transition-all animate-pulse">
                                                        {friend.icon ? (
                                                            <Image src={friend.icon} alt={friend.name} width={48} height={48} className="w-full h-full object-cover" unoptimized />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">IMG</div>
                                                        )}
                                                    </div>
                                                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 md:w-3 md:h-3 bg-amber-500 border-2 border-slate-900 rounded-full animate-pulse"></div>
                                                </div>
                                                <p className="text-[10px] md:text-xs font-medium text-amber-300 group-hover/friend:text-amber-200 truncate max-w-full text-center flex items-center gap-1">
                                                    {friend.name}
                                                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />
                                                </p>
                                                <p className="text-[10px] text-amber-500/70">Moving...</p>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {(() => {
                        const privateInstances = instances.filter(g => g.id === 'private' || g.worldName === 'Private World');
                        const privateFriends = privateInstances.flatMap(g => g.friends);
                        if (privateFriends.length === 0) return null;

                        const grouped = privateFriends.reduce<Record<string, typeof privateFriends[number][]>>((acc, friend) => {
                            const group = friend.favoriteGroup || 'group_unknown';
                            if (!acc[group]) acc[group] = [];
                            acc[group].push(friend);
                            return acc;
                        }, {});

                        const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
                            const aNum = a.startsWith('group_') ? parseInt(a.replace('group_', ''), 10) : 999;
                            const bNum = b.startsWith('group_') ? parseInt(b.replace('group_', ''), 10) : 999;
                            return aNum - bNum;
                        });

                        return (
                            <div className="mt-8">
                                <div className="flex items-center gap-3 mb-4 px-1">
                                    <div className="flex-1 h-px bg-white/10"></div>
                                    <h3 className="text-sm font-medium text-slate-500 flex items-center gap-2">
                                        <Lock className="w-4 h-4" />
                                        Private World ({privateFriends.length})
                                    </h3>
                                    <div className="flex-1 h-px bg-white/10"></div>
                                </div>
                                <div className="space-y-4">
                                    {sortedGroups.map(([groupName, friends]) => (
                                        <div key={groupName} className="glass-panel rounded-xl p-3 md:p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                                <span className="text-xs font-medium text-slate-400">
                                                    Group {parseInt(groupName.replace('group_', ''), 10) + 1 || '?'}
                                                </span>
                                                <span className="text-xs text-slate-600">({friends.length})</span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 md:gap-2">
                                                {friends.map((friend) => (
                                                    <FriendRow key={friend.id} friend={friend} favorite />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {offlineFriends.length > 0 && (
                        <div className="mt-8">
                            <div className="flex items-center gap-3 mb-4 px-1">
                                <div className="flex-1 h-px bg-white/10"></div>
                                <h3 className="text-sm font-medium text-slate-500 flex items-center gap-2">
                                    <WifiOff className="w-4 h-4" />
                                    Offline Favorites ({offlineFriends.length})
                                </h3>
                                <div className="flex-1 h-px bg-white/10"></div>
                            </div>
                            <div className="space-y-4">
                                {(() => {
                                    const grouped = offlineFriends.reduce<Record<string, typeof offlineFriends[number][]>>((acc, friend) => {
                                        const group = friend.favoriteGroup || 'group_unknown';
                                        if (!acc[group]) acc[group] = [];
                                        acc[group].push(friend);
                                        return acc;
                                    }, {});

                                    const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
                                        const aNum = a.startsWith('group_') ? parseInt(a.replace('group_', ''), 10) : 999;
                                        const bNum = b.startsWith('group_') ? parseInt(b.replace('group_', ''), 10) : 999;
                                        return aNum - bNum;
                                    });

                                    return sortedGroups.map(([groupName, friends]) => (
                                        <div key={groupName} className="glass-panel rounded-xl p-3 md:p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Star className="w-4 h-4 text-yellow-600 fill-yellow-600" />
                                                <span className="text-xs font-medium text-slate-400">
                                                    Group {parseInt(groupName.replace('group_', ''), 10) + 1 || '?'}
                                                </span>
                                                <span className="text-xs text-slate-600">({friends.length})</span>
                                            </div>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 md:gap-3">
                                                {friends.map((friend) => (
                                                    <Link
                                                        key={friend.id}
                                                        href={`/friends/${friend.id}`}
                                                        className="flex flex-col items-center p-2 rounded-lg hover:bg-white/5 transition-colors group/friend opacity-60 hover:opacity-100"
                                                    >
                                                        <div className="relative mb-2">
                                                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-slate-700 overflow-hidden ring-2 ring-slate-600/30 group-hover/friend:ring-slate-500/50 transition-all">
                                                                {friend.icon || friend.userIcon ? (
                                                                    <Image src={friend.icon || friend.userIcon || ''} alt={friend.displayName || friend.name} width={48} height={48} className="w-full h-full object-cover grayscale" unoptimized />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">IMG</div>
                                                                )}
                                                            </div>
                                                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-slate-500 border-2 border-slate-900 rounded-full"></div>
                                                        </div>
                                                        <p className="text-[10px] font-medium text-slate-500 group-hover/friend:text-slate-300 truncate max-w-full text-center">
                                                            {friend.displayName || friend.name}
                                                        </p>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
