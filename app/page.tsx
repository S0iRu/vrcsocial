'use client';

import { Globe, MoreHorizontal, User, Star, Users, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// Types
type Friend = {
    id: string;
    name: string;
    status: string;
    statusMsg: string;
    icon: string;
    location: string;
    isFavorite: boolean;
};

type InstanceGroup = {
    id: string;
    worldName: string;
    instanceType: string;
    region: string;
    userCount: number;
    friends: Friend[];
    creatorName?: string;
    creatorId?: string;
};

const parseInstanceInfo = (location: string) => {
    if (!location || location === 'offline' || location === 'private') return null;
    const parts = location.split(':');
    if (parts.length < 2) return { name: '', type: 'Public', typeColor: 'text-green-400', region: 'US', creatorId: null };

    const raw = parts[1];
    const name = raw.split('~')[0];

    let type = 'Public';
    let typeColor = 'text-green-400';
    let creatorId = null;

    // specific extraction for usr_ id
    const usrMatch = raw.match(/\((usr_[^)]+)\)/);
    if (usrMatch) {
        creatorId = usrMatch[1];
    }

    if (raw.includes('private')) {
        type = 'Invite';
        typeColor = 'text-rose-400';
    } else if (raw.includes('friends')) {
        type = 'Friends';
        typeColor = 'text-yellow-400';
    } else if (raw.includes('hidden')) {
        type = 'Friends+';
        typeColor = 'text-orange-400';
    }

    let region = 'US';
    if (raw.includes('region(jp)')) region = 'JP';
    else if (raw.includes('region(eu)')) region = 'EU';

    return { name, type, typeColor, region, creatorId };
};

