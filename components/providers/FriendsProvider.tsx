'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Types
type Friend = {
    id: string;
    displayName: string;
    userIcon: string;
    status: string;
    location: string;
    worldName?: string;
    favoriteGroup?: string;  // e.g., "group_0", "group_1", etc.
    [key: string]: any;
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
    minFavoriteGroup: number;    // Minimum favorite group number (for sorting)
    creatorId?: string;
    creatorName?: string;
    worldImageUrl?: string;
    groupId?: string;
    groupName?: string;
    ownerId?: string;
    ownerName?: string;
};

interface FriendsContextType {
    instances: InstanceGroup[];
    loading: boolean;
    isAuthenticated: boolean;
    lastUpdated: Date | null;
    isRefreshing: boolean;
    refresh: () => void;
}

const FriendsContext = createContext<FriendsContextType>({
    instances: [],
    loading: true,
    isAuthenticated: false,
    lastUpdated: null,
    isRefreshing: false,
    refresh: () => { },
});

// Parse instance info from location string
// VRChat instance types:
// - Public: wrld_xxx:instanceId
// - Friends+: wrld_xxx:instanceId~hidden(usr_xxx)
// - Friends: wrld_xxx:instanceId~friends(usr_xxx)
// - Invite+: wrld_xxx:instanceId~private(usr_xxx)~canRequestInvite
// - Invite: wrld_xxx:instanceId~private(usr_xxx)
// - Group Public: wrld_xxx:instanceId~group(grp_xxx)~groupAccessType(public)
// - Group: wrld_xxx:instanceId~group(grp_xxx)~groupAccessType(members)
// - Group+: wrld_xxx:instanceId~group(grp_xxx)~groupAccessType(plus)
const parseInstanceInfo = (location: string) => {
    if (!location || location === 'offline' || location === 'private') return null;
    const parts = location.split(':');
    if (parts.length < 2) return { name: '', type: 'Public', region: 'US', creatorId: null, groupId: null };

    const raw = parts[1];
    const name = raw.split('~')[0];

    let type = 'Public';
    let creatorId: string | null = null;
    let groupId: string | null = null;

    // Extract user ID (instance creator)
    const usrMatch = raw.match(/\((usr_[^)]+)\)/);
    if (usrMatch) {
        creatorId = usrMatch[1];
    }

    // Extract group ID
    const grpMatch = raw.match(/~group\((grp_[^)]+)\)/);
    if (grpMatch) {
        groupId = grpMatch[1];
    }

    // Check for group instances first (they may also contain other keywords)
    if (raw.includes('~group(')) {
        if (raw.includes('groupAccessType(public)')) {
            type = 'Group Public';
        } else if (raw.includes('groupAccessType(plus)')) {
            type = 'Group+';
        } else if (raw.includes('groupAccessType(members)')) {
            type = 'Group';
        } else {
            type = 'Group';
        }
    } else if (raw.includes('~private(')) {
        if (raw.includes('~canRequestInvite')) {
            type = 'Invite+';
        } else {
            type = 'Invite';
        }
    } else if (raw.includes('~friends(')) {
        type = 'Friends';
    } else if (raw.includes('~hidden(')) {
        type = 'Friends+';
    }

    let region = 'US';
    const regionMatch = raw.match(/~region\(([^)]+)\)/);
    if (regionMatch) {
        const r = regionMatch[1].toLowerCase();
        if (r === 'jp') region = 'JP';
        else if (r === 'eu') region = 'EU';
        else if (r === 'use') region = 'US East';
        else if (r === 'usw') region = 'US West';
        else if (r === 'us') region = 'US';
    }

    return { name, type, region, creatorId, groupId };
};

