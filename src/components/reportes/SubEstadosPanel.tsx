"use client";

// Reporte «SUB ESTADOS PROYECTOS», compartido por las pestañas ALIADOS y AM.
//
// Dos columnas —Aprobados y Condicionados— con el conteo de cada subetapa. Al
// pinchar una, se despliega la lista de proyectos que están ahí: nombre del
// cliente, tipo de financiamiento, AM asignado y aliado.
//
// El componente NO filtra: recibe los proyectos ya acotados por el período, el
// producto y el segmento de la pestaña que lo usa. Así el panel dice siempre lo
// mismo que las tarjetas de arriba.

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Layers } from "lucide-react";
import type { Prospect, UserProfile } from "@/utils/context/AppContext";
import { TipoFinanciamientoBadge } from "@/components/ui/tipoFinanciamiento";
import { PanelHeader } from "./ReportesCharts";
import {
  type SubEtapa,
  SUB_APROBADOS,
  SUB_CONDICIONADOS,
  SUB_CONDICIONADOS_LEGACY,
} from "./reportesTypes";

interface FilaSub extends SubEtapa {
  items: Prospect[];
}

function Columna({
  titulo,
  tono,
  filas,
  abierta,
  onToggle,
  total,
}: {
  titulo: string;
  tono: "emerald" | "amber";
  filas: FilaSub[];
  abierta: string | null;
  onToggle: (status: string) => void;
  total: number;
}) {
  const max = Math.max(...filas.map((f) => f.items.length), 1);
  const cabecera =
    tono === "emerald"
      ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20"
      : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 ring-amber-500/20";
  const barra = tono === "emerald" ? "bg-emerald-500" : "bg-amber-500";

  return (
    <div className="min-w-0 space-y-2">
      <div className={`rounded-xl px-3 py-2 ring-1 ring-inset flex items-center justify-between gap-2 ${cabecera}`}>
        <span className="text-[11px] font-bold uppercase tracking-[0.06em]">{titulo}</span>
        <span className="text-sm font-bold tabular-nums">{total}</span>
      </div>

      <ul className="space-y-1.5">
        {filas.map((f) => {
          const abierto = abierta === f.status;
          const n = f.items.length;
          return (
            <li key={f.status}>
              <button
                type="button"
                onClick={() => onToggle(f.status)}
                className={`w-full text-left rounded-xl border px-3 py-2 transition-all ${
                  abierto
                    ? "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40"
                    : "border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-90" : ""}`} />
                  <span className="flex-1 min-w-0 text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate" title={f.label}>
                    {f.label}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white shrink-0">{n}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full ${barra} transition-all duration-500`} style={{ width: `${n > 0 ? Math.max((n / max) * 100, 3) : 0}%` }} />
                </div>
              </button>

              {abierto && (
                <div className="mt-1.5 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30 overflow-hidden">
                  {n === 0 ? (
                    <p className="px-3 py-4 text-[11px] text-slate-400 dark:text-slate-500 text-center">
                      No hay proyectos en esta subetapa dentro de los filtros activos.
                    </p>
                  ) : (
                    <ListaProyectos items={f.items} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ListaProyectos({ items }: { items: (Prospect & { __am?: string })[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[560px]">
        <thead>
          <tr className="border-b border-slate-200/70 dark:border-slate-800 text-left">
            {["Cliente", "Tipo financiamiento", "AM asignado", "Aliado", ""].map((h, i) => (
              <th
                key={h + i}
                className={`px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ${i === 0 ? "pl-4" : ""} ${
                  i === 4 ? "pr-4 text-right" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
          {items.map((p) => (
            <tr key={p.id} className="hover:bg-white/70 dark:hover:bg-slate-800/20 transition-colors">
              <td className="pl-4 pr-3 py-2">
                <Link href={`/prospectos/${p.id}`} className="font-bold text-slate-800 dark:text-slate-200 hover:underline truncate block max-w-[200px]">
                  {p.full_name}
                </Link>
                <span className="text-[9px] text-slate-400 dark:text-slate-500 tabular-nums">{p.nss}</span>
              </td>
              <td className="px-3 py-2">
                <TipoFinanciamientoBadge value={p.tipo_financiamiento} />
              </td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-300 truncate max-w-[150px]">{p.__am || "Mesa de dirección"}</td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-300 truncate max-w-[150px]">{p.aliado_name || "Asesor Comercial"}</td>
              <td className="pl-3 pr-4 py-2 text-right">
                <Link
                  href={`/prospectos/${p.id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wide bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all active:scale-95"
                >
                  Abrir <ArrowRight className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SubEstadosPanel({
  items,
  profiles,
  subtitulo,
}: {
  items: Prospect[];
  profiles: UserProfile[];
  subtitulo?: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);

  const nombrePorId = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);

  // El AM se resuelve una vez y se cuelga del proyecto: si no, cada fila de cada
  // subetapa abierta volvería a recorrer `profiles`.
  const conAM = useMemo(
    () => items.map((p) => Object.assign({}, p, { __am: p.account_manager_id ? nombrePorId.get(p.account_manager_id) || "Account Manager" : "" })),
    [items, nombrePorId]
  );

  const { aprobados, condicionados, totalAprob, totalCond } = useMemo(() => {
    const porStatus = new Map<string, typeof conAM>();
    for (const p of conAM) {
      const prev = porStatus.get(p.status);
      if (prev) prev.push(p);
      else porStatus.set(p.status, [p]);
    }
    const arma = (defs: SubEtapa[]): FilaSub[] => defs.map((d) => ({ ...d, items: porStatus.get(d.status) || [] }));

    const aprob = arma(SUB_APROBADOS);
    // Los legacy solo aparecen si de verdad existen: si no, la columna se llenaría
    // de renglones a cero que no significan nada para quien lee hoy.
    const cond = [...arma(SUB_CONDICIONADOS), ...arma(SUB_CONDICIONADOS_LEGACY).filter((f) => f.items.length > 0)];

    return {
      aprobados: aprob,
      condicionados: cond,
      totalAprob: aprob.reduce((s, f) => s + f.items.length, 0),
      totalCond: cond.reduce((s, f) => s + f.items.length, 0),
    };
  }, [conAM]);

  const toggle = (status: string) => setAbierta((prev) => (prev === status ? null : status));

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
      <PanelHeader
        icon={Layers}
        tone="violet"
        title="Sub estados de los proyectos"
        subtitle={subtitulo ?? "Toca una subetapa para desplegar sus proyectos."}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Columna titulo="Aprobados" tono="emerald" filas={aprobados} abierta={abierta} onToggle={toggle} total={totalAprob} />
        <Columna titulo="Condicionados" tono="amber" filas={condicionados} abierta={abierta} onToggle={toggle} total={totalCond} />
      </div>
    </div>
  );
}