export default function FavoritesPage() {
    const router = useRouter();
    const [instances, setInstances] = useState<InstanceGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchFriends = useCallback(async (isBackground = false) => {
        if (isBackground) {
            setIsRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            // Get local credentials if available (Fallback for cookie issues)
            const localCreds = typeof window !== 'undefined' ? localStorage.getItem('vrc_creds') : null;
            const headers: Record<string, string> = {};
            if (localCreds) {
                headers['Authorization'] = `Basic ${localCreds}`;
            }

            const res = await fetch('/api/friends/active', { headers });

            if (res.ok) {
                const data = await res.json();
                setIsAuthenticated(true);

                // Group friends by location
                const grouped: Record<string, InstanceGroup> = {};

                if (data.friends && Array.isArray(data.friends)) {
                    // Create Map for quick friend lookup
                    const friendMap = new Map<string, string>();
                    data.friends.forEach((f: any) => friendMap.set(f.id, f.name));

                    data.friends.forEach((f: any) => {
                        const loc = f.location || "offline";
                        if (loc === "offline") return;

                        if (!grouped[loc]) {
                            // Resolve creator
                            const info = parseInstanceInfo(loc);
                            let cName = undefined;
                            if (info && info.creatorId) {
                                cName = friendMap.get(info.creatorId);
                            }

                            grouped[loc] = {
                                id: loc,
                                worldName: f.worldName || (loc.includes('private') ? "Private World" : `World ${loc.split(':')[0]}`),
                                instanceType: f.isPrivate ? "private" : "public",
                                region: "us",
                                userCount: 0,
                                friends: [],
                                creatorId: info?.creatorId || undefined,
                                creatorName: cName
                            };
                        }
                        grouped[loc].friends.push(f);
                        grouped[loc].userCount++;
                    });
                }

                // Sort: User Count Descending, but 'private' (hidden) at bottom
                const sortedInstances = Object.values(grouped).sort((a, b) => {
                    const aIsHidden = a.id === 'private' || a.worldName === 'Private World';
                    const bIsHidden = b.id === 'private' || b.worldName === 'Private World';

                    if (aIsHidden && !bIsHidden) return 1;
                    if (!aIsHidden && bIsHidden) return -1;

                    return b.userCount - a.userCount;
                });

                setInstances(sortedInstances);
                setLastUpdated(new Date());
            } else {
                // Auth failed or API error
                console.log("Failed to fetch friends, likely not authenticated.");
                setIsAuthenticated(false);
                setInstances([]);
            }
        } catch (e) {
            console.error(e);
            setInstances([]);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchFriends(false);

        // Polling every 60 seconds
        const interval = setInterval(() => {
            fetchFriends(true);
        }, 60000);

        return () => clearInterval(interval);
    }, [fetchFriends]);

    return (
        <div className="space-y-6 md:space-y-8 pb-24 md:pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2 md:gap-3">
                        <Star className="w-6 h-6 md:w-8 md:h-8 text-yellow-500 fill-yellow-500" /> Favorites
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                        <p className="text-sm md:text-base text-muted-foreground">Active Friends</p>
                        {lastUpdated && (
                            <span className="text-xs text-slate-600 hidden sm:inline-block">
                                Updated: {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                        <button
                            onClick={() => fetchFriends(true)}
                            disabled={isRefreshing || loading}
                            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                            title="Refresh Now"
                        >
                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
                        </button>
                    </div>
                </div>

                {!loading && !isAuthenticated && (
                    <Link href="/login" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition-all text-sm w-full md:w-auto justify-center">
                        Connect VRChat <ArrowRight className="w-4 h-4" />
                    </Link>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
            ) : (
                <div className="space-y-6 md:space-y-6">
                    {instances.length === 0 ? (
                        <div className="glass-card p-10 rounded-xl text-center">
                            <p className="text-slate-400 mb-2">No friends online found.</p>
                            <p className="text-xs text-slate-500">Try logging in or checking back later.</p>
                        </div>
                    ) : (
                        instances.map((instance) => (
                            <div key={instance.id} className="space-y-3">
                                {/* Instance Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2 gap-1 sm:gap-0">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden">
                                        <h3 className="text-sm font-medium text-slate-300 truncate leading-tight">
                                            {instance.worldName}
                                        </h3>

                                        {(() => {
                                            const info = parseInstanceInfo(instance.id);
                                            if (info) {
                                                return (
                                                    <>
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/5 bg-black/40 ${info.typeColor} whitespace-nowrap`}>
                                                            {info.type} #{info.name}
                                                        </span>
                                                        {info.region === 'JP' && <span className="text-[10px] bg-red-900/40 text-red-200 px-1 py-0.5 rounded border border-red-500/20">JP</span>}

                                                        {/* Creator Display */}
                                                        {instance.creatorName && (
                                                            <span className="text-[10px] bg-indigo-900/40 text-indigo-200 px-1.5 py-0.5 rounded border border-indigo-500/20 max-w-[100px] truncate">
                                                                Host: {instance.creatorName}
                                                            </span>
                                                        )}
                                                    </>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 shrink-0">
                                        <Users className="w-3 h-3" /> {instance.userCount} Users
                                    </div>
                                </div>

                                {/* Friend Cards Grid - Optimized for Mobile (2 Cols) */}
                                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-3">
                                    {instance.friends.map((friend) => (
                                        <div key={friend.id} className="glass-card p-2 md:p-3 rounded-lg flex items-center gap-2 md:gap-3 group hover:bg-white/10 transition-colors cursor-pointer relative overflow-hidden">
                                            <Link href={`/friends/${friend.id}`} className="absolute inset-0 z-10" />

                                            {/* Avatar */}
                                            <div className="relative shrink-0">
                                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-800 overflow-hidden">
                                                    <img src={friend.icon} alt={friend.name} className="w-full h-full object-cover" />
                                                </div>
                                                <div className={`absolute top-0 right-0 w-2 md:w-2.5 h-2 md:h-2.5 rounded-full border border-[#1e293b] ${friend.status === 'active' || friend.status === 'online' ? 'bg-green-500' :
                                                    friend.status === 'busy' ? 'bg-red-500' :
                                                        friend.status === 'join_me' ? 'bg-blue-400' : 'bg-slate-500'
                                                    }`}></div>
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs md:text-sm font-bold text-white truncate group-hover:text-indigo-300 transition-colors">{friend.name}</h4>
                                                </div>
                                                {friend.statusMsg && (
                                                    <p className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                                                        <span className="w-0.5 h-2 bg-slate-600 rounded-full inline-block shrink-0"></span>
                                                        <span className="truncate">{friend.statusMsg}</span>
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="border-b border-white/5 pt-2"></div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
