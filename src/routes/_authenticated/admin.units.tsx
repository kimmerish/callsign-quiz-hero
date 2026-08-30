import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/units")({
  head: () => ({
    meta: [
      { title: "Підрозділи та учасники | Панель адміністратора" },
      { name: "description", content: "Управління підрозділами та позивними учасників." },
      { property: "og:title", content: "Підрозділи та учасники | Панель адміністратора" },
      { property: "og:description", content: "Управління підрозділами та позивними учасників." },
    ],
  }),
  component: UnitsPage,
});

function UnitsPage() {
  const queryClient = useQueryClient();
  const [unitName, setUnitName] = useState("");
  const [unitDescription, setUnitDescription] = useState("");
  const [participantUnit, setParticipantUnit] = useState("");
  const [callsign, setCallsign] = useState("");

  const unitsQuery = useQuery({
    queryKey: ["admin-units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, name, description, participants(id, callsign, device_token)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-units"] });

  const addUnit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("units")
        .insert({ name: unitName.trim(), description: unitDescription.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      setUnitName("");
      setUnitDescription("");
      toast.success("Підрозділ додано");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addParticipant = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("participants")
        .insert({ unit_id: participantUnit, callsign: callsign.trim().toUpperCase() });
      if (error) throw error;
    },
    onSuccess: () => {
      setCallsign("");
      toast.success("Учасника додано");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetDevice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("participants")
        .update({ device_token: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Прив'язку до пристрою скинуто");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AdminShell title="Підрозділи та учасники" eyebrow="Управління">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {(unitsQuery.data ?? []).map((unit) => (
            <div key={unit.id} className="rounded-lg border border-border bg-surface p-4">
              <p className="font-display text-lg font-semibold">{unit.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {unit.description ?? "—"}
              </p>
              <div className="mt-3 divide-y divide-border/60">
                {(unit.participants ?? []).map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between py-2 font-mono text-xs"
                  >
                    <span>{participant.callsign}</span>
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          participant.device_token ? "text-success" : "text-muted-foreground"
                        }
                      >
                        {participant.device_token ? "Прив'язано" : "Вільний"}
                      </span>
                      {participant.device_token ? (
                        <button
                          onClick={() => resetDevice.mutate(participant.id)}
                          className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          Скинути
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {unit.participants?.length === 0 ? (
                  <p className="py-2 font-mono text-[11px] text-muted-foreground">
                    Учасників немає.
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="h-fit space-y-4">
          <form
            className="rounded-lg border border-border bg-surface p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!unitName.trim()) return toast.error("Вкажіть назву підрозділу");
              addUnit.mutate();
            }}
          >
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.15em] text-accent">
              Додати підрозділ
            </p>
            <input
              value={unitName}
              maxLength={120}
              placeholder="3-й батальйон"
              onChange={(e) => setUnitName(e.target.value)}
              className="mb-3 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={unitDescription}
              maxLength={240}
              placeholder="Опис"
              onChange={(e) => setUnitDescription(e.target.value)}
              className="mb-4 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button className="w-full rounded-md bg-accent py-2 font-mono text-xs font-medium text-accent-foreground">
              Додати підрозділ
            </button>
          </form>

          <form
            className="rounded-lg border border-border bg-surface p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!participantUnit || !callsign.trim())
                return toast.error("Оберіть підрозділ і вкажіть позивний");
              addParticipant.mutate();
            }}
          >
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.15em] text-accent">
              Додати учасника
            </p>
            <select
              value={participantUnit}
              onChange={(e) => setParticipantUnit(e.target.value)}
              className="mb-3 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">— підрозділ —</option>
              {(unitsQuery.data ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
            <input
              value={callsign}
              maxLength={40}
              placeholder="ALPHA"
              onChange={(e) => setCallsign(e.target.value)}
              className="mb-4 w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
            <button className="w-full rounded-md bg-accent py-2 font-mono text-xs font-medium text-accent-foreground">
              Додати учасника
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
