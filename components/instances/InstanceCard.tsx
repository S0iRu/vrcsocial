'use client';

import { ExternalLink, Globe, User, Users } from 'lucide-react';
import Image from 'next/image';
import type { Friend, InstanceGroup } from '@/components/providers/FriendsProvider';
import { instanceTypePillClass } from '@/lib/presence';
import { vrchatWorldPageUrl } from '@/lib/vrcFields';
import { FriendRow } from './FriendRow';

export type InstanceCardModel = {
    id: string;
    worldName: string;
    worldImageUrl?: string;
    instanceType: string;
    region?: string;
    instanceDisplayName?: string | null;
    instanceDescription?: string | null;
    instanceCategory?: string | null;
    instanceVibes?: string[];
    instanceLanguages?: string[];
    groupName?: string;
    ownerName?: string;
    favoriteCount: number;
    trackedFriends: number;
    occupantCount?: number;
    capacity?: number;
    friends: Friend[];
    otherFriends: Friend[];
};

export function toInstanceCardModel(group: InstanceGroup): InstanceCardModel {
    const trackedFriends = group.friends.length + group.otherFriends.length;
    return {
        id: group.id,
        worldName: group.worldName,
        worldImageUrl: group.worldImageUrl,
        instanceType: group.instanceType,
        region: group.region,
        instanceDisplayName: group.instanceDisplayName,
        instanceDescription: group.instanceDescription,
        instanceCategory: group.instanceCategory,
        instanceVibes: group.instanceVibes,
        instanceLanguages: group.instanceLanguages,
        groupName: group.groupName,
        ownerName: group.ownerName,
        favoriteCount: group.userCount,
        trackedFriends,
        occupantCount: group.instanceUserCount,
        capacity: group.instanceCapacity,
        friends: group.friends,
        otherFriends: group.otherFriends,
    };
}

function WorldNameLink({ location, name }: { location: string; name: string }) {
    const worldUrl = vrchatWorldPageUrl(location);
    if (!worldUrl) {
        return <h3 className="text-base font-medium line-clamp-1">{name}</h3>;
    }

    return (
        <a
            href={worldUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-base font-medium hover:text-[var(--hover)] transition-colors inline-flex items-center gap-1.5 max-w-full"
            title="Open VRChat world page"
        >
            <span className="line-clamp-1">{name}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
        </a>
    );
}

export function InstanceCard({ group }: { group: InstanceCardModel }) {
    const users = Math.max(group.occupantCount ?? 0, group.trackedFriends);
    const isPrivate = group.id === 'private' || group.worldName === 'Private World';
    const shortId = group.id.split(':')[1]?.split('~')[0];

    return (
        <div className="glass-card glass-card-interactive overflow-hidden">
            <div className="p-4 md:p-5 border-b border-[var(--line)]">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-14 h-14 md:w-16 md:h-16 bg-[var(--surface)] flex items-center justify-center shrink-0 overflow-hidden relative border border-[var(--line)]">
                            {group.worldImageUrl ? (
                                <Image src={group.worldImageUrl} alt={group.worldName || 'World'} fill sizes="56px" className="object-cover" unoptimized />
                            ) : (
                                <Globe className="w-5 h-5 text-[var(--faint)]" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <WorldNameLink location={group.id} name={group.worldName} />
                            {group.instanceDisplayName && (
                                <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                                    {group.instanceDisplayName}
                                </p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className={`text-[10px] md:text-xs font-medium px-2 py-0.5 border border-[var(--line)] ${instanceTypePillClass(group.instanceType)}`}>
                                    {group.instanceType}
                                </span>
                                {group.instanceCategory && (
                                    <span className="text-[10px] md:text-xs text-violet-300 bg-violet-500/10 px-1.5 rounded">
                                        {group.instanceCategory}
                                    </span>
                                )}
                                {group.instanceVibes && group.instanceVibes.length > 0 && (
                                    <span className="text-[10px] md:text-xs text-fuchsia-300 bg-fuchsia-500/10 px-1.5 rounded">
                                        {group.instanceVibes.join(', ')}
                                    </span>
                                )}
                                {group.instanceLanguages && group.instanceLanguages.length > 0 && (
                                    <span className="text-[10px] md:text-xs text-slate-400 bg-white/5 px-1.5 rounded">
                                        {group.instanceLanguages.join(', ')}
                                    </span>
                                )}
                                {group.region && (
                                    <span className="text-[10px] md:text-xs text-slate-500 font-mono">
                                        {group.region}
                                    </span>
                                )}
                                {group.groupName && (
                                    <span className="text-[10px] md:text-xs text-[var(--hover)] px-1.5">
                                        Group: {group.groupName}
                                    </span>
                                )}
                                <span className="text-[10px] md:text-xs text-[var(--muted)] px-1.5 flex items-center gap-1">
                                    <User className="w-3 h-3" /> Host: {group.ownerName || '-'}
                                </span>
                                {!isPrivate && shortId && (
                                    <span className="text-[10px] md:text-xs text-slate-600 font-mono truncate max-w-[100px]">
                                        #{shortId}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <span
                        className="flex items-center gap-1.5 px-2 py-1 border border-[var(--line)] text-xs md:text-sm shrink-0 font-meta"
                        title={`${group.favoriteCount} favorites / ${group.trackedFriends} friends / ${users} users / ${group.capacity ?? '?'} capacity`}
                    >
                        <Users className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-400" />
                        ★{group.favoriteCount}/{group.trackedFriends}/{users}/{group.capacity ?? '-'}
                    </span>
                </div>
                {group.instanceDescription && (
                    <p className="text-[11px] md:text-xs text-slate-500 mt-3 line-clamp-2">
                        {group.instanceDescription}
                    </p>
                )}
            </div>

            <div className="p-2">
                {group.friends.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 md:gap-2">
                        {group.friends.map((friend) => (
                            <FriendRow key={friend.id} friend={friend} favorite />
                        ))}
                    </div>
                )}

                {group.friends.length > 0 && group.otherFriends.length > 0 && !isPrivate && (
                    <div className="flex items-center gap-2 my-2 px-2">
                        <div className="flex-1 h-px bg-[var(--line)]"></div>
                        <span className="kicker">Other Friends</span>
                        <div className="flex-1 h-px bg-[var(--line)]"></div>
                    </div>
                )}

                {group.otherFriends.length > 0 && !isPrivate && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 md:gap-2">
                        {group.otherFriends.map((friend) => (
                            <FriendRow key={friend.id} friend={friend} favorite={false} />
                        ))}
                    </div>
                )}

                {group.friends.length === 0 && group.otherFriends.length === 0 && (
                    <p className="px-3 py-4 text-xs text-[var(--faint)]">No friends here</p>
                )}
            </div>
        </div>
    );
}
