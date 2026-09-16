import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { VRC_API_BASE, buildVrcHeaders } from '@/lib/vrcApi';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateCheck = checkRateLimit(req, 'groups');
    if (rateCheck.limited) {
        return rateLimitResponse(rateCheck.resetIn);
    }

    const { id: groupId } = await params;

    if (!groupId || typeof groupId !== 'string' || !groupId.startsWith('grp_') || groupId.length > 50) {
        return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 });
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
        const res = await fetch(`${VRC_API_BASE}/groups/${groupId}`, { headers });

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch group' }, { status: res.status });
        }

        const data = await res.json();

        return NextResponse.json({
            id: data.id,
            name: data.name,
            shortCode: data.shortCode,
            discriminator: data.discriminator,
            description: data.description,
            iconUrl: data.iconUrl,
            bannerUrl: data.bannerUrl,
            memberCount: data.memberCount,
        });
    } catch (error: unknown) {
        console.error('[GroupsAPI] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
