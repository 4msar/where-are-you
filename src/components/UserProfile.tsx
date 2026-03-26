"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { User, Pencil } from "lucide-react";

interface UserProfileProps {
    username: string;
    displayName: string;
    avatarUrl: string;
    onUpdate: (
        username: string,
        displayName: string,
        avatarUrl: string,
    ) => Promise<void>;
}

function isValidImageUrl(value: string): boolean {
    if (!value.trim()) return true;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

export function UserProfile({
    username,
    displayName,
    avatarUrl,
    onUpdate,
}: UserProfileProps) {
    const [open, setOpen] = useState(false);
    const [newUsername, setNewUsername] = useState(username);
    const [newDisplayName, setNewDisplayName] = useState(displayName);
    const [newAvatarUrl, setNewAvatarUrl] = useState(avatarUrl);
    const [loading, setLoading] = useState(false);
    const [usernameError, setUsernameError] = useState("");
    const [avatarError, setAvatarError] = useState("");
    const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
    const showAvatar = Boolean(avatarUrl) && failedAvatarUrl !== avatarUrl;

    const validateUsername = useCallback((value: string) => {
        if (!value.trim()) {
            setUsernameError("Username cannot be empty");
            return false;
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
            setUsernameError(
                "Only lowercase letters, numbers, and hyphens allowed",
            );
            return false;
        }
        if (value.length < 3) {
            setUsernameError("Username must be at least 3 characters");
            return false;
        }
        if (value.length > 32) {
            setUsernameError("Username must be at most 32 characters");
            return false;
        }
        setUsernameError("");
        return true;
    }, []);

    const handleOpenChange = (isOpen: boolean) => {
        if (isOpen) {
            setNewUsername(username);
            setNewDisplayName(displayName);
            setNewAvatarUrl(avatarUrl);
            setUsernameError("");
            setAvatarError("");
        }
        setOpen(isOpen);
    };

    const handleSave = async () => {
        if (!validateUsername(newUsername)) return;
        if (!newDisplayName.trim()) {
            toast({
                title: "Display name cannot be empty",
                variant: "destructive",
            });
            return;
        }
        if (!isValidImageUrl(newAvatarUrl)) {
            setAvatarError("Please enter a valid http(s) image URL");
            return;
        }
        setAvatarError("");

        setLoading(true);
        try {
            // Check username availability if changed
            if (newUsername !== username) {
                const res = await fetch(
                    `/api/user?username=${encodeURIComponent(newUsername)}`,
                );
                const data = await res.json();
                if (data.exists) {
                    setUsernameError("Username is already taken");
                    setLoading(false);
                    return;
                }
            }

            await onUpdate(
                newUsername.trim(),
                newDisplayName.trim(),
                newAvatarUrl.trim(),
            );
            setOpen(false);
            toast({ title: "Profile updated!", variant: "success" });
        } catch (err) {
            toast({
                title: "Failed to update profile",
                description:
                    err instanceof Error ? err.message : "Unknown error",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="flex w-full min-w-0 items-center gap-2 rounded-full border border-gray-100 bg-white/90 px-4 py-2 shadow-md backdrop-blur-sm sm:w-auto sm:max-w-xs">
                {showAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={avatarUrl}
                        alt={`${displayName} avatar`}
                        className="w-8 h-8 rounded-full object-cover border border-gray-200"
                        onError={(e) => {
                            e.preventDefault();
                            setFailedAvatarUrl(avatarUrl);
                        }}
                    />
                ) : (
                    <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full text-blue-600 text-sm font-bold">
                        {displayName?.charAt(0).toUpperCase() || (
                            <User className="w-4 h-4 text-blue-600" />
                        )}
                    </div>
                )}
                <div className="leading-tight min-w-0 flex-1 sm:flex-none">
                    <p className="text-xs text-gray-500 font-medium">
                        @{username}
                    </p>
                    <p className="text-sm font-semibold text-gray-800 truncate">
                        {displayName}
                    </p>
                </div>
                <button
                    onClick={() => handleOpenChange(true)}
                    className="ml-1 p-1 rounded-full hover:bg-gray-100 transition-colors"
                    title="Edit profile"
                >
                    <Pencil className="w-3.5 h-3.5 text-gray-500" />
                </button>
            </div>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Profile</DialogTitle>
                        <DialogDescription>
                            Update your username and display name.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="displayName">Display Name</Label>
                            <Input
                                id="displayName"
                                value={newDisplayName}
                                onChange={(e) =>
                                    setNewDisplayName(e.target.value)
                                }
                                placeholder="Your display name"
                                maxLength={50}
                            />
                        </div>

                        <div className="grid gap-1.5">
                            <Label htmlFor="username">Username</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                    @
                                </span>
                                <Input
                                    id="username"
                                    className="pl-7"
                                    value={newUsername}
                                    onChange={(e) => {
                                        setNewUsername(
                                            e.target.value.toLowerCase(),
                                        );
                                        validateUsername(
                                            e.target.value.toLowerCase(),
                                        );
                                    }}
                                    placeholder="your-username"
                                    maxLength={32}
                                />
                            </div>
                            {usernameError && (
                                <p className="text-xs text-red-500">
                                    {usernameError}
                                </p>
                            )}
                            <p className="text-xs text-gray-400">
                                Lowercase letters, numbers, and hyphens only
                            </p>
                        </div>

                        <div className="grid gap-1.5">
                            <Label htmlFor="avatarUrl">
                                Avatar / Gravatar URL
                            </Label>
                            <Input
                                id="avatarUrl"
                                type="url"
                                value={newAvatarUrl}
                                onChange={(e) => {
                                    setNewAvatarUrl(e.target.value);
                                    if (avatarError) {
                                        setAvatarError("");
                                    }
                                }}
                                placeholder="https://..."
                            />
                            {avatarError && (
                                <p className="text-xs text-red-500">
                                    {avatarError}
                                </p>
                            )}
                            <p className="text-xs text-gray-400">
                                Optional. Add any public image or Gravatar link.
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={loading}>
                            {loading ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
