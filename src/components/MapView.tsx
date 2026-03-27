"use client";

import {
    APIProvider,
    Map,
    AdvancedMarker,
    InfoWindow,
    useAdvancedMarkerRef,
} from "@vis.gl/react-google-maps";
import { useState } from "react";
import type { UserLocation } from "@/lib/kv";

interface MapViewProps {
    apiKey: string;
    currentUser: UserLocation | null;
    allUsers: UserLocation[];
}

const INACTIVE_USER_THRESHOLD_MS = 30 * 60 * 1000;

function isUserInactive(lastUpdated: string): boolean {
    const updatedAtMs = new Date(lastUpdated).getTime();
    if (!Number.isFinite(updatedAtMs)) return true;
    return Date.now() - updatedAtMs > INACTIVE_USER_THRESHOLD_MS;
}

function UserMarker({
    user,
    isCurrentUser,
}: {
    user: UserLocation;
    isCurrentUser: boolean;
}) {
    const [infoOpen, setInfoOpen] = useState(false);
    const [markerRef, marker] = useAdvancedMarkerRef();
    const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
    const hasAvatar =
        Boolean(user.avatarUrl) && failedAvatarUrl !== user.avatarUrl;
    const inactive = isUserInactive(user.lastUpdated);

    return (
        <>
            <AdvancedMarker
                ref={markerRef}
                position={user.location}
                onClick={() => setInfoOpen((v) => !v)}
                title={user.displayName}
            >
                <div
                    className={`relative flex items-center justify-center w-10 h-10 rounded-full border-2 shadow-md cursor-pointer transition-transform hover:scale-110 ${
                        isCurrentUser
                            ? "bg-blue-600 border-blue-300"
                            : inactive
                              ? "bg-gray-200 border-gray-400"
                              : "bg-white border-gray-300"
                    }`}
                >
                    {hasAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={user.avatarUrl}
                            alt={`${user.displayName} avatar`}
                            className="w-full h-full rounded-full object-cover"
                            onError={() =>
                                setFailedAvatarUrl(user.avatarUrl ?? null)
                            }
                        />
                    ) : (
                        <span
                            className={`text-sm font-bold ${isCurrentUser ? "text-white" : "text-gray-700"}`}
                        >
                            {user.displayName.charAt(0).toUpperCase()}
                        </span>
                    )}
                    {isCurrentUser && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse" />
                    )}
                </div>
            </AdvancedMarker>

            {infoOpen && marker && (
                <InfoWindow
                    anchor={marker}
                    onCloseClick={() => setInfoOpen(false)}
                >
                    <div className="p-1 min-w-30">
                        {hasAvatar && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={user.avatarUrl}
                                alt={`${user.displayName} avatar`}
                                className="w-10 h-10 rounded-full object-cover mb-2"
                                onError={() =>
                                    setFailedAvatarUrl(user.avatarUrl ?? null)
                                }
                            />
                        )}
                        <p className="font-semibold text-gray-800">
                            {user.displayName}
                        </p>
                        <p className="text-xs text-gray-500">
                            @{user.username}
                        </p>
                        {isCurrentUser && (
                            <p className="text-xs text-blue-600 font-medium mt-1">
                                📍 You are here
                            </p>
                        )}
                        {inactive && (
                            <p className="text-xs text-amber-700 font-medium mt-1">
                                Inactive
                            </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                            Updated:{" "}
                            {new Date(user.lastUpdated).toLocaleString(
                                undefined,
                                {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                },
                            )}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                            {user.location.lat.toFixed(6)},{" "}
                            {user.location.lng.toFixed(6)}
                        </p>
                        <a
                            href={`https://www.google.com/maps?q=${encodeURIComponent(user.location.lat)},${encodeURIComponent(user.location.lng)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="View location in Google Maps"
                            className="text-xs text-blue-500 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 mt-2 inline-block"
                        >
                            Open in Google Maps
                        </a>
                    </div>
                </InfoWindow>
            )}
        </>
    );
}

const DhakaLocation: google.maps.LatLngLiteral = {
    lat: 23.8103,
    lng: 90.4125,
};

export function MapView({ apiKey, currentUser, allUsers }: MapViewProps) {
    const defaultCenter = currentUser?.location ?? DhakaLocation;
    const defaultZoom = currentUser ? 13 : 6;

    return (
        <APIProvider apiKey={apiKey}>
            <Map
                mapId="where-are-you-map"
                defaultCenter={defaultCenter}
                defaultZoom={defaultZoom}
                gestureHandling="greedy"
                disableDefaultUI={false}
                className="w-full h-full"
            >
                {allUsers.map((user) => (
                    <UserMarker
                        key={user.username}
                        user={user}
                        isCurrentUser={currentUser?.username === user.username}
                    />
                ))}
                {currentUser &&
                    !allUsers.find(
                        (u) => u.username === currentUser.username,
                    ) && <UserMarker user={currentUser} isCurrentUser={true} />}
            </Map>
        </APIProvider>
    );
}
