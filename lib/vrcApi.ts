export const VRC_API_BASE = 'https://api.vrchat.cloud/api/1';
export const VRC_USER_AGENT = 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)';

export {
    asRecord,
    getTrustRank,
    instanceTypeFromApi,
    isHiddenPrivateLocation,
    isInviteLocation,
    mergeProfileFields,
    parseBadges,
    parseInstanceExtras,
    parseRepresentedGroup,
    pickInstanceOccupancy,
    pickNonEmptyString,
    pickStringArray,
    pickUserImageUrl,
    vrchatWorldPageUrl,
} from './vrcFields';

export type { InstanceCatalogView, VrcBadge, VrcRepresentedGroup } from './vrcFields';

export function buildVrcHeaders(
    authCookie?: string | null,
    twoFactorCookie?: string | null
): Record<string, string> | null {
    if (!authCookie) return null;

    let cookie = `auth=${authCookie}`;
    if (twoFactorCookie) cookie += `; twoFactorAuth=${twoFactorCookie}`;

    return {
        'User-Agent': VRC_USER_AGENT,
        Accept: 'application/json',
        Cookie: cookie,
    };
}

type InstanceCatalog = {
    categories: Map<string, string>;
    vibes: Map<string, string>;
    fetchedAt: number;
    ttl: number;
};

let instanceCatalog: InstanceCatalog | null = null;
const INSTANCE_CATALOG_TTL = 24 * 60 * 60 * 1000;
const INSTANCE_CATALOG_RETRY_TTL = 60 * 1000;

async function fetchNamedCatalog(
    url: string,
    headers: Record<string, string>,
    nameKey: 'name' | 'title'
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
        const res = await fetch(url, { headers });
        if (!res.ok) return map;
        const data: unknown = await res.json();
        if (!Array.isArray(data)) return map;
        for (const item of data) {
            const row = typeof item === 'object' && item !== null ? item as Record<string, unknown> : null;
            if (!row || row.deleted === true) continue;
            if (typeof row.id !== 'string') continue;
            const label = row[nameKey];
            if (typeof label === 'string' && label.trim()) {
                map.set(row.id, label);
            }
        }
    } catch (error: unknown) {
        console.error(`[VrcApi] Failed to fetch catalog ${url}:`, error);
    }
    return map;
}

export async function getInstanceCatalog(
    headers: Record<string, string>
): Promise<{ categories: Map<string, string>; vibes: Map<string, string> }> {
    const now = Date.now();
    if (instanceCatalog && now - instanceCatalog.fetchedAt < instanceCatalog.ttl) {
        return instanceCatalog;
    }

    const [categories, vibes] = await Promise.all([
        fetchNamedCatalog(`${VRC_API_BASE}/instanceCategories`, headers, 'name'),
        fetchNamedCatalog(`${VRC_API_BASE}/instanceVibes`, headers, 'title'),
    ]);

    const empty = categories.size === 0 && vibes.size === 0;
    if (empty && instanceCatalog) {
        return instanceCatalog;
    }

    instanceCatalog = {
        categories,
        vibes,
        fetchedAt: now,
        ttl: empty ? INSTANCE_CATALOG_RETRY_TTL : INSTANCE_CATALOG_TTL,
    };
    return instanceCatalog;
}
