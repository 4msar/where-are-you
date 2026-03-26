import { NextRequest, NextResponse } from "next/server";
import {
    saveUserLocation,
    getAllUserLocations,
    getUserLocation,
} from "@/lib/kv";

export async function GET() {
    try {
        const locations = await getAllUserLocations();
        return NextResponse.json(locations);
    } catch (error) {
        console.error("Error fetching locations:", error);
        return NextResponse.json(
            { error: "Failed to fetch locations" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { username, displayName, avatarUrl, location, status } = body;

        const normalizedStatus =
            status === "active" || status === "idle" || status === "left"
                ? status
                : "active";

        const existing = username ? await getUserLocation(username) : null;
        const resolvedLocation =
            typeof location?.lat === "number" &&
            typeof location?.lng === "number"
                ? location
                : existing?.location;
        const resolvedDisplayName =
            typeof displayName === "string" && displayName.trim().length > 0
                ? displayName
                : existing?.displayName;

        if (
            !username ||
            !resolvedDisplayName ||
            typeof resolvedLocation?.lat !== "number" ||
            typeof resolvedLocation?.lng !== "number"
        ) {
            return NextResponse.json(
                {
                    error: "Missing required fields: username, displayName, location (lat, lng)",
                },
                { status: 400 },
            );
        }

        const usernamePattern = /^[a-z0-9-]+$/;
        if (!usernamePattern.test(username)) {
            return NextResponse.json(
                {
                    error: "Username can only contain lowercase letters, numbers and hyphens",
                },
                { status: 400 },
            );
        }

        await saveUserLocation({
            username,
            displayName: resolvedDisplayName,
            avatarUrl:
                typeof avatarUrl === "string" ? avatarUrl : existing?.avatarUrl,
            status: normalizedStatus,
            location: resolvedLocation,
            lastUpdated: new Date().toISOString(),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error saving location:", error);
        return NextResponse.json(
            { error: "Failed to save location" },
            { status: 500 },
        );
    }
}
