import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase per i Server Component / Route Handler (legge i cookie di sessione).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll chiamato da un Server Component: ignorabile, il refresh
            // della sessione avviene nel middleware.
          }
        },
      },
    },
  );
}
