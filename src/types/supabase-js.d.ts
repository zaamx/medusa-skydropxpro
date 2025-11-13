declare module "@supabase/supabase-js" {
  export type SupabaseClient = any
  export function createClient<
    TDatabase = any,
    TSchemaName extends string = "public"
  >(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, any>
  ): SupabaseClient
}

