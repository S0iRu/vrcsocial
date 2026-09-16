import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { VRC_API_BASE, buildVrcHeaders, pickUserImageUrl } from '@/lib/vrcApi';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const rateCheck = checkRateLimit(req, 'user');
    if (rateCheck.limited) {
        return rateLimitResponse(rateCheck.resetIn);
    }

    const headers = buildVrcHeaders(
        req.cookies.get('auth')?.value,
        req.cookies.get('twoFactorAuth')?.value
    );

    if (!headers) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const apiRes = await fetch(`${VRC_API_BASE}/auth/user`, { headers });

        if (!apiRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch user' }, { status: apiRes.status });
        }

        const data = await apiRes.json();
        return NextResponse.json({
            ...data,
            icon: pickUserImageUrl(data),
        });
    } catch (error: unknown) {
        console.error('[UserAPI] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
