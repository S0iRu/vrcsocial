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
    const favoriteIdsRef = useRef<Set<string>>(new Set());
    const favoriteGroupsRef = useRef<Map<string, string>>(new Map());
    const locationTimestampsRef = useRef<Map<string, TimestampEntry>>(new Map());
    const worldCacheRef = useRef<Map<string, WorldInfo>>(new Map());
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isFirstLoadRef = useRef(true);

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

                // Special handling for traveling state
                const isTraveling = effectiveLoc === "traveling";
                
                grouped[effectiveLoc] = {
                    id: effectiveLoc,
                    worldName: isTraveling ? "Traveling" : (f.worldName || (loc.includes('private') ? "Private World" : `World ${loc.split(':')[0]}`)),
                    worldImageUrl: isTraveling ? undefined : f.worldImageUrl,
                    instanceType: isTraveling ? "Traveling" : (f.instanceType || info?.type || "Public"),
                    region: isTraveling ? "" : (f.isPrivate || loc === 'private' ? "" : (info?.region || "US")),
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
                // Update instance type if friend has more accurate info (from API event)
                // This handles the case where a friend joined with fresh instance data
                if (f.instanceType && f.instanceType !== 'Public') {
                    grouped[effectiveLoc].instanceType = f.instanceType;
                }
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
                    // Owner comes first
                    const aIsOwner = inst.ownerId && a.id === inst.ownerId;
                    const bIsOwner = inst.ownerId && b.id === inst.ownerId;
                    if (aIsOwner && !bIsOwner) return -1;
                    if (!aIsOwner && bIsOwner) return 1;
                    // Then sort by stay duration (longer stay = smaller joinedAt = first)
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
                // Traveling goes before private but after regular instances
                if (aIsTraveling && !bIsTraveling && !bIsHidden) return 1;
                if (!aIsTraveling && bIsTraveling && !aIsHidden) return -1;
                if (aIsTraveling && bIsHidden) return -1;
                if (aIsHidden && bIsTraveling) return 1;
                // Private/unknown location goes last
                if (aIsHidden && !bIsHidden) return 1;
                if (!aIsHidden && bIsHidden) return -1;
                // For known locations: sort by longest stay duration of FAVORITE friends (earliest joinedAt first)
                if (!aIsHidden && !bIsHidden) {
                    const getOldestFavoriteJoinTime = (inst: typeof a) => {
                        const times = inst.friends.map(f => f.joinedAt || now);
                        return times.length > 0 ? Math.min(...times) : now;
                    };
                    const aOldestJoin = getOldestFavoriteJoinTime(a);
                    const bOldestJoin = getOldestFavoriteJoinTime(b);
                    if (aOldestJoin !== bOldestJoin) return aOldestJoin - bOldestJoin;
                }
                // Fallback: favorite group, then user count
                if (a.minFavoriteGroup !== b.minFavoriteGroup) return a.minFavoriteGroup - b.minFavoriteGroup;
                return b.userCount - a.userCount;
            });

        setInstances(sortedInstances);
        setLastUpdated(new Date());
    }, []);

    // Fetch initial friends data
    const fetchFriends = useCallback(async () => {
        try {
            const res = await fetch('/api/friends/active', { credentials: 'include' });
            if (res.ok) {
                const data: ActiveFriendsResponse = await res.json();
                setIsAuthenticated(true);
                isAuthenticatedRef.current = true; // Set ref immediately for SSE connection

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

                // Handle offline friends (from API offlineFriends + friends with location: "offline")
                const allOfflineFavorites: Friend[] = [];
                
                // Add friends from offlineFriends array (truly offline)
                (data.offlineFriends || []).forEach((f) => {
                    if (!f?.id) return;
                        allOfflineFavorites.push({
                            id: f.id,
                            name: f.name || f.displayName || 'Unknown',
                            displayName: f.name || f.displayName,
                            userIcon: f.icon || f.userIcon,
                            status: f.status || 'offline',
                            location: 'offline',
                            worldName: 'Offline',
                            favoriteGroup: f.favoriteGroup,
                            last_login: f.last_login,
                            last_activity: f.last_activity,
                        });
                    });
                
                // Add favorite friends with location: "offline" from friends array (Active/web status)
                (data.friends || []).forEach((f) => {
                        if (f.isFavorite && f.location === 'offline') {
                            allOfflineFavorites.push({
                                id: f.id,
                                name: f.name || f.displayName || 'Unknown',
                                displayName: f.name || f.displayName,
                                userIcon: f.icon || f.userIcon,
                                status: f.status || 'active',
                                location: 'offline',
                                worldName: 'Offline',
                                favoriteGroup: f.favoriteGroup,
                            });
                        }
                    });
                
                // Sort by favorite group
                allOfflineFavorites.sort((a, b) => {
                    const aGroup = parseInt(a.favoriteGroup?.replace('group_', '') || '999', 10);
                    const bGroup = parseInt(b.favoriteGroup?.replace('group_', '') || '999', 10);
                    return aGroup - bGroup;
                });
                setOfflineFriends(allOfflineFavorites);

            } else {
                setIsAuthenticated(false);
                isAuthenticatedRef.current = false; // Set ref immediately
                setInstances([]);
                setOfflineFriends([]);
            }
        } catch (error: unknown) {
            console.error(error);
            isAuthenticatedRef.current = false; // Set ref immediately on error
            setInstances([]);
        } finally {
            setLoading(false);
        }
    }, [rebuildInstances, saveTimestamps, saveWorldCache]);

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

                // Get instance type from event data or parse from location
                const info = parseInstanceInfo(location);
                let instanceType = info?.type || 'Public';
                const instance = isObject(data.instance) ? data.instance : null;
                // Use instance type from VRChat API if available (more accurate)
                if (typeof instance?.type === 'string') {
                    instanceType = convertInstanceType(instance.type);
                }

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
                    isPrivate: location === 'private',
                    isFavorite,
                    favoriteGroup,
                    instanceType,
                    ownerId: info?.creatorId || (typeof instance?.ownerId === 'string' ? instance.ownerId : undefined),
                    groupId: info?.groupId || (typeof instance?.groupId === 'string' ? instance.groupId : undefined),
                });

                locationTimestampsRef.current.set(userId, { location, joinedAt: now });
                saveTimestamps();
                // Only log favorite friends
                if (isFavorite) {
                    addLogEntry('OnLine', user.displayName, worldName || 'Online', 'text-green-400');
                }
                rebuildInstances();
                break;
            }

            case 'friend-offline': {
                const userId = typeof data.userId === 'string' ? data.userId : null;
                if (!userId) break;
                const friend = friendsDataRef.current.get(userId);
                // Only log favorite friends
                if (friend?.isFavorite) addLogEntry('Offline', friend.name || friend.displayName || userId, 'Went Offline', 'text-slate-500');
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

                // Get previous location info
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

                // Get instance type from event data or parse from location
                const info = parseInstanceInfo(location);
                let instanceType = info?.type || 'Public';
                const instance = isObject(data.instance) ? data.instance : null;
                // Use instance type from VRChat API if available (more accurate for new instances)
                if (typeof instance?.type === 'string') {
                    instanceType = convertInstanceType(instance.type);
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
                    isPrivate: location === 'private',
                    isFavorite,
                    favoriteGroup,
                    instanceType,
                    ownerId: info?.creatorId || (typeof instance?.ownerId === 'string' ? instance.ownerId : undefined),
                    groupId: info?.groupId || (typeof instance?.groupId === 'string' ? instance.groupId : undefined),
                });

                if (hasLocationChanged) {
                    locationTimestampsRef.current.set(userId, { location, joinedAt: now });
                    saveTimestamps();
                }

                // Only log favorite friends when the location actually changed
                if (isFavorite && hasLocationChanged) {
                    const newWorldName = worldName || (location === 'private' ? 'Private World' : existingFriend?.worldName || 'Unknown');
                    const logDetail = `${prevWorldName} → ${newWorldName}`;
                    addLogEntry('GPS', user.displayName, logDetail, 'text-orange-400');
                }
                rebuildInstances();
                break;
            }

            case 'friend-update': {
                const userId = typeof data.userId === 'string' ? data.userId : null;
                const user = isObject(data.user) ? data.user : null;
                if (!userId || !user || typeof user.displayName !== 'string') break;
                const existingFriend = friendsDataRef.current.get(userId);

                if (existingFriend) {
                    const isFavorite = existingFriend.isFavorite;
                    const prevStatus = existingFriend.status;
                    const prevStatusMsg = existingFriend.statusMsg;
                    const newStatus = typeof user.status === 'string' ? user.status : existingFriend.status;
                    const newStatusMsg = typeof user.statusDescription === 'string'
                        ? user.statusDescription
                        : existingFriend.statusMsg;

                    // Log status change for favorites
                    if (isFavorite && prevStatus && newStatus && prevStatus !== newStatus) {
                        addLogEntry('Status', user.displayName, `${prevStatus} → ${newStatus}`, 'text-cyan-400');
                    }

                    // Log status message change for favorites
                    if (isFavorite && prevStatusMsg !== newStatusMsg && newStatusMsg) {
                        addLogEntry('StatusMsg', user.displayName, newStatusMsg, 'text-purple-400');
                    }

                    friendsDataRef.current.set(userId, {
                        ...existingFriend,
                        name: user.displayName,
                        status: newStatus,
                        statusMsg: newStatusMsg,
                        icon: (typeof user.userIcon === 'string' && user.userIcon)
                            || (typeof user.profilePicOverride === 'string' && user.profilePicOverride)
                            || (typeof user.currentAvatarThumbnailImageUrl === 'string' && user.currentAvatarThumbnailImageUrl)
                            || existingFriend.icon,
                    });
                    rebuildInstances();
                }
                break;
            }
        }
    }, [rebuildInstances, saveTimestamps, fetchWorldInfo]);

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
        // Don't connect if not authenticated (use ref for latest value)
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
        });

        eventSource.addEventListener('disconnected', () => {
            console.log('[FriendsProvider] SSE disconnected');
            setWsConnectionState('disconnected');
        });

        eventSource.addEventListener('error', () => {
            // Don't reconnect if we're logged out
            if (!isAuthenticatedRef.current) {
                disconnectSSE();
                return;
            }
            console.log('[FriendsProvider] SSE error, will reconnect...');
            setWsConnectionState('reconnecting');
            
            // Reconnect after delay
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
                if (isAuthenticatedRef.current) {
                    console.log('[FriendsProvider] Attempting SSE reconnect...');
                    connectSSE();
                }
            }, 5000);
        });

        // Friend events
        const friendEvents = ['friend-online', 'friend-offline', 'friend-location', 'friend-update', 'friend-active'];
        friendEvents.forEach(eventType => {
            eventSource.addEventListener(eventType, (e: MessageEvent) => {
                try {
                    const data = JSON.parse(e.data);
                    // friend-active is similar to friend-online
                    const normalizedType = eventType === 'friend-active' ? 'friend-online' : eventType;
                    handleSSEEvent(normalizedType, data);
                } catch (err) {
                    console.error(`[FriendsProvider] Failed to parse ${eventType} event:`, err);
                }
            });
        });

        eventSource.onerror = () => {
            // Don't reconnect if not authenticated (user logged out)
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
        
        // Disconnect SSE when user logs out
        if (!isAuthenticated && eventSourceRef.current) {
            console.log('[FriendsProvider] User logged out, disconnecting SSE');
            disconnectSSE();
        }
    }, [isAuthenticated, disconnectSSE]);

    // Initialize
    useEffect(() => {
        fetchFriends().then(() => {
            // Only connect SSE if authenticated after fetch
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
