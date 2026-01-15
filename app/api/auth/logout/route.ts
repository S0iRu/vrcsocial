import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';

export async function POST(req: NextRequest) {
    // Basic CSRF protection - verify request origin
    const headersList = await headers();
    const origin = headersList.get('origin');
    const referer = headersList.get('referer');
    const host = headersList.get('host');

    // In production, verify the origin matches our host
    if (process.env.NODE_ENV === 'production' && origin) {
        const allowedOrigins = [
            `https://${host}`,
            `http://${host}` // For development with production flag
        ];
        if (!allowedOrigins.some(allowed => origin.startsWith(allowed))) {
            return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
        }
    }

    const cookieStore = await cookies();
    
    // Get auth cookies for VRChat API logout
    const authCookie = cookieStore.get('auth')?.value;
    const twoFactorCookie = cookieStore.get('twoFactorAuth')?.value;

    // Call VRChat API logout endpoint to invalidate the session
    if (authCookie) {
        try {
            const cookieHeader = twoFactorCookie 
                ? `auth=${authCookie}; twoFactorAuth=${twoFactorCookie}`
                : `auth=${authCookie}`;
            
            await fetch('https://api.vrchat.cloud/api/1/logout', {
                method: 'PUT',
                headers: {
                    'Cookie': cookieHeader,
                    'User-Agent': 'VRC Social/1.0.0'
                }
            });
        } catch (error) {
            // Log error but continue with local logout
            console.error('Failed to logout from VRChat API:', error);
        }
    }

    // Delete all authentication cookies
    cookieStore.delete('auth');
    cookieStore.delete('twoFactorAuth');
    cookieStore.delete('vrc_creds');
    cookieStore.delete('apiKey');

    return NextResponse.json({ success: true });
}
