"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "../../lib/supabase/client";
import { isSupabaseConfigured } from "../../lib/supabase/env";

/**
 * The signed in user, or null. `configured` is false in local mode, where
 * there is no account system at all and every screen still works.
 */
export function useSession() {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return undefined;

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = getSupabaseBrowser();
    if (supabase) await supabase.auth.signOut();
  };

  return { user, loading, configured, signOut };
}
