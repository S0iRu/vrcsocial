import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.vrchat.cloud/api/1';

const USER_AGENT = 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)';


export async function GET(req: NextRequest) {

    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth')?.value;
    const credsCookie = cookieStore.get('vrc_creds')?.value;
    const clientAuthHeader = req.headers.get('Authorization');

    // Build Headers
    const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
    };

    if (authCookie) {
        headers['Cookie'] = `auth=${authCookie}`;
    } else if (clientAuthHeader) {
        // Use client provided auth header (from localStorage)
        headers['Authorization'] = clientAuthHeader;
    } else if (credsCookie) {
        headers['Authorization'] = `Basic ${credsCookie}`;
    } else {

        console.log('[FriendsAPI] Not authenticated. Cookies present:', cookieStore.getAll().map(c => c.name));
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }


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
        const favoriteIds = new Set<string>();
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            try {
                const favRes = await fetch(`${API_BASE}/favorites?type=friend&n=100&offset=${offset}`, { headers });
                if (favRes.ok) {
                    const favs = await favRes.json();
                    if (Array.isArray(favs) && favs.length > 0) {
                        favs.forEach((fav: any) => favoriteIds.add(fav.favoriteId));
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

        // Filter: Keep only favorite friends
        const activeFavoriteFriends = friends.filter((f: any) => favoriteIds.has(f.id));

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

        // Extract unique world IDs and group IDs from filtered list
        const worldIds = new Set<string>();
        const groupIds = new Set<string>();
        activeFavoriteFriends.forEach((f: any) => {
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
        const BATCH_SIZE = 10;

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


        // Transform
        const simplifiedFriends = activeFavoriteFriends.map((f: any) => {
            let worldName = f.location;
            let worldImageUrl = null;
            let isPrivate = false;
            
            // Parse instance info
            const instanceInfo = parseLocation(f.location);
            let ownerName: string | null = null;
            let groupName: string | null = null;
            
            // Get owner name from friends map
            if (instanceInfo.ownerId) {
                ownerName = allFriendsMap.get(instanceInfo.ownerId) || null;
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

            return {
                id: f.id,
                name: f.displayName,
                status: f.status,
                statusMsg: f.statusDescription,
                icon: f.userIcon || f.currentAvatarThumbnailImageUrl,
                location: f.location,
                worldName,
                worldImageUrl,
                isPrivate,
                isFavorite: true,
                instanceType: instanceInfo.instanceType,
                ownerId: instanceInfo.ownerId,
                ownerName,
                groupId: instanceInfo.groupId,
                groupName,
            };
        });

        return NextResponse.json({ friends: simplifiedFriends });


    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
