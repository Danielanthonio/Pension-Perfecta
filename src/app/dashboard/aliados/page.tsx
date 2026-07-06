"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useApp } from "@/utils/context/AppContext";
import { Users, UserX, ArrowUpRight } from "lucide-react";
import Link from "next/link";

function AliadosContent() {
  const { user: contextUser, profiles, prospects, isProspectDeleted, isProspectPurged, isDemoMode } = useApp();
  const user = profiles.find((p) => p.id === contextUser?.id) || contextUser;

  const [liderAliadosData, setLiderAliadosData] = useState<any>(null);
  const [loadingLiderAliados, setLoadingLiderAliados] = useState(false);
  // Ranking de gestión: métrica por la que se ordenan los aliados del líder.
  const [rankBy, setRankBy] = useState<"ganados" | "comision" | "conversion" | "volumen">("ganados");
  const RANK_OPTIONS: { id: "ganados" | "comision" | "conversion" | "volumen"; label: string }[] = [
    { id: "ganados", label: "Proyectos ganados" },
    { id: "comision", label: "Crédito gestionado" },
    { id: "conversion", label: "Tasa de conversión" },
    { id: "volumen", label: "Volumen de prospectos" },
  ];
  const rankValueFor = (allyId: string) => {
    const ps = prospects.filter((p) => p.aliado_id === allyId && !isProspectDeleted(p) && !isProspectPurged(p));
    const financed = ps.filter((p) => p.status === "pagado_comision").length;
    const total = ps.length;
    switch (rankBy) {
      case "comision": return ps.reduce((s, p) => s + (p.simulation?.totalCredito || 0), 0);
      case "conversion": return total > 0 ? Math.round((financed / total) * 100) : 0;
      case "volumen": return total;
      case "ganados":
      default: return financed;
    }
  };

  useEffect(() => {
    if (user?.aliado_tipo === "lider") {
      if (isDemoMode) {
        const storedLiderAliados = localStorage.getItem("pensionflow_lider_aliados");
        let localRels = [];
        if (storedLiderAliados) {
          try {
            localRels = JSON.parse(storedLiderAliados);
          } catch (e) {
            localRels = [];
          }
        }
        
        const matchedRels = localRels.filter((r: any) => r.lider_id === user.id);
        const mappedAllies = matchedRels.map((r: any) => {
          const allyProfile = profiles.find((p) => p.id === r.aliado_asignado_id);
          const amProfile = profiles.find((p) => p.id === allyProfile?.account_manager_id);
          const allyProspects = prospects.filter((p) => p.aliado_id === r.aliado_asignado_id && !isProspectDeleted(p) && !isProspectPurged(p));
          
          return {
            id: r.aliado_asignado_id,
            name: allyProfile?.full_name || "Asesor Comercial Demo",
            email: allyProfile?.email || "demo@aliado.com",
            prospectos_activos: allyProspects.length,
            assigned_at: new Date(r.created_at || Date.now()).toISOString().split("T")[0],
            empresa_nombre: allyProfile?.lider_grupo || user.lider_grupo || "Sin Empresa",
            account_manager_name: amProfile?.full_name || "Mesa de Operaciones",
            lider_nombre: user.full_name
          };
        });

        const totalProspects = mappedAllies.reduce((sum: number, a: any) => sum + a.prospectos_activos, 0);

        setLiderAliadosData({
          lider_id: user.id,
          lider_nombre: user.full_name,
          grupo_nombre: user.lider_grupo || "Sin Grupo",
          aliados_asignados: mappedAllies,
          totales: {
            total_aliados: mappedAllies.length,
            total_prospectos: totalProspects
          }
        });
      } else {
        setLoadingLiderAliados(true);
        fetch(`/api/lideres/${user.id}/aliados`)
          .then((res) => res.json())
          .then((data) => {
            if (data.aliados_asignados) {
              setLiderAliadosData(data);
            }
          })
          .catch((err) => console.error("Error fetching leader allies:", err))
          .finally(() => setLoadingLiderAliados(false));
      }
    }
  }, [user, profiles, prospects, isDemoMode, isProspectDeleted, isProspectPurged]);

  if (user?.aliado_tipo !== "lider") {
    return (
      <div className="py-12 text-center text-slate-500 dark:text-slate-400">
        No tienes acceso a esta sección.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-850 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest block flex items-center gap-1.5">
              <Users className="h-4.5 w-4.5 text-blue-500" /> Mis Aliados Asignados
            </span>
            <span className="text-xs font-bold text-slate-650 dark:text-slate-400 mt-1 block">
              Visualiza los asesores comerciales asignados bajo tu liderazgo en la empresa <strong className="text-blue-550 dark:text-blue-400">"{user.lider_grupo || "Sin Empresa"}"</strong>.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hidden sm:block">Ordenar por</span>
            <select
              value={rankBy}
              onChange={(e) => setRankBy(e.target.value as typeof rankBy)}
              className="py-2 pl-3 pr-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 outline-none focus:border-blue-500 transition-colors shadow-sm cursor-pointer"
              title="Ranking de gestión: métrica por la que se ordenan los aliados"
            >
              {RANK_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loadingLiderAliados ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2">
            <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold">Cargando aliados asignados...</span>
          </div>
        ) : !liderAliadosData || liderAliadosData.aliados_asignados.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-850 flex items-center justify-center text-slate-400 mx-auto">
              <UserX className="h-6 w-6 text-slate-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350">No hay aliados asignados aún</h4>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Los Account Managers le asignarán asesores a tu grupo en breve.</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-850 text-[10px] font-bold text-slate-550 uppercase tracking-widest text-left">
                    <th className="px-6 py-4">Nombre del Aliado</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4 text-center">Prospectos Activos</th>
                    <th className="px-6 py-4">Fecha Asignación</th>
                    <th className="px-6 py-4">Empresa</th>
                    <th className="px-6 py-4">Account Manager</th>
                    <th className="px-6 py-4">Líder Asignado</th>
                    <th className="px-6 py-4 text-right">Proyectos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-850 text-xs">
                  {[...liderAliadosData.aliados_asignados].sort((a: any, b: any) => rankValueFor(b.id) - rankValueFor(a.id)).map((a: any) => (
                    <tr key={a.id} className="hover:bg-slate-50/45 dark:hover:bg-slate-850/10 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-650 dark:text-blue-400 flex items-center justify-center font-bold">
                            {a.name.charAt(0)}
                          </div>
                          <span className="font-extrabold text-slate-800 dark:text-slate-200">{a.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-slate-650 dark:text-slate-300">
                        {a.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-300 font-extrabold rounded-full">
                          {a.prospectos_activos}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-450 dark:text-slate-500 font-semibold">
                        {new Date(a.assigned_at + "T00:00:00").toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-650 dark:text-slate-300 font-semibold">
                        {a.empresa_nombre}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-650 dark:text-slate-300 font-semibold">
                        {a.account_manager_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-indigo-600 dark:text-indigo-400 font-extrabold">
                        {a.lider_nombre || user.full_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link
                          href={`/dashboard/clientes?aliado=${a.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[11px] font-bold rounded-xl border border-blue-200/60 dark:border-blue-900/40 transition-colors"
                          title={`Revisar los proyectos de ${a.name}`}
                        >
                          Ver proyectos <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-150 dark:border-slate-850 flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300 px-6">
              <span>TOTALES DE GRUPO</span>
              <div className="flex items-center gap-6">
                <span>Asesores: <strong className="text-blue-600 dark:text-blue-400">{liderAliadosData.totales.total_aliados}</strong></span>
                <span>Prospectos Sumados: <strong className="text-emerald-600 dark:text-emerald-400">{liderAliadosData.totales.total_prospectos}</strong></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AliadosPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-400">Cargando aliados...</div>}>
      <AliadosContent />
    </Suspense>
  );
}
