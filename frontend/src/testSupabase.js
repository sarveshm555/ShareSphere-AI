import { supabase } from "./lib/supabase";

export async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("Supabase connection check:", error.message);
    } else {
      console.log("Supabase connected. Session:", data.session ? "Active" : "None");
    }
  } catch (err) {
    console.warn("Supabase initialization:", err.message);
  }
}
