import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Null until VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY are set. Callers
 * must check for null and render an "unavailable / not configured" state
 * rather than crashing — no feature may silently substitute fake data.
 * Auth + farm/crop/soil/scan/report data all flow through this client
 * directly; access is enforced by Supabase row-level security, not by a
 * separate backend.
 */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
