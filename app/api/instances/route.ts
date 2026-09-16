import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { VRC_API_BASE, buildVrcHeaders, getInstanceCatalog, parseInstanceExtras } from '@/lib/vrcApi';

export const dynamic = 'force-dynamic';

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
    const headers = buildVrcHeaders(
        cookieStore.get('auth')?.value,
        cookieStore.get('twoFactorAuth')?.value
    );

    if (!headers) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const [res, catalog] = await Promise.all([
            fetch(`${VRC_API_BASE}/instances/${location}`, { headers }),
            getInstanceCatalog(headers),
        ]);

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch instance' }, { status: res.status });
        }

        const data = await res.json();
        const extras = parseInstanceExtras(data, catalog);

        let ownerName: string | null = null;
        if (extras.ownerId && extras.ownerId.startsWith('usr_')) {
            try {
                const userRes = await fetch(`${VRC_API_BASE}/users/${extras.ownerId}`, { headers });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    if (userData?.displayName) ownerName = userData.displayName;
                }
            } catch { /* non-critical */ }
        }

        const occupancy = extras.occupancy ?? extras.n_users ?? extras.userCount;

        return NextResponse.json({
            instanceId: extras.instanceId ?? data.instanceId,
            location: extras.location ?? data.location,
            worldId: extras.worldId ?? data.worldId,
            type: extras.type ?? data.type,
            ownerId: extras.ownerId ?? data.ownerId,
            ownerName,
            occupancy,
            n_users: occupancy,
            userCount: occupancy,
            capacity: extras.capacity,
            groupAccessType: extras.groupAccessType,
            displayName: extras.displayName || null,
            description: extras.description || null,
            categoryName: extras.categoryName || null,
            vibeNames: extras.vibeNames,
            languages: extras.languages,
        });
    } catch (error: unknown) {
        console.error('[InstancesAPI] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
