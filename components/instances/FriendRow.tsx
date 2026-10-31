'use client';

import { Clock, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { Friend } from '@/components/providers/FriendsProvider';
import { formatDuration, statusColorClass } from '@/lib/presence';

export function FriendRow({ friend, favorite }: { friend: Friend; favorite: boolean }) {
    return (
        <Link
            href={`/friends/${friend.id}`}
            className={`flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group/friend ${favorite ? '' : 'opacity-70 hover:opacity-100'}`}
        >
            <div className="relative">
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full bg-[var(--surface)] overflow-hidden ring-1 transition-all ${favorite ? 'ring-[var(--hover)]' : 'ring-[var(--line)] group-hover/friend:ring-[var(--hover)]'}`}>
                    {friend.icon ? (
                        <Image src={friend.icon} alt={friend.name} width={40} height={40} className="w-full h-full object-cover" unoptimized />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">IMG</div>
                    )}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${statusColorClass(friend.status)} border-2 border-[var(--bg)]`}></div>
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs md:text-sm font-medium truncate flex items-center gap-1 ${favorite ? 'text-slate-200 group-hover/friend:text-white' : 'text-slate-400 group-hover/friend:text-slate-200'}`}>
                        {friend.name}
                        {favorite && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                    </p>
                    {friend.joinedAt && (
                        <span className={`text-xs md:text-sm flex items-center gap-1 shrink-0 font-mono ${favorite ? 'text-slate-400' : 'text-slate-500'}`}>
                            <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" />
                            {formatDuration(friend.joinedAt)}
                        </span>
                    )}
                </div>
                {friend.statusMsg && (
                    <p className={`text-[10px] md:text-xs truncate mt-0.5 ${favorite ? 'text-slate-500' : 'text-slate-600'}`}>
                        {friend.statusMsg}
                    </p>
                )}
            </div>
        </Link>
    );
}
