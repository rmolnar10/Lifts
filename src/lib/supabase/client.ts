"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfigured } from "./env";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Browser Supabase client. The session is persisted and refreshed automatically. */
export function getSupabaseBrowserClient() {
  assertSupabaseConfigured();
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
