export const VRC_API_BASE = 'https://api.vrchat.cloud/api/1';
export const VRC_USER_AGENT = 'VRCSocial/1.0.0 (GitHub: vrcsocial-dev)';

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

export function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

export function pickNonEmptyString(...candidates: unknown[]): string {
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
    return '';
}

export function pickStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function pickUserImageUrl(source: unknown): string {
    const user = asRecord(source);
    if (!user) return '';
    return pickNonEmptyString(
        user.iconUrl,
        user.userIcon,
        user.profilePicOverrideThumbnail,
        user.profilePicOverride,
        user.imageUrl,
        user.currentAvatarThumbnailImageUrl,
        user.currentAvatarImageUrl,
        user.icon
    );
}

export type VrcBadge = {
    badgeId: string;
    badgeName: string;
    badgeDescription?: string;
    badgeImageUrl?: string;
    assignedAt?: string;
    showcased?: boolean;
};

export function parseBadges(value: unknown): VrcBadge[] {
    if (!Array.isArray(value)) return [];

    const badges: VrcBadge[] = [];
    for (const item of value) {
        const badge = asRecord(item);
        if (!badge) continue;
        if (badge.hidden === true) continue;
        if (typeof badge.badgeId !== 'string' || typeof badge.badgeName !== 'string') continue;
        badges.push({
            badgeId: badge.badgeId,
            badgeName: badge.badgeName,
            badgeDescription: typeof badge.badgeDescription === 'string' ? badge.badgeDescription : undefined,
            badgeImageUrl: typeof badge.badgeImageUrl === 'string' ? badge.badgeImageUrl : undefined,
            assignedAt: typeof badge.assignedAt === 'string' ? badge.assignedAt : undefined,
            showcased: badge.showcased === true,
        });
    }

    return badges.sort((a, b) => Number(b.showcased) - Number(a.showcased));
}

export type VrcRepresentedGroup = {
    id: string;
    name: string;
    iconUrl?: string;
};

export function parseRepresentedGroup(value: unknown): VrcRepresentedGroup | null {
    const group = asRecord(value);
    if (!group) return null;
    if (typeof group.id !== 'string' || typeof group.name !== 'string') return null;
    return {
        id: group.id,
        name: group.name,
        iconUrl: typeof group.iconUrl === 'string' ? group.iconUrl : undefined,
    };
}

export function getTrustRank(tags?: unknown, trustTags?: unknown): string {
    const combined = [...pickStringArray(tags), ...pickStringArray(trustTags)];
    if (combined.includes('system_trust_legend') || combined.includes('system_trust_veteran')) {
        return 'Trusted User';
    }
    if (combined.includes('system_trust_trusted')) return 'Known User';
    if (combined.includes('system_trust_known')) return 'User';
    if (combined.includes('system_trust_basic')) return 'New User';
    return 'Visitor';
}

export function mergeProfileFields(user: unknown, profile: unknown) {
    const userObj = asRecord(user) ?? {};
    const profileObj = asRecord(profile) ?? {};

    return {
        icon: pickUserImageUrl(profileObj) || pickUserImageUrl(userObj),
        bannerUrl: pickNonEmptyString(userObj.bannerUrl, profileObj.bannerUrl),
        profilePicOverride: pickNonEmptyString(
            userObj.profilePicOverride,
            profileObj.profilePicOverride,
            userObj.bannerUrl
        ),
        bio: pickNonEmptyString(profileObj.bio, userObj.bio),
        bioLinks: (() => {
            const fromProfile = pickStringArray(profileObj.bioLinks);
            return fromProfile.length > 0 ? fromProfile : pickStringArray(userObj.bioLinks);
        })(),
        pronouns: pickNonEmptyString(profileObj.pronouns, userObj.pronouns),
        badges: parseBadges(profileObj.badges ?? userObj.badges),
        trust: getTrustRank(userObj.tags, profileObj.trustTags ?? userObj.trustTags),
        representedGroup: parseRepresentedGroup(profileObj.representedGroup),
    };
}

type InstanceCatalog = {
    categories: Map<string, string>;
    vibes: Map<string, string>;
    fetchedAt: number;
};

let instanceCatalog: InstanceCatalog | null = null;
const INSTANCE_CATALOG_TTL = 24 * 60 * 60 * 1000;

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
            const row = asRecord(item);
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
): Promise<InstanceCatalog> {
    const now = Date.now();
    if (instanceCatalog && now - instanceCatalog.fetchedAt < INSTANCE_CATALOG_TTL) {
        return instanceCatalog;
    }

    const [categories, vibes] = await Promise.all([
        fetchNamedCatalog(`${VRC_API_BASE}/instanceCategories`, headers, 'name'),
        fetchNamedCatalog(`${VRC_API_BASE}/instanceVibes`, headers, 'title'),
    ]);

    instanceCatalog = { categories, vibes, fetchedAt: now };
    return instanceCatalog;
}

export function parseInstanceExtras(
    data: unknown,
    catalog?: InstanceCatalog | null
) {
    const instance = asRecord(data) ?? {};
    const categoryId = typeof instance.categoryId === 'string' ? instance.categoryId : '';
    const vibeIds = pickStringArray(instance.vibeIds);

    return {
        displayName: pickNonEmptyString(instance.displayName),
        description: pickNonEmptyString(instance.description),
        categoryId,
        categoryName: (categoryId && catalog?.categories.get(categoryId)) || '',
        vibeIds,
        vibeNames: vibeIds
            .map((id) => catalog?.vibes.get(id))
            .filter((name): name is string => Boolean(name)),
        languages: pickStringArray(instance.languagesIso639).length > 0
            ? pickStringArray(instance.languagesIso639)
            : pickStringArray(instance.languages),
        n_users: typeof instance.n_users === 'number' ? instance.n_users : undefined,
        userCount: typeof instance.userCount === 'number' ? instance.userCount : undefined,
        capacity: typeof instance.capacity === 'number' ? instance.capacity : undefined,
        ownerId: typeof instance.ownerId === 'string' ? instance.ownerId : undefined,
        type: typeof instance.type === 'string' ? instance.type : undefined,
        groupAccessType: typeof instance.groupAccessType === 'string' ? instance.groupAccessType : undefined,
        instanceId: typeof instance.instanceId === 'string' ? instance.instanceId : undefined,
        location: typeof instance.location === 'string' ? instance.location : undefined,
        worldId: typeof instance.worldId === 'string' ? instance.worldId : undefined,
    };
}
