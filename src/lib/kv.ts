export interface UserLocation {
  username: string;
  displayName: string;
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
        `Please add it to your .env.local file. See .env.example for reference.`
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

export async function getUserLocation(
  username: string
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
      { headers: kvAuthHeader() }
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
    allKeys.map((key) => getUserLocation(key))
  );

  return locations.filter((l): l is UserLocation => l !== null);
}

export async function usernameExists(username: string): Promise<boolean> {
  const existing = await getUserLocation(username);
  return existing !== null;
}
