'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// Types
type Friend = {
    id: string;
    displayName?: string;
    name: string;
    userIcon?: string;
    icon?: string;
    status: string;
    statusMsg?: string;
    location: string;
    worldName?: string;
    worldImageUrl?: string;
    favoriteGroup?: string;
    joinedAt?: number;
    isPrivate?: boolean;
    isFavorite?: boolean;
    instanceType?: string;
    ownerId?: string;
    ownerName?: string;
    groupId?: string;
    groupName?: string;
    instanceUserCount?: number;
    last_login?: string;
    last_activity?: string;
};

type WorldInfo = {
    id: string;
    name: string;
    thumbnailImageUrl?: string;
    cachedAt: number;
};

type GroupInfo = {
    id: string;
    name: string;
    cachedAt: number;
};

type InstanceGroup = {
    id: string;
    worldName: string;
    instanceType: string;
    region: string;
    userCount: number;
    instanceUserCount?: number;
    friends: Friend[];
    otherFriends: Friend[];
    minFavoriteGroup: number;
    creatorId?: string;
    creatorName?: string;
    worldImageUrl?: string;
    groupId?: string;
    groupName?: string;
    ownerId?: string;
    ownerName?: string;
};

type TimestampEntry = {
    location: string;
    joinedAt: number;
};

type ActiveFriendsResponse = {
    friends?: Friend[];
    offlineFriends?: Friend[];
};

const WORLD_CACHE_TTL = 24 * 60 * 60 * 1000;
const GROUP_CACHE_TTL = 24 * 60 * 60 * 1000;
const INSTANCE_FETCH_DEBOUNCE = 3000;

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isTimestampEntry = (value: unknown): value is TimestampEntry => {
    if (!isObject(value)) return false;
    return typeof value.location === 'string' && typeof value.joinedAt === 'number';
};

const isWorldInfo = (value: unknown): value is WorldInfo => {
    if (!isObject(value)) return false;
    return typeof value.id === 'string' && typeof value.name === 'string' && typeof value.cachedAt === 'number';
};

const isPrivateLocation = (location: string): boolean =>
    location === 'private' || (location.startsWith('wrld_') && location.includes('~private('));

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface FriendsContextType {
    instances: InstanceGroup[];
    offlineFriends: Friend[];
    loading: boolean;
    isAuthenticated: boolean;
    lastUpdated: Date | null;
    wsConnectionState: ConnectionState;
    refresh: () => void;
}

const FriendsContext = createContext<FriendsContextType>({
    instances: [],
    offlineFriends: [],
    loading: true,
    isAuthenticated: false,
    lastUpdated: null,
    wsConnectionState: 'disconnected',
    refresh: () => { },
});

// Parse instance info from location string
const parseInstanceInfo = (location: string) => {
    if (!location || location === 'offline' || location === 'private' || location === 'traveling') return null;
    const parts = location.split(':');
    if (parts.length < 2) return { name: '', type: 'Public', region: 'US', creatorId: null, groupId: null };

    const raw = parts[1];
    const name = raw.split('~')[0];

    let type = 'Public';
    let creatorId: string | null = null;
    let groupId: string | null = null;

    const usrMatch = raw.match(/\((usr_[^)]+)\)/);
    if (usrMatch) creatorId = usrMatch[1];

    const grpMatch = raw.match(/~group\((grp_[^)]+)\)/);
    if (grpMatch) groupId = grpMatch[1];

    if (raw.includes('~group(')) {
        if (raw.includes('groupAccessType(public)')) type = 'Group Public';
        else if (raw.includes('groupAccessType(plus)')) type = 'Group+';
        else if (raw.includes('groupAccessType(members)')) type = 'Group';
        else type = 'Group';
    } else if (raw.includes('~private(')) {
        type = raw.includes('~canRequestInvite') ? 'Invite+' : 'Invite';
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
    }

    return { name, type, region, creatorId, groupId };
};

// Convert VRChat API instance type to display type
const convertInstanceType = (apiType: string | undefined): string => {
    if (!apiType) return 'Public';
    switch (apiType.toLowerCase()) {
        case 'public': return 'Public';
        case 'friends': return 'Friends';
        case 'hidden': return 'Friends+';
        case 'private': return 'Invite';
        case 'invite': return 'Invite';
        case 'inviteplus': return 'Invite+';
        case 'group': return 'Group';
        default: return apiType;
    }
};

// Helper to add a log entry
const addLogEntry = (type: string, user: string, detail: string, color: string) => {
    const now = new Date();
    const timeStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const newLog = {
        id: Date.now() + Math.random(),
        date: timeStr,
        type,
        user,
        detail,
        color
    };

    try {
        const existing = JSON.parse(localStorage.getItem('vrc_logs') || '[]');
        const updated = [newLog, ...existing].slice(0, 500);
        localStorage.setItem('vrc_logs', JSON.stringify(updated));
    } catch (error: unknown) {
        console.error('Log save error', error);
    }
};

