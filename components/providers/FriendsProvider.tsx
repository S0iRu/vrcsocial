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
    favoriteGroup?: string;
    joinedAt?: number;
    [key: string]: any;
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

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface FriendsContextType {
    instances: InstanceGroup[];
    loading: boolean;
    isAuthenticated: boolean;
    lastUpdated: Date | null;
    wsConnectionState: ConnectionState;
    refresh: () => void;
}

const FriendsContext = createContext<FriendsContextType>({
    instances: [],
    loading: true,
    isAuthenticated: false,
    lastUpdated: null,
    wsConnectionState: 'disconnected',
    refresh: () => { },
});

// Parse instance info from location string
const parseInstanceInfo = (location: string) => {
    if (!location || location === 'offline' || location === 'private') return null;
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
    } catch (e) {
        console.error('Log save error', e);
    }
};

export const FriendsProvider = ({ children }: { children: React.ReactNode }) => {
    const pathname = usePathname();
    const [instances, setInstances] = useState<InstanceGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [wsConnectionState, setWsConnectionState] = useState<ConnectionState>('disconnected');

    // Refs for data management
    const friendsDataRef = useRef<Map<string, any>>(new Map());
    const favoriteIdsRef = useRef<Set<string>>(new Set());
    const favoriteGroupsRef = useRef<Map<string, string>>(new Map());
    const locationTimestampsRef = useRef<Map<string, { location: string; joinedAt: number }>>(new Map());
    const worldCacheRef = useRef<Map<string, WorldInfo>>(new Map());
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isFirstLoadRef = useRef(true);

    const WORLD_CACHE_TTL = 24 * 60 * 60 * 1000;

    // Load cached data from localStorage
    useEffect(() => {
        try {
            const savedTimestamps = localStorage.getItem('vrc_location_timestamps');
            if (savedTimestamps) {
                const parsed = JSON.parse(savedTimestamps);
                Object.entries(parsed).forEach(([id, data]: [string, any]) => {
                    locationTimestampsRef.current.set(id, data);
                });
            }

            const savedWorldCache = localStorage.getItem('vrc_world_cache');
            if (savedWorldCache) {
                const parsed = JSON.parse(savedWorldCache);
                const now = Date.now();
                Object.entries(parsed).forEach(([id, data]: [string, any]) => {
                    if (data.cachedAt && (now - data.cachedAt) < WORLD_CACHE_TTL) {
                        worldCacheRef.current.set(id, data as WorldInfo);
                    }
                });
            }
        } catch (e) {
            console.error('[FriendsProvider] Failed to load cached data:', e);
        }
    }, []);

    // Save functions
    const saveTimestamps = useCallback(() => {
        try {
            const obj: Record<string, any> = {};
            locationTimestampsRef.current.forEach((data, id) => obj[id] = data);
            localStorage.setItem('vrc_location_timestamps', JSON.stringify(obj));
        } catch (e) { console.error('Failed to save timestamps:', e); }
    }, []);

    const saveWorldCache = useCallback(() => {
        try {
            const obj: Record<string, WorldInfo> = {};
            worldCacheRef.current.forEach((data, id) => obj[id] = data);
            localStorage.setItem('vrc_world_cache', JSON.stringify(obj));
        } catch (e) { console.error('Failed to save world cache:', e); }
    }, []);

    // Fetch world info
    const fetchWorldInfo = useCallback(async (worldId: string): Promise<WorldInfo | null> => {
        const cached = worldCacheRef.current.get(worldId);
        if (cached && (Date.now() - cached.cachedAt) < WORLD_CACHE_TTL) return cached;

        try {
            const res = await fetch(`/api/worlds/${worldId}`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                const worldInfo: WorldInfo = {
                    id: data.id,
                    name: data.name,
                    thumbnailImageUrl: data.thumbnailImageUrl,
                    cachedAt: Date.now()
                };
                worldCacheRef.current.set(worldId, worldInfo);
                saveWorldCache();
                return worldInfo;
            }
        } catch (e) { console.error(`Failed to fetch world ${worldId}:`, e); }
        return null;
    }, [saveWorldCache]);

    // Rebuild instances from friendsDataRef
    const rebuildInstances = useCallback(() => {
        const grouped: Record<string, InstanceGroup> = {};
        const friendMap = new Map<string, string>();
        const now = Date.now();

        friendsDataRef.current.forEach((f, id) => friendMap.set(id, f.name));

        friendsDataRef.current.forEach((f) => {
            const loc = f.location || "offline";
            if (loc === "offline") return;

            if (!grouped[loc]) {
                const info = parseInstanceInfo(loc);
                let ownerName = f.ownerName || undefined;
                if (!ownerName && info?.creatorId) ownerName = friendMap.get(info.creatorId);

                grouped[loc] = {
                    id: loc,
                    worldName: f.worldName || (loc.includes('private') ? "Private World" : `World ${loc.split(':')[0]}`),
                    worldImageUrl: f.worldImageUrl,
                    instanceType: f.instanceType || info?.type || "Public",
                    region: f.isPrivate || loc === 'private' ? "" : (info?.region || "US"),
                    userCount: 0,
                    instanceUserCount: f.instanceUserCount,
                    friends: [],
                    otherFriends: [],
                    minFavoriteGroup: 999,
                    creatorId: info?.creatorId ?? undefined,
                    creatorName: ownerName,
                    groupId: f.groupId || (info?.groupId ?? undefined),
                    groupName: f.groupName,
                    ownerId: f.ownerId || (info?.creatorId ?? undefined),
                    ownerName: ownerName,
                };
            }

            const timestampData = locationTimestampsRef.current.get(f.id);
            const friendWithTimestamp = { ...f, joinedAt: timestampData?.joinedAt || now };

            if (f.isFavorite) {
                grouped[loc].friends.push(friendWithTimestamp);
                grouped[loc].userCount++;
                if (f.favoriteGroup) {
                    const groupNum = parseInt(f.favoriteGroup.replace('group_', ''), 10);
                    if (!isNaN(groupNum) && groupNum < grouped[loc].minFavoriteGroup) {
                        grouped[loc].minFavoriteGroup = groupNum;
                    }
                }
            } else {
                grouped[loc].otherFriends.push(friendWithTimestamp);
            }
        });

        const sortedInstances = Object.values(grouped)
            .filter(inst => inst.userCount > 0)
            .sort((a, b) => {
                const aIsHidden = a.id === 'private' || a.worldName === 'Private World';
                const bIsHidden = b.id === 'private' || b.worldName === 'Private World';
                if (aIsHidden && !bIsHidden) return 1;
                if (!aIsHidden && bIsHidden) return -1;
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
                const data = await res.json();
                setIsAuthenticated(true);

                const currentFriendsMap = new Map();
                if (data.friends && Array.isArray(data.friends)) {
                    data.friends.forEach((f: any) => currentFriendsMap.set(f.id, f));
                }

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

            } else {
                setIsAuthenticated(false);
                setInstances([]);
            }
        } catch (e) {
            console.error(e);
            setInstances([]);
        } finally {
            setLoading(false);
        }
    }, [rebuildInstances, saveTimestamps, saveWorldCache]);

    // Handle SSE events
    const handleSSEEvent = useCallback(async (eventType: string, data: any) => {
        const now = Date.now();

        switch (eventType) {
            case 'friend-online': {
                const userId = data.userId;
                const user = data.user;
                const isFavorite = favoriteIdsRef.current.has(userId);
                const favoriteGroup = favoriteGroupsRef.current.get(userId);

                let worldName = data.world?.name;
                let worldImageUrl = data.world?.thumbnailImageUrl;

                if (!worldName && data.location?.startsWith('wrld_')) {
                    const worldId = data.location.split(':')[0];
                    const cached = worldCacheRef.current.get(worldId);
                    if (cached) {
                        worldName = cached.name;
                        worldImageUrl = cached.thumbnailImageUrl;
                    } else {
                        fetchWorldInfo(worldId).then((info) => {
                            if (info) {
                                const friend = friendsDataRef.current.get(userId);
                                if (friend?.location === data.location) {
                                    friend.worldName = info.name;
                                    friend.worldImageUrl = info.thumbnailImageUrl;
                                    friendsDataRef.current.set(userId, friend);
                                    rebuildInstances();
                                }
                            }
                        });
                    }
                }

                friendsDataRef.current.set(userId, {
                    id: userId,
                    name: user.displayName,
                    status: user.status || 'active',
                    statusMsg: user.statusDescription,
                    icon: user.userIcon || user.profilePicOverride || user.currentAvatarThumbnailImageUrl || '',
                    location: data.location,
                    worldName: worldName || (data.location === 'private' ? 'Private World' : undefined),
                    worldImageUrl,
                    isPrivate: data.location === 'private',
                    isFavorite,
                    favoriteGroup,
                });

                locationTimestampsRef.current.set(userId, { location: data.location, joinedAt: now });
                saveTimestamps();
                addLogEntry('OnLine', user.displayName, worldName || 'Online', 'text-green-400');
                rebuildInstances();
                break;
            }

            case 'friend-offline': {
                const friend = friendsDataRef.current.get(data.userId);
                if (friend) addLogEntry('Offline', friend.name, 'Went Offline', 'text-slate-500');
                friendsDataRef.current.delete(data.userId);
                locationTimestampsRef.current.delete(data.userId);
                saveTimestamps();
                rebuildInstances();
                break;
            }

            case 'friend-location': {
                const userId = data.userId;
                const user = data.user;
                const existingFriend = friendsDataRef.current.get(userId);
                const isFavorite = existingFriend?.isFavorite ?? favoriteIdsRef.current.has(userId);
                const favoriteGroup = existingFriend?.favoriteGroup ?? favoriteGroupsRef.current.get(userId);

                let worldName = data.world?.name;
                let worldImageUrl = data.world?.thumbnailImageUrl;

                if (!worldName && data.location?.startsWith('wrld_')) {
                    const worldId = data.location.split(':')[0];
                    const cached = worldCacheRef.current.get(worldId);
                    if (cached) {
                        worldName = cached.name;
                        worldImageUrl = cached.thumbnailImageUrl;
                    } else {
                        fetchWorldInfo(worldId).then((info) => {
                            if (info) {
                                const friend = friendsDataRef.current.get(userId);
                                if (friend?.location === data.location) {
                                    friend.worldName = info.name;
                                    friend.worldImageUrl = info.thumbnailImageUrl;
                                    friendsDataRef.current.set(userId, friend);
                                    rebuildInstances();
                                }
                            }
                        });
                    }
                }

                friendsDataRef.current.set(userId, {
                    ...existingFriend,
                    id: userId,
                    name: user.displayName,
                    status: user.status || existingFriend?.status || 'active',
                    statusMsg: user.statusDescription || existingFriend?.statusMsg,
                    icon: user.userIcon || user.profilePicOverride || user.currentAvatarThumbnailImageUrl || existingFriend?.icon || '',
                    location: data.location,
                    worldName: worldName || (data.location === 'private' ? 'Private World' : undefined),
                    worldImageUrl,
                    isPrivate: data.location === 'private',
                    isFavorite,
                    favoriteGroup,
                });

                locationTimestampsRef.current.set(userId, { location: data.location, joinedAt: now });
                saveTimestamps();
                addLogEntry('GPS', user.displayName, worldName || 'Private', 'text-orange-400');
                rebuildInstances();
                break;
            }

            case 'friend-update': {
                const userId = data.userId;
                const user = data.user;
                const existingFriend = friendsDataRef.current.get(userId);

                if (existingFriend) {
                    friendsDataRef.current.set(userId, {
                        ...existingFriend,
                        name: user.displayName,
                        status: user.status || existingFriend.status,
                        statusMsg: user.statusDescription || existingFriend.statusMsg,
                        icon: user.userIcon || user.profilePicOverride || user.currentAvatarThumbnailImageUrl || existingFriend.icon,
                    });
                    rebuildInstances();
                }
                break;
            }
        }
    }, [rebuildInstances, saveTimestamps, fetchWorldInfo]);

    // Connect to SSE
    const connectSSE = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        console.log('[FriendsProvider] Connecting to SSE...');
        setWsConnectionState('connecting');

        const eventSource = new EventSource('/api/friends/stream');
        eventSourceRef.current = eventSource;

        eventSource.addEventListener('connected', (e) => {
            console.log('[FriendsProvider] SSE connected');
            setWsConnectionState('connected');
        });

        eventSource.addEventListener('disconnected', (e) => {
            console.log('[FriendsProvider] SSE disconnected');
            setWsConnectionState('disconnected');
        });

        eventSource.addEventListener('error', (e) => {
            console.error('[FriendsProvider] SSE error');
            setWsConnectionState('reconnecting');
            
            // Reconnect after delay
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
                console.log('[FriendsProvider] Attempting SSE reconnect...');
                connectSSE();
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
            console.error('[FriendsProvider] EventSource error');
            eventSource.close();
            setWsConnectionState('reconnecting');
            
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
                connectSSE();
            }, 5000);
        };

    }, [handleSSEEvent]);

    // Initialize
    useEffect(() => {
        fetchFriends().then(() => {
            connectSSE();
        });

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [fetchFriends, connectSSE]);

    return (
        <FriendsContext.Provider value={{
            instances,
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
