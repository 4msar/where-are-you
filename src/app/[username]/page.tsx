import { notFound } from "next/navigation";
import { LocationPage } from "@/components/LocationPage";

function isValidUsername(value: string): boolean {
    return /^[a-z0-9-]+$/.test(value);
}

export default async function UsernamePage(props: PageProps<"/[username]">) {
    const { username } = await props.params;

    if (!isValidUsername(username)) {
        notFound();
    }

    return <LocationPage routeUsername={username} />;
}
