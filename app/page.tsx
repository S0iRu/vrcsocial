'use client';

import { Globe, MoreHorizontal, User, Star, Users, ArrowRight, Loader2, RefreshCw, Clock, Wifi, WifiOff, Lock, Plane } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useFriends, ConnectionState } from "@/components/providers/FriendsProvider";
import { useState, useEffect } from "react";

// Types
type Friend = {
    id: string;
    name: string;
    icon: string;
    status: string;
    statusMsg?: string;
    location: string;
    worldName?: string;
    joinedAt?: number;
    [key: string]: any;
};

// Format duration from timestamp
const formatDuration = (joinedAt: number | undefined): string => {
    if (!joinedAt) return '';
    const now = Date.now();
    const diffMs = now - joinedAt;
    const totalSeconds = Math.floor(diffMs / 1000);
    
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const totalHours = Math.floor(totalMinutes / 60);
    const hours = totalHours % 24;
    const days = Math.floor(totalHours / 24);
    
    if (days > 0) {
        return `${days}日${hours}時間${minutes}分`;
    }
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

type InstanceGroup = {
    id: string;
    worldName: string;
    instanceType: string;
    region: string;
    userCount: number;           // Number of favorite friends in this instance
    instanceUserCount?: number;  // Total number of users in this instance
    friends: Friend[];           // Favorite friends
    otherFriends: Friend[];      // Non-favorite friends with visible locations
    creatorId?: string;
    creatorName?: string;
    worldImageUrl?: string;
    groupId?: string;
    groupName?: string;
    ownerId?: string;
    ownerName?: string;
};

// Get status color (VRChat status values)
const getStatusColor = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'join me') return 'bg-blue-500';
    if (s === 'ask me') return 'bg-orange-500';
    if (s === 'busy' || s === 'do not disturb') return 'bg-red-500';
    if (s === 'active' || s === 'online') return 'bg-green-500';
    return 'bg-slate-500'; // offline or unknown
};

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
            return { icon: WifiOff, color: 'text-slate-500', label: 'Polling' };
    }
};

