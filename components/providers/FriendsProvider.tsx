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
    [key: string]: any;
};

type InstanceGroup = {
    id: string;
    worldName: string;
    instanceType: string;
    region: string;
    userCount: number;
    friends: Friend[];
    creatorId?: string;
    creatorName?: string;
    worldImageUrl?: string;
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

const parseInstanceInfo = (location: string) => {
    if (!location || location === 'offline' || location === 'private') return null;
    const parts = location.split(':');
    if (parts.length < 2) return { name: '', type: 'Public', region: 'US', creatorId: null };

    const raw = parts[1];
    const name = raw.split('~')[0];

    let type = 'Public';
    let creatorId = null;

    const usrMatch = raw.match(/\((usr_[^)]+)\)/);
    if (usrMatch) {
        creatorId = usrMatch[1];
    }

    if (raw.includes('private')) {
        type = 'Invite';
    } else if (raw.includes('friends')) {
        type = 'Friends';
    } else if (raw.includes('hidden')) {
        type = 'Friends+';
    }

    let region = 'US';
    if (raw.includes('region(jp)')) region = 'JP';
    else if (raw.includes('region(eu)')) region = 'EU';

    return { name, type, region, creatorId };
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
                            // Resolve creator
                            const info = parseInstanceInfo(loc);
                            let cName = undefined;
                            if (info && info.creatorId) {
                                cName = friendMap.get(info.creatorId);
                            }

                            grouped[loc] = {
                                id: loc,
                                worldName: f.worldName || (loc.includes('private') ? "Private World" : `World ${loc.split(':')[0]}`),
                                worldImageUrl: f.worldImageUrl,
                                instanceType: info?.type || (f.isPrivate ? "Invite" : "Public"),
                                region: info?.region || "US",
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
