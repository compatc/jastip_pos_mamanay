import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

let supabase: SupabaseClient;

if (
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith("http") &&
  !supabaseUrl.includes("your-project")
) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  supabase = createClient("https://placeholder.supabase.co", "placeholder-key");
}

export { supabase };
