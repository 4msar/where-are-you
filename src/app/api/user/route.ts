import { NextRequest, NextResponse } from "next/server";
import { getUserLocation, usernameExists } from "@/lib/kv";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 }
    );
  }

  try {
    const user = await getUserLocation(username);
    if (!user) {
      return NextResponse.json({ exists: false });
    }
    return NextResponse.json({ exists: true, user });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { oldUsername, newUsername } = body;

    if (!oldUsername) {
      return NextResponse.json(
        { error: "oldUsername is required" },
        { status: 400 }
      );
    }

    if (newUsername) {
      const usernamePattern = /^[a-z0-9-]+$/;
      if (!usernamePattern.test(newUsername)) {
        return NextResponse.json(
          { error: "Username can only contain lowercase letters, numbers and hyphens" },
          { status: 400 }
        );
      }

      if (newUsername !== oldUsername) {
        const taken = await usernameExists(newUsername);
        if (taken) {
          return NextResponse.json(
            { error: "Username is already taken" },
            { status: 409 }
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
