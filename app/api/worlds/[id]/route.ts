import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const API_BASE = 'https://api.vrchat.cloud/api/1';
const USER_AGENT = 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)';

/**
 * GET /api/worlds/[id]
 * 
 * Fetches world information from VRChat API.
 * Used to get world details when WebSocket events don't include world info.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Rate limiting check
    const rateCheck = checkRateLimit(req, 'worlds');
    if (rateCheck.limited) {
        return rateLimitResponse(rateCheck.resetIn);
    }

    const { id: worldId } = await params;

    // Input validation: World ID must match VRChat format
    if (!worldId || typeof worldId !== 'string' || !worldId.startsWith('wrld_') || worldId.length > 50) {
        return NextResponse.json(
            { error: 'Invalid world ID' },
            { status: 400 }
        );
    }

    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth')?.value;

    if (!authCookie) {
        return NextResponse.json(
            { error: 'Not authenticated' },
            { status: 401 }
        );
    }

    const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Cookie': `auth=${authCookie}`
    };

    try {
        const res = await fetch(`${API_BASE}/worlds/${worldId}`, { headers });

        if (!res.ok) {
            console.error(`[WorldsAPI] Failed to fetch world ${worldId}:`, res.status);
            return NextResponse.json(
                { error: 'Failed to fetch world' },
                { status: res.status }
            );
        }

        const worldData = await res.json();

        // Return simplified world data
        return NextResponse.json({
            id: worldData.id,
            name: worldData.name,
            description: worldData.description,
            authorId: worldData.authorId,
            authorName: worldData.authorName,
            thumbnailImageUrl: worldData.thumbnailImageUrl,
            imageUrl: worldData.imageUrl,
            capacity: worldData.capacity,
            recommendedCapacity: worldData.recommendedCapacity,
            occupants: worldData.occupants,
            publicOccupants: worldData.publicOccupants,
            privateOccupants: worldData.privateOccupants,
            tags: worldData.tags,
            releaseStatus: worldData.releaseStatus,
            favorites: worldData.favorites,
            visits: worldData.visits,
            popularity: worldData.popularity,
            heat: worldData.heat,
        });

    } catch (error: any) {
        console.error('[WorldsAPI] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
