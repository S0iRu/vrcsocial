import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = 'https://api.vrchat.cloud/api/1';
const USER_AGENT = 'VRCSocial/1.0.0 dev_test_vrc@gmail.com';

export async function POST(req: NextRequest) {
    try {
        const { code } = await req.json();
        const cookieStore = await cookies();

        const authCookie = cookieStore.get('auth')?.value;
        const twoFactorCookie = cookieStore.get('twoFactorAuth')?.value;

        // Build Cookie Header
        let cookieHeaderStr = '';
        if (authCookie) cookieHeaderStr += `auth=${authCookie}; `;
        if (twoFactorCookie) cookieHeaderStr += `twoFactorAuth=${twoFactorCookie}; `;

        if (!authCookie) {
            return NextResponse.json({ error: 'Session expired (No auth cookie)' }, { status: 400 });
        }

        console.log(`[Verify] Trying TOTP with cookie length: ${cookieHeaderStr.length}`);

        // Try TOTP
        let verifyRes = await fetch(`${API_BASE}/auth/twofactorauth/totp/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': USER_AGENT,
                'Cookie': cookieHeaderStr
            },
            body: JSON.stringify({ code })
        });

        // Try Email OTP if failed
        if (!verifyRes.ok) {
            console.log('[Verify] TOTP failed, trying Email OTP...');
            const emailRes = await fetch(`${API_BASE}/auth/twofactorauth/emailotp/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': USER_AGENT,
                    'Cookie': cookieHeaderStr
                },
                body: JSON.stringify({ code })
            });
            if (emailRes.ok) verifyRes = emailRes;
        }

        if (!verifyRes.ok) {
            const errorData = await verifyRes.json();
            return NextResponse.json({ error: 'Verification failed', details: errorData }, { status: 400 });
        }

        const data = await verifyRes.json();

        if (data.verified) {
            const response = NextResponse.json({ verified: true });

            // Extract cookies manually
            const headerVal = verifyRes.headers.get('set-cookie');
            if (headerVal) {
                const rawCookies = headerVal.split(/,(?=\s*\S+=)/);
                rawCookies.forEach(cookieStr => {
                    const [keyVal] = cookieStr.split(';');
                    const [key, val] = keyVal.split('=');
                    if (['auth', 'twoFactorAuth', 'apiKey'].includes(key.trim())) {
                        response.cookies.set(key.trim(), val, {
                            httpOnly: true,
                            secure: process.env.NODE_ENV === 'production',
                            path: '/'
                        });
                    }
                });
            }
            return response;
        }

        return NextResponse.json({ error: 'Code invalid' }, { status: 400 });

    } catch (error: any) {
        console.error('[Verify] Error:', error);
        return NextResponse.json({ error: 'Internal Error', details: error.message }, { status: 500 });
    }
}