export const FriendsProvider = ({ children }: { children: React.ReactNode }) => {
    const pathname = usePathname();
    const [instances, setInstances] = useState<InstanceGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Refs for logging diffs
    const previousFriendsRef = useRef<Map<string, any>>(new Map());
    const isFirstLoadRef = useRef(true);

    const fetchFriends = useCallback(async (isBackground = false) => {
        if (isBackground) {
            setIsRefreshing(true);
        } else {
            // Only set main loading on first load
            if (isFirstLoadRef.current) setLoading(true);
        }

        try {
            if (typeof window === 'undefined') return;
            // Authentication is handled via httpOnly cookies automatically
            // No need to manually send credentials from localStorage
            const res = await fetch('/api/friends/active', {
                credentials: 'include' // Ensure cookies are sent
            });

            if (res.ok) {
                const data = await res.json();
                setIsAuthenticated(true);

                // --- LOGGING LOGIC START ---
                const currentFriendsMap = new Map();
                if (data.friends && Array.isArray(data.friends)) {
                    data.friends.forEach((f: any) => currentFriendsMap.set(f.id, f));
                }

                if (!isFirstLoadRef.current) {
                    const newLogs: any[] = [];
                    const now = new Date();
                    const timeStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

                    // Check Online / Moved
                    currentFriendsMap.forEach((curr, id) => {
                        const prev = previousFriendsRef.current.get(id);
                        if (!prev) {
                            newLogs.push({
                                id: Date.now() + Math.random(),
                                date: timeStr,
                                type: 'OnLine',
                                user: curr.name,
                                detail: curr.worldName || 'Online',
                                color: 'text-green-400'
                            });
                        } else if (prev.location !== curr.location) {
                            newLogs.push({
                                id: Date.now() + Math.random(),
                                date: timeStr,
                                type: 'GPS', // Moved
                                user: curr.name,
                                detail: curr.worldName || 'Private',
                                color: 'text-orange-400'
                            });
                        }
                    });

                    // Check Offline
                    previousFriendsRef.current.forEach((prev, id) => {
                        if (!currentFriendsMap.has(id)) {
                            newLogs.push({
                                id: Date.now() + Math.random(),
                                date: timeStr,
                                type: 'Offline',
                                user: prev.name,
                                detail: 'Went Offline',
                                color: 'text-slate-500'
                            });
                        }
                    });

                    if (newLogs.length > 0) {
                        try {
                            const existing = JSON.parse(localStorage.getItem('vrc_logs') || '[]');
                            const updated = [...newLogs, ...existing].slice(0, 500);
                            localStorage.setItem('vrc_logs', JSON.stringify(updated));
                        } catch (e) {
                            console.error('Log save error', e);
                        }
                    }
                }
                previousFriendsRef.current = currentFriendsMap;
                isFirstLoadRef.current = false;
                // --- LOGGING LOGIC END ---

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
                            // Parse instance info from location
                            const info = parseInstanceInfo(loc);
                            
                            // Get owner name - from API response or from friends map
                            let ownerName = f.ownerName || undefined;
                            if (!ownerName && info && info.creatorId) {
                                ownerName = friendMap.get(info.creatorId);
                            }

                            grouped[loc] = {
                                id: loc,
                                worldName: f.worldName || (loc.includes('private') ? "Private World" : `World ${loc.split(':')[0]}`),
                                worldImageUrl: f.worldImageUrl,
                                instanceType: f.instanceType || info?.type || (f.isPrivate ? "Invite" : "Public"),
                                region: f.isPrivate || loc === 'private' || loc.includes('private') ? "" : (info?.region || "US"),
                                userCount: 0,
                                instanceUserCount: f.instanceUserCount || undefined,
                                friends: [],
                                otherFriends: [],
                                minFavoriteGroup: 999,  // Will be updated with actual min
                                creatorId: info?.creatorId || undefined,
                                creatorName: ownerName,
                                groupId: f.groupId || info?.groupId || undefined,
                                groupName: f.groupName || undefined,
                                ownerId: f.ownerId || info?.creatorId || undefined,
                                ownerName: ownerName,
                            };
                        }
                        // Separate favorite and non-favorite friends
                        if (f.isFavorite) {
                            grouped[loc].friends.push(f);
                            grouped[loc].userCount++;
                            // Track minimum favorite group number (e.g., "group_0" -> 0)
                            if (f.favoriteGroup) {
                                const groupNum = parseInt(f.favoriteGroup.replace('group_', ''), 10);
                                if (!isNaN(groupNum) && groupNum < grouped[loc].minFavoriteGroup) {
                                    grouped[loc].minFavoriteGroup = groupNum;
                                }
                            }
                        } else {
                            grouped[loc].otherFriends.push(f);
                        }
                    });
                }

                // Filter: Only show instances with at least one favorite friend
                // Sort: By favorite group (ascending), then by favorite count (descending)
                // Private instances at bottom
                const sortedInstances = Object.values(grouped)
                    .filter(inst => inst.userCount > 0)  // Only instances with favorites
                    .sort((a, b) => {
                        const aIsHidden = a.id === 'private' || a.worldName === 'Private World';
                        const bIsHidden = b.id === 'private' || b.worldName === 'Private World';

                        // Private instances at bottom
                        if (aIsHidden && !bIsHidden) return 1;
                        if (!aIsHidden && bIsHidden) return -1;

                        // Sort by minimum favorite group number (ascending)
                        // group_0 comes before group_1, etc.
                        if (a.minFavoriteGroup !== b.minFavoriteGroup) {
                            return a.minFavoriteGroup - b.minFavoriteGroup;
                        }

                        // Then sort by favorite count (descending)
                        return b.userCount - a.userCount;
                    });

                setInstances(sortedInstances);
                setLastUpdated(new Date());

            } else {
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
        const interval = setInterval(() => {
            fetchFriends(true);
        }, 60000); // 60s
        return () => clearInterval(interval);
    }, [fetchFriends, pathname]);

    return (
        <FriendsContext.Provider value={{ instances, loading, isAuthenticated, lastUpdated, isRefreshing, refresh: () => fetchFriends(true) }}>
            {children}
        </FriendsContext.Provider>
    );
};

export const useFriends = () => useContext(FriendsContext);
