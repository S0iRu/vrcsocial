import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, rateLimitResponse, addRateLimitHeaders, resetRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.vrchat.cloud/api/1';

// User-Agent: Specific format required by VRChat API (AppName/Version Contact)
// Even if not strictly documented in some places, it is enforced by their WAF.
const USER_AGENT = 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)';

export async function GET(req: NextRequest) {
    try {
        const res = await fetch(`${API_BASE}/config`, {
            headers: { 'User-Agent': USER_AGENT }
        });
        if (res.ok) {
            const data = await res.json();
            return NextResponse.json({ status: 'ok', message: 'VRChat API Reachable', appName: data.appName });
        }
        return NextResponse.json({ status: 'error', code: res.status }, { status: 502 });
    } catch (e: any) {
        return NextResponse.json({ status: 'error', message: 'Service unavailable' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    // Rate limiting check - 5 attempts per 15 minutes
    const rateCheck = checkRateLimit(req, 'login');
    if (rateCheck.limited) {
        return rateLimitResponse(rateCheck.resetIn);
    }

    try {
        const body = await req.json();
        const { username, password } = body;

        // Input validation
        if (!username || typeof username !== 'string' || username.length > 100) {
            return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
        }
        if (!password || typeof password !== 'string' || password.length > 200) {
            return NextResponse.json({ error: 'Invalid password' }, { status: 400 });
        }

        const credentials = Buffer.from(`${username}:${password}`).toString('base64');
        const authHeader = `Basic ${credentials}`;

        // Get existing cookies to potentially skip 2FA
        const cookieStore = await cookies();
        const existingTwoFactorAuth = cookieStore.get('twoFactorAuth')?.value;
        
        // Build request headers
        const requestHeaders: Record<string, string> = {
            'Authorization': authHeader,
            'User-Agent': USER_AGENT,
            'Accept': 'application/json'
        };
        
        // If we have a valid twoFactorAuth cookie, send it to potentially skip 2FA
        if (existingTwoFactorAuth) {
            requestHeaders['Cookie'] = `twoFactorAuth=${existingTwoFactorAuth}`;
            console.log('[Login] Sending existing twoFactorAuth cookie to skip 2FA');
        }

        const res = await fetch(`${API_BASE}/auth/user`, {
            method: 'GET',
            headers: requestHeaders
        });

        // Handle Cookie Extraction - using standard API if available
        let cookieStrictVerify = false; // Flag to see if we need to manually relax cookies

        // Helper to get cookies from response
        const getCookies = (response: Response): string[] => {
            // @ts-ignore: getSetCookie is available in newer Node/Next environments
            if (typeof response.headers.getSetCookie === 'function') {
                // @ts-ignore
                return response.headers.getSetCookie();
            }
            // Fallback for older environments: simplistic split
            const raw = response.headers.get('set-cookie');
            if (!raw) return [];
            return raw.split(/,(?=\s*[a-zA-Z0-9_-]+=)/).map(s => s.trim());
        };

        const cookieStrings = getCookies(res);
        console.log(`[Login] Received ${cookieStrings.length} cookies from VRChat`);

        // Prepare Frontend Response
        let response: NextResponse;

        // --- 2FA REQUIRED (401) ---
        if (res.status === 401) {
            const text = await res.text();
            let data;
            try { data = JSON.parse(text); } catch { data = { error: text }; }

            // Detect 2FA requirement
            const requires2FA = data.requiresTwoFactorAuth ||
                (data.error?.message?.toLowerCase().includes('two-factor'));

            if (requires2FA) {
                console.log('[Login] 2FA Required');
                response = NextResponse.json({
                    requiresTwoFactorAuth: true,
                    twoFactorAuthType: data.requiresTwoFactorAuth || ['totp']
                }, { status: 401 });
            } else {
                console.log('[Login] Unauthorized (Credentials likely wrong)');
                return NextResponse.json(data, { status: 401 });
            }
        }
        // --- SUCCESS (200) ---
        else if (res.ok) {
            console.log('[Login] Success (200)');
            const userData = await res.json();

            // Check if 2FA is actually required despite 200 OK
            // VRChat sometimes returns 200 with requiresTwoFactorAuth array
            if (Array.isArray(userData.requiresTwoFactorAuth) && userData.requiresTwoFactorAuth.length > 0) {
                console.log('[Login] 2FA actually required (found in 200 response)');
                response = NextResponse.json({
                    requiresTwoFactorAuth: true,
                    twoFactorAuthType: userData.requiresTwoFactorAuth
                }, { status: 401 }); // Force 401 so frontend switches to 2FA view
            } else {
                // Real success - Do NOT send credentials to client for security
                response = NextResponse.json({ user: userData, success: true });
            }
        }

        // --- ERROR ---
        else {
            console.error(`[Login] API Error: ${res.status}`);
            return NextResponse.json({ error: `API Error ${res.status}` }, { status: res.status });
        }

        // --- FORWARD COOKIES ---
        // We must forward VRChat cookies to the client browser.
        // Important: VRChat cookies might be Secure/SameSite=None. 
        // For localhost (http), we MUST relax Secure to false and SameSite to Lax.

        cookieStrings.forEach(cookieStr => {
            // Format: Name=Value; Path=/; Secure; HttpOnly...
            const firstSemi = cookieStr.indexOf(';');
            const nameValue = firstSemi > 0 ? cookieStr.slice(0, firstSemi) : cookieStr;
            const [name, ...valParts] = nameValue.split('=');
            const value = valParts.join('=');

            if (name && value) {
                const lowerName = name.trim().toLowerCase();
                // We forward specific auth cookies. 'auth' is critical.
                if (['auth', 'twofactorauth', 'apikey'].includes(lowerName)) {
                    console.log(`[Login] Forwarding Valid Cookie: ${name.trim()}`);
                    // twoFactorAuth cookie gets longer expiry to avoid repeated 2FA
                    const maxAge = lowerName === 'twofactorauth' 
                        ? 60 * 60 * 24 * 30  // 30 days for 2FA
                        : 60 * 60 * 24 * 7;  // 7 days for others
                    response.cookies.set({
                        name: name.trim(),
                        value: value.trim(),
                        httpOnly: true,
                        path: '/',
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'strict',
                        maxAge
                    });
                }
            }
        });

        // Preserve existing twoFactorAuth cookie if we have it and VRChat didn't send a new one
        if (existingTwoFactorAuth && !cookieStrings.some(c => c.toLowerCase().startsWith('twofactorauth='))) {
            console.log('[Login] Preserving existing twoFactorAuth cookie');
            response.cookies.set({
                name: 'twoFactorAuth',
                value: existingTwoFactorAuth,
                httpOnly: true,
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 24 * 30 // 30 days
            });
        }

        return response;

    } catch (e: any) {
        console.error('[Login] Exception:', e);
        // Don't expose internal error details to client
        return NextResponse.json({ error: 'An error occurred during login' }, { status: 500 });
    }
}
