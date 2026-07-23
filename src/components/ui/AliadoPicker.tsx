"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, X, Check, Users } from "lucide-react";
import type { UserProfile, Prospect } from "@/utils/context/AppContext";

// Buscador + filtro multi-selección de aliados / account managers. Compartido por el
// Dashboard Ejecutivo y Gestión de Clientes (sólo vista del director). Reemplaza las
// pestañas de selección única (Todos / Por AM / Por Aliado / Gestión Directa): ahora el
// director elige 1 o más aliados y/o AMs a la vez para comparar sus gestiones.
// Sin selección = Todos.

// Opción sintética: proyectos sin account manager ("Gestión Directa (Sin AM)"),
// es decir, prospectos con account_manager_id null (mesa de dirección).
export const GESTION_DIRECTA_ID = "__direct__";

// Fuente de verdad del filtrado (usada por ambas páginas). Sin selección → deja pasar todo.
// Con selección hace match si: el aliado del prospecto está seleccionado directamente, o el
// account manager DEL PROYECTO está seleccionado, o se seleccionó "Gestión Directa" y el
// proyecto no tiene AM (account_manager_id null).
export function prospectMatchesSelection(
  p: Prospect,
  selected: string[],
  _profiles: UserProfile[] // ya no se usa (el AM vive en el proyecto); se conserva por compatibilidad
): boolean {
  if (selected.length === 0) return true;
  const set = new Set(selected);
  if (set.has(p.aliado_id)) return true;
  const amId = p.account_manager_id;
  if (amId && set.has(amId)) return true;
  if (set.has(GESTION_DIRECTA_ID) && !amId) return true;
  return false;
}

type Accent = "emerald" | "blue";

const ACCENT: Record<Accent, { ring: string; chip: string; check: string; badge: string }> = {
  emerald: {
    ring: "focus:border-emerald-500",
    chip: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
    check: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-600 text-white",
  },
  blue: {
    ring: "focus:border-blue-500",
    chip: "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-blue-500/20",
    check: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-600 text-white",
  },
};

export function AliadoPicker({
  profiles,
  selected,
  onChange,
  accent = "emerald",
  className = "",
}: {
  profiles: UserProfile[];
  selected: string[];
  onChange: (ids: string[]) => void;
  accent?: Accent;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const c = ACCENT[accent];

  // Cerrar el panel al hacer click fuera.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const ams = useMemo(
    () =>
      profiles
        .filter((p) => p.role === "account_manager" && p.is_active)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "es")),
    [profiles]
  );
  const allies = useMemo(
    () =>
      profiles
        .filter((p) => p.role === "aliado" && p.is_active)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "es")),
    [profiles]
  );

  // Nombre legible de cualquier id seleccionado (para los chips).
  const nameOf = (id: string): string => {
    if (id === GESTION_DIRECTA_ID) return "Gestión Directa";
    return profiles.find((p) => p.id === id)?.full_name || "—";
  };
  const q = query.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const filteredAms = ams.filter((a) => matches(a.full_name));
  const filteredAllies = allies.filter((a) => matches(a.full_name));
  const showDirect = matches("gestión directa") || matches("gestion directa") || matches("sin am");

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  const Option = ({ id, label, sub }: { id: string; label: string; sub?: string }) => {
    const on = selected.includes(id);
    return (
      <button
        type="button"
        onClick={() => toggle(id)}
        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <span
          className={`h-4 w-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
            on
              ? "border-transparent bg-slate-900 dark:bg-white"
              : "border-slate-300 dark:border-slate-600"
          }`}
        >
          {on && <Check className="h-3 w-3 text-white dark:text-slate-900" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span>
          {sub && <span className="block truncate text-[10px] text-slate-400 dark:text-slate-500">{sub}</span>}
        </span>
      </button>
    );
  };

  return (
    <div ref={rootRef} className={`relative w-full lg:w-auto ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Chips de la selección actual */}
        {selected.map((id) => (
          <span
            key={id}
            className={`inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg text-[11px] font-semibold ring-1 ring-inset ${c.chip}`}
          >
            <span className="truncate max-w-[130px]">{nameOf(id)}</span>
            <button
              type="button"
              onClick={() => toggle(id)}
              className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={`Quitar ${nameOf(id)}`}
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </span>
        ))}

        {/* Disparador */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl py-1.5 px-3 text-xs font-semibold outline-none transition-colors cursor-pointer text-slate-700 dark:text-slate-300 ${c.ring}`}
        >
          <Search className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          {selected.length === 0 ? "Todos los aliados y AM" : "Agregar / buscar"}
          {selected.length > 0 && (
            <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${c.badge}`}>
              {selected.length}
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[300px] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
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
                placeholder="Buscar aliado o AM..."
                className={`w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-lg text-xs font-semibold outline-none transition-all dark:text-slate-200 ${c.ring}`}
              />
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-1">
            {showDirect && (
              <Option id={GESTION_DIRECTA_ID} label="Gestión Directa (Sin AM)" sub="Proyectos sin account manager" />
            )}

            {filteredAms.length > 0 && (
              <>
                <p className="px-2.5 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Account Managers
                </p>
                {filteredAms.map((am) => (
                  <Option key={am.id} id={am.id} label={am.full_name} sub="Incluye todos sus proyectos" />
                ))}
              </>
            )}

            {filteredAllies.length > 0 && (
              <>
                <p className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Aliados
                </p>
                {filteredAllies.map((ally) => (
                  <Option key={ally.id} id={ally.id} label={ally.full_name} />
                ))}
              </>
            )}

            {!showDirect && filteredAms.length === 0 && filteredAllies.length === 0 && (
              <div className="py-8 text-center text-slate-400 dark:text-slate-500">
                <Users className="h-5 w-5 mx-auto mb-1.5 opacity-60" />
                <p className="text-xs font-semibold">Sin coincidencias</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
              {selected.length === 0 ? "Todos" : `${selected.length} seleccionado${selected.length === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
              className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
