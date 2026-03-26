import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

export interface UserLocation {
  username: string;
  displayName: string;
  location: {
    lat: number;
    lng: number;
  };
  lastUpdated: string;
}

const R2_ENDPOINT = process.env.R2_ENDPOINT!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

function getS3Client() {
  return new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

export async function saveUserLocation(data: UserLocation): Promise<void> {
  const client = getS3Client();
  const key = `users/${data.username}.json`;

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
    })
  );
}

export async function getUserLocation(username: string): Promise<UserLocation | null> {
  const client = getS3Client();
  const key = `users/${username}.json`;

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as UserLocation;
  } catch {
    return null;
  }
}

export async function getAllUserLocations(): Promise<UserLocation[]> {
  const client = getS3Client();

  try {
    const listResponse = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: "users/",
      })
    );

    const objects = listResponse.Contents ?? [];
    const locations: UserLocation[] = [];

    await Promise.all(
      objects.map(async (obj) => {
        if (!obj.Key) return;
        try {
          const getResponse = await client.send(
            new GetObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: obj.Key,
            })
          );
          const body = await getResponse.Body?.transformToString();
          if (body) {
            locations.push(JSON.parse(body) as UserLocation);
          }
        } catch {
          // skip individual failures
        }
      })
    );

    return locations;
  } catch {
    return [];
  }
}

export async function usernameExists(username: string): Promise<boolean> {
  const existing = await getUserLocation(username);
  return existing !== null;
}
