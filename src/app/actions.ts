"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Salva il valore "effettivo" di una riga settimanale.
// La RLS di Supabase garantisce che si possa scrivere solo sul proprio household.
export async function saveActual(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("actual") ?? "").trim().replace(",", ".");
  const actual = raw === "" ? null : Number(raw);

  if (!id || (actual !== null && Number.isNaN(actual))) return;

  const supabase = await createClient();
  await supabase.from("weekly_values").update({ actual }).eq("id", id);

  revalidatePath("/");
}
