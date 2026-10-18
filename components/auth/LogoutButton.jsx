"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignOut } from "@phosphor-icons/react";
import { Button } from "../ui";
import { useSession } from "./useSession";
import { useStore } from "../../lib/store";

// Signing out also clears this browser's copy of the brand, watchlists and
// drafts. They are safe in the account, and the next person to use this
// browser starts clean instead of inheriting them.
export default function LogoutButton({ variant = "ghost", className, size = "sm" }) {
  const router = useRouter();
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        useStore.getState().resetLocal();
        router.push("/");
        router.refresh();
      }}
    >
      {!busy ? <SignOut size={15} /> : null}
      Log out
    </Button>
  );
}
