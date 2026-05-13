import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.vrchat.cloud/api/1';
const USER_AGENT = 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)';

export async function GET(req: NextRequest) {
    const rateCheck = checkRateLimit(req, 'instances');
    if (rateCheck.limited) {
        return rateLimitResponse(rateCheck.resetIn);
    }

    const location = req.nextUrl.searchParams.get('location');
    if (!location || !location.startsWith('wrld_') || !location.includes(':')) {
        return NextResponse.json({ error: 'Invalid location' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth')?.value;

    if (!authCookie) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Cookie': `auth=${authCookie}`
    };

    try {
        const res = await fetch(`${API_BASE}/instances/${location}`, { headers });

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch instance' }, { status: res.status });
        }

        const data = await res.json();

        // Resolve owner name if ownerId is present
        let ownerName: string | null = null;
        if (data.ownerId && typeof data.ownerId === 'string' && data.ownerId.startsWith('usr_')) {
            try {
                const userRes = await fetch(`${API_BASE}/users/${data.ownerId}`, { headers });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    if (userData?.displayName) ownerName = userData.displayName;
                }
            } catch { /* non-critical */ }
        }

        return NextResponse.json({
            instanceId: data.instanceId,
            location: data.location,
            worldId: data.worldId,
            type: data.type,
            ownerId: data.ownerId,
            ownerName,
            n_users: data.n_users,
            userCount: data.userCount,
            capacity: data.capacity,
            groupAccessType: data.groupAccessType,
        });
    } catch (error: unknown) {
        console.error('[InstancesAPI] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
