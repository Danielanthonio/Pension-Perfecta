"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import { useApp, getStageAndSubStage, Prospect } from "@/utils/context/AppContext";
import SalesFunnel from "@/components/SalesFunnel";
import { Plus, AlertCircle, Shield, Users, Mail, Phone, User, Award, Layers, UserX, Sparkles, ChevronRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

function DashboardContent() {
  const { prospects, isProspectDeleted, isProspectPurged, user: contextUser, profiles, isDemoMode } = useApp();
  const user = profiles.find((p) => p.id === contextUser?.id) || contextUser;
  const searchParams = useSearchParams();

  const [assignedLeaderIds, setAssignedLeaderIds] = useState<string[]>([]);
  const [dbLeaders, setDbLeaders] = useState<any[]>([]);

  useEffect(() => {
    if (user?.id && !isDemoMode) {
      const supabaseClient = createClient();
      supabaseClient
        .from("lider_aliados")
        .select("lider_id")
        .eq("aliado_asignado_id", user.id)
        .then(async ({ data, error }) => {
          if (error) {
            console.error("Error fetching leaders directly:", error);
          }
          if (data && data.length > 0) {
            const ids = data.map((r: any) => r.lider_id);
            setAssignedLeaderIds(ids);
            
            // Failsafe: Fetch leader profile directly by ID to bypass missing entries in profiles state
            const { data: profs } = await supabaseClient
              .from("profiles")
              .select("id, full_name, email, role")
              .in("id", ids);
            if (profs) {
              setDbLeaders(profs);
            }
          }
        });
    }
  }, [user?.id, isDemoMode]);

  const activeLeaderIds = Array.from(new Set([
    ...(user?.lider_ids || []),
    ...(user?.lider_id ? [user.lider_id] : []),
    ...assignedLeaderIds
  ]));

  const allProfiles = [
    ...profiles,
    ...dbLeaders
  ];

  const assignedLeaders = allProfiles.filter(
    (p, index, self) => activeLeaderIds.includes(p.id) && self.findIndex(o => o.id === p.id) === index
  );

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
          const amProfile = profiles.find((p) => p.id === allyProfile?.account_manager_id);
          // Look up all prospects of this ally
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

  // Expanded rows state for indicators table
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Auto-expand Company row by default to match new layout
  useEffect(() => {
    if (user?.aliado_tipo === "lider") {
      const companyRowId = `company-${user.empresa_multialiado_id || "unknown"}`;
      setExpandedRows({
        [companyRowId]: true,
      });
    }
  }, [user]);

  interface EfficiencyTableRow {
    id: string;
    level: number;
    name: string;
    subLabel?: string;
    type: "am" | "category" | "company" | "role-group" | "ally";
    alliesCount?: number;
    clientes: number;
    evaluados: number;
    aprobados: number;
    condicionados: number;
    rechazados: number;
    finAprobados: number;
    finOtorgados: number;
    tasaEvaluacion: number;
    tasaAprobacion: number;
    tasaCierre: number;
    hasChildren: boolean;
    isExpanded: boolean;
    parentId?: string;
  }

  // Calculate hierarchical Visible Rows for "Mis Indicadores de Eficiencia"
  const visibleRows = useMemo(() => {
    if (user?.aliado_tipo !== "lider") return [];

    const rows: EfficiencyTableRow[] = [];

    const getStats = (prospectsList: Prospect[]) => {
      const totalClientes = prospectsList.length;
      const evaluados = totalClientes;
      const aprobados = prospectsList.filter((p) =>
        ["aprobado_listo", "asesoria_agendada", "firma_programada"].includes(p.status)
      ).length;
      const condicionados = prospectsList.filter((p) =>
        ["falta_reporte", "falta_afore", "pendiente_documentos", "falta_semanas", "falta_afore_cuenta", "posible_simulacion", "aportacion"].includes(p.status)
      ).length;
      // "Cerrado perdido" es solo un estado del cliente, no un rechazo.
      const rechazados = prospectsList.filter((p) => p.status === "rechazado").length;

      const approvedStatuses = [
        "aprobado_listo",
        "aportacion",
        "asesoria_agendada",
        "doc_proceso",
        "analisis_riesgo",
        "firma_programada",
        "pagado_comision",
      ];
      const finAprobados = prospectsList
        .filter((p) => approvedStatuses.includes(p.status) && p.simulation)
        .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

      const finOtorgados = prospectsList
        .filter((p) => p.status === "pagado_comision" && p.simulation)
        .reduce((sum, p) => sum + (p.simulation?.totalCredito || p.simulation?.financiamiento || 0), 0);

      const tasaEvaluacion = totalClientes > 0 ? (evaluados / totalClientes) * 100 : 0;
      const tasaAprobacion = evaluados > 0 ? (aprobados / evaluados) * 100 : 0;
      const tasaCierre = aprobados > 0 ? (prospectsList.filter((p) => p.status === "pagado_comision").length / aprobados) * 100 : 0;

      return {
        clientes: totalClientes,
        evaluados,
        aprobados,
        condicionados,
        rechazados,
        finAprobados,
        finOtorgados,
        tasaEvaluacion,
        tasaAprobacion,
        tasaCierre,
      };
    };

    // Use backend-loaded allies to bypass RLS limitations on client-side profiles list
    const assignedAllies = liderAliadosData?.aliados_asignados || [];
    const assignedAllyIds = assignedAllies.map((a: any) => a.id);

    const leaderProspects = filteredProspects.filter((p) => p.aliado_id === user.id);
    const allProspects = filteredProspects.filter((p) => p.aliado_id === user.id || assignedAllyIds.includes(p.aliado_id || ""));

    const companyName = user.lider_grupo || "Sin Empresa";
    const companyRowId = `company-${user.empresa_multialiado_id || "unknown"}`;
    const companyExpanded = !!expandedRows[companyRowId];

    const totalAlliesCount = assignedAllies.length + 1; // Team + Leader
    const companyStats = getStats(allProspects);

    // Root Company row (Level 1)
    rows.push({
      id: companyRowId,
      level: 1,
      name: companyName,
      type: "company",
      alliesCount: totalAlliesCount,
      ...companyStats,
      hasChildren: true,
      isExpanded: companyExpanded,
    });

    if (companyExpanded) {
      // Level 2 Role Group: Leaders
      const leadersHeaderId = `${companyRowId}-lideres-header`;
      rows.push({
        id: leadersHeaderId,
        level: 2,
        name: "Líderes",
        type: "role-group",
        clientes: 0,
        evaluados: 0,
        aprobados: 0,
        condicionados: 0,
        rechazados: 0,
        finAprobados: 0,
        finOtorgados: 0,
        tasaEvaluacion: 0,
        tasaAprobacion: 0,
        tasaCierre: 0,
        hasChildren: false,
        isExpanded: false,
        parentId: companyRowId,
      });

      // Level 3 Ally: Leader himself
      const leaderStats = getStats(leaderProspects);
      const leaderRowId = `${leadersHeaderId}-${user.id}`;
      rows.push({
        id: leaderRowId,
        level: 3,
        name: user.full_name,
        type: "ally",
        ...leaderStats,
        hasChildren: false,
        isExpanded: false,
        parentId: leadersHeaderId,
      });

      // Level 2 Role Group: Allies
      if (assignedAllies.length > 0) {
        const alliesHeaderId = `${companyRowId}-aliados-header`;
        rows.push({
          id: alliesHeaderId,
          level: 2,
          name: "Aliados",
          type: "role-group",
          clientes: 0,
          evaluados: 0,
          aprobados: 0,
          condicionados: 0,
          rechazados: 0,
          finAprobados: 0,
          finOtorgados: 0,
          tasaEvaluacion: 0,
          tasaAprobacion: 0,
          tasaCierre: 0,
          hasChildren: false,
          isExpanded: false,
          parentId: companyRowId,
        });

        // Level 3 Ally: Advisors
        assignedAllies.forEach((ally: any) => {
          const allyRowId = `${alliesHeaderId}-${ally.id}`;
          const allyProspects = filteredProspects.filter((p) => p.aliado_id === ally.id);
          const allyStats = getStats(allyProspects);

          rows.push({
            id: allyRowId,
            level: 3,
            name: ally.name,
            subLabel: `Líder: ${user.full_name}`,
            type: "ally",
            ...allyStats,
            hasChildren: false,
            isExpanded: false,
            parentId: alliesHeaderId,
          });
        });
      }
    }

    return rows;
  }, [filteredProspects, expandedRows, user, liderAliadosData]);

  const toggleRow = (rowId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  const getActionButtonText = (row: EfficiencyTableRow) => {
    if (row.type === "company") return row.isExpanded ? "Ocultar" : "Ver detalle";
    return null;
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in pb-12">
           {/* 1. Mi Información / Profile Info Cards */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm relative overflow-hidden transition-all">
        <div className="absolute top-0 right-0 h-40 w-40 bg-gradient-to-bl from-blue-500/5 via-indigo-500/5 to-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:divide-x divide-slate-150 dark:divide-slate-800">
          
          {/* Section 1: Mi Información */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Mi Información</span>
              {user?.aliado_tipo === "lider" ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/10">
                  <Award className="h-3 w-3" /> Líder de empresa
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900">
                  <User className="h-3 w-3" /> Aliado
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-black border shrink-0 ${
                user?.aliado_tipo === "lider"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/20"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/20"
              }`}>
                {user?.full_name.charAt(0)}
              </div>
              <div className="min-w-0">
                <span className="block text-sm font-extrabold text-slate-850 dark:text-white truncate leading-tight">{user?.full_name}</span>
                <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-bold">
                  {user?.empresa_multialiado_id ? `Empresa: ${user.lider_grupo || "Sin Empresa"}` : "Asesor Independiente"}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-850 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5 truncate">
                <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{user?.email}</span>
              </div>
              <span className="hidden sm:inline text-slate-350 dark:text-slate-700">•</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>{user?.phone || "Sin Celular"}</span>
              </div>
            </div>

            {/* Display assigned leaders only for allies in a compact row */}
            {user?.aliado_tipo === "aliado" && user?.empresa_multialiado_id && assignedLeaders.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-850 flex flex-wrap items-center gap-1.5 text-[9px]">
                <span className="text-slate-400 font-bold uppercase mr-1">Líderes:</span>
                {assignedLeaders.map((l) => (
                  <span key={l.id} className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 rounded-lg font-bold border border-indigo-100/50 dark:border-indigo-900/40">
                    {l.full_name.split(" ")[0]}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Account Manager */}
          <div className="space-y-3 lg:pl-6">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Account Manager Asignado</span>

            {assignedAM ? (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 flex items-center justify-center text-sm font-black border border-indigo-200/25 shrink-0">
                  {assignedAM.full_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <span className="block text-sm font-extrabold text-slate-850 dark:text-white truncate leading-tight">{assignedAM.full_name}</span>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-550 mt-0.5 font-semibold uppercase tracking-wider">
                    Soporte B2B y Dictámenes
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-sm font-black border border-slate-200/30 shrink-0">
                  ?
                </div>
                <div className="min-w-0">
                  <span className="block text-sm font-extrabold text-slate-650 dark:text-slate-400 truncate leading-tight">Mesa de Operaciones</span>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-semibold">
                    Espera de asignación del director
                  </span>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-slate-850 text-[10px] leading-relaxed text-slate-500 dark:text-slate-450 font-medium">
              {assignedAM 
                ? `Supervisor: ${assignedAM.full_name}. Contáctale para dudas de clientes o liberación de dictámenes Ley 73.`
                : "Aún no se te ha asignado un AM. Tus expedientes serán evaluados por el Director de Operaciones."}
            </div>
          </div>

          {/* Section 3: Cartera Comercial */}
          <div className="space-y-3 lg:pl-6">
            <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider block">Cartera Comercial</span>

            <div className="flex items-center gap-3">
              <div className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl">
                <span className="block text-[8px] text-slate-400 font-extrabold uppercase">Prospectos</span>
                <span className="block text-lg font-black text-slate-850 dark:text-white mt-0.5 leading-none">
                  {activeProspects.length}
                </span>
              </div>
              
              {user?.aliado_tipo === "lider" ? (
                <div className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl">
                  <span className="block text-[8px] text-slate-400 font-extrabold uppercase">Asesores</span>
                  <span className="block text-lg font-black text-blue-650 dark:text-blue-400 mt-0.5 leading-none">
                    {liderAliadosData?.totales?.total_aliados || 0}
                  </span>
                </div>
              ) : (
                <div className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl">
                  <span className="block text-[8px] text-slate-400 font-extrabold uppercase">Completados</span>
                  <span className="block text-lg font-black text-emerald-650 dark:text-emerald-400 mt-0.5 leading-none">
                    {activeProspects.filter(p => p.status === "pagado_comision").length}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-850 text-[10px] text-slate-500 dark:text-slate-450 font-medium leading-relaxed">
              {user?.aliado_tipo === "lider" 
                ? `Lideras un grupo de ${liderAliadosData?.totales?.total_aliados || 0} asesores comerciales, con un total de ${liderAliadosData?.totales?.total_prospectos || 0} prospectos acumulados.`
                : `Tienes ${activeProspects.filter(p => p.status === "evaluacion_pendiente").length} expedientes pendientes de evaluar.`}
          </div>
        </div>
      </div>
    </div>

      {/* Incidencia Alert Bar (Incompletos) */}
      {faltaDocumentos.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 animate-pulse" />
            <div>
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300">Prospectos Incompletos ({faltaDocumentos.length})</h4>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">Se han detectado expedientes evaluados con documentación faltante. Completa los requisitos para emitir dictamen.</p>
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
      <SalesFunnel prospects={filteredProspects} assignedAllies={liderAliadosData?.aliados_asignados} />

      {/* Hierarchical Efficiency Indicators Table (Solo para Líderes) */}
      {user?.aliado_tipo === "lider" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden mt-8">
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
              Mis Indicadores de Eficiencia
            </span>
            <span className="text-[10px] font-bold flex items-center gap-1 text-blue-500">
              <Sparkles className="h-3.5 w-3.5" />
              Comparativa de eficiencia en tiempo real
            </span>
          </div>

          {visibleRows.length === 0 ? (
            <div className="py-20 text-center space-y-3 bg-white dark:bg-slate-900">
              <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mx-auto">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Sin datos de rendimiento</h4>
                <p className="text-xs text-slate-450 dark:text-slate-500 mt-1 max-w-[280px] mx-auto">
                  No hay aliados asignados ni prospectos registrados bajo tu liderazgo.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-150 dark:border-slate-800 text-[9px] font-bold text-slate-550 dark:text-slate-450 uppercase tracking-widest text-left">
                    <th className="px-6 py-4">Account Manager / Entidad</th>
                    <th className="px-4 py-4 text-center">Aliados</th>
                    <th className="px-4 py-4 text-center">Clientes</th>
                    <th className="px-4 py-4 text-center">Evaluados</th>
                    <th className="px-4 py-4 text-center">Aprobados</th>
                    <th className="px-4 py-4 text-center">Condicionados</th>
                    <th className="px-4 py-4 text-center">Rechazados</th>
                    <th className="px-5 py-4 text-right">Fin. Aprobados</th>
                    <th className="px-5 py-4 text-right">Fin. Otorgados</th>
                    <th className="px-4 py-4 text-center">Tasa Eval.</th>
                    <th className="px-4 py-4 text-center">Tasa Aprob.</th>
                    <th className="px-4 py-4 text-center">Tasa Cierre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                  {visibleRows.map((row) => {
                    if (row.type === "role-group") {
                      return (
                        <tr key={row.id} className="bg-slate-100/50 dark:bg-slate-950/20">
                          <td
                            colSpan={12}
                            className="px-6 py-2.5 text-[9px] font-black text-slate-450 dark:text-slate-550 uppercase tracking-widest"
                            style={{ paddingLeft: `${row.level * 1.5}rem` }}
                          >
                            {row.name}
                          </td>
                        </tr>
                      );
                    }

                    const actionText = getActionButtonText(row);
                    const isLevel1 = row.level === 1;

                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-colors group ${
                          isLevel1 ? "bg-slate-50/20 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-800" : ""
                        }`}
                      >
                        <td
                          className="py-4 pr-4 select-none cursor-pointer"
                          onClick={() => row.hasChildren && toggleRow(row.id)}
                          style={{ paddingLeft: `${row.level * 1.5}rem` }}
                        >
                          <div className="flex items-center gap-2">
                            {row.hasChildren ? (
                              <span className="flex-shrink-0">
                                {row.isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" />
                                )}
                              </span>
                            ) : (
                              <span className="w-4 h-4 flex-shrink-0" />
                            )}

                            <div className="flex flex-col">
                              <span className={`text-xs ${isLevel1 ? "text-slate-900 dark:text-white font-extrabold" : "text-slate-700 dark:text-slate-300 font-semibold"}`}>
                                {row.name}
                              </span>
                              {row.subLabel && (
                                <span className="text-[10px] text-slate-450 dark:text-slate-500 font-medium mt-0.5">
                                  {row.subLabel}
                                </span>
                              )}
                            </div>

                            {row.hasChildren && actionText && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRow(row.id);
                                }}
                                className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[9px] text-slate-500 dark:text-slate-400 font-bold transition-all cursor-pointer border border-slate-200 dark:border-slate-700/80"
                              >
                                {actionText}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                          {row.alliesCount !== undefined ? row.alliesCount : "-"}
                        </td>
                        <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                          {row.clientes}
                        </td>
                        <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                          {row.evaluados}
                        </td>
                        <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                          {row.aprobados}
                        </td>
                        <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                          {row.condicionados}
                        </td>
                        <td className="px-4 py-4 text-center whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-350">
                          {row.rechazados}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                          {formatCurrency(row.finAprobados)}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(row.finOtorgados)}
                        </td>
                        <td className="px-4 py-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/20 text-blue-650 dark:text-blue-400 border border-blue-100">
                            {row.tasaEvaluacion.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950/20 text-purple-650 dark:text-purple-400 border border-purple-100">
                            {row.tasaAprobacion.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-650 dark:text-emerald-400 border border-emerald-100">
                            {row.tasaCierre.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
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
