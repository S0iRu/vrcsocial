import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import {
    VRC_API_BASE,
    asRecord,
    buildVrcHeaders,
    getInstanceCatalog,
    groupIdFromLocation,
    instanceTypeFromApi,
    parseInstanceExtras,
    pickNonEmptyString,
    regionLabelFromCode,
    regionLabelFromLocation,
} from '@/lib/vrcApi';

export const dynamic = 'force-dynamic';

const GROUP_CACHE_TTL = 24 * 60 * 60 * 1000;

type CachedGroup = {
    name: string;
    shortCode?: string;
    iconUrl?: string;
    cachedAt: number;
};

const serverGroupCache = new Map<string, CachedGroup>();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type GroupMeta = {
    id: string;
    name?: string;
    shortCode?: string;
    iconUrl?: string;
};

const readGroupMeta = (value: unknown): GroupMeta | null => {
    const group = asRecord(value);
    if (!group) return null;
    const id = pickNonEmptyString(group.id, group.groupId);
    if (!id.startsWith('grp_')) return null;
    const name = pickNonEmptyString(group.name);
    const shortCode = pickNonEmptyString(group.shortCode);
    const iconUrl = pickNonEmptyString(group.iconUrl, group.icon);
    return {
        id,
        name: name || undefined,
        shortCode: shortCode || undefined,
        iconUrl: iconUrl || undefined,
    };
};

const rememberGroup = (meta: GroupMeta) => {
    if (!meta.name) return;
    const cached = serverGroupCache.get(meta.id);
    serverGroupCache.set(meta.id, {
        name: meta.name,
        shortCode: meta.shortCode || cached?.shortCode,
        iconUrl: meta.iconUrl || cached?.iconUrl,
        cachedAt: Date.now(),
    });
};

