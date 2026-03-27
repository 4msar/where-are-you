"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { generateUsername, generateDisplayName } from "@/lib/username";
import type { UserLocation } from "@/lib/kv";
import { UserProfile } from "@/components/UserProfile";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
    MapPin,
    Loader2,
    AlertCircle,
    RefreshCw,
    User,
    Clock3,
} from "lucide-react";

const MapView = dynamic(
    () => import("@/components/MapView").then((m) => m.MapView),
    { ssr: false },
);

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const USER_STORAGE_KEY = "where-are-you:username";
const LOCATION_UPDATE_INTERVAL = 60_000; // 1 minutes
const IDLE_TIMEOUT_MS = 60_000; // 1 minute of inactivity before marking user as idle
const INACTIVE_USER_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

type UserPresenceStatus = "active" | "idle" | "left";

interface UserIdentity {
    username: string;
    displayName: string;
    avatarUrl: string;
}

interface LocationPageProps {
    routeUsername?: string;
}

function normalizeUsername(value: string | null | undefined): string | null {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return null;
    return /^[a-z0-9-]+$/.test(normalized) ? normalized : null;
}

function isUserInactive(
    lastUpdated: string,
    now: number = Date.now(),
): boolean {
    const updatedAtMs = new Date(lastUpdated).getTime();
    if (!Number.isFinite(updatedAtMs)) return true;
    return now - updatedAtMs > INACTIVE_USER_THRESHOLD_MS;
}

