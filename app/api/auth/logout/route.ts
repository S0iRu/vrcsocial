import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    const cookieStore = await cookies();

    // Delete authentication cookies
    cookieStore.delete('auth');
    cookieStore.delete('twoFactorAuth'); // If exists
    cookieStore.delete('vrc_creds'); // If we ever stored it in cookie

    return NextResponse.json({ success: true });
}
