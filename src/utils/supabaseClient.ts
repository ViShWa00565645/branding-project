import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mxidagpeocejtudrorhe.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14aWRhZ3Blb2NlanR1ZHJvcmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODE4ODQsImV4cCI6MjA5NzQ1Nzg4NH0.z1qieN9D0hY4Tr9LY7vouSthYRBf_7DGo3brO0SBQnY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
