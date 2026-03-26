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

function UserMarker({
    user,
    isCurrentUser,
}: {
    user: UserLocation;
    isCurrentUser: boolean;
}) {
    const [infoOpen, setInfoOpen] = useState(false);
    const [markerRef, marker] = useAdvancedMarkerRef();

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
                            : "bg-white border-gray-300"
                    }`}
                >
                    <span
                        className={`text-sm font-bold ${isCurrentUser ? "text-white" : "text-gray-700"}`}
                    >
                        {user.displayName.charAt(0).toUpperCase()}
                    </span>
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
                    <div className="p-1 min-w-[120px]">
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
