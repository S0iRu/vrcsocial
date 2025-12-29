import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

const API_BASE = 'https://api.vrchat.cloud/api/1';
const USER_AGENT = 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)';

export async function POST(req: NextRequest) {
    // Rate limiting check - 10 attempts per 15 minutes
    const rateCheck = checkRateLimit(req, 'verify');
    if (rateCheck.limited) {
        return rateLimitResponse(rateCheck.resetIn);
    }

    try {
        const body = await req.json();
        const { code } = body;

        // Input validation for 2FA code
        if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
            return NextResponse.json({ error: 'Invalid verification code format' }, { status: 400 });
        }
        const cookieStore = await cookies();

        const authCookie = cookieStore.get('auth')?.value;
        const twoFactorCookie = cookieStore.get('twoFactorAuth')?.value;

        // Build Cookie Header
        let cookieHeaderStr = '';
        if (authCookie) cookieHeaderStr += `auth=${authCookie}; `;
        if (twoFactorCookie) cookieHeaderStr += `twoFactorAuth=${twoFactorCookie}; `;

        if (!authCookie) {
            return NextResponse.json({ error: 'Session expired' }, { status: 400 });
        }

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
            // Don't expose API error details to client
            return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
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
                            path: '/',
                            sameSite: 'strict',
                            maxAge: 60 * 60 * 24 * 7
                        });
                    }
                });
            }
            return response;
        }

        return NextResponse.json({ error: 'Code invalid' }, { status: 400 });

    } catch (error: any) {
        console.error('[Verify] Error:', error);
        return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
    }
}
