// Stands in for npm:@supabase/supabase-js@2 when a function under test is imported.
import { makeFakeSupabase } from "./fake-db.ts";
export const world: { fake: ReturnType<typeof makeFakeSupabase> | null } = { fake: null };
export const createClient = (url: string, key: string, o?: any) => world.fake!.createClient(url, key, o);
