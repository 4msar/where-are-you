"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { generateUsername, generateDisplayName } from "@/lib/username";
import type { UserLocation } from "@/lib/kv";
import { UserProfile } from "@/components/UserProfile";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/hooks/use-toast";
import { MapPin, Loader2, AlertCircle, RefreshCw } from "lucide-react";

// Dynamically import MapView to avoid SSR issues with the Google Maps API
const MapView = dynamic(
    () => import("@/components/MapView").then((m) => m.MapView),
    { ssr: false },
);

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const USER_STORAGE_KEY = "where-are-you:username";
const LOCATION_UPDATE_INTERVAL = 30_000; // 30 seconds

interface UserIdentity {
    username: string;
    displayName: string;
    avatarUrl: string;
}

export default function HomePage() {
    const [user, setUser] = useState<UserIdentity | null>(null);
    const [currentLocation, setCurrentLocation] = useState<UserLocation | null>(
        null,
    );
    const [allUsers, setAllUsers] = useState<UserLocation[]>([]);
    const [locationStatus, setLocationStatus] = useState<
        "idle" | "requesting" | "granted" | "denied" | "error"
    >("idle");
    const [isUpdating, setIsUpdating] = useState(false);
    const [profileHydrated, setProfileHydrated] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const userRef = useRef<UserIdentity | null>(null);

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    // Initialize user from localStorage username and hydrate profile from KV.
    useEffect(() => {
        const usernamePattern = /^[a-z0-9-]+$/;
        const storedUsername = localStorage
            .getItem(USER_STORAGE_KEY)
            ?.trim()
            .toLowerCase();
        const username =
            storedUsername && usernamePattern.test(storedUsername)
                ? storedUsername
                : generateUsername();

        localStorage.setItem(USER_STORAGE_KEY, username);

        const fallbackDisplayName = generateDisplayName();
        setUser({ username, displayName: fallbackDisplayName, avatarUrl: "" });

        const hydrateProfileFromKv = async () => {
            try {
                const res = await fetch(
                    `/api/user?username=${encodeURIComponent(username)}`,
                );
                if (!res.ok) return;

                const data = await res.json();
                if (data.exists && data.user) {
                    setUser((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  displayName:
                                      data.user.displayName || prev.displayName,
                                  avatarUrl: data.user.avatarUrl || "",
                              }
                            : prev,
                    );
                }
            } catch {
                // Keep fallback profile if KV read fails.
            } finally {
                setProfileHydrated(true);
            }
        };

        void hydrateProfileFromKv();
    }, []);

    // Fetch all user locations
    const fetchAllUsers = useCallback(async () => {
        try {
            const res = await fetch("/api/location");
            if (res.ok) {
                const data: UserLocation[] = await res.json();
                setAllUsers(data);
            }
        } catch {
            // silently fail
        }
    }, []);

    // Save location to Cloudflare KV
    const saveLocation = useCallback(
        async (lat: number, lng: number, userData: UserIdentity) => {
            setIsUpdating(true);
            try {
                const res = await fetch("/api/location", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: userData.username,
                        displayName: userData.displayName,
                        avatarUrl: userData.avatarUrl || undefined,
                        location: { lat, lng },
                    }),
                });

                if (res.ok) {
                    const locationData: UserLocation = {
                        username: userData.username,
                        displayName: userData.displayName,
                        avatarUrl: userData.avatarUrl || undefined,
                        location: { lat, lng },
                        lastUpdated: new Date().toISOString(),
                    };
                    setCurrentLocation(locationData);
                    await fetchAllUsers();
                }
            } catch {
                toast({
                    title: "Could not save location",
                    description: "Check your connection and try again.",
                    variant: "destructive",
                });
            } finally {
                setIsUpdating(false);
            }
        },
        [fetchAllUsers],
    );

    // Request geolocation
    const requestLocation = useCallback(
        (userData: UserIdentity) => {
            if (!navigator.geolocation) {
                setLocationStatus("error");
                toast({
                    title: "Geolocation not supported",
                    description: "Your browser doesn't support geolocation.",
                    variant: "destructive",
                });
                return;
            }

            setLocationStatus("requesting");
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    setLocationStatus("granted");
                    const { latitude, longitude } = position.coords;
                    await saveLocation(latitude, longitude, userData);

                    // Set up periodic location updates
                    if (intervalRef.current) clearInterval(intervalRef.current);
                    intervalRef.current = setInterval(() => {
                        navigator.geolocation.getCurrentPosition(
                            (pos) => {
                                const activeUser = userRef.current;
                                if (activeUser) {
                                    saveLocation(
                                        pos.coords.latitude,
                                        pos.coords.longitude,
                                        activeUser,
                                    );
                                }
                            },
                            () => {},
                            { enableHighAccuracy: true, timeout: 10000 },
                        );
                    }, LOCATION_UPDATE_INTERVAL);
                },
                (err) => {
                    if (
                        err.code === GeolocationPositionError.PERMISSION_DENIED
                    ) {
                        setLocationStatus("denied");
                        toast({
                            title: "Location access denied",
                            description:
                                "Please allow location access to share your position.",
                            variant: "destructive",
                        });
                    } else {
                        setLocationStatus("error");
                        toast({
                            title: "Could not get location",
                            description: err.message,
                            variant: "destructive",
                        });
                    }
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
            );
        },
        [saveLocation],
    );

    // Request location once user is ready
    useEffect(() => {
        if (user && profileHydrated && locationStatus === "idle") {
            requestLocation(user);
        }
    }, [user, profileHydrated, locationStatus, requestLocation]);

    // Fetch all users on mount
    useEffect(() => {
        fetchAllUsers();
    }, [fetchAllUsers]);

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const handleProfileUpdate = useCallback(
        async (
            newUsername: string,
            newDisplayName: string,
            newAvatarUrl: string,
        ) => {
            if (!user) return;

            const updatedUser: UserIdentity = {
                username: newUsername,
                displayName: newDisplayName,
                avatarUrl: newAvatarUrl,
            };

            localStorage.setItem(USER_STORAGE_KEY, updatedUser.username);
            userRef.current = updatedUser;
            setUser(updatedUser);

            // Re-save location with new user info
            if (currentLocation) {
                await saveLocation(
                    currentLocation.location.lat,
                    currentLocation.location.lng,
                    updatedUser,
                );
            } else {
                requestLocation(updatedUser);
            }
        },
        [user, currentLocation, saveLocation, requestLocation],
    );

    if (!user) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="relative w-full h-screen overflow-hidden bg-gray-100">
            {/* Map */}
            {GOOGLE_MAPS_API_KEY ? (
                <div className="absolute inset-0">
                    <MapView
                        apiKey={GOOGLE_MAPS_API_KEY}
                        currentUser={currentLocation}
                        allUsers={allUsers}
                    />
                </div>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                    <div className="text-center p-6 bg-white rounded-xl shadow-md max-w-sm mx-4">
                        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                        <h2 className="text-lg font-semibold text-gray-800 mb-2">
                            Google Maps API Key Missing
                        </h2>
                        <p className="text-sm text-gray-500">
                            Set{" "}
                            <code className="bg-gray-100 px-1 rounded">
                                NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                            </code>{" "}
                            in your environment variables to enable the map.
                        </p>
                    </div>
                </div>
            )}

            {/* Top bar */}
            <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-3 pointer-events-none">
                {/* App title */}
                <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-md border border-gray-100 pointer-events-auto">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-gray-800 text-sm">
                        Where Are You
                    </span>
                </div>

                {/* User profile widget */}
                <div className="pointer-events-auto">
                    <UserProfile
                        username={user.username}
                        displayName={user.displayName}
                        avatarUrl={user.avatarUrl}
                        onUpdate={handleProfileUpdate}
                    />
                </div>
            </div>

            {/* Status bar */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
                <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-md border border-gray-100 text-sm">
                    {locationStatus === "requesting" && (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                            <span className="text-gray-600">
                                Requesting location access…
                            </span>
                        </>
                    )}
                    {locationStatus === "granted" && isUpdating && (
                        <>
                            <RefreshCw className="w-4 h-4 animate-spin text-green-500" />
                            <span className="text-gray-600">
                                Updating location…
                            </span>
                        </>
                    )}
                    {locationStatus === "granted" &&
                        !isUpdating &&
                        currentLocation && (
                            <>
                                <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse inline-block" />
                                <span className="text-gray-600">
                                    Sharing location with {allUsers.length} user
                                    {allUsers.length !== 1 ? "s" : ""}
                                </span>
                            </>
                        )}
                    {locationStatus === "denied" && (
                        <>
                            <AlertCircle className="w-4 h-4 text-red-500" />
                            <span className="text-gray-600">
                                Location access denied
                            </span>
                            <button
                                className="pointer-events-auto ml-1 text-blue-600 font-medium hover:underline"
                                onClick={() => {
                                    setLocationStatus("idle");
                                    requestLocation(user);
                                }}
                            >
                                Retry
                            </button>
                        </>
                    )}
                    {locationStatus === "error" && (
                        <>
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                            <span className="text-gray-600">
                                Could not get location
                            </span>
                            <button
                                className="pointer-events-auto ml-1 text-blue-600 font-medium hover:underline"
                                onClick={() => {
                                    setLocationStatus("idle");
                                    requestLocation(user);
                                }}
                            >
                                Retry
                            </button>
                        </>
                    )}
                    {locationStatus === "idle" && (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            <span className="text-gray-400">Initializing…</span>
                        </>
                    )}
                </div>
            </div>

            <Toaster />
        </div>
    );
}
