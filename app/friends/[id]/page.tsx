'use client';

import { MapPin, Users, Globe, ArrowLeft, Loader2, UserX, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useFriends } from "@/components/providers/FriendsProvider";

type FriendData = {
    id: string;
    name: string;
    status: string;  // User-set status: active, join me, ask me, busy
    state: string;   // Online state: online, active, offline
    statusMessage: string;
    icon: string;
    profilePicOverride: string;
    bio: string;
    bioLinks: string[];
    trust: string;
    location: string;
    world: {
        id: string;
        name: string;
        description: string;
        authorName: string;
        thumbnailImageUrl: string;
        imageUrl: string;
        capacity: number;
        occupants: number;
    } | null;
    instance: {
        type: string;
        region: string;
        id: string;
        ownerId: string | null;
        ownerName: string | null;
        groupId: string | null;
        groupName: string | null;
    };
    lastLogin: string;
    dateJoined: string;
    isFriend: boolean;
};

export default function FriendDetailsPage() {
    const params = useParams();
    const id = params.id as string;
    const { instances } = useFriends();

    const [friend, setFriend] = useState<FriendData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Find friends in the same instance
    const friendsInSameInstance = friend?.location && friend.location !== 'offline' && friend.location !== 'private'
        ? instances
            .flatMap(inst => inst.friends)
            .filter(f => f.location === friend.location && f.id !== friend.id)
        : [];

    useEffect(() => {
        const fetchFriend = async () => {
            setLoading(true);
            setError(null);

            try {
                const res = await fetch(`/api/friends/${id}`, {
                    credentials: 'include'
                });

                if (!res.ok) {
                    if (res.status === 401) {
                        setError('ログインが必要です');
                    } else if (res.status === 404) {
                        setError('ユーザーが見つかりません');
                    } else {
                        setError('データの取得に失敗しました');
                    }
                    return;
                }

                const data = await res.json();
                setFriend(data);
            } catch (e) {
                console.error('Failed to fetch friend:', e);
                setError('エラーが発生しました');
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchFriend();
        }
    }, [id]);

    // Get status color (VRChat status values)
    const getStatusColor = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s === 'join me') return 'bg-blue-500';
        if (s === 'ask me') return 'bg-orange-500';
        if (s === 'busy' || s === 'do not disturb') return 'bg-red-500';
        if (s === 'active' || s === 'online') return 'bg-green-500';
        return 'bg-slate-500'; // offline or unknown
    };

    // Get trust color (VRChat Trust System)
    const getTrustColor = (trust: string) => {
        switch (trust) {
            case 'Trusted User': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
            case 'Known User': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
            case 'User': return 'text-green-400 bg-green-500/10 border-green-500/20';
            case 'New User': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
            case 'Visitor': return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
            default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <p className="text-slate-400">Loading...</p>
            </div>
        );
    }

    if (error || !friend) {
        return (
            <div className="space-y-6 pb-20">
                <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Favorites
                </Link>
                <div className="glass-card rounded-xl p-12 text-center">
                    <UserX className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">エラー</h2>
                    <p className="text-slate-400">{error || 'ユーザーが見つかりません'}</p>
                </div>
            </div>
        );
    }

    const isOnline = friend.status !== 'offline' && friend.location !== 'offline';
    const isInWorld = friend.location && friend.location.startsWith('wrld_');
    const isPrivate = friend.location === 'private' || (friend.location && friend.location.includes('private'));

    return (
        <div className="space-y-6 pb-20">
            {/* Back Button */}
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Favorites
            </Link>

            {/* Profile Header */}
            <div className="relative rounded-2xl overflow-hidden glass-card group">
                {/* Banner */}
                <div className="h-48 bg-gradient-to-br from-indigo-900/50 to-slate-900 relative">
                    {friend.profilePicOverride && (
                        <img 
                            src={friend.profilePicOverride} 
                            alt="Banner" 
                            className="w-full h-full object-cover opacity-50" 
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] to-transparent opacity-80"></div>
                </div>

                <div className="px-6 pb-6 relative -mt-16 flex flex-col md:flex-row items-start md:items-end gap-6">
                    {/* Avatar */}
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full border-4 border-[#0f172a] bg-slate-800 overflow-hidden">
                            {friend.icon ? (
                                <img src={friend.icon} alt={friend.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl text-slate-500">
                                    {friend.name.charAt(0)}
                                </div>
                            )}
                        </div>
                        <div className={`absolute bottom-2 right-2 w-6 h-6 rounded-full border-4 border-[#0f172a] ${getStatusColor(friend.status)}`}></div>
                    </div>

                    {/* Name & Status */}
                    <div className="flex-1 mb-2">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-bold text-white">{friend.name}</h1>
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold border uppercase tracking-wider ${getTrustColor(friend.trust)}`}>
                                {friend.trust}
                            </span>
                        </div>
                        {friend.statusMessage && (
                            <p className="text-slate-300 mt-1">{friend.statusMessage}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-2 capitalize">
                            Status: {friend.status || 'offline'}
                        </p>
                    </div>

                </div>
            </div>

            {/* Links */}
            <div className="glass-card p-4 rounded-2xl">
                <div className="flex flex-wrap gap-2">
                    <a
                        href={`https://vrchat.com/home/user/${friend.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-sm font-medium transition-colors border border-indigo-500/30"
                    >
                        <ExternalLink className="w-4 h-4" />
                        VRChat Profile
                    </a>
                    {isInWorld && friend.world && (
                        <a
                            href={`https://vrchat.com/home/world/${friend.world.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 hover:text-cyan-200 text-sm font-medium transition-colors border border-cyan-500/30"
                        >
                            <Globe className="w-4 h-4" />
                            World Page
                        </a>
                    )}
                    {isInWorld && friend.location && (
                        <a
                            href={`https://vrchat.com/home/launch?worldId=${friend.location.split(':')[0]}&instanceId=${friend.location.split(':')[1]}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-300 hover:text-green-200 text-sm font-medium transition-colors border border-green-500/30"
                        >
                            <MapPin className="w-4 h-4" />
                            Join Instance
                        </a>
                    )}
                </div>
            </div>

            {/* Bio */}
            {friend.bio && (
                <div className="glass-card p-6 rounded-2xl">
                    <h3 className="text-lg font-bold text-white mb-3">Bio</h3>
                    <p className="text-slate-300 text-sm whitespace-pre-wrap">{friend.bio}</p>
                </div>
            )}

            {/* Social Links */}
            {friend.bioLinks && friend.bioLinks.length > 0 && (
                <div className="glass-card p-6 rounded-2xl">
                    <h3 className="text-lg font-bold text-white mb-3">Social Links</h3>
                    <div className="flex flex-wrap gap-2">
                        {friend.bioLinks.map((link, index) => {
                            // Extract service name from URL
                            let serviceName = 'Link';
                            let bgColor = 'bg-slate-500/20 hover:bg-slate-500/30 text-slate-300 border-slate-500/30';
                            
                            try {
                                const url = new URL(link);
                                const host = url.hostname.toLowerCase();
                                
                                if (host.includes('twitter.com') || host.includes('x.com')) {
                                    serviceName = 'Twitter / X';
                                    bgColor = 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/30';
                                } else if (host.includes('youtube.com') || host.includes('youtu.be')) {
                                    serviceName = 'YouTube';
                                    bgColor = 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/30';
                                } else if (host.includes('twitch.tv')) {
                                    serviceName = 'Twitch';
                                    bgColor = 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border-purple-500/30';
                                } else if (host.includes('discord.gg') || host.includes('discord.com')) {
                                    serviceName = 'Discord';
                                    bgColor = 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border-indigo-500/30';
                                } else if (host.includes('booth.pm')) {
                                    serviceName = 'BOOTH';
                                    bgColor = 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/30';
                                } else if (host.includes('github.com')) {
                                    serviceName = 'GitHub';
                                    bgColor = 'bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 border-gray-500/30';
                                } else if (host.includes('pixiv.net')) {
                                    serviceName = 'pixiv';
                                    bgColor = 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border-blue-500/30';
                                } else if (host.includes('instagram.com')) {
                                    serviceName = 'Instagram';
                                    bgColor = 'bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 border-pink-500/30';
                                } else if (host.includes('tiktok.com')) {
                                    serviceName = 'TikTok';
                                    bgColor = 'bg-black/40 hover:bg-black/50 text-white border-white/20';
                                } else if (host.includes('niconico') || host.includes('nicovideo.jp')) {
                                    serviceName = 'niconico';
                                    bgColor = 'bg-gray-600/20 hover:bg-gray-600/30 text-gray-300 border-gray-500/30';
                                } else if (host.includes('fanbox.cc')) {
                                    serviceName = 'FANBOX';
                                    bgColor = 'bg-red-400/20 hover:bg-red-400/30 text-red-300 border-red-400/30';
                                } else if (host.includes('patreon.com')) {
                                    serviceName = 'Patreon';
                                    bgColor = 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border-orange-500/30';
                                } else if (host.includes('lit.link')) {
                                    serviceName = 'lit.link';
                                    bgColor = 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border-yellow-500/30';
                                } else if (host.includes('linktr.ee')) {
                                    serviceName = 'Linktree';
                                    bgColor = 'bg-green-500/20 hover:bg-green-500/30 text-green-300 border-green-500/30';
                                } else {
                                    // Use domain name as service name
                                    serviceName = host.replace('www.', '').split('.')[0];
                                    serviceName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);
                                }
                            } catch {
                                serviceName = 'Link';
                            }
                            
                            return (
                                <a
                                    key={index}
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${bgColor}`}
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    {serviceName}
                                </a>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Current Location */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="glass-card p-6 rounded-2xl">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-indigo-400" /> Current World
                        </h3>

                        {!isOnline ? (
                            <div className="text-center py-8">
                                <p className="text-slate-500">This user is currently offline</p>
                            </div>
                        ) : isPrivate ? (
                            <div className="text-center py-8">
                                <p className="text-slate-500">This user is in a private world</p>
                            </div>
                        ) : friend.world ? (
                            <>
                                <div className="group relative rounded-xl overflow-hidden aspect-video bg-slate-800 mb-4">
                                    <img 
                                        src={friend.world.thumbnailImageUrl || friend.world.imageUrl} 
                                        alt={friend.world.name} 
                                        className="w-full h-full object-cover" 
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-6">
                                        <div>
                                            <h2 className="text-2xl font-bold text-white mb-1">{friend.world.name}</h2>
                                            <p className="text-sm text-slate-300">by {friend.world.authorName}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                        <p className="text-xs text-slate-400 uppercase">Instance</p>
                                        <p className="text-white font-medium mt-1">
                                            {friend.instance.type} {friend.instance.id && `#${friend.instance.id}`}
                                        </p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                        <p className="text-xs text-slate-400 uppercase">Region</p>
                                        <p className="text-white font-medium mt-1 flex items-center gap-2">
                                            <Globe className="w-4 h-4 text-slate-400" /> {friend.instance.region}
                                        </p>
                                    </div>
                                    {/* Show group name for group instances, or owner for other instances */}
                                    {friend.instance.groupName ? (
                                        <div className="p-3 rounded-xl bg-white/5 border border-white/5 col-span-2">
                                            <p className="text-xs text-slate-400 uppercase">Group</p>
                                            <p className="text-white font-medium mt-1">
                                                {friend.instance.groupName}
                                            </p>
                                        </div>
                                    ) : friend.instance.ownerName ? (
                                        <div className="p-3 rounded-xl bg-white/5 border border-white/5 col-span-2">
                                            <p className="text-xs text-slate-400 uppercase">Instance Owner</p>
                                            <p className="text-white font-medium mt-1">
                                                {friend.instance.ownerName}
                                            </p>
                                        </div>
                                    ) : null}
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-8">
                                <p className="text-slate-500">World information unavailable</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: People in Instance */}
                <div className="space-y-6">
                    <div className="glass-card p-6 rounded-2xl h-full">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-green-400" /> 
                            Friends Here ({friendsInSameInstance.length})
                        </h3>
                        <p className="text-sm text-slate-400 mb-6">
                            Other favorite friends in the same instance.
                        </p>

                        {friendsInSameInstance.length === 0 ? (
                            <div className="text-center py-4">
                                <p className="text-slate-500 text-sm">No other friends in this instance</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {friendsInSameInstance.map((f) => (
                                    <Link 
                                        key={f.id} 
                                        href={`/friends/${f.id}`}
                                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden">
                                            {f.icon ? (
                                                <img src={f.icon} alt={f.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-500">
                                                    {f.name?.charAt(0) || '?'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors truncate">
                                                {f.name}
                                            </p>
                                            <p className="text-xs text-green-400">In World</p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
