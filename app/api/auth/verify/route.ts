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

            // Helper to get cookies from response (same as login route)
            const getCookies = (res: Response): string[] => {
                // @ts-ignore: getSetCookie is available in newer Node/Next environments
                if (typeof res.headers.getSetCookie === 'function') {
                    // @ts-ignore
                    return res.headers.getSetCookie();
                }
                // Fallback for older environments
                const raw = res.headers.get('set-cookie');
                if (!raw) return [];
                return raw.split(/,(?=\s*[a-zA-Z0-9_-]+=)/).map(s => s.trim());
            };

            // Extract and forward cookies
            const cookieStrings = getCookies(verifyRes);
            console.log(`[Verify] Received ${cookieStrings.length} cookies from VRChat`);
            
            cookieStrings.forEach(cookieStr => {
                const firstSemi = cookieStr.indexOf(';');
                const nameValue = firstSemi > 0 ? cookieStr.slice(0, firstSemi) : cookieStr;
                const [name, ...valParts] = nameValue.split('=');
                const value = valParts.join('=');

                if (name && value) {
                    const lowerName = name.trim().toLowerCase();
                    if (['auth', 'twofactorauth', 'apikey'].includes(lowerName)) {
                        console.log(`[Verify] Forwarding cookie: ${name.trim()}`);
                        response.cookies.set({
                            name: name.trim(),
                            value: value.trim(),
                            httpOnly: true,
                            secure: process.env.NODE_ENV === 'production',
                            path: '/',
                            sameSite: 'strict',
                            maxAge: 60 * 60 * 24 * 30 // 30 days for 2FA cookie
                        });
                    }
                }
            });
            
            return response;
        }

        return NextResponse.json({ error: 'Code invalid' }, { status: 400 });

    } catch (error: any) {
        console.error('[Verify] Error:', error);
        return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
    }
}
