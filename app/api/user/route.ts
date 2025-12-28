import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.vrchat.cloud/api/1';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('Authorization');

    // Forward Cookies (Critical for 2FA sessions)
    const cookieStore = req.cookies;
    const allCookies = cookieStore.getAll();
    const cookieHeader = allCookies.map(c => `${c.name}=${c.value}`).join('; ');

    const headers: Record<string, string> = {
        'User-Agent': 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)'
    };
    if (authHeader) headers['Authorization'] = authHeader;
    if (cookieHeader) headers['Cookie'] = cookieHeader;

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
