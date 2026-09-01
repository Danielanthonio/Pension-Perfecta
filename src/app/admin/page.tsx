"use client";

import React, { useState, useMemo } from "react";
import {
  useApp,
  Prospect,
  isLostStatus,
} from "@/utils/context/AppContext";
import SalesFunnel from "@/components/SalesFunnel";
import { SortControl, SortHeader, SortDir, SortState } from "@/components/ui/sorting";
import { ModalidadFilter, ModalidadFilterValue, prospectMatchesModalidadFilter } from "@/components/ui/ModalidadFilter";
import { AliadoPicker, prospectMatchesSelection, GESTION_DIRECTA_ID } from "@/components/ui/AliadoPicker";
// Buckets de estado (fuente única de verdad compartida con el módulo Reportes).
import { fueAprobado, fueCondicionado, fueEvaluado, fueOtorgado, fueRechazado, montoFinanciamiento } from "./_pipelineBuckets";
import {
  Users,
  Filter,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PipelineManagerContent() {
  const {
    user,
    prospects,
    profiles,
    isProspectDeleted,
    isProspectPurged,
  } = useApp();

  const isAM = user?.role === "account_manager";
  const searchParams = useSearchParams();

  const startDate = searchParams.get("desde") || "";
  const endDate = searchParams.get("hasta") || "";

  // Filtro de asignación (director): multi-selección de aliados y/o account managers.
  // Vacío = Todos. Ver AliadoPicker / prospectMatchesSelection.
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  // Filtro por modalidad de aprobación (Todos / M40 / M10): recalcula todos los KPIs.
  const [modalidadFilter, setModalidadFilter] = useState<ModalidadFilterValue>("all");

  // Sort state for the comparative table (top-level entities).
  const [sortKey, setSortKey] = useState("clientes");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const sort: SortState = {
    sortKey,
    sortDir,
    setSortKey,
    setSortDir,
    toggle: (key: string) => {
      if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
  };

  const baseFilteredProspects = useMemo(() => {
    if (user?.role !== "director") return prospects;
    return prospects.filter((p) => prospectMatchesSelection(p, selectedEntities, profiles));
  }, [prospects, user, selectedEntities, profiles]);

  const activeProspects = baseFilteredProspects.filter(
    (p) =>
      !isProspectDeleted(p) &&
      !isProspectPurged(p) &&
      prospectMatchesModalidadFilter(p, modalidadFilter)
  );

  const filteredByDate = activeProspects.filter((p) => {
    if (!p.created_at) return true;
    const createdDateStr = p.created_at.substring(0, 10);

    if (startDate && createdDateStr < startDate) return false;
    if (endDate && createdDateStr > endDate) return false;

    return true;
  });

  const amsList = useMemo(() => {
    return profiles.filter((p) => p.role === "account_manager" && p.is_active);
  }, [profiles]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  interface RowStats {
    clientes: number;
    evaluados: number;
    aprobados: number;
    condicionados: number;
    rechazados: number;
    perdidos: number;
    finAprobados: number;
    finOtorgados: number;
    tasaEvaluacion: number;
    tasaAprobacion: number;
    tasaCierre: number;
  }

  interface EfficiencyTableRow extends RowStats {
    id: string;
    name: string;
    subLabel?: string;
    type: "am" | "ally";
  }

  // Filas del detallado. Con el pivote AM-por-PROYECTO ya NO se desglosan los aliados
  // por account manager: el detallado se mide POR PROYECTO. La vista por defecto es una
  // fila por AM (+ Gestión Directa); si el director selecciona entidades en el
  // AliadoPicker, es una fila por selección (comparativa plana, incluye aliados).
  const visibleRows = useMemo(() => {
    const rows: EfficiencyTableRow[] = [];

    const getStats = (prospectsList: Prospect[]): RowStats => {
      // Se cuenta por HITO ALCANZADO, no por el estado de hoy (mismo criterio que el
      // Embudo Comercial, ver _pipelineBuckets.ts). Antes se excluía a los cerrados
      // perdidos de TODOS los conteos, así que marcar un cliente como perdido le
      // borraba al AM la aprobación que ya había conseguido y le movía la T. Aprob.
      // hacia atrás. Ahora el perdido conserva los escalones que subió, y un
      // financiamiento otorgado sigue contando como aprobado.
      const totalClientes = prospectsList.length;
      const evaluados = prospectsList.filter(fueEvaluado).length;
      const aprobados = prospectsList.filter(fueAprobado).length;
      const condicionados = prospectsList.filter(fueCondicionado).length;
      const rechazados = prospectsList.filter(fueRechazado).length;
      const otorgados = prospectsList.filter(fueOtorgado).length;
      const perdidos = prospectsList.filter((p) => isLostStatus(p.status)).length;

      const finAprobados = prospectsList.filter(fueAprobado).reduce((sum, p) => sum + montoFinanciamiento(p), 0);
      const finOtorgados = prospectsList.filter(fueOtorgado).reduce((sum, p) => sum + montoFinanciamiento(p), 0);

      const tasaEvaluacion = totalClientes > 0 ? (evaluados / totalClientes) * 100 : 0;
      const tasaAprobacion = evaluados > 0 ? (aprobados / evaluados) * 100 : 0;
      const tasaCierre = aprobados > 0 ? (otorgados / aprobados) * 100 : 0;

      return { clientes: totalClientes, evaluados, aprobados, condicionados, rechazados, perdidos, finAprobados, finOtorgados, tasaEvaluacion, tasaAprobacion, tasaCierre };
    };

    // Value used to order rows, per the selected sort key.
    const sortVal = (stats: RowStats, name: string): number | string => {
      switch (sortKey) {
        case "name": return name;
        case "clientes": return stats.clientes;
        case "evaluados": return stats.evaluados;
        case "aprobados": return stats.aprobados;
        case "condicionados": return stats.condicionados;
        case "rechazados": return stats.rechazados;
        case "perdidos": return stats.perdidos;
        case "finAprobados": return stats.finAprobados;
        case "finOtorgados": return stats.finOtorgados;
        case "tasaEvaluacion": return stats.tasaEvaluacion;
        case "tasaAprobacion": return stats.tasaAprobacion;
        case "tasaCierre": return stats.tasaCierre;
        default: return stats.clientes;
      }
    };
    const cmp = (va: number | string, vb: number | string) => {
      let d: number;
      if (typeof va === "number" && typeof vb === "number") d = va - vb;
      else d = String(va).localeCompare(String(vb), "es", { numeric: true });
      return sortDir === "desc" ? -d : d;
    };

    // Vista comparativa plana: el director eligió 1 o más aliados/AMs → una fila por
    // selección (sin jerarquía), lado a lado con sus KPIs. Ver AliadoPicker.
    if (!isAM && selectedEntities.length > 0) {
      type FlatEntry = { key: string; name: string; subLabel: string; type: "am" | "ally"; stats: RowStats };
      const flat: FlatEntry[] = [];
      selectedEntities.forEach((id) => {
        if (id === GESTION_DIRECTA_ID) {
          // Gestión Directa = proyectos sin account manager asignado (AM por proyecto).
          const ps = filteredByDate.filter((p) => !p.account_manager_id);
          flat.push({ key: `cmp-${id}`, name: "Gestión Directa (Sin AM)", subLabel: "Proyectos sin account manager", type: "am", stats: getStats(ps) });
          return;
        }
        const prof = profiles.find((p) => p.id === id);
        if (!prof) return;
        if (prof.role === "account_manager") {
          // AM por proyecto: sus proyectos son los que tienen su id asignado directamente.
          const ps = filteredByDate.filter((p) => p.account_manager_id === prof.id);
          flat.push({ key: `cmp-${id}`, name: prof.full_name, subLabel: "Account Manager", type: "am", stats: getStats(ps) });
        } else {
          // Un aliado ya no tiene UN AM fijo (el AM es por proyecto), así que no se muestra AM.
          const ps = filteredByDate.filter((p) => p.aliado_id === prof.id);
          flat.push({ key: `cmp-${id}`, name: prof.full_name, subLabel: "Aliado", type: "ally", stats: getStats(ps) });
        }
      });
      flat.sort((a, b) => cmp(sortVal(a.stats, a.name), sortVal(b.stats, b.name)));
      flat.forEach((e) => {
        rows.push({
          id: e.key,
          name: e.name,
          subLabel: e.subLabel,
          type: e.type,
          ...e.stats,
        });
      });
      return rows;
    }

    // Vista por defecto: una fila por AM (+ Gestión Directa), medida por proyecto.
    let selectedAMs: { id: string | null; name: string }[] = [];
    if (isAM) {
      if (user) {
        selectedAMs = [{ id: user.id, name: user.full_name }];
      }
    } else {
      // Director sin selección → Todos los AM + Gestión Directa.
      selectedAMs = amsList.map((am) => ({ id: am.id, name: am.full_name }));
      // Gestión Directa = proyectos sin account manager asignado (AM por proyecto).
      const unassignedProspects = filteredByDate.filter((p) => !p.account_manager_id);
      if (unassignedProspects.length > 0) {
        selectedAMs.push({ id: null, name: "Gestión Directa (Sin AM)" });
      }
    }

    const amEntries = selectedAMs.map((am) => {
      // AM por proyecto: los proyectos de la fila son los asignados a ese AM (o sin AM
      // para Gestión Directa).
      const amProspects = filteredByDate.filter((p) =>
        am.id ? p.account_manager_id === am.id : !p.account_manager_id
      );
      return { am, amRowId: `am-${am.id || "direct"}`, amStats: getStats(amProspects) };
    });
    amEntries.sort((a, b) => cmp(sortVal(a.amStats, a.am.name), sortVal(b.amStats, b.am.name)));

    amEntries.forEach(({ amRowId, amStats, am }) => {
      rows.push({
        id: amRowId,
        name: am.name,
        subLabel: am.name.startsWith("Gestión Directa") ? undefined : "Account Manager",
        type: "am",
        ...amStats,
      });
    });

    return rows;
  }, [amsList, profiles, filteredByDate, user, isAM, selectedEntities, sortKey, sortDir]);

  const accent = isAM ? "blue" : "emerald";
  const sortOptions = [
    { id: "clientes", label: "Proyectos" },
    { id: "aprobados", label: "Aprobados" },
    { id: "condicionados", label: "Condicionados" },
    { id: "rechazados", label: "Rechazados" },
    { id: "finAprobados", label: "Fin. aprobado" },
    { id: "finOtorgados", label: "Fin. otorgado" },
    { id: "tasaAprobacion", label: "Tasa aprobación" },
    { id: "tasaCierre", label: "Tasa cierre" },
    { id: "name", label: "Nombre (A-Z)" },
  ];

  return (
    <div className="space-y-5 max-w-[1700px] mx-auto animate-fade-in text-slate-800 dark:text-slate-100">

      {/* Director Pipeline Assignment Filters */}
      {!isAM && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-emerald-500/10">
              <Users className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-white">Filtro de Asignación / Origen</h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Selecciona uno o varios aliados y/o account managers para comparar sus gestiones lado a lado.</p>
            </div>
          </div>

          <AliadoPicker
            profiles={profiles}
            selected={selectedEntities}
            onChange={setSelectedEntities}
            accent="emerald"
          />
        </div>
      )}

      {/* Filtro por modalidad de aprobación — recalcula todos los KPIs (Director y AM) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-indigo-500/10">
            <Filter className="h-4 w-4" strokeWidth={2.2} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-white">Modalidad de aprobación</h4>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Recalcula el embudo y los indicadores por modalidad (M40 / M10).</p>
          </div>
        </div>
        <ModalidadFilter value={modalidadFilter} onChange={setModalidadFilter} />
      </div>

      {/* Sales Funnel Section */}
      <SalesFunnel prospects={filteredByDate} />

      {/* Account Manager Performance Comparative Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
            {isAM ? "Mis Indicadores de Eficiencia" : "Indicadores de Gestión — Account Managers"}
          </span>
          <SortControl options={sortOptions} sort={sort} accent={accent as any} />
        </div>

        {visibleRows.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-white dark:bg-slate-900">
            <div className="h-11 w-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Sin datos de rendimiento</h4>
              <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                No hay proyectos registrados bajo el filtro actual.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/60 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-left">
                  <SortHeader col="name" label="Account Manager / Entidad" sort={sort} align="left" className="pl-4" />
                  <SortHeader col="clientes" label="Proyectos" sort={sort} align="center" />
                  <SortHeader col="evaluados" label="Eval." sort={sort} align="center" />
                  <SortHeader col="aprobados" label="Aprob." sort={sort} align="center" />
                  <SortHeader col="condicionados" label="Condic." sort={sort} align="center" />
                  <SortHeader col="rechazados" label="Rechaz." sort={sort} align="center" />
                  <SortHeader col="perdidos" label="Perdidos" sort={sort} align="center" />
                  <SortHeader col="finAprobados" label="Fin. Aprob." sort={sort} align="right" />
                  <SortHeader col="finOtorgados" label="Fin. Otorg." sort={sort} align="right" />
                  <SortHeader col="tasaEvaluacion" label="T. Eval." sort={sort} align="center" />
                  <SortHeader col="tasaAprobacion" label="T. Aprob." sort={sort} align="center" />
                  <SortHeader col="tasaCierre" label="T. Cierre" sort={sort} align="center" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-850/20 transition-colors group bg-slate-50/40 dark:bg-slate-900/40"
                  >
                    <td className="py-2.5 pr-3 pl-4">
                      <div className="flex flex-col min-w-0">
                        <span className="truncate text-slate-900 dark:text-white font-bold">
                          {row.name}
                        </span>
                        {row.subLabel && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{row.subLabel}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums font-semibold text-slate-800 dark:text-slate-200">{row.clientes}</td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums text-slate-500 dark:text-slate-400">{row.evaluados}</td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{row.aprobados}</td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums text-amber-600 dark:text-amber-400">{row.condicionados}</td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums text-rose-500 dark:text-rose-400">{row.rechazados}</td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap tabular-nums text-slate-400 dark:text-slate-500">{row.perdidos}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(row.finAprobados)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(row.finOtorgados)}</td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <span className="tabular-nums font-semibold text-slate-500 dark:text-slate-400">{row.tasaEvaluacion.toFixed(0)}%</span>
                    </td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <span className="tabular-nums font-semibold text-slate-500 dark:text-slate-400">{row.tasaAprobacion.toFixed(0)}%</span>
                    </td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${
                        row.tasaCierre >= 50
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                          : row.tasaCierre > 0
                            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                      }`}>
                        {row.tasaCierre.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PipelineManager() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-450">Cargando consola...</div>}>
      <PipelineManagerContent />
    </Suspense>
  );
}
