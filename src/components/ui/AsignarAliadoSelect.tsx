"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check, Users, UserCircle } from "lucide-react";
import type { UserProfile } from "@/utils/context/AppContext";

// Selector buscador de UN solo aliado, para asignar el proyecto al capturarlo.
// Lo usa el Director / Account Manager en la Captura de Prospecto: al crear el
// proyecto, elige a qué aliado quedará asignado desde una búsqueda de todos los
// aliados activos. A diferencia de `AliadoPicker` (multi-selección, usado como
// filtro), este es de selección única y solo lista aliados (no AMs).
export function AsignarAliadoSelect({
  profiles,
  value,
  onChange,
  invalid = false,
  placeholder = "Selecciona el aliado…",
  className = "",
}: {
  profiles: UserProfile[];
  value: string | null;
  onChange: (id: string | null) => void;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Cerrar el panel al hacer click fuera.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Todos los aliados activos, ordenados por nombre.
  const allies = useMemo(
    () =>
      profiles
        .filter((p) => p.role === "aliado" && p.is_active)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "es")),
    [profiles]
  );

  const selectedAlly = value ? profiles.find((p) => p.id === value) : null;

  // El Account Manager de cada aliado. Se enseña porque desde 20260831000001 el
  // proyecto es del AM del ALIADO: quien captura elige aquí, sin saberlo, a quién
  // le queda la gestión. Un aliado sin AM manda el proyecto a la mesa de dirección.
  const nombrePorId = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);
  const amDe = (a: UserProfile): string | null =>
    a.account_manager_id ? nombrePorId.get(a.account_manager_id) || "Account Manager" : null;

  const q = query.trim().toLowerCase();
  const filtered = q ? allies.filter((a) => a.full_name.toLowerCase().includes(q)) : allies;

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      {/* Disparador */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold outline-none transition-all bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border ${
          invalid
            ? "border-red-400 dark:border-red-500/50 focus:ring-1 focus:ring-red-400"
            : "border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500"
        }`}
      >
        <span className="text-slate-400 dark:text-slate-500 shrink-0">
          <UserCircle className="h-4 w-4" />
        </span>
        {selectedAlly ? (
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-slate-800 dark:text-white">{selectedAlly.full_name}</span>
            <span className="block truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
              {amDe(selectedAlly) ? `Lo gestiona ${amDe(selectedAlly)}` : "Sin Account Manager · mesa de dirección"}
            </span>
          </span>
        ) : (
          <span className="flex-1 text-left text-slate-400 dark:text-slate-500">{placeholder}</span>
        )}
        <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
          <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <Search className="h-3.5 w-3.5" />
              </span>
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar aliado por nombre…"
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-lg text-xs font-semibold outline-none transition-all dark:text-slate-200 focus:border-emerald-500 dark:focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-1">
            {filtered.length > 0 ? (
              filtered.map((ally) => {
                const on = ally.id === value;
                return (
                  <button
                    key={ally.id}
                    type="button"
                    onClick={() => pick(ally.id)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <span
                      className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                        on ? "border-transparent bg-emerald-600" : "border-slate-300 dark:border-slate-600"
                      }`}
                    >
                      {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{ally.full_name}</span>
                      <span className="block truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                        {amDe(ally) || "Sin Account Manager"}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="py-8 text-center text-slate-400 dark:text-slate-500">
                <Users className="h-5 w-5 mx-auto mb-1.5 opacity-60" />
                <p className="text-xs font-semibold">
                  {allies.length === 0 ? "No hay aliados activos" : "Sin coincidencias"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
