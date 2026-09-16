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

export function vrchatWorldPageUrl(locationOrWorldId: string): string | null {
    const worldId = locationOrWorldId.startsWith('wrld_') ? locationOrWorldId.split(':')[0] : '';
    return worldId.startsWith('wrld_') ? `https://vrchat.com/home/world/${worldId}` : null;
}

export function isHiddenPrivateLocation(location: string): boolean {
    return location === 'private';
}

export function isInviteLocation(location: string): boolean {
    return location.startsWith('wrld_') && location.includes('~private(');
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
        bannerUrl: pickNonEmptyString(profileObj.bannerUrl, userObj.bannerUrl),
        profilePicOverride: pickNonEmptyString(
            profileObj.profilePicOverride,
            userObj.profilePicOverride,
            profileObj.bannerUrl,
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

export type InstanceCatalogView = {
    categories: Map<string, string>;
    vibes: Map<string, string>;
};

export function pickInstanceOccupancy(data: unknown): number | undefined {
    const instance = asRecord(data);
    if (!instance) return undefined;

    const candidates: number[] = [];
    const push = (value: unknown) => {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
            candidates.push(value);
        }
    };

    push(instance.n_users);
    push(instance.userCount);
    if (Array.isArray(instance.users)) push(instance.users.length);

    const platforms = asRecord(instance.platforms);
    if (platforms) {
        let sum = 0;
        let hasPlatform = false;
        for (const key of ['android', 'ios', 'standalonewindows']) {
            const count = platforms[key];
            if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
                sum += count;
                hasPlatform = true;
            }
        }
        if (hasPlatform) candidates.push(sum);
    }

    if (candidates.length === 0) return undefined;
    return Math.max(...candidates);
}

export function instanceTypeFromApi(apiType?: string, groupAccessType?: string): string {
    if (!apiType) return 'Public';
    switch (apiType.toLowerCase()) {
        case 'public': return 'Public';
        case 'friends': return 'Friends';
        case 'hidden': return 'Friends+';
        case 'private': return 'Invite';
        case 'invite': return 'Invite';
        case 'inviteplus': return 'Invite+';
        case 'group':
            if (groupAccessType === 'public') return 'Group Public';
            if (groupAccessType === 'plus') return 'Group+';
            return 'Group';
        default: return apiType;
    }
}

export function parseInstanceExtras(
    data: unknown,
    catalog?: InstanceCatalogView | null
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
        occupancy: pickInstanceOccupancy(instance),
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