export async function GET(req: NextRequest) {
    const rateCheck = checkRateLimit(req, 'groups');
    if (rateCheck.limited) {
        return rateLimitResponse(rateCheck.resetIn);
    }

    const cookieStore = await cookies();
    const headers = buildVrcHeaders(
        cookieStore.get('auth')?.value,
        cookieStore.get('twoFactorAuth')?.value
    );

    if (!headers) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const userRes = await fetch(`${VRC_API_BASE}/auth/user`, { headers });
        if (!userRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch user' }, { status: userRes.status });
        }

        const user = asRecord(await userRes.json());
        const userId = typeof user?.id === 'string' ? user.id : '';
        if (!userId.startsWith('usr_')) {
            return NextResponse.json({ error: 'Failed to resolve user' }, { status: 502 });
        }

        const [instanceRes, catalog] = await Promise.all([
            fetch(`${VRC_API_BASE}/users/${userId}/instances/groups`, { headers }),
            getInstanceCatalog(headers),
        ]);

        if (!instanceRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch group instances' }, { status: instanceRes.status });
        }

        const payload = asRecord(await instanceRes.json());
        const rawInstances = Array.isArray(payload?.instances)
            ? payload.instances
            : Array.isArray(payload)
                ? payload
                : [];
        const fetchedAt = typeof payload?.fetchedAt === 'string' ? payload.fetchedAt : null;

        type ParsedInstance = {
            groupId: string;
            location: string;
            worldId: string;
            worldName: string;
            worldImageUrl?: string;
            instanceType: string;
            region: string;
            userCount?: number;
            capacity?: number;
            displayName?: string;
            description?: string;
            category?: string;
            vibes: string[];
            languages: string[];
            ownerId?: string;
        };

        const parsed: ParsedInstance[] = [];
        const neededGroups = new Set<string>();

        for (const item of rawInstances) {
            const instance = asRecord(item);
            if (!instance) continue;
            if (instance.active === false) continue;
            if (typeof instance.closedAt === 'string' && instance.closedAt) {
                const closedAt = Date.parse(instance.closedAt);
                if (!Number.isNaN(closedAt) && closedAt <= Date.now()) continue;
            }

            const extras = parseInstanceExtras(instance, catalog);
            const world = asRecord(instance.world);
            const locationFromExtras = extras.location ?? '';
            const worldId = pickNonEmptyString(extras.worldId, world?.id, locationFromExtras.split(':')[0]);
            const instanceId = pickNonEmptyString(extras.instanceId, instance.id);
            const location = locationFromExtras || (worldId && instanceId ? `${worldId}:${instanceId}` : '');
            if (!location.startsWith('wrld_')) continue;

            const embedded = readGroupMeta(instance.group);
            const explicitGroupId = typeof instance.groupId === 'string' ? instance.groupId : '';
            const groupId = groupIdFromLocation(location) || embedded?.id || explicitGroupId;
            if (!groupId.startsWith('grp_')) continue;
            if (embedded?.name) rememberGroup({ ...embedded, id: groupId });
            const cachedGroup = serverGroupCache.get(groupId);
            const cacheFresh = Boolean(cachedGroup?.name) && Date.now() - (cachedGroup?.cachedAt ?? 0) < GROUP_CACHE_TTL;
            if (!cacheFresh) neededGroups.add(groupId);

            const worldName = pickNonEmptyString(world?.name) || `World ${worldId}`;
            const worldImageUrl = pickNonEmptyString(world?.thumbnailImageUrl, world?.imageUrl);
            const region = regionLabelFromLocation(location)
                || (typeof instance.photonRegion === 'string' ? regionLabelFromCode(instance.photonRegion) : '')
                || (typeof instance.region === 'string' ? regionLabelFromCode(instance.region) : '');
            let instanceType = instanceTypeFromApi(extras.type, extras.groupAccessType);
            if (!instanceType.startsWith('Group') && location.includes('~group(')) {
                const access = location.includes('groupAccessType(public)')
                    ? 'public'
                    : location.includes('groupAccessType(plus)')
                        ? 'plus'
                        : 'members';
                instanceType = instanceTypeFromApi('group', access);
            }
            const worldCapacity = world && typeof world.capacity === 'number' ? world.capacity : undefined;

            parsed.push({
                groupId,
                location,
                worldId,
                worldName,
                worldImageUrl: worldImageUrl || undefined,
                instanceType,
                region,
                userCount: extras.occupancy,
                capacity: extras.capacity ?? worldCapacity,
                displayName: extras.displayName || undefined,
                description: extras.description || undefined,
                category: extras.categoryName || undefined,
                vibes: extras.vibeNames,
                languages: extras.languages,
                ownerId: extras.ownerId,
            });
        }

        const missingIds = Array.from(neededGroups);
        for (let index = 0; index < missingIds.length; index++) {
            const groupId = missingIds[index];
            const cached = serverGroupCache.get(groupId);
            if (cached && Date.now() - cached.cachedAt < GROUP_CACHE_TTL && cached.name) continue;
            if (index > 0) await wait(500);

            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const groupRes = await fetch(`${VRC_API_BASE}/groups/${groupId}`, { headers });
                    if (groupRes.ok) {
                        const meta = readGroupMeta(await groupRes.json());
                        if (meta?.name) rememberGroup(meta);
                        break;
                    }
                    if (groupRes.status === 429 && attempt === 0) {
                        await wait(3000);
                        continue;
                    }
                    break;
                } catch (error: unknown) {
                    console.error(`[GroupInstances] Failed to fetch group ${groupId}:`, error);
                    break;
                }
            }
        }

        const grouped = new Map<string, {
            id: string;
            name: string;
            shortCode?: string;
            iconUrl?: string;
            instances: Omit<ParsedInstance, 'groupId'>[];
        }>();

        for (const instance of parsed) {
            const cached = serverGroupCache.get(instance.groupId);
            let section = grouped.get(instance.groupId);
            if (!section) {
                section = {
                    id: instance.groupId,
                    name: cached?.name || 'Group',
                    shortCode: cached?.shortCode,
                    iconUrl: cached?.iconUrl,
                    instances: [],
                };
                grouped.set(instance.groupId, section);
            }
            section.instances.push({
                location: instance.location,
                worldId: instance.worldId,
                worldName: instance.worldName,
                worldImageUrl: instance.worldImageUrl,
                instanceType: instance.instanceType,
                region: instance.region,
                userCount: instance.userCount,
                capacity: instance.capacity,
                displayName: instance.displayName,
                description: instance.description,
                category: instance.category,
                vibes: instance.vibes,
                languages: instance.languages,
                ownerId: instance.ownerId,
            });
        }

        return NextResponse.json({
            fetchedAt,
            groups: Array.from(grouped.values()),
        });
    } catch (error: unknown) {
        console.error('[GroupInstances] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
