import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkSameOrigin } from '@/lib/requestGuard';

export async function POST(req: NextRequest) {
    // Basic CSRF protection - verify request origin
    // 本文の無い POST なので Content-Type は求めない（画面側は Content-Type を付けずに送っている）
    const originError = checkSameOrigin(req);
    if (originError) return originError;

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
