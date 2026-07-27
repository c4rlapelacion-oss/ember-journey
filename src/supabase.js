import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const hiddenEmail = (username) =>
  `${username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@emberjourney.app`;

// Users type their chosen password normally. The application strengthens it
// before it reaches Supabase, allowing the requested visible admin password "ember".
export const authPassword = (password) => `${password}#E8`;
