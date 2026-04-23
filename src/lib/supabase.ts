import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "[Supabase] ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.\n" +
    "Add them to StudyHive-Backend/.env and restart the server."
  );
  process.exit(1); // Exit cleanly instead of throwing at module scope
}

// Service-role client — bypasses RLS, backend only
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
