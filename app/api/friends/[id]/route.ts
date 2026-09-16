import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import {
    VRC_API_BASE,
    buildVrcHeaders,
    getInstanceCatalog,
    mergeProfileFields,
    parseInstanceExtras,
} from '@/lib/vrcApi';

export const dynamic = 'force-dynamic';

async function getAuthHeaders(): Promise<Record<string, string> | null> {
    const cookieStore = await cookies();
    return buildVrcHeaders(
        cookieStore.get('auth')?.value,
        cookieStore.get('twoFactorAuth')?.value
    );
}

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
function parseInstanceInfo(location: string) {
    if (!location || location === 'offline' || location === 'private') {
        return { instanceType: 'Private', region: 'Unknown', instanceId: '', ownerId: null, groupId: null };
    }

    const parts = location.split(':');
    if (parts.length < 2) {
        return { instanceType: 'Public', region: 'US', instanceId: '', ownerId: null, groupId: null };
    }

    const raw = parts[1];
    const instanceId = raw.split('~')[0];

    let instanceType = 'Public';
    let ownerId: string | null = null;
    let groupId: string | null = null;
    
    // Extract owner user ID
    const usrMatch = raw.match(/\((usr_[^)]+)\)/);
    if (usrMatch) {
        ownerId = usrMatch[1];
    }
    
    // Extract group ID
    const grpMatch = raw.match(/~group\((grp_[^)]+)\)/);
    if (grpMatch) {
        groupId = grpMatch[1];
    }
    
    // Check for group instances first (they may also contain other keywords)
    if (raw.includes('~group(')) {
        if (raw.includes('groupAccessType(public)')) {
            instanceType = 'Group Public';
        } else if (raw.includes('groupAccessType(plus)')) {
            instanceType = 'Group+';
        } else if (raw.includes('groupAccessType(members)')) {
            instanceType = 'Group';
        } else {
            instanceType = 'Group';
        }
    } else if (raw.includes('~private(')) {
        if (raw.includes('~canRequestInvite')) {
            instanceType = 'Invite+';
        } else {
            instanceType = 'Invite';
        }
    } else if (raw.includes('~friends(')) {
        instanceType = 'Friends';
    } else if (raw.includes('~hidden(')) {
        instanceType = 'Friends+';
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

    return { instanceType, region, instanceId, ownerId, groupId };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Rate limiting check
    const rateCheck = checkRateLimit(req, 'friendDetail');
    if (rateCheck.limited) {
        return rateLimitResponse(rateCheck.resetIn);
    }

    const { id } = await params;

    // Input validation: User ID must match VRChat format
    if (!id || typeof id !== 'string' || !id.startsWith('usr_') || id.length > 50) {
        return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const headers = await getAuthHeaders();
    if (!headers) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const [userRes, profileRes] = await Promise.all([
            fetch(`${VRC_API_BASE}/users/${id}`, { headers }),
            fetch(`${VRC_API_BASE}/profile/${id}`, { headers }),
        ]);

        if (!userRes.ok) {
            console.error(`[FriendAPI] Failed to fetch user ${id}:`, userRes.status);
            return NextResponse.json({ error: 'Failed to fetch user' }, { status: userRes.status });
        }

        const user = await userRes.json();
        const profile = profileRes.ok ? await profileRes.json() : null;
        const profileFields = mergeProfileFields(user, profile);

        // Parse instance info first to get IDs
        const instanceInfo = parseInstanceInfo(user.location || '');

        // Fetch world info if user is in a world
        let worldData = null;
        if (user.location && user.location.startsWith('wrld_')) {
            const worldId = user.location.split(':')[0];
            try {
                const worldRes = await fetch(`${VRC_API_BASE}/worlds/${worldId}`, { headers });
                if (worldRes.ok) {
                    worldData = await worldRes.json();
                }
            } catch (error: unknown) {
                console.error(`[FriendAPI] Failed to fetch world ${worldId}`, error);
            }
        }

        // Fetch group info if it's a group instance
        let groupData = null;
        if (instanceInfo.groupId) {
            try {
                const groupRes = await fetch(`${VRC_API_BASE}/groups/${instanceInfo.groupId}`, { headers });
                if (groupRes.ok) {
                    groupData = await groupRes.json();
                }
            } catch (error: unknown) {
                console.error(`[FriendAPI] Failed to fetch group ${instanceInfo.groupId}`, error);
            }
        }

        // Fetch instance owner info if available
        let ownerData = null;
        if (instanceInfo.ownerId) {
            try {
                const ownerRes = await fetch(`${VRC_API_BASE}/users/${instanceInfo.ownerId}`, { headers });
                if (ownerRes.ok) {
                    ownerData = await ownerRes.json();
                }
            } catch (error: unknown) {
                console.error(`[FriendAPI] Failed to fetch owner ${instanceInfo.ownerId}`, error);
            }
        }

        let instanceExtras = parseInstanceExtras(null);
        if (user.location && typeof user.location === 'string' && user.location.startsWith('wrld_') && user.location.includes(':')) {
            try {
                const [instRes, catalog] = await Promise.all([
                    fetch(`${VRC_API_BASE}/instances/${user.location}`, { headers }),
                    getInstanceCatalog(headers),
                ]);
                if (instRes.ok) {
                    instanceExtras = parseInstanceExtras(await instRes.json(), catalog);
                }
            } catch (error: unknown) {
                console.error('[FriendAPI] Failed to fetch instance extras', error);
            }
        }

        let displayStatus = 'offline';
        if (user.state === 'online' || user.state === 'active') {
            displayStatus = user.status || 'active';
        } else if (user.location && user.location !== 'offline') {
            displayStatus = user.status || 'active';
        }

        const friendData = {
            id: user.id,
            name: user.displayName,
            status: displayStatus,
            state: user.state || 'offline',
            statusMessage: user.statusDescription || '',
            icon: profileFields.icon,
            bannerUrl: profileFields.bannerUrl,
            profilePicOverride: profileFields.profilePicOverride,
            bio: profileFields.bio,
            bioLinks: profileFields.bioLinks,
            pronouns: profileFields.pronouns,
            badges: profileFields.badges,
            representedGroup: profileFields.representedGroup,
            trust: profileFields.trust,
            location: user.location || 'offline',
            world: worldData ? {
                id: worldData.id,
                name: worldData.name,
                description: worldData.description,
                authorName: worldData.authorName,
                thumbnailImageUrl: worldData.thumbnailImageUrl,
                imageUrl: worldData.imageUrl,
                capacity: worldData.capacity,
                occupants: worldData.occupants,
            } : null,
            instance: {
                type: instanceInfo.instanceType,
                region: instanceInfo.region,
                id: instanceInfo.instanceId,
                ownerId: instanceInfo.ownerId,
                ownerName: ownerData?.displayName || null,
                groupId: instanceInfo.groupId,
                groupName: groupData?.name || null,
                displayName: instanceExtras.displayName || null,
                description: instanceExtras.description || null,
                categoryName: instanceExtras.categoryName || null,
                vibeNames: instanceExtras.vibeNames,
                languages: instanceExtras.languages,
                userCount: instanceExtras.n_users ?? instanceExtras.userCount ?? null,
                capacity: instanceExtras.capacity ?? null,
            },
            lastLogin: user.last_login,
            dateJoined: user.date_joined,
            isFriend: user.isFriend,
        };

        return NextResponse.json(friendData);

    } catch (error: unknown) {
        console.error('[FriendAPI] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
