import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.vrchat.cloud/api/1';

export async function GET(req: NextRequest) {
    // Rate limiting check
    const rateCheck = checkRateLimit(req, 'user');
    if (rateCheck.limited) {
        return rateLimitResponse(rateCheck.resetIn);
    }

    // Only forward VRChat-specific cookies (security: don't leak other cookies)
    const cookieStore = req.cookies;
    const authCookie = cookieStore.get('auth')?.value;
    const twoFactorCookie = cookieStore.get('twoFactorAuth')?.value;

    if (!authCookie) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Build cookie header with only VRChat cookies
    let cookieHeader = `auth=${authCookie}`;
    if (twoFactorCookie) cookieHeader += `; twoFactorAuth=${twoFactorCookie}`;

    const headers: Record<string, string> = {
        'User-Agent': 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)',
        'Cookie': cookieHeader
    };

    try {
        const apiRes = await fetch(`${API_BASE}/auth/user`, { headers });

        if (!apiRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch user' }, { status: apiRes.status });
        }

        const data = await apiRes.json();
        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
