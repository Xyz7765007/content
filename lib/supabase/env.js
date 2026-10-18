// Accounts, the waitlist and the contact form all run on one Supabase project.
// When these two public values are absent the app runs in local mode: every
// screen still works, the auth pages explain that accounts are not connected
// yet, and the two forms report the same rather than pretending to send.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