export function LocationPage({ routeUsername }: LocationPageProps) {
    const routeUsernameNormalized = normalizeUsername(routeUsername);
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
    const [canShareLocation, setCanShareLocation] = useState(true);
    const [onboardingOpen, setOnboardingOpen] = useState(false);
    const [onboardingUsername, setOnboardingUsername] = useState("");
    const [onboardingError, setOnboardingError] = useState("");
    const [onboardingLoading, setOnboardingLoading] = useState(false);
    const [showInactiveUsers, setShowInactiveUsers] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const userRef = useRef<UserIdentity | null>(null);
    const locationRef = useRef<UserLocation | null>(null);
    const presenceRef = useRef<UserPresenceStatus>("active");

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    useEffect(() => {
        locationRef.current = currentLocation;
    }, [currentLocation]);

    const fetchAllUsers = useCallback(async () => {
        try {
            const res = await fetch("/api/location");
            if (!res.ok) return;

            const data: UserLocation[] = await res.json();
            const visibleUsers = routeUsernameNormalized
                ? data.filter(
                      (entry) => entry.username === routeUsernameNormalized,
                  )
                : data;
            setAllUsers(visibleUsers);

            if (routeUsernameNormalized) {
                const matching = visibleUsers.find(
                    (entry) => entry.username === routeUsernameNormalized,
                );
                if (matching) {
                    setCurrentLocation((prev) =>
                        prev?.username === matching.username
                            ? { ...prev, ...matching }
                            : matching,
                    );
                }
            }
        } catch {
            // silently fail
        }
    }, [routeUsernameNormalized]);

    const saveLocation = useCallback(
        async (
            lat: number,
            lng: number,
            userData: UserIdentity,
            status: UserPresenceStatus = "active",
        ) => {
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
                        status,
                    }),
                });

                if (res.ok) {
                    const locationData: UserLocation = {
                        username: userData.username,
                        displayName: userData.displayName,
                        avatarUrl: userData.avatarUrl || undefined,
                        status,
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

    const syncPresenceStatus = useCallback(
        async (status: UserPresenceStatus) => {
            const activeUser = userRef.current;
            const activeLocation = locationRef.current;
            if (!activeUser || !activeLocation || !canShareLocation) return;

            try {
                const res = await fetch("/api/location", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: activeUser.username,
                        displayName: activeUser.displayName,
                        avatarUrl: activeUser.avatarUrl || undefined,
                        location: activeLocation.location,
                        status,
                    }),
                });

                if (res.ok) {
                    setCurrentLocation((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  status,
                                  lastUpdated: new Date().toISOString(),
                              }
                            : prev,
                    );
                    await fetchAllUsers();
                }
            } catch {
                // silently fail for background status sync
            }
        },
        [canShareLocation, fetchAllUsers],
    );

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
                    await saveLocation(latitude, longitude, userData, "active");

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
                                        "active",
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

    const hydrateLandingUser = useCallback(async (inputUsername?: string) => {
        const selectedUsername = normalizeUsername(inputUsername);
        const username = selectedUsername ?? generateUsername();
        const fallbackDisplayName = generateDisplayName();

        localStorage.setItem(USER_STORAGE_KEY, username);
        setUser({
            username,
            displayName: fallbackDisplayName,
            avatarUrl: "",
        });
        setCanShareLocation(true);
        setCurrentLocation(null);

        try {
            const res = await fetch(
                `/api/user?username=${encodeURIComponent(username)}`,
            );
            if (!res.ok) return;

            const data = await res.json();
            if (data.exists && data.user) {
                setUser({
                    username: data.user.username,
                    displayName: data.user.displayName || fallbackDisplayName,
                    avatarUrl: data.user.avatarUrl || "",
                });
                setCurrentLocation(data.user as UserLocation);
            }
        } catch {
            // Keep fallback profile if KV read fails.
        } finally {
            setProfileHydrated(true);
        }
    }, []);

    const handleContinueAsNew = useCallback(async () => {
        setOnboardingError("");
        setOnboardingLoading(true);
        try {
            await hydrateLandingUser();
            setOnboardingOpen(false);
        } finally {
            setOnboardingLoading(false);
        }
    }, [hydrateLandingUser]);

    const handleContinueAsExisting = useCallback(async () => {
        const normalized = normalizeUsername(onboardingUsername);
        if (!normalized) {
            setOnboardingError(
                "Enter a valid username using lowercase letters, numbers, or hyphens.",
            );
            return;
        }

        setOnboardingError("");
        setOnboardingLoading(true);
        try {
            await hydrateLandingUser(normalized);
            setOnboardingOpen(false);
        } finally {
            setOnboardingLoading(false);
        }
    }, [hydrateLandingUser, onboardingUsername]);

    useEffect(() => {
        const storedUsername = normalizeUsername(
            localStorage.getItem(USER_STORAGE_KEY),
        );

        if (!routeUsernameNormalized) {
            setCanShareLocation(true);
            setProfileHydrated(false);
            setLocationStatus("idle");
            setOnboardingUsername("");
            setOnboardingError("");

            if (storedUsername) {
                setOnboardingOpen(false);
                void hydrateLandingUser(storedUsername);
            } else {
                setUser(null);
                setCurrentLocation(null);
                setAllUsers([]);
                setOnboardingOpen(true);
            }
            return;
        }

        setOnboardingOpen(false);

        const hydrateRouteUser = async () => {
            try {
                const res = await fetch(
                    `/api/user?username=${encodeURIComponent(routeUsernameNormalized)}`,
                );

                if (!res.ok) {
                    const fallbackDisplayName = generateDisplayName();
                    setUser({
                        username: routeUsernameNormalized,
                        displayName: fallbackDisplayName,
                        avatarUrl: "",
                    });
                    setCanShareLocation(true);
                    localStorage.setItem(
                        USER_STORAGE_KEY,
                        routeUsernameNormalized,
                    );
                    return;
                }

                const data = await res.json();
                if (data.exists && data.user) {
                    const sameAsLocal =
                        storedUsername === routeUsernameNormalized;
                    setUser({
                        username: data.user.username,
                        displayName: data.user.displayName,
                        avatarUrl: data.user.avatarUrl || "",
                    });
                    setCurrentLocation(data.user as UserLocation);
                    setAllUsers([data.user as UserLocation]);
                    setCanShareLocation(sameAsLocal);
                    setLocationStatus(sameAsLocal ? "idle" : "granted");
                    if (sameAsLocal) {
                        localStorage.setItem(
                            USER_STORAGE_KEY,
                            routeUsernameNormalized,
                        );
                    }
                    return;
                }

                const fallbackDisplayName = generateDisplayName();
                setUser({
                    username: routeUsernameNormalized,
                    displayName: fallbackDisplayName,
                    avatarUrl: "",
                });
                setCanShareLocation(true);
                localStorage.setItem(USER_STORAGE_KEY, routeUsernameNormalized);
            } catch {
                const fallbackDisplayName = generateDisplayName();
                setUser({
                    username: routeUsernameNormalized,
                    displayName: fallbackDisplayName,
                    avatarUrl: "",
                });
                setCanShareLocation(true);
                localStorage.setItem(USER_STORAGE_KEY, routeUsernameNormalized);
            } finally {
                setProfileHydrated(true);
            }
        };

        void hydrateRouteUser();
    }, [hydrateLandingUser, routeUsernameNormalized]);

    useEffect(() => {
        if (
            user &&
            profileHydrated &&
            canShareLocation &&
            locationStatus === "idle"
        ) {
            requestLocation(user);
        }
    }, [
        user,
        profileHydrated,
        canShareLocation,
        locationStatus,
        requestLocation,
    ]);

    useEffect(() => {
        void fetchAllUsers();
    }, [fetchAllUsers]);

    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!user || locationStatus !== "granted" || !canShareLocation) return;

        const setIdle = () => {
            if (presenceRef.current === "idle") return;
            presenceRef.current = "idle";
            void syncPresenceStatus("idle");
        };

        const restartIdleTimer = () => {
            if (idleTimerRef.current) {
                clearTimeout(idleTimerRef.current);
            }
            idleTimerRef.current = setTimeout(setIdle, IDLE_TIMEOUT_MS);
        };

        const setActive = () => {
            if (document.visibilityState === "hidden") return;

            const changed = presenceRef.current !== "active";
            presenceRef.current = "active";
            restartIdleTimer();

            if (changed) {
                void syncPresenceStatus("active");
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                setIdle();
                return;
            }
            setActive();
        };

        const activityEvents: Array<keyof WindowEventMap> = [
            "mousemove",
            "mousedown",
            "keydown",
            "touchstart",
            "scroll",
        ];

        for (const eventName of activityEvents) {
            window.addEventListener(eventName, setActive, { passive: true });
        }
        document.addEventListener("visibilitychange", handleVisibilityChange);
        restartIdleTimer();

        return () => {
            for (const eventName of activityEvents) {
                window.removeEventListener(eventName, setActive);
            }
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
            if (idleTimerRef.current) {
                clearTimeout(idleTimerRef.current);
                idleTimerRef.current = null;
            }
        };
    }, [user, locationStatus, canShareLocation, syncPresenceStatus]);

    useEffect(() => {
        if (!canShareLocation) return;

        const handlePageHide = () => {
            presenceRef.current = "left";
            const activeUser = userRef.current;
            const activeLocation = locationRef.current;
            if (!activeUser || !activeLocation) return;

            const payload = JSON.stringify({
                username: activeUser.username,
                displayName: activeUser.displayName,
                avatarUrl: activeUser.avatarUrl || undefined,
                location: activeLocation.location,
                status: "left",
            });

            if (navigator.sendBeacon) {
                navigator.sendBeacon("/api/location", payload);
                return;
            }

            void fetch("/api/location", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
                keepalive: true,
            });
        };

        window.addEventListener("pagehide", handlePageHide);
        return () => {
            window.removeEventListener("pagehide", handlePageHide);
        };
    }, [canShareLocation]);

    const handleProfileUpdate = useCallback(
        async (
            newUsername: string,
            newDisplayName: string,
            newAvatarUrl: string,
        ) => {
            if (!user || !canShareLocation) return;

            const normalizedUsername = newUsername.trim();
            const normalizedDisplayName = newDisplayName.trim();
            const normalizedAvatarUrl = newAvatarUrl.trim();

            const profileRes = await fetch("/api/user", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    oldUsername: user.username,
                    newUsername: normalizedUsername,
                    displayName: normalizedDisplayName,
                    avatarUrl: normalizedAvatarUrl,
                }),
            });

            if (!profileRes.ok) {
                const errorData = await profileRes.json().catch(() => ({}));
                throw new Error(errorData.error ?? "Failed to update user");
            }

            const updatedUser: UserIdentity = {
                username: normalizedUsername,
                displayName: normalizedDisplayName,
                avatarUrl: normalizedAvatarUrl,
            };

            localStorage.setItem(USER_STORAGE_KEY, updatedUser.username);
            userRef.current = updatedUser;
            setUser(updatedUser);

            if (currentLocation) {
                await saveLocation(
                    currentLocation.location.lat,
                    currentLocation.location.lng,
                    updatedUser,
                    "active",
                );
            } else {
                requestLocation(updatedUser);
            }
        },
        [
            user,
            canShareLocation,
            currentLocation,
            saveLocation,
            requestLocation,
        ],
    );

    const inactiveUsersCount = allUsers.filter((entry) =>
        isUserInactive(entry.lastUpdated),
    ).length;

    const usersForMap = showInactiveUsers
        ? allUsers
        : allUsers.filter((entry) => !isUserInactive(entry.lastUpdated));

    const currentUserForMap = !currentLocation
        ? null
        : showInactiveUsers || !isUserInactive(currentLocation.lastUpdated)
          ? currentLocation
          : null;

    if (!user && !routeUsernameNormalized) {
        return (
            <div className="relative flex h-screen items-center justify-center bg-gray-50">
                <Dialog open={onboardingOpen} onOpenChange={setOnboardingOpen}>
                    <DialogContent
                        className="sm:max-w-md [&>button]:hidden"
                        onInteractOutside={(event) => event.preventDefault()}
                        onEscapeKeyDown={(event) => event.preventDefault()}
                    >
                        <DialogHeader>
                            <DialogTitle>
                                Are you existing user? Enter your username!
                            </DialogTitle>
                            <DialogDescription>
                                New is the default. Enter a username only if you
                                already have one.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-2 py-1">
                            <Label htmlFor="existing-username">
                                Existing username
                            </Label>
                            <Input
                                id="existing-username"
                                placeholder="your-username"
                                value={onboardingUsername}
                                onChange={(event) => {
                                    setOnboardingUsername(
                                        event.target.value.toLowerCase(),
                                    );
                                    if (onboardingError) {
                                        setOnboardingError("");
                                    }
                                }}
                                maxLength={32}
                                disabled={onboardingLoading}
                            />
                            {onboardingError && (
                                <p className="text-xs text-red-500">
                                    {onboardingError}
                                </p>
                            )}
                        </div>

                        <DialogFooter className="gap-2">
                            <Button
                                variant="outline"
                                onClick={handleContinueAsNew}
                                disabled={onboardingLoading}
                            >
                                New
                            </Button>
                            <Button
                                onClick={handleContinueAsExisting}
                                disabled={onboardingLoading}
                            >
                                {onboardingLoading
                                    ? "Continuing..."
                                    : "Continue"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="relative w-full h-screen overflow-hidden bg-gray-100">
            {GOOGLE_MAPS_API_KEY ? (
                <div className="absolute inset-0">
                    <MapView
                        apiKey={GOOGLE_MAPS_API_KEY}
                        currentUser={currentUserForMap}
                        allUsers={usersForMap}
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

            <div className="absolute inset-x-0 top-0 z-20 p-3 sm:p-4 pointer-events-none">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex w-fit flex-col gap-2 pointer-events-auto">
                        <div className="flex w-fit items-center gap-2 rounded-full border border-gray-100 bg-white/90 px-4 py-2 shadow-md backdrop-blur-sm">
                            <MapPin className="w-4 h-4 text-blue-600" />
                            <span className="font-bold text-gray-800 text-sm">
                                Where Are You
                            </span>
                        </div>
                        <Button
                            type="button"
                            variant={showInactiveUsers ? "default" : "outline"}
                            size="sm"
                            className="w-fit rounded-full bg-white/90 shadow-md backdrop-blur-sm"
                            onClick={() =>
                                setShowInactiveUsers((previous) => !previous)
                            }
                            disabled={
                                inactiveUsersCount === 0 && !showInactiveUsers
                            }
                        >
                            <Clock3 className="h-3.5 w-3.5" />
                            {showInactiveUsers
                                ? `Hide inactive (${inactiveUsersCount})`
                                : `Show inactive (${inactiveUsersCount})`}
                        </Button>
                    </div>

                    <div className="pointer-events-auto w-full sm:w-auto sm:self-auto">
                        {canShareLocation ? (
                            <UserProfile
                                username={user.username}
                                displayName={user.displayName}
                                avatarUrl={user.avatarUrl}
                                onUpdate={handleProfileUpdate}
                            />
                        ) : (
                            <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-md border border-gray-100 w-full sm:w-auto">
                                <User className="w-4 h-4 text-gray-500" />
                                <div className="leading-tight min-w-0">
                                    <p className="text-xs text-gray-500 font-medium">
                                        Viewing
                                    </p>
                                    <p className="text-sm font-semibold text-gray-800 truncate">
                                        @{user.username}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="absolute inset-x-0 bottom-4 z-20 px-3 pointer-events-none sm:bottom-6">
                <div className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white/90 px-3 py-2 text-xs shadow-md backdrop-blur-sm sm:rounded-full sm:px-4 sm:text-sm">
                    {!canShareLocation && currentLocation && (
                        <>
                            <span className="w-2.5 h-2.5 bg-blue-500 rounded-full inline-block" />
                            <span className="text-gray-600">
                                Viewing @{currentLocation.username}
                            </span>
                        </>
                    )}
                    {canShareLocation && locationStatus === "requesting" && (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                            <span className="text-gray-600">
                                Requesting location access...
                            </span>
                        </>
                    )}
                    {canShareLocation &&
                        locationStatus === "granted" &&
                        isUpdating && (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin text-green-500" />
                                <span className="text-gray-600">
                                    Updating location...
                                </span>
                            </>
                        )}
                    {canShareLocation &&
                        locationStatus === "granted" &&
                        !isUpdating &&
                        currentLocation && (
                            <>
                                <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse inline-block" />
                                <span className="text-gray-600">
                                    Sharing location with {usersForMap.length}{" "}
                                    visible user
                                    {usersForMap.length !== 1 ? "s" : ""}
                                </span>
                            </>
                        )}
                    {canShareLocation && locationStatus === "denied" && (
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
                    {canShareLocation && locationStatus === "error" && (
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
                    {canShareLocation && locationStatus === "idle" && (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            <span className="text-gray-400">
                                Initializing...
                            </span>
                        </>
                    )}
                </div>
            </div>

            <Toaster />
        </div>
    );
}
