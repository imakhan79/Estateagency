import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (see .env.example).");
}

export const supabase = createClient(url, key);

export function storageUrl(bucket: string, path: string) {
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}
