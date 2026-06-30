"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useApp, getStageAndSubStage } from "@/utils/context/AppContext";
import SalesFunnel from "@/components/SalesFunnel";
import { Plus, AlertCircle, Shield, Users, Mail, Phone, User, Award, Layers, UserX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function DashboardContent() {
  const { prospects, isProspectDeleted, isProspectPurged, user: contextUser, profiles, isDemoMode } = useApp();
  const user = profiles.find((p) => p.id === contextUser?.id) || contextUser;
  const searchParams = useSearchParams();

  // Read URL parameters
  const startDate = searchParams.get("desde") || "";
  const endDate = searchParams.get("hasta") || "";
  const stageFilter = searchParams.get("etapa") || "all";
  const subStageFilter = searchParams.get("subetapa") || "all";

  // Filter active prospects (for the current user)
  const activeProspects = prospects.filter(
    (p) => !isProspectDeleted(p) && !isProspectPurged(p)
  );

  const filteredProspects = activeProspects.filter((p) => {
    // Date filter
    if (p.created_at) {
      const createdDateStr = p.created_at.substring(0, 10);
      if (startDate && createdDateStr < startDate) return false;
      if (endDate && createdDateStr > endDate) return false;
    }

    // Stage filter
    const { stage, subStage } = getStageAndSubStage(p.status);
    if (stageFilter !== "all" && stage !== stageFilter) {
      return false;
    }

    // Sub-stage filter
    if (subStageFilter !== "all" && subStage !== subStageFilter) {
      return false;
    }

    return true;
  });

  // Missing documents alert (in evaluation but has < 2 documents)
  const faltaDocumentos = activeProspects.filter(
    (p) => p.status === "evaluacion_pendiente" && p.documents.length < 2
  );

  // Leadership state
  const [liderAliadosData, setLiderAliadosData] = useState<any>(null);
  const [loadingLiderAliados, setLoadingLiderAliados] = useState(false);

  useEffect(() => {
    if (user?.aliado_tipo === "lider") {
      if (isDemoMode) {
        // Load mock relationships in demo mode
        const storedLiderAliados = localStorage.getItem("pensionflow_lider_aliados");
        let localRels = [];
        if (storedLiderAliados) {
          try {
            localRels = JSON.parse(storedLiderAliados);
          } catch (e) {
            localRels = [];
          }
        }
        
        // Filter relationships for this leader
        const matchedRels = localRels.filter((r: any) => r.lider_id === user.id);
        const mappedAllies = matchedRels.map((r: any) => {
          const allyProfile = profiles.find((p) => p.id === r.aliado_asignado_id);
          // Look up all prospects of this ally
          const allyProspects = prospects.filter((p) => p.aliado_id === r.aliado_asignado_id && !isProspectDeleted(p) && !isProspectPurged(p));
          
          return {
            id: r.aliado_asignado_id,
            name: allyProfile?.full_name || "Asesor Comercial Demo",
            email: allyProfile?.email || "demo@aliado.com",
            prospectos_activos: allyProspects.length,
            assigned_at: new Date(r.created_at || Date.now()).toISOString().split("T")[0]
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
        // Real API request
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
  }, [user, profiles, prospects, isDemoMode]);

  const assignedAM = profiles.find(p => p.id === user?.account_manager_id);

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in pb-12">
      
      {/* 1. Mi Información / Profile Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Profile Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden transition-all">
          <div className="absolute top-0 right-0 h-28 w-28 bg-gradient-to-bl from-emerald-500/10 to-teal-500/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Mi Información</span>
              {user?.aliado_tipo === "lider" ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/10">
                  <Award className="h-3 w-3" /> Líder
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900">
                  <User className="h-3 w-3" /> Aliado
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className={`h-11 w-11 rounded-2xl flex items-center justify-center text-sm font-black border ${
                user?.aliado_tipo === "lider"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/20"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/20"
              }`}>
                {user?.full_name.charAt(0)}
              </div>
              <div className="min-w-0">
                <span className="block text-sm font-extrabold text-slate-855 dark:text-white truncate leading-tight">{user?.full_name}</span>
                <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-bold">
                  {user?.empresa_multialiado_id ? `Empresa: ${user.lider_grupo || "Sin Empresa"}` : "Asesor Independiente"}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-850 pt-4 space-y-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <span className="truncate">{user?.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                <span>{user?.phone || "Sin Celular"}</span>
              </div>

              {/* Company membership details & Leaders list */}
              <div className="border-t border-slate-100 dark:border-slate-850 pt-2 mt-2 space-y-2 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold uppercase text-[9px]">Pertenece a Empresa:</span>
                  <span className={`px-2 py-0.5 rounded-full font-extrabold uppercase text-[9px] ${
                    user?.empresa_multialiado_id 
                      ? "bg-blue-50 dark:bg-blue-955/20 text-blue-650 dark:text-blue-400" 
                      : "bg-slate-50 dark:bg-slate-800 text-slate-500"
                  }`}>
                    {user?.empresa_multialiado_id ? "Sí" : "No (Independiente)"}
                  </span>
                </div>

                {user?.empresa_multialiado_id && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Rol en Empresa:</span>
                      <span className={`px-2 py-0.5 rounded-full font-black uppercase text-[9px] ${
                        user?.aliado_tipo === "lider" 
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-955 dark:text-blue-400" 
                          : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {user?.aliado_tipo === "lider" ? "Líder" : "Aliado"}
                      </span>
                    </div>

                    {user?.aliado_tipo === "aliado" && (
                      <div className="flex flex-col gap-1.5 pt-1">
                        <span className="text-slate-400 font-bold uppercase text-[9px]">Mis Líderes Asignados:</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {profiles.filter((p) => user?.lider_ids?.includes(p.id)).length > 0 ? (
                            profiles
                              .filter((p) => user?.lider_ids?.includes(p.id))
                              .map((l) => (
                                <span key={l.id} className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 rounded-lg font-extrabold border border-indigo-100 dark:border-indigo-900/40">
                                  👤 {l.full_name}
                                </span>
                              ))
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Ningún líder asignado</span>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Assigned Account Manager */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden transition-all">
          <div className="absolute top-0 right-0 h-28 w-28 bg-gradient-to-bl from-blue-500/10 to-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="space-y-4">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Account Manager Asignado</span>

            {assignedAM ? (
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 flex items-center justify-center text-sm font-black border border-indigo-200/25">
                  {assignedAM.full_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <span className="block text-sm font-extrabold text-slate-850 dark:text-white truncate leading-tight">{assignedAM.full_name}</span>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-550 mt-1 font-semibold uppercase tracking-wider">
                    Soporte B2B y Dictámenes
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-sm font-black border border-slate-200/30">
                  ?
                </div>
                <div className="min-w-0">
                  <span className="block text-sm font-extrabold text-slate-650 dark:text-slate-400 truncate leading-tight">Mesa de Operaciones</span>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-semibold">
                    Espera de asignación del director
                  </span>
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-slate-850 pt-4 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 font-medium">
              {assignedAM 
                ? `Tu supervisor directo es ${assignedAM.full_name}. Contáctale para dudas sobre tus clientes o liberación de dictámenes Ley 73.`
                : "Aún no se te ha asignado un Account Manager personalizado. Tus expedientes serán evaluados directamente por el Director de Operaciones."}
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden transition-all">
          <div className="absolute top-0 right-0 h-28 w-28 bg-gradient-to-bl from-indigo-500/10 to-purple-500/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="space-y-4">
            <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider block">Cartera Comercial</span>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-2xl">
                <span className="block text-[8px] text-slate-400 font-extrabold uppercase">Prospectos</span>
                <span className="block text-2xl font-black text-slate-850 dark:text-white mt-1">
                  {activeProspects.length}
                </span>
              </div>
              
              {user?.aliado_tipo === "lider" ? (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-2xl">
                  <span className="block text-[8px] text-slate-400 font-extrabold uppercase">Asesores a Cargo</span>
                  <span className="block text-2xl font-black text-blue-650 dark:text-blue-400 mt-1">
                    {liderAliadosData?.totales?.total_aliados || 0}
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-2xl">
                  <span className="block text-[8px] text-slate-400 font-extrabold uppercase">Completados</span>
                  <span className="block text-2xl font-black text-emerald-650 dark:text-emerald-400 mt-1">
                    {activeProspects.filter(p => p.status === "pagado_comision").length}
                  </span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-slate-850 pt-4 text-[11px] text-slate-505 dark:text-slate-400 font-medium">
              {user?.aliado_tipo === "lider" 
                ? `Lideras un grupo de ${liderAliadosData?.totales?.total_aliados || 0} asesores comerciales, sumando un total acumulado de ${liderAliadosData?.totales?.total_prospectos || 0} prospectos.`
                : `Tienes ${activeProspects.filter(p => p.status === "evaluacion_pendiente").length} expedientes pendientes de evaluar.`}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Sección "MIS ALIADOS ASIGNADOS" (Solo para Líderes) */}
      {user?.aliado_tipo === "lider" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
          <div className="p-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-850 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest block flex items-center gap-1.5">
                <Users className="h-4.5 w-4.5 text-blue-500" /> Mis Aliados Asignados
              </span>
              <span className="text-xs font-bold text-slate-650 dark:text-slate-400 mt-1 block">
                Visualiza los asesores comerciales asignados bajo tu liderazgo en la empresa <strong className="text-blue-550 dark:text-blue-400">"{user.lider_grupo}"</strong>.
              </span>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-slate-850 text-xs">
                    {liderAliadosData.aliados_asignados.map((a: any) => (
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
      )}

      {/* Incidencia Alert Bar (Incompletos) */}
      {faltaDocumentos.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 animate-pulse" />
            <div>
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300">Prospectos Incompletos ({faltaDocumentos.length})</h4>
              <p className="text-[11px] text-amber-700 dark:text-amber-405 mt-0.5">Se han detectado expedientes evaluados con documentación faltante. Completa los requisitos para emitir dictamen.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {faltaDocumentos.map((fd) => (
              <Link
                key={fd.id}
                href={`/prospectos/${fd.id}`}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold transition-colors"
              >
                Completar: {fd.full_name.split(" ")[0]}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sales Funnel and Rates */}
      <SalesFunnel prospects={filteredProspects} />
    </div>
  );
}

export default function DashboardAliado() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-400">Cargando dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