export const FriendsProvider = ({ children }: { children: React.ReactNode }) => {
    const [instances, setInstances] = useState<InstanceGroup[]>([]);
    const [offlineFriends, setOfflineFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [wsConnectionState, setWsConnectionState] = useState<ConnectionState>('disconnected');

    // Refs for data management
    const friendsDataRef = useRef<Map<string, Friend>>(new Map());
    const offlineFriendsRef = useRef<Map<string, Friend>>(new Map());
    const favoriteIdsRef = useRef<Set<string>>(new Set());
    const favoriteGroupsRef = useRef<Map<string, string>>(new Map());
    const locationTimestampsRef = useRef<Map<string, TimestampEntry>>(new Map());
    const worldCacheRef = useRef<Map<string, WorldInfo>>(new Map());
    const groupCacheRef = useRef<Map<string, GroupInfo>>(new Map());
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isFirstLoadRef = useRef(true);
    const lastConnectedRef = useRef<number>(0);
    const pendingInstanceFetchesRef = useRef<Set<string>>(new Set());

    // Load cached data from localStorage
    useEffect(() => {
        try {
            const savedTimestamps = localStorage.getItem('vrc_location_timestamps');
            if (savedTimestamps) {
                const parsed: unknown = JSON.parse(savedTimestamps);
                if (isObject(parsed)) {
                    Object.entries(parsed).forEach(([id, data]) => {
                        if (isTimestampEntry(data)) {
                            locationTimestampsRef.current.set(id, data);
                        }
                    });
                }
            }

            const savedWorldCache = localStorage.getItem('vrc_world_cache');
            if (savedWorldCache) {
                const parsed: unknown = JSON.parse(savedWorldCache);
                const now = Date.now();
                if (isObject(parsed)) {
                    Object.entries(parsed).forEach(([id, data]) => {
                        if (isWorldInfo(data) && (now - data.cachedAt) < WORLD_CACHE_TTL) {
                            worldCacheRef.current.set(id, data);
                        }
                    });
                }
            }
        } catch (error: unknown) {
            console.error('[FriendsProvider] Failed to load cached data:', error);
        }
    }, []);

    // Save functions
    const saveTimestamps = useCallback(() => {
        try {
            const obj: Record<string, TimestampEntry> = {};
            locationTimestampsRef.current.forEach((data, id) => obj[id] = data);
            localStorage.setItem('vrc_location_timestamps', JSON.stringify(obj));
        } catch (error: unknown) { console.error('Failed to save timestamps:', error); }
    }, []);

    const saveWorldCache = useCallback(() => {
        try {
            const obj: Record<string, WorldInfo> = {};
            worldCacheRef.current.forEach((data, id) => obj[id] = data);
            localStorage.setItem('vrc_world_cache', JSON.stringify(obj));
        } catch (error: unknown) { console.error('Failed to save world cache:', error); }
    }, []);

    // Rebuild offline friends list from ref
    const rebuildOfflineFriends = useCallback(() => {
        const sorted = Array.from(offlineFriendsRef.current.values())
            .sort((a, b) => {
                const aGroup = parseInt(a.favoriteGroup?.replace('group_', '') || '999', 10);
                const bGroup = parseInt(b.favoriteGroup?.replace('group_', '') || '999', 10);
                return aGroup - bGroup;
            });
        setOfflineFriends(sorted);
    }, []);

    // Fetch world info
    const fetchWorldInfo = useCallback(async (worldId: string): Promise<WorldInfo | null> => {
        const cached = worldCacheRef.current.get(worldId);
        if (cached && (Date.now() - cached.cachedAt) < WORLD_CACHE_TTL) return cached;

        try {
            const res = await fetch(`/api/worlds/${worldId}`, { credentials: 'include' });
            if (res.ok) {
                const data: unknown = await res.json();
                if (!isObject(data) || typeof data.id !== 'string' || typeof data.name !== 'string') {
                    return null;
                }
                const worldInfo: WorldInfo = {
                    id: data.id,
                    name: data.name,
                    thumbnailImageUrl: typeof data.thumbnailImageUrl === 'string' ? data.thumbnailImageUrl : undefined,
                    cachedAt: Date.now()
                };
                worldCacheRef.current.set(worldId, worldInfo);
                saveWorldCache();
                return worldInfo;
            }
        } catch (error: unknown) { console.error(`Failed to fetch world ${worldId}:`, error); }
        return null;
    }, [saveWorldCache]);

    // Fetch group info
    const fetchGroupInfo = useCallback(async (groupId: string): Promise<GroupInfo | null> => {
        const cached = groupCacheRef.current.get(groupId);
        if (cached && (Date.now() - cached.cachedAt) < GROUP_CACHE_TTL) return cached;

        try {
            const res = await fetch(`/api/groups/${groupId}`, { credentials: 'include' });
            if (res.ok) {
                const data: unknown = await res.json();
                if (!isObject(data) || typeof data.name !== 'string') return null;
                const groupInfo: GroupInfo = {
                    id: typeof data.id === 'string' ? data.id : groupId,
                    name: data.name,
                    cachedAt: Date.now()
                };
                groupCacheRef.current.set(groupId, groupInfo);
                return groupInfo;
            }
        } catch (error: unknown) { console.error(`Failed to fetch group ${groupId}:`, error); }
        return null;
    }, []);

    // Fetch instance info (debounced per location)
    const fetchInstanceInfo = useCallback(async (location: string) => {
        if (pendingInstanceFetchesRef.current.has(location)) return;
        pendingInstanceFetchesRef.current.add(location);

        setTimeout(async () => {
            try {
                const res = await fetch(`/api/instances?location=${encodeURIComponent(location)}`, { credentials: 'include' });
                if (res.ok) {
                    const data: unknown = await res.json();
                    if (!isObject(data)) return;

                    const userCount = typeof data.n_users === 'number' ? data.n_users
                        : typeof data.userCount === 'number' ? data.userCount : undefined;
                    const instanceType = typeof data.type === 'string' ? convertInstanceType(data.type) : undefined;
                    const ownerId = typeof data.ownerId === 'string' ? data.ownerId : undefined;
                    const ownerName = typeof data.ownerName === 'string' ? data.ownerName : undefined;

                    let updated = false;
                    friendsDataRef.current.forEach((f, id) => {
                        if (f.location === location) {
                            const patch: Partial<Friend> = {};
                            if (userCount != null) patch.instanceUserCount = userCount;
                            if (instanceType) patch.instanceType = instanceType;
                            if (ownerId && !f.ownerId) patch.ownerId = ownerId;
                            if (ownerName && !f.ownerName) patch.ownerName = ownerName;
                            if (Object.keys(patch).length > 0) {
                                friendsDataRef.current.set(id, { ...f, ...patch });
                                updated = true;
                            }
                        }
                    });

                    if (updated) rebuildInstances();
                }
            } catch (error: unknown) {
                console.error(`Failed to fetch instance ${location}:`, error);
            } finally {
                pendingInstanceFetchesRef.current.delete(location);
            }
        }, INSTANCE_FETCH_DEBOUNCE);
    }, []); // rebuildInstances added below via ref pattern

    // Rebuild instances from friendsDataRef
    const rebuildInstances = useCallback(() => {
        const grouped: Record<string, InstanceGroup> = {};
        const friendMap = new Map<string, string>();
        const now = Date.now();

        friendsDataRef.current.forEach((f, id) => friendMap.set(id, f.name || f.displayName || id));

        friendsDataRef.current.forEach((f) => {
            const loc = f.location || "offline";
            if (loc === "offline") return;

            // Handle traveling state - group all traveling friends together
            const effectiveLoc = loc === "traveling" ? "traveling" : loc;

            if (!grouped[effectiveLoc]) {
                const info = parseInstanceInfo(loc);
                let ownerName = f.ownerName || undefined;
                if (!ownerName && info?.creatorId) ownerName = friendMap.get(info.creatorId);

                const isTraveling = effectiveLoc === "traveling";
                
                grouped[effectiveLoc] = {
                    id: effectiveLoc,
                    worldName: isTraveling ? "Traveling" : (f.worldName || (loc.includes('private') ? "Private World" : `World ${loc.split(':')[0]}`)),
                    worldImageUrl: isTraveling ? undefined : f.worldImageUrl,
                    instanceType: isTraveling ? "Traveling" : (f.instanceType || info?.type || "Public"),
                    region: isTraveling ? "" : (isPrivateLocation(loc) ? "" : (info?.region || "US")),
                    userCount: 0,
                    instanceUserCount: isTraveling ? undefined : f.instanceUserCount,
                    friends: [],
                    otherFriends: [],
                    minFavoriteGroup: 999,
                    creatorId: isTraveling ? undefined : (info?.creatorId ?? undefined),
                    creatorName: isTraveling ? undefined : ownerName,
                    groupId: isTraveling ? undefined : (f.groupId || (info?.groupId ?? undefined)),
                    groupName: isTraveling ? undefined : f.groupName,
                    ownerId: isTraveling ? undefined : (f.ownerId || (info?.creatorId ?? undefined)),
                    ownerName: isTraveling ? undefined : ownerName,
                };
            } else {
                const g = grouped[effectiveLoc];
                if (f.instanceType && f.instanceType !== 'Public') {
                    g.instanceType = f.instanceType;
                }
                if (!g.worldName || g.worldName.startsWith('World ')) {
                    if (f.worldName && !f.worldName.startsWith('World ')) g.worldName = f.worldName;
                }
                if (!g.worldImageUrl && f.worldImageUrl) g.worldImageUrl = f.worldImageUrl;
                if (f.instanceUserCount != null) {
                    g.instanceUserCount = Math.max(g.instanceUserCount ?? 0, f.instanceUserCount);
                }
                if (!g.groupName && f.groupName) g.groupName = f.groupName;
                if (!g.ownerId && f.ownerId) g.ownerId = f.ownerId;
                if (!g.ownerName) {
                    g.ownerName = f.ownerName || (g.ownerId ? friendMap.get(g.ownerId) : undefined);
                }
                if (!g.groupId && f.groupId) g.groupId = f.groupId;
                if (g.ownerName) g.creatorName = g.ownerName;
            }

            const timestampData = locationTimestampsRef.current.get(f.id);
            const friendWithTimestamp = { ...f, joinedAt: timestampData?.joinedAt || now };

            if (f.isFavorite) {
                grouped[effectiveLoc].friends.push(friendWithTimestamp);
                grouped[effectiveLoc].userCount++;
                if (f.favoriteGroup) {
                    const groupNum = parseInt(f.favoriteGroup.replace('group_', ''), 10);
                    if (!isNaN(groupNum) && groupNum < grouped[effectiveLoc].minFavoriteGroup) {
                        grouped[effectiveLoc].minFavoriteGroup = groupNum;
                    }
                }
            } else {
                grouped[effectiveLoc].otherFriends.push(friendWithTimestamp);
            }
        });

        // Sort friends within each instance: owner first, then by stay duration (longest first)
        Object.values(grouped).forEach(inst => {
            const sortFriends = (friends: typeof inst.friends) => {
                return friends.sort((a, b) => {
                    const aIsOwner = inst.ownerId && a.id === inst.ownerId;
                    const bIsOwner = inst.ownerId && b.id === inst.ownerId;
                    if (aIsOwner && !bIsOwner) return -1;
                    if (!aIsOwner && bIsOwner) return 1;
                    const aJoined = a.joinedAt || now;
                    const bJoined = b.joinedAt || now;
                    return aJoined - bJoined;
                });
            };
            inst.friends = sortFriends(inst.friends);
            inst.otherFriends = sortFriends(inst.otherFriends);
        });

        const sortedInstances = Object.values(grouped)
            .filter(inst => inst.userCount > 0)
            .sort((a, b) => {
                const aIsHidden = a.id === 'private' || a.worldName === 'Private World';
                const bIsHidden = b.id === 'private' || b.worldName === 'Private World';
                const aIsTraveling = a.id === 'traveling';
                const bIsTraveling = b.id === 'traveling';
                if (aIsTraveling && !bIsTraveling && !bIsHidden) return 1;
                if (!aIsTraveling && bIsTraveling && !aIsHidden) return -1;
                if (aIsTraveling && bIsHidden) return -1;
                if (aIsHidden && bIsTraveling) return 1;
                if (aIsHidden && !bIsHidden) return 1;
                if (!aIsHidden && bIsHidden) return -1;
                if (!aIsHidden && !bIsHidden) {
                    const getOldestFavoriteJoinTime = (inst: typeof a) => {
                        const times = inst.friends.map(f => f.joinedAt || now);
                        return times.length > 0 ? Math.min(...times) : now;
                    };
                    const aOldestJoin = getOldestFavoriteJoinTime(a);
                    const bOldestJoin = getOldestFavoriteJoinTime(b);
                    if (aOldestJoin !== bOldestJoin) return aOldestJoin - bOldestJoin;
                }
                if (a.minFavoriteGroup !== b.minFavoriteGroup) return a.minFavoriteGroup - b.minFavoriteGroup;
                return b.userCount - a.userCount;
            });

        setInstances(sortedInstances);
        setLastUpdated(new Date());
    }, []);

    // Enrich friend data with group name and instance info after location change
    const enrichFriendData = useCallback(async (userId: string, location: string) => {
        const info = parseInstanceInfo(location);
        let needsRebuild = false;

        // Fetch group name if groupId is present but groupName is missing
        if (info?.groupId) {
            const friend = friendsDataRef.current.get(userId);
            if (friend && !friend.groupName) {
                const groupInfo = await fetchGroupInfo(info.groupId);
                if (groupInfo) {
                    const current = friendsDataRef.current.get(userId);
                    if (current?.location === location) {
                        friendsDataRef.current.set(userId, { ...current, groupName: groupInfo.name });
                        needsRebuild = true;
                    }
                }
            }
        }

        // Fetch instance info for user count and owner
        if (location.startsWith('wrld_') && location.includes(':')) {
            fetchInstanceInfo(location);
        }

        if (needsRebuild) rebuildInstances();
    }, [fetchGroupInfo, fetchInstanceInfo, rebuildInstances]);

    // Fetch initial friends data
    const fetchFriends = useCallback(async () => {
        try {
            const res = await fetch('/api/friends/active', { credentials: 'include' });
            if (res.ok) {
                const data: ActiveFriendsResponse = await res.json();
                setIsAuthenticated(true);
                isAuthenticatedRef.current = true;

                const currentFriendsMap = new Map<string, Friend>();
                (data.friends || []).forEach((f) => {
                    if (f?.id) {
                        currentFriendsMap.set(f.id, f);
                    }
                });

                const now = Date.now();
                let worldCacheChanged = false;

                favoriteIdsRef.current.clear();
                favoriteGroupsRef.current.clear();

                currentFriendsMap.forEach((f, id) => {
                    if (f.isFavorite) {
                        favoriteIdsRef.current.add(id);
                        if (f.favoriteGroup) favoriteGroupsRef.current.set(id, f.favoriteGroup);
                    }

                    const existing = locationTimestampsRef.current.get(id);
                    if (!existing || existing.location !== f.location) {
                        locationTimestampsRef.current.set(id, { location: f.location, joinedAt: now });
                    }

                    if (f.location?.startsWith('wrld_') && f.worldName) {
                        const worldId = f.location.split(':')[0];
                        const cachedWorld = worldCacheRef.current.get(worldId);
                        if (!cachedWorld || (now - cachedWorld.cachedAt) > WORLD_CACHE_TTL) {
                            worldCacheRef.current.set(worldId, {
                                id: worldId,
                                name: f.worldName,
                                thumbnailImageUrl: f.worldImageUrl,
                                cachedAt: now
                            });
                            worldCacheChanged = true;
                        }
                    }
                });

                friendsDataRef.current = currentFriendsMap;
                saveTimestamps();
                if (worldCacheChanged) saveWorldCache();
                rebuildInstances();
                isFirstLoadRef.current = false;

                // Build offline friends ref
                offlineFriendsRef.current.clear();

                (data.offlineFriends || []).forEach((f) => {
                    if (!f?.id) return;
                    offlineFriendsRef.current.set(f.id, {
                        id: f.id,
                        name: f.name || f.displayName || 'Unknown',
                        displayName: f.name || f.displayName,
                        userIcon: f.icon || f.userIcon,
                        status: f.status || 'offline',
                        location: 'offline',
                        worldName: 'Offline',
                        favoriteGroup: f.favoriteGroup,
                        isFavorite: true,
                        last_login: f.last_login,
                        last_activity: f.last_activity,
                    });
                });

                (data.friends || []).forEach((f) => {
                    if (f.isFavorite && f.location === 'offline') {
                        offlineFriendsRef.current.set(f.id, {
                            id: f.id,
                            name: f.name || f.displayName || 'Unknown',
                            displayName: f.name || f.displayName,
                            userIcon: f.icon || f.userIcon,
                            status: f.status || 'active',
                            location: 'offline',
                            worldName: 'Offline',
                            favoriteGroup: f.favoriteGroup,
                            isFavorite: true,
                        });
                    }
                });

                rebuildOfflineFriends();

            } else {
                setIsAuthenticated(false);
                isAuthenticatedRef.current = false;
                setInstances([]);
                offlineFriendsRef.current.clear();
                setOfflineFriends([]);
            }
        } catch (error: unknown) {
            console.error(error);
            isAuthenticatedRef.current = false;
            setInstances([]);
        } finally {
            setLoading(false);
        }
    }, [rebuildInstances, rebuildOfflineFriends, saveTimestamps, saveWorldCache]);

    // Handle SSE events
    const handleSSEEvent = useCallback(async (eventType: string, data: unknown) => {
        if (!isObject(data)) return;
        const now = Date.now();

        switch (eventType) {
            case 'friend-online': {
                const userId = typeof data.userId === 'string' ? data.userId : null;
                const location = typeof data.location === 'string' ? data.location : null;
                const user = isObject(data.user) ? data.user : null;
                if (!userId || !location || !user || typeof user.displayName !== 'string') break;
                const isFavorite = favoriteIdsRef.current.has(userId);
                const favoriteGroup = favoriteGroupsRef.current.get(userId);

                const world = isObject(data.world) ? data.world : null;
                let worldName = typeof world?.name === 'string' ? world.name : undefined;
                let worldImageUrl = typeof world?.thumbnailImageUrl === 'string' ? world.thumbnailImageUrl : undefined;

                if (!worldName && location.startsWith('wrld_')) {
                    const worldId = location.split(':')[0];
                    const cached = worldCacheRef.current.get(worldId);
                    if (cached) {
                        worldName = cached.name;
                        worldImageUrl = cached.thumbnailImageUrl;
                    } else {
                        fetchWorldInfo(worldId).then((info) => {
                            if (info) {
                                const friend = friendsDataRef.current.get(userId);
                                if (friend?.location === location) {
                                    friend.worldName = info.name;
                                    friend.worldImageUrl = info.thumbnailImageUrl;
                                    friendsDataRef.current.set(userId, friend);
                                    rebuildInstances();
                                }
                            }
                        });
                    }
                }

                const info = parseInstanceInfo(location);
                const instanceType = info?.type || 'Public';

                friendsDataRef.current.set(userId, {
                    id: userId,
                    name: user.displayName,
                    status: typeof user.status === 'string' ? user.status : 'active',
                    statusMsg: typeof user.statusDescription === 'string' ? user.statusDescription : undefined,
                    icon: (typeof user.userIcon === 'string' && user.userIcon)
                        || (typeof user.profilePicOverride === 'string' && user.profilePicOverride)
                        || (typeof user.currentAvatarThumbnailImageUrl === 'string' && user.currentAvatarThumbnailImageUrl)
                        || '',
                    location,
                    worldName: worldName || (location === 'private' ? 'Private World' : undefined),
                    worldImageUrl,
                    isPrivate: isPrivateLocation(location),
                    isFavorite,
                    favoriteGroup,
                    instanceType,
                    ownerId: info?.creatorId ?? undefined,
                    groupId: info?.groupId ?? undefined,
                });

                locationTimestampsRef.current.set(userId, { location, joinedAt: now });
                saveTimestamps();

                // Remove from offline list
                if (offlineFriendsRef.current.delete(userId)) {
                    rebuildOfflineFriends();
                }

                if (isFavorite) {
                    addLogEntry('OnLine', user.displayName, worldName || 'Online', 'text-green-400');
                }
                rebuildInstances();

                enrichFriendData(userId, location);
                break;
            }

            case 'friend-offline': {
                const userId = typeof data.userId === 'string' ? data.userId : null;
                if (!userId) break;
                const friend = friendsDataRef.current.get(userId);

                if (friend?.isFavorite) {
                    addLogEntry('Offline', friend.name || friend.displayName || userId, 'Went Offline', 'text-slate-500');
                    offlineFriendsRef.current.set(userId, {
                        ...friend,
                        location: 'offline',
                        worldName: 'Offline',
                        status: 'offline',
                    });
                    rebuildOfflineFriends();
                }

                friendsDataRef.current.delete(userId);
                locationTimestampsRef.current.delete(userId);
                saveTimestamps();
                rebuildInstances();
                break;
            }

            case 'friend-location': {
                const userId = typeof data.userId === 'string' ? data.userId : null;
                const location = typeof data.location === 'string' ? data.location : null;
                const user = isObject(data.user) ? data.user : null;
                if (!userId || !location || !user || typeof user.displayName !== 'string') break;
                const existingFriend = friendsDataRef.current.get(userId);
                const isFavorite = existingFriend?.isFavorite ?? favoriteIdsRef.current.has(userId);
                const favoriteGroup = existingFriend?.favoriteGroup ?? favoriteGroupsRef.current.get(userId);
                const previousLocation = existingFriend?.location;
                const hasLocationChanged = previousLocation !== location;

                const prevWorldName = existingFriend?.worldName || 'Unknown';

                const world = isObject(data.world) ? data.world : null;
                let worldName = typeof world?.name === 'string' ? world.name : undefined;
                let worldImageUrl = typeof world?.thumbnailImageUrl === 'string' ? world.thumbnailImageUrl : undefined;

                if (!worldName && location.startsWith('wrld_')) {
                    const worldId = location.split(':')[0];
                    const cached = worldCacheRef.current.get(worldId);
                    if (cached) {
                        worldName = cached.name;
                        worldImageUrl = cached.thumbnailImageUrl;
                    } else {
                        fetchWorldInfo(worldId).then((info) => {
                            if (info) {
                                const friend = friendsDataRef.current.get(userId);
                                if (friend?.location === location) {
                                    friend.worldName = info.name;
                                    friend.worldImageUrl = info.thumbnailImageUrl;
                                    friendsDataRef.current.set(userId, friend);
                                    rebuildInstances();
                                }
                            }
                        });
                    }
                }

                const info = parseInstanceInfo(location);
                const instanceType = info?.type || 'Public';

                // Handle offline transition for favorites
                if (location === 'offline' && isFavorite) {
                    offlineFriendsRef.current.set(userId, {
                        ...existingFriend,
                        id: userId,
                        name: user.displayName,
                        location: 'offline',
                        worldName: 'Offline',
                        status: typeof user.status === 'string' ? user.status : existingFriend?.status || 'offline',
                        isFavorite: true,
                        favoriteGroup,
                    });
                    rebuildOfflineFriends();
                } else if (offlineFriendsRef.current.delete(userId)) {
                    rebuildOfflineFriends();
                }

                friendsDataRef.current.set(userId, {
                    ...existingFriend,
                    id: userId,
                    name: user.displayName,
                    status: (typeof user.status === 'string' && user.status) || existingFriend?.status || 'active',
                    statusMsg: (typeof user.statusDescription === 'string' && user.statusDescription) || existingFriend?.statusMsg,
                    icon: (typeof user.userIcon === 'string' && user.userIcon)
                        || (typeof user.profilePicOverride === 'string' && user.profilePicOverride)
                        || (typeof user.currentAvatarThumbnailImageUrl === 'string' && user.currentAvatarThumbnailImageUrl)
                        || existingFriend?.icon
                        || '',
                    location,
                    worldName: worldName || (location === 'private' ? 'Private World' : undefined),
                    worldImageUrl,
                    isPrivate: isPrivateLocation(location),
                    isFavorite,
                    favoriteGroup,
                    instanceType,
                    ownerId: info?.creatorId ?? undefined,
                    groupId: info?.groupId ?? undefined,
                });

                if (hasLocationChanged) {
                    locationTimestampsRef.current.set(userId, { location, joinedAt: now });
                    saveTimestamps();
                }

                if (isFavorite && hasLocationChanged) {
                    const newWorldName = worldName || (location === 'private' ? 'Private World' : existingFriend?.worldName || 'Unknown');
                    const logDetail = `${prevWorldName} → ${newWorldName}`;
                    addLogEntry('GPS', user.displayName, logDetail, 'text-orange-400');
                }
                rebuildInstances();

                if (hasLocationChanged && location !== 'offline' && location !== 'private' && location !== 'traveling') {
                    enrichFriendData(userId, location);
                }
                break;
            }

            case 'friend-update': {
                const userId = typeof data.userId === 'string' ? data.userId : null;
                const user = isObject(data.user) ? data.user : null;
                if (!userId || !user || typeof user.displayName !== 'string') break;
                const existingFriend = friendsDataRef.current.get(userId);

                const newIcon = (typeof user.userIcon === 'string' && user.userIcon)
                    || (typeof user.profilePicOverride === 'string' && user.profilePicOverride)
                    || (typeof user.currentAvatarThumbnailImageUrl === 'string' && user.currentAvatarThumbnailImageUrl)
                    || undefined;
                const newStatus = typeof user.status === 'string' ? user.status : undefined;
                const newStatusMsg = typeof user.statusDescription === 'string' ? user.statusDescription : undefined;

                if (existingFriend) {
                    const isFavorite = existingFriend.isFavorite;
                    const prevStatus = existingFriend.status;
                    const prevStatusMsg = existingFriend.statusMsg;

                    if (isFavorite && prevStatus && newStatus && prevStatus !== newStatus) {
                        addLogEntry('Status', user.displayName, `${prevStatus} → ${newStatus}`, 'text-cyan-400');
                    }

                    if (isFavorite && prevStatusMsg !== (newStatusMsg ?? existingFriend.statusMsg) && (newStatusMsg ?? existingFriend.statusMsg)) {
                        addLogEntry('StatusMsg', user.displayName, newStatusMsg ?? existingFriend.statusMsg ?? '', 'text-purple-400');
                    }

                    friendsDataRef.current.set(userId, {
                        ...existingFriend,
                        name: user.displayName,
                        status: newStatus || existingFriend.status,
                        statusMsg: newStatusMsg ?? existingFriend.statusMsg,
                        icon: newIcon || existingFriend.icon,
                    });
                    rebuildInstances();
                }

                // Also update offline friends ref
                const offlineFriend = offlineFriendsRef.current.get(userId);
                if (offlineFriend) {
                    offlineFriendsRef.current.set(userId, {
                        ...offlineFriend,
                        name: user.displayName,
                        displayName: user.displayName,
                        status: newStatus || offlineFriend.status,
                        statusMsg: newStatusMsg ?? offlineFriend.statusMsg,
                        icon: newIcon || offlineFriend.icon,
                        userIcon: newIcon || offlineFriend.userIcon,
                    });
                    rebuildOfflineFriends();
                }
                break;
            }

            case 'friend-active': {
                // friend-active uses 'userid' (lowercase d) and has no location
                const userId = typeof data.userid === 'string' ? data.userid
                    : typeof data.userId === 'string' ? data.userId
                    : null;
                const user = isObject(data.user) ? data.user : null;
                if (!userId || !user) break;

                // Web active only - update status if friend is already tracked
                const existing = friendsDataRef.current.get(userId);
                if (existing) {
                    const newStatus = typeof user.status === 'string' ? user.status : undefined;
                    if (newStatus && newStatus !== existing.status) {
                        friendsDataRef.current.set(userId, { ...existing, status: newStatus });
                        rebuildInstances();
                    }
                }
                break;
            }

            case 'friend-add': {
                const userId = typeof data.userId === 'string' ? data.userId : null;
                const user = isObject(data.user) ? data.user : null;
                if (!userId) break;

                if (user && typeof user.displayName === 'string') {
                    const location = typeof user.location === 'string' ? user.location : 'offline';
                    if (location !== 'offline') {
                        friendsDataRef.current.set(userId, {
                            id: userId,
                            name: user.displayName,
                            status: typeof user.status === 'string' ? user.status : 'active',
                            location,
                            isFavorite: favoriteIdsRef.current.has(userId),
                            favoriteGroup: favoriteGroupsRef.current.get(userId),
                            icon: (typeof user.userIcon === 'string' && user.userIcon)
                                || (typeof user.profilePicOverride === 'string' && user.profilePicOverride)
                                || (typeof user.currentAvatarThumbnailImageUrl === 'string' && user.currentAvatarThumbnailImageUrl)
                                || '',
                        });
                        rebuildInstances();
                    }
                }
                break;
            }

            case 'friend-delete': {
                const userId = typeof data.userId === 'string' ? data.userId : null;
                if (!userId) break;

                friendsDataRef.current.delete(userId);
                locationTimestampsRef.current.delete(userId);
                if (offlineFriendsRef.current.delete(userId)) {
                    rebuildOfflineFriends();
                }
                favoriteIdsRef.current.delete(userId);
                favoriteGroupsRef.current.delete(userId);
                saveTimestamps();
                rebuildInstances();
                break;
            }
        }
    }, [rebuildInstances, rebuildOfflineFriends, saveTimestamps, fetchWorldInfo, enrichFriendData]);

    // Ref for fetchFriends to avoid stale closures in connectSSE
    const fetchFriendsRef = useRef(fetchFriends);
    fetchFriendsRef.current = fetchFriends;

    // Track authentication state for SSE management (ref to avoid stale closures)
    const isAuthenticatedRef = useRef(false);

    // Disconnect SSE
    const disconnectSSE = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        setWsConnectionState('disconnected');
    }, []);

    // Connect to SSE
    const connectSSE = useCallback(() => {
        if (!isAuthenticatedRef.current) {
            console.log('[FriendsProvider] Not authenticated, skipping SSE connection');
            return;
        }

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        console.log('[FriendsProvider] Connecting to SSE...');
        setWsConnectionState('connecting');

        const eventSource = new EventSource('/api/friends/stream');
        eventSourceRef.current = eventSource;

        eventSource.addEventListener('connected', () => {
            console.log('[FriendsProvider] SSE connected');
            setWsConnectionState('connected');

            const now = Date.now();
            if (lastConnectedRef.current > 0 && now - lastConnectedRef.current > 30_000) {
                fetchFriendsRef.current();
            }
            lastConnectedRef.current = now;
        });

        eventSource.addEventListener('disconnected', () => {
            console.log('[FriendsProvider] SSE disconnected');
            setWsConnectionState('disconnected');
        });

        eventSource.addEventListener('error', () => {
            if (!isAuthenticatedRef.current) {
                disconnectSSE();
                return;
            }
            console.log('[FriendsProvider] SSE error, will reconnect...');
            setWsConnectionState('reconnecting');
            
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
                if (isAuthenticatedRef.current) {
                    console.log('[FriendsProvider] Attempting SSE reconnect...');
                    connectSSE();
                }
            }, 5000);
        });

        // Friend events (friend-active handled separately, not normalized to friend-online)
        const friendEvents = ['friend-online', 'friend-offline', 'friend-location', 'friend-update', 'friend-active', 'friend-add', 'friend-delete'];
        friendEvents.forEach(eventType => {
            eventSource.addEventListener(eventType, (e: MessageEvent) => {
                try {
                    const eventData = JSON.parse(e.data);
                    handleSSEEvent(eventType, eventData);
                } catch (err) {
                    console.error(`[FriendsProvider] Failed to parse ${eventType} event:`, err);
                }
            });
        });

        eventSource.onerror = () => {
            if (!isAuthenticatedRef.current) {
                disconnectSSE();
                return;
            }
            console.log('[FriendsProvider] EventSource error, reconnecting...');
            eventSource.close();
            setWsConnectionState('reconnecting');
            
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
                if (isAuthenticatedRef.current) {
                    connectSSE();
                }
            }, 5000);
        };

    }, [handleSSEEvent, disconnectSSE]);

    // Update auth ref when state changes and manage SSE connection
    useEffect(() => {
        isAuthenticatedRef.current = isAuthenticated;
        
        if (!isAuthenticated && eventSourceRef.current) {
            console.log('[FriendsProvider] User logged out, disconnecting SSE');
            disconnectSSE();
        }
    }, [isAuthenticated, disconnectSSE]);

    // Initialize
    useEffect(() => {
        fetchFriends().then(() => {
            if (isAuthenticatedRef.current) {
                connectSSE();
            }
        });

        return () => {
            disconnectSSE();
        };
    }, [fetchFriends, connectSSE, disconnectSSE]);

    return (
        <FriendsContext.Provider value={{
            instances,
            offlineFriends,
            loading,
            isAuthenticated,
            lastUpdated,
            wsConnectionState,
            refresh: fetchFriends
        }}>
            {children}
        </FriendsContext.Provider>
    );
};

export const useFriends = () => useContext(FriendsContext);
