import { NextRequest, NextResponse } from "next/server";
import { saveUserLocation, getAllUserLocations } from "@/lib/r2";

export async function GET() {
  try {
    const locations = await getAllUserLocations();
    return NextResponse.json(locations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    return NextResponse.json(
      { error: "Failed to fetch locations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, displayName, location } = body;

    if (!username || !displayName || !location?.lat || !location?.lng) {
      return NextResponse.json(
        { error: "Missing required fields: username, displayName, location (lat, lng)" },
        { status: 400 }
      );
    }

    const usernamePattern = /^[a-z0-9-]+$/;
    if (!usernamePattern.test(username)) {
      return NextResponse.json(
        { error: "Username can only contain lowercase letters, numbers and hyphens" },
        { status: 400 }
      );
    }

    await saveUserLocation({
      username,
      displayName,
      location,
      lastUpdated: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving location:", error);
    return NextResponse.json(
      { error: "Failed to save location" },
      { status: 500 }
    );
  }
}