export default function FavoritesPage() {
    const router = useRouter();
    const { instances, offlineFriends, loading, isAuthenticated, lastUpdated, wsConnectionState, refresh } = useFriends();
    
    // Force re-render every second to update duration display
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="space-y-4 md:space-y-6 pb-24 md:pb-20">
            <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2 md:gap-3">
                    <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                        <Star className="w-5 h-5 md:w-6 md:h-6 text-yellow-500 fill-yellow-500" /> Favorites
                    </h2>
                    {isAuthenticated && (
                        <span className={`text-xs flex items-center gap-1 ${getWsStatusDisplay(wsConnectionState).color}`} title={`Connection: ${wsConnectionState}`}>
                            {(() => {
                                const status = getWsStatusDisplay(wsConnectionState);
                                const Icon = status.icon;
                                return <Icon className="w-3 h-3" />;
                            })()}
                            <span className="hidden sm:inline">{getWsStatusDisplay(wsConnectionState).label}</span>
                        </span>
                    )}
                    {lastUpdated && (
                        <span className="text-xs text-slate-600 hidden sm:inline-block">
                            {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        onClick={() => refresh()}
                        disabled={loading}
                        className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                        title="Refresh Now"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
                    </button>
                </div>

                {!loading && !isAuthenticated && (
                    <Link
                        href="/login"
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-lg shadow-indigo-500/20 text-sm transition-all"
                    >
                        Login
                    </Link>
                )}
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                    <Loader2 className="w-8 h-8 md:w-10 md:h-10 animate-spin text-indigo-500" />
                    <p className="text-sm md:text-base animate-pulse">Checking friends location...</p>
                </div>
            ) : !isAuthenticated || (instances.length === 0 && offlineFriends.length === 0) ? (
                <div className="glass-card rounded-xl p-8 md:p-12 text-center">
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                        <Users className="w-8 h-8 md:w-10 md:h-10 text-indigo-400" />
                    </div>
                    <h3 className="text-lg md:text-xl font-bold text-white mb-2">No Active Favorites</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto mb-6 text-sm md:text-base">
                        {isAuthenticated
                            ? "None of your favorite friends seem to be online right now."
                            : "Log in to see your VRChat friends activity."}
                    </p>
                    {!isAuthenticated && (
                        <Link
                            href="/login"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black hover:bg-slate-200 rounded-full font-bold transition-colors text-sm md:text-base"
                        >
                            Get Started
                        </Link>
                    )}
                </div>
            ) : (
                <>
                    {/* Online Instances (excluding Private and Traveling) */}
                    {instances.filter(g => g.id !== 'private' && g.worldName !== 'Private World' && g.id !== 'traveling').length > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                            {instances.filter(g => g.id !== 'private' && g.worldName !== 'Private World' && g.id !== 'traveling').map((group) => (
                                <div key={group.id} className="glass-card rounded-xl overflow-hidden group hover:border-indigo-500/30 transition-all duration-300">
                                    {/* Instance Header */}
                                    <div className="p-4 md:p-5 border-b border-white/5 bg-slate-800/20">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative">
                                                    {group.worldImageUrl ? (
                                                        <img src={group.worldImageUrl} alt={group.worldName} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Globe className="w-5 h-5 md:w-6 md:h-6 text-indigo-400" />
                                                    )}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-white text-base md:text-lg line-clamp-1 group-hover:text-indigo-400 transition-colors">
                                                        {group.worldName}
                                                    </h3>
                                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                                        <span className={`text-[10px] md:text-xs font-medium px-2 py-0.5 rounded-full bg-slate-800 border border-white/10 ${
                                                            group.instanceType === 'Invite' || group.instanceType === 'Invite+' ? 'text-rose-400 border-rose-500/30' :
                                                            group.instanceType === 'Friends+' || group.instanceType === 'Friends' ? 'text-orange-400 border-orange-500/30' :
                                                            group.instanceType.startsWith('Group') ? 'text-cyan-400 border-cyan-500/30' :
                                                            'text-green-400 border-green-500/30'
                                                        }`}>
                                                            {group.instanceType}
                                                        </span>
                                                        {group.region && (
                                                            <span className="text-[10px] md:text-xs text-slate-500 font-mono">
                                                                {group.region}
                                                            </span>
                                                        )}
                                                        {group.groupName ? (
                                                            <span className="text-[10px] md:text-xs text-cyan-300 bg-cyan-500/10 px-1.5 rounded flex items-center gap-1">
                                                                Group: {group.groupName}
                                                            </span>
                                                        ) : group.ownerName ? (
                                                            <span className="text-[10px] md:text-xs text-indigo-300 bg-indigo-500/10 px-1.5 rounded flex items-center gap-1">
                                                                <User className="w-3 h-3" /> Host: {group.ownerName}
                                                            </span>
                                                        ) : null}
                                                        {!group.worldName.includes("Private") && group.id !== 'private' && (
                                                            <span className="text-[10px] md:text-xs text-slate-600 font-mono truncate max-w-[100px]">
                                                                #{group.id.split(':')[1]?.split('~')[0]}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-lg text-xs md:text-sm font-medium text-white shrink-0" title={`${group.userCount} favorites / ${group.instanceUserCount || '?'} total`}>
                                                <Users className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-400" />
                                                {group.instanceUserCount || group.userCount}
                                                {group.instanceUserCount && group.instanceUserCount !== group.userCount && (
                                                    <span className="text-slate-400 text-[10px] md:text-xs">({group.userCount}★)</span>
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Friends List */}
                                    <div className="p-2">
                                        {/* Favorite Friends */}
                                        {group.friends.length > 0 && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 md:gap-2">
                                                {group.friends.map((friend) => (
                                                    <Link
                                                        key={friend.id}
                                                        href={`/friends/${friend.id}`}
                                                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group/friend"
                                                    >
                                                        <div className="relative">
                                                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-700 overflow-hidden ring-2 ring-yellow-500/30 group-hover/friend:ring-indigo-500/50 transition-all">
                                                                {friend.icon ? (
                                                                    <img src={friend.icon} alt={friend.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">IMG</div>
                                                                )}
                                                            </div>
                                                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 md:w-3 md:h-3 ${getStatusColor(friend.status)} border-2 border-[#1a1f2e] rounded-full`}></div>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="text-xs md:text-sm font-medium text-slate-200 group-hover/friend:text-white truncate flex items-center gap-1">
                                                                    {friend.name}
                                                                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />
                                                                </p>
                                                                {friend.joinedAt && (
                                                                    <span className="text-xs md:text-sm text-slate-400 flex items-center gap-1 shrink-0 font-mono">
                                                                        <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                                                        {formatDuration(friend.joinedAt)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {friend.statusMsg && (
                                                                <p className="text-[10px] md:text-xs text-slate-500 truncate mt-0.5">
                                                                    {friend.statusMsg}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        )}

                                        {/* Separator between favorites and others (hide for Private instances) */}
                                        {group.friends.length > 0 && group.otherFriends && group.otherFriends.length > 0 && group.id !== 'private' && group.worldName !== 'Private World' && (
                                            <div className="flex items-center gap-2 my-2 px-2">
                                                <div className="flex-1 h-px bg-white/10"></div>
                                                <span className="text-[10px] text-slate-500">Other Friends</span>
                                                <div className="flex-1 h-px bg-white/10"></div>
                                            </div>
                                        )}

                                        {/* Non-Favorite Friends (hide for Private instances) */}
                                        {group.otherFriends && group.otherFriends.length > 0 && group.id !== 'private' && group.worldName !== 'Private World' && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 md:gap-2">
                                                {group.otherFriends.map((friend) => (
                                                    <Link
                                                        key={friend.id}
                                                        href={`/friends/${friend.id}`}
                                                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group/friend opacity-70 hover:opacity-100"
                                                    >
                                                        <div className="relative">
                                                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-700 overflow-hidden ring-2 ring-transparent group-hover/friend:ring-slate-500/50 transition-all">
                                                                {friend.icon ? (
                                                                    <img src={friend.icon} alt={friend.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">IMG</div>
                                                                )}
                                                            </div>
                                                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 md:w-3 md:h-3 ${getStatusColor(friend.status)} border-2 border-[#1a1f2e] rounded-full`}></div>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="text-xs md:text-sm font-medium text-slate-400 group-hover/friend:text-slate-200 truncate">
                                                                    {friend.name}
                                                                </p>
                                                                {friend.joinedAt && (
                                                                    <span className="text-xs md:text-sm text-slate-500 flex items-center gap-1 shrink-0 font-mono">
                                                                        <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                                                        {formatDuration(friend.joinedAt)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {friend.statusMsg && (
                                                                <p className="text-[10px] md:text-xs text-slate-600 truncate mt-0.5">
                                                                    {friend.statusMsg}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Traveling Section */}
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
                                <div className="glass-card rounded-xl p-3 md:p-4 border-amber-500/20">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
                                        {travelingInstance.friends.map((friend: any) => (
                                            <Link
                                                key={friend.id}
                                                href={`/friends/${friend.id}`}
                                                className="flex flex-col items-center p-2 rounded-lg hover:bg-white/5 transition-colors group/friend"
                                            >
                                                <div className="relative mb-2">
                                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-slate-700 overflow-hidden ring-2 ring-amber-500/30 group-hover/friend:ring-amber-400/50 transition-all animate-pulse">
                                                        {friend.icon ? (
                                                            <img src={friend.icon} alt={friend.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">IMG</div>
                                                        )}
                                                    </div>
                                                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 md:w-3 md:h-3 bg-amber-500 border-2 border-[#1a1f2e] rounded-full animate-pulse`}></div>
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

                    {/* Private World Section - Grid layout */}
                    {(() => {
                        const privateInstances = instances.filter(g => g.id === 'private' || g.worldName === 'Private World');
                        const privateFriends = privateInstances.flatMap(g => g.friends);
                        
                        if (privateFriends.length === 0) return null;
                        
                        // Group by favorite group
                        const grouped = privateFriends.reduce((acc: Record<string, any[]>, friend: any) => {
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
                                        <div key={groupName} className="glass-card rounded-xl p-3 md:p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                                <span className="text-xs font-medium text-slate-400">
                                                    Group {parseInt(groupName.replace('group_', ''), 10) + 1 || '?'}
                                                </span>
                                                <span className="text-xs text-slate-600">({(friends as any[]).length})</span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 md:gap-2">
                                                {(friends as any[]).map((friend: any) => (
                                                    <Link
                                                        key={friend.id}
                                                        href={`/friends/${friend.id}`}
                                                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group/friend"
                                                    >
                                                        <div className="relative">
                                                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-700 overflow-hidden ring-2 ring-yellow-500/30 group-hover/friend:ring-indigo-500/50 transition-all">
                                                                {friend.icon ? (
                                                                    <img src={friend.icon} alt={friend.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">IMG</div>
                                                                )}
                                                            </div>
                                                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 md:w-3 md:h-3 ${getStatusColor(friend.status)} border-2 border-[#1a1f2e] rounded-full`}></div>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="text-xs md:text-sm font-medium text-slate-200 group-hover/friend:text-white truncate flex items-center gap-1">
                                                                    {friend.name}
                                                                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />
                                                                </p>
                                                                {friend.joinedAt && (
                                                                    <span className="text-xs md:text-sm text-slate-400 flex items-center gap-1 shrink-0 font-mono">
                                                                        <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                                                        {formatDuration(friend.joinedAt)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {friend.statusMsg && (
                                                                <p className="text-[10px] md:text-xs text-slate-500 truncate mt-0.5">
                                                                    {friend.statusMsg}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Offline Favorites Section - Grouped by favorite group */}
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
                                    // Group offline friends by favorite group
                                    const grouped = offlineFriends.reduce((acc: Record<string, any[]>, friend: any) => {
                                        const group = friend.favoriteGroup || 'group_unknown';
                                        if (!acc[group]) acc[group] = [];
                                        acc[group].push(friend);
                                        return acc;
                                    }, {});
                                    
                                    // Sort groups by group number
                                    const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
                                        const aNum = a.startsWith('group_') ? parseInt(a.replace('group_', ''), 10) : 999;
                                        const bNum = b.startsWith('group_') ? parseInt(b.replace('group_', ''), 10) : 999;
                                        return aNum - bNum;
                                    });
                                    
                                    return sortedGroups.map(([groupName, friends]) => (
                                        <div key={groupName} className="glass-card rounded-xl p-3 md:p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Star className="w-4 h-4 text-yellow-600 fill-yellow-600" />
                                                <span className="text-xs font-medium text-slate-400">
                                                    Group {parseInt(groupName.replace('group_', ''), 10) + 1 || '?'}
                                                </span>
                                                <span className="text-xs text-slate-600">({(friends as any[]).length})</span>
                                            </div>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 md:gap-3">
                                                {(friends as any[]).map((friend: any) => (
                                                    <Link
                                                        key={friend.id}
                                                        href={`/friends/${friend.id}`}
                                                        className="flex flex-col items-center p-2 rounded-lg hover:bg-white/5 transition-colors group/friend opacity-60 hover:opacity-100"
                                                    >
                                                        <div className="relative mb-2">
                                                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-slate-700 overflow-hidden ring-2 ring-slate-600/30 group-hover/friend:ring-slate-500/50 transition-all">
                                                                {friend.userIcon ? (
                                                                    <img src={friend.userIcon} alt={friend.displayName} className="w-full h-full object-cover grayscale" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">IMG</div>
                                                                )}
                                                            </div>
                                                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-slate-500 border-2 border-[#1a1f2e] rounded-full"></div>
                                                        </div>
                                                        <p className="text-[10px] font-medium text-slate-500 group-hover/friend:text-slate-300 truncate max-w-full text-center">
                                                            {friend.displayName}
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
