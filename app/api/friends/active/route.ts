import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.vrchat.cloud/api/1';

const USER_AGENT = 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)';


export async function GET(req: NextRequest) {
    // Rate limiting check
    const rateCheck = checkRateLimit(req, 'friends');
    if (rateCheck.limited) {
        return rateLimitResponse(rateCheck.resetIn);
    }

    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth')?.value;

    if (!authCookie) {
        console.log('[FriendsAPI] Not authenticated. No auth cookie present.');
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Build Headers
    const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Cookie': `auth=${authCookie}`
    };


    try {
        // Fetch ALL Online Friends with pagination
        let allFriends: any[] = [];
        let friendOffset = 0;
        let friendsHasMore = true;

        console.log('[FriendsAPI] Starting to fetch all online friends...');

        while (friendsHasMore) {
            try {
                const res = await fetch(`${API_BASE}/auth/user/friends?offline=false&n=100&offset=${friendOffset}`, {
                    method: 'GET',
                    headers
                });

                if (!res.ok) {
                    console.error('Fetch Friends Error:', res.status);
                    friendsHasMore = false;
                    // If first request fails seriously, return error, but if we have data, continue
                    if (allFriends.length === 0) {
                        return NextResponse.json({ error: 'Failed to fetch friends' }, { status: res.status });
                    }
                    break;
                }

                const pageFriends = await res.json();
                if (Array.isArray(pageFriends) && pageFriends.length > 0) {
                    allFriends = allFriends.concat(pageFriends);
                    if (pageFriends.length < 100) {
                        friendsHasMore = false; // Less than 100 means end of list
                    } else {
                        friendOffset += 100; // Next page
                    }
                } else {
                    friendsHasMore = false;
                }
            } catch (e) {
                console.error('Error fetching friends page', e);
                friendsHasMore = false;
                if (allFriends.length === 0) return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
            }
        }

        const friends = allFriends;
        console.log(`[FriendsAPI] Total online friends fetched: ${friends.length}`);


        // Fetch ALL Favorites to filter (pagination loop)
        // Also store favorite group info for sorting
        const favoriteIds = new Set<string>();
        const favoriteGroups = new Map<string, string>(); // userId -> group (e.g., "group_0")
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            try {
                const favRes = await fetch(`${API_BASE}/favorites?type=friend&n=100&offset=${offset}`, { headers });
                if (favRes.ok) {
                    const favs = await favRes.json();
                    if (Array.isArray(favs) && favs.length > 0) {
                        favs.forEach((fav: any) => {
                            favoriteIds.add(fav.favoriteId);
                            // Extract favorite group from tags (e.g., ["group_0"])
                            if (fav.tags && Array.isArray(fav.tags) && fav.tags.length > 0) {
                                favoriteGroups.set(fav.favoriteId, fav.tags[0]);
                            }
                        });
                        if (favs.length < 100) {
                            hasMore = false; // End of list
                        } else {
                            offset += 100; // Next page
                        }
                    } else {
                        hasMore = false;
                    }
                } else {
                    console.error(`[FriendsAPI] Failed to fetch favorites offset=${offset}`, favRes.status);
                    hasMore = false;
                }
            } catch (e) {
                console.error('[FriendsAPI] Error fetching favorites', e);
                hasMore = false;
            }
        }

        console.log(`[FriendsAPI] Total favorites loaded: ${favoriteIds.size}. Filtering ${friends.length} online friends.`);

        // Split friends into favorites and non-favorites
        // For non-favorites, only include those with visible locations (not private/offline)
        const activeFavoriteFriends = friends.filter((f: any) => favoriteIds.has(f.id));
        const activeNonFavoriteFriends = friends.filter((f: any) => {
            if (favoriteIds.has(f.id)) return false;  // Already in favorites
            if (!f.location || f.location === 'offline' || f.location === 'private') return false;
            return true;  // Has visible location
        });
        
        // Combine all friends that need processing
        const allActiveFriends = [...activeFavoriteFriends, ...activeNonFavoriteFriends];

        // Batch size for API requests
        const BATCH_SIZE = 10;

        // Fetch offline favorite friends
        const offlineFavoriteIds = new Set<string>();
        favoriteIds.forEach(id => {
            if (!friends.some((f: any) => f.id === id)) {
                offlineFavoriteIds.add(id);
            }
        });

        // Fetch offline favorites info in batches
        const offlineFavoriteFriends: any[] = [];
        const offlineFavoriteIdList = Array.from(offlineFavoriteIds);
        
        if (offlineFavoriteIdList.length > 0) {
            console.log(`[FriendsAPI] Fetching info for ${offlineFavoriteIdList.length} offline favorite friends`);
            
            for (let i = 0; i < offlineFavoriteIdList.length; i += BATCH_SIZE) {
                const batch = offlineFavoriteIdList.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (userId) => {
                    try {
                        const userRes = await fetch(`${API_BASE}/users/${userId}`, { headers });
                        if (userRes.ok) {
                            const userData = await userRes.json();
                            offlineFavoriteFriends.push(userData);
                        }
                    } catch (e) {
                        console.error(`Failed to fetch offline favorite ${userId}`);
                    }
                }));

                if (i + BATCH_SIZE < offlineFavoriteIdList.length) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        }

        // Create a map of all friends for quick lookup (for instance owner names)
        const allFriendsMap = new Map<string, string>();
        friends.forEach((f: any) => allFriendsMap.set(f.id, f.displayName));

        // Helper function to parse instance info
        const parseLocation = (location: string) => {
            if (!location || location === 'offline' || location === 'private') {
                return { instanceType: 'Private', ownerId: null, groupId: null };
            }
            const parts = location.split(':');
            if (parts.length < 2) return { instanceType: 'Public', ownerId: null, groupId: null };
            
            const raw = parts[1];
            let instanceType = 'Public';
            let ownerId: string | null = null;
            let groupId: string | null = null;
            
            // Extract owner ID
            const usrMatch = raw.match(/\((usr_[^)]+)\)/);
            if (usrMatch) ownerId = usrMatch[1];
            
            // Extract group ID
            const grpMatch = raw.match(/~group\((grp_[^)]+)\)/);
            if (grpMatch) groupId = grpMatch[1];
            
            // Determine instance type
            if (raw.includes('~group(')) {
                if (raw.includes('groupAccessType(public)')) instanceType = 'Group Public';
                else if (raw.includes('groupAccessType(plus)')) instanceType = 'Group+';
                else if (raw.includes('groupAccessType(members)')) instanceType = 'Group';
                else instanceType = 'Group';
            } else if (raw.includes('~private(')) {
                instanceType = raw.includes('~canRequestInvite') ? 'Invite+' : 'Invite';
            } else if (raw.includes('~friends(')) {
                instanceType = 'Friends';
            } else if (raw.includes('~hidden(')) {
                instanceType = 'Friends+';
            }
            
            return { instanceType, ownerId, groupId };
        };

        // Extract unique world IDs and group IDs from all active friends
        const worldIds = new Set<string>();
        const groupIds = new Set<string>();
        allActiveFriends.forEach((f: any) => {
            if (typeof f.location === 'string' && f.location.startsWith('wrld_')) {
                const wid = f.location.split(':')[0];
                worldIds.add(wid);
                
                // Extract group ID if present
                const grpMatch = f.location.match(/~group\((grp_[^)]+)\)/);
                if (grpMatch) groupIds.add(grpMatch[1]);
            }
        });

        // Fetch world details with BATCHING to avoid 429 Rate Limits
        const worldMap = new Map<string, any>();
        const worldIdList = Array.from(worldIds);

        console.log(`[FriendsAPI] Fetching info for ${worldIdList.length} unique worlds (Batch Size: ${BATCH_SIZE})`);

        for (let i = 0; i < worldIdList.length; i += BATCH_SIZE) {
            const batch = worldIdList.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (wid) => {
                try {
                    const wRes = await fetch(`${API_BASE}/worlds/${wid}`, { headers });
                    if (wRes.ok) {
                        const wData = await wRes.json();
                        worldMap.set(wid, wData);
                    }
                } catch (e) {
                    console.error(`Failed to fetch world ${wid}`);
                }
            }));

            if (i + BATCH_SIZE < worldIdList.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        // Fetch group details
        const groupMap = new Map<string, any>();
        const groupIdList = Array.from(groupIds);
        
        console.log(`[FriendsAPI] Fetching info for ${groupIdList.length} unique groups`);

        for (let i = 0; i < groupIdList.length; i += BATCH_SIZE) {
            const batch = groupIdList.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (gid) => {
                try {
                    const gRes = await fetch(`${API_BASE}/groups/${gid}`, { headers });
                    if (gRes.ok) {
                        const gData = await gRes.json();
                        groupMap.set(gid, gData);
                    }
                } catch (e) {
                    console.error(`Failed to fetch group ${gid}`);
                }
            }));

            if (i + BATCH_SIZE < groupIdList.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        // Collect unique instance locations (for fetching instance user counts)
        const instanceLocations = new Set<string>();
        allActiveFriends.forEach((f: any) => {
            if (f.location && f.location.startsWith('wrld_') && !f.location.includes('private')) {
                instanceLocations.add(f.location);
            }
        });

        // Fetch instance details to get total user count
        const instanceMap = new Map<string, any>();
        const instanceList = Array.from(instanceLocations);
        
        console.log(`[FriendsAPI] Fetching info for ${instanceList.length} unique instances`);

        for (let i = 0; i < instanceList.length; i += BATCH_SIZE) {
            const batch = instanceList.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (loc) => {
                try {
                    // Instance API format: /instances/{worldId}:{instanceId}
                    const instRes = await fetch(`${API_BASE}/instances/${loc}`, { headers });
                    if (instRes.ok) {
                        const instData = await instRes.json();
                        instanceMap.set(loc, instData);
                    }
                } catch (e) {
                    console.error(`Failed to fetch instance ${loc}`);
                }
            }));

            if (i + BATCH_SIZE < instanceList.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        // Collect instance owner IDs that are not in friends list
        const nonFriendOwnerIds = new Set<string>();
        allActiveFriends.forEach((f: any) => {
            const instanceInfo = parseLocation(f.location);
            if (instanceInfo.ownerId && !allFriendsMap.has(instanceInfo.ownerId)) {
                nonFriendOwnerIds.add(instanceInfo.ownerId);
            }
        });

        // Fetch non-friend owner info
        const ownerMap = new Map<string, string>(); // userId -> displayName
        const ownerIdList = Array.from(nonFriendOwnerIds);
        
        if (ownerIdList.length > 0) {
            console.log(`[FriendsAPI] Fetching info for ${ownerIdList.length} non-friend instance owners`);
            
            for (let i = 0; i < ownerIdList.length; i += BATCH_SIZE) {
                const batch = ownerIdList.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (userId) => {
                    try {
                        const userRes = await fetch(`${API_BASE}/users/${userId}`, { headers });
                        if (userRes.ok) {
                            const userData = await userRes.json();
                            ownerMap.set(userId, userData.displayName);
                        }
                    } catch (e) {
                        console.error(`Failed to fetch user ${userId}`);
                    }
                }));

                if (i + BATCH_SIZE < ownerIdList.length) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        }

        // Transform all active friends
        const simplifiedFriends = allActiveFriends.map((f: any) => {
            let worldName = f.location;
            let worldImageUrl = null;
            let isPrivate = false;
            const isFavorite = favoriteIds.has(f.id);
            
            // Parse instance info
            const instanceInfo = parseLocation(f.location);
            let ownerName: string | null = null;
            let groupName: string | null = null;
            
            // Get owner name from friends map or non-friend owner map
            if (instanceInfo.ownerId) {
                ownerName = allFriendsMap.get(instanceInfo.ownerId) || ownerMap.get(instanceInfo.ownerId) || null;
            }
            
            // Get group name from group map
            if (instanceInfo.groupId) {
                const gData = groupMap.get(instanceInfo.groupId);
                if (gData) groupName = gData.name;
            }

            if (f.location === 'private') {
                isPrivate = true;
                worldName = 'Private World';
            } else if (typeof f.location === 'string' && f.location.startsWith('wrld_')) {
                const wid = f.location.split(':')[0];
                const wData = worldMap.get(wid);

                if (wData) {
                    worldName = wData.name;
                    worldImageUrl = wData.thumbnailImageUrl;
                }

                // Check if instance is private
                if (f.location.includes('private')) {
                    isPrivate = true;
                }
            } else if (f.location === 'offline') {
                worldName = 'Offline';
            }

            // Get instance user count
            const instData = instanceMap.get(f.location);
            const instanceUserCount = instData?.n_users || instData?.userCount || null;

            // Get favorite group for this friend
            const favoriteGroup = favoriteGroups.get(f.id) || null;

            return {
                id: f.id,
                name: f.displayName,
                status: f.status,
                statusMsg: f.statusDescription,
                icon: f.userIcon || f.profilePicOverride || f.currentAvatarThumbnailImageUrl || f.currentAvatarImageUrl || '',
                location: f.location,
                worldName,
                worldImageUrl,
                isPrivate,
                isFavorite,
                favoriteGroup,  // e.g., "group_0", "group_1", etc.
                instanceType: instanceInfo.instanceType,
                ownerId: instanceInfo.ownerId,
                ownerName,
                groupId: instanceInfo.groupId,
                groupName,
                instanceUserCount,
            };
        });

        // Transform offline favorite friends
        const simplifiedOfflineFriends = offlineFavoriteFriends.map((f: any) => {
            const favoriteGroup = favoriteGroups.get(f.id) || null;
            return {
                id: f.id,
                name: f.displayName,
                status: 'offline',
                statusMsg: f.statusDescription,
                icon: f.userIcon || f.profilePicOverride || f.currentAvatarThumbnailImageUrl || f.currentAvatarImageUrl || '',
                location: 'offline',
                worldName: 'Offline',
                worldImageUrl: null,
                isPrivate: false,
                isFavorite: true,
                favoriteGroup,
                instanceType: 'Offline',
                ownerId: null,
                ownerName: null,
                groupId: null,
                groupName: null,
                instanceUserCount: null,
                last_login: f.last_login,
                last_activity: f.last_activity,
            };
        });

        return NextResponse.json({ 
            friends: simplifiedFriends,
            offlineFriends: simplifiedOfflineFriends
        });


    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
