import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { formatEuro, formatWeek } from "@/lib/format";
import { logout } from "@/app/login/actions";
import { saveActual } from "@/app/actions";

type Row = {
  id: string;
  week_start: string;
  planned: number | null;
  actual: number | null;
  note: string | null;
  items: {
    name: string;
    categories: { name: string; kind: string } | null;
  } | null;
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("weekly_values")
    .select(
      "id, week_start, planned, actual, note, items!inner(name, position, categories!inner(name, kind))",
    )
    .order("week_start", { ascending: true });

  const rows = (data ?? []) as unknown as Row[];

  // Raggruppa per settimana (week_start).
  const byWeek = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byWeek.get(r.week_start) ?? [];
    list.push(r);
    byWeek.set(r.week_start, list);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Cash-flow famiglia</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Esci
          </Button>
        </form>
      </header>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-red-600">
            Errore nel caricamento dati: {error.message}
          </CardContent>
        </Card>
      ) : null}

      {byWeek.size === 0 && !error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Nessun dato. Esegui le migrazioni e il seed in Supabase
            (vedi README).
          </CardContent>
        </Card>
      ) : null}

      {[...byWeek.entries()].map(([week, list]) => (
        <Card key={week}>
          <CardHeader>
            <CardTitle className="text-base">
              Settimana del {formatWeek(week)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {list.map((r) => {
              const delta =
                r.planned !== null && r.actual !== null
                  ? r.actual - r.planned
                  : null;
              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{r.items?.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.items?.categories?.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      Previsto: {formatEuro(r.planned)}
                    </span>
                    {delta !== null ? (
                      <span
                        className={
                          delta === 0
                            ? "text-muted-foreground"
                            : delta > 0
                              ? "text-green-600"
                              : "text-red-600"
                        }
                      >
                        Δ {formatEuro(delta)}
                      </span>
                    ) : null}
                  </div>
                  <form action={saveActual} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <Input
                      name="actual"
                      type="text"
                      inputMode="decimal"
                      defaultValue={r.actual ?? ""}
                      placeholder="Effettivo"
                      aria-label={`Effettivo ${r.items?.name ?? ""}`}
                    />
                    <Button type="submit" size="sm">
                      Salva
                    </Button>
                  </form>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
