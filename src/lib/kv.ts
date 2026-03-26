export interface UserLocation {
    username: string;
    displayName: string;
    avatarUrl?: string;
    status: "active" | "idle" | "left";
    location: {
        lat: number;
        lng: number;
    };
    lastUpdated: string;
}

function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `Missing required environment variable: ${name}. ` +
                `Please add it to your .env.local file. See .env.example for reference.`,
        );
    }
    return value;
}

const KV_BASE_URL = () => {
    const accountId = getRequiredEnv("CLOUDFLARE_ACCOUNT_ID");
    const namespaceId = getRequiredEnv("CLOUDFLARE_KV_NAMESPACE_ID");
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;
};

const kvAuthHeader = () => ({
    Authorization: `Bearer ${getRequiredEnv("CLOUDFLARE_KV_API_TOKEN")}`,
});

export async function saveUserLocation(data: UserLocation): Promise<void> {
    const url = `${KV_BASE_URL()}/values/${encodeURIComponent(data.username)}`;
    const res = await fetch(url, {
        method: "PUT",
        headers: { ...kvAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`KV write failed (${res.status}): ${text}`);
    }
}

export async function deleteUserLocation(username: string): Promise<void> {
    const url = `${KV_BASE_URL()}/values/${encodeURIComponent(username)}`;
    const res = await fetch(url, {
        method: "DELETE",
        headers: kvAuthHeader(),
    });

    if (res.status === 404) return;
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`KV delete failed (${res.status}): ${text}`);
    }
}

export async function getUserLocation(
    username: string,
): Promise<UserLocation | null> {
    const url = `${KV_BASE_URL()}/values/${encodeURIComponent(username)}`;
    const res = await fetch(url, {
        headers: kvAuthHeader(),
    });

    if (res.status === 404) return null;
    if (!res.ok) return null;

    try {
        return (await res.json()) as UserLocation;
    } catch {
        return null;
    }
}

export async function getAllUserLocations(): Promise<UserLocation[]> {
    // List all keys in the namespace (paginated, cursor-based)
    const allKeys: string[] = [];
    let cursor: string | undefined;

    do {
        const params = new URLSearchParams({ limit: "1000" });
        if (cursor) params.set("cursor", cursor);

        const listRes = await fetch(
            `${KV_BASE_URL()}/keys?${params.toString()}`,
            { headers: kvAuthHeader() },
        );

        if (!listRes.ok) break;

        const json = (await listRes.json()) as {
            result: { name: string }[];
            result_info?: { cursor?: string };
        };

        for (const key of json.result ?? []) {
            allKeys.push(key.name);
        }

        cursor = json.result_info?.cursor;
    } while (cursor);

    // Fetch each value in parallel
    const locations = await Promise.all(
        allKeys.map((key) => getUserLocation(key)),
    );

    return locations.filter((l): l is UserLocation => l !== null);
}

export async function usernameExists(username: string): Promise<boolean> {
    const existing = await getUserLocation(username);
    return existing !== null;
}

export async function upsertUserProfile(options: {
    oldUsername: string;
    newUsername?: string;
    displayName?: string;
    avatarUrl?: string;
    status?: UserLocation["status"];
}): Promise<UserLocation> {
    const existing = await getUserLocation(options.oldUsername);
    if (!existing) {
        throw new Error("User not found");
    }

    const targetUsername =
        options.newUsername && options.newUsername.trim()
            ? options.newUsername.trim()
            : existing.username;

    const updated: UserLocation = {
        ...existing,
        username: targetUsername,
        displayName:
            typeof options.displayName === "string" &&
            options.displayName.trim().length > 0
                ? options.displayName.trim()
                : existing.displayName,
        avatarUrl:
            typeof options.avatarUrl === "string"
                ? options.avatarUrl.trim() || undefined
                : existing.avatarUrl,
        status: options.status ?? existing.status ?? "active",
        lastUpdated: new Date().toISOString(),
    };

    await saveUserLocation(updated);

    if (targetUsername !== options.oldUsername) {
        await deleteUserLocation(options.oldUsername);
    }

    return updated;
}
