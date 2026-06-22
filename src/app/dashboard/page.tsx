"use client";

import React, { Suspense } from "react";
import { useApp, getStageAndSubStage } from "@/utils/context/AppContext";
import SalesFunnel from "@/components/SalesFunnel";
import { Plus, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function DashboardContent() {
  const { prospects, isProspectDeleted, isProspectPurged } = useApp();
  const searchParams = useSearchParams();

  // Read URL parameters
  const startDate = searchParams.get("desde") || "";
  const endDate = searchParams.get("hasta") || "";
  const stageFilter = searchParams.get("etapa") || "all";
  const subStageFilter = searchParams.get("subetapa") || "all";

  // Filter active prospects
  const activeProspects = prospects.filter(
    (p) => !isProspectDeleted(p) && !isProspectPurged(p)
  );

  const filteredProspects = activeProspects.filter((p) => {
    // Date filter
    if (p.created_at) {
      const createdDate = new Date(p.created_at).getTime();
      if (startDate) {
        const start = new Date(startDate + "T00:00:00").getTime();
        if (createdDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate + "T23:59:59").getTime();
        if (createdDate > end) return false;
      }
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

  return (
    <div className="space-y-8 max-w-[1700px] mx-auto animate-fade-in">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Mi Panel Comercial</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Monitorea el embudo de ventas, conversiones y financiamientos de tus prospectos.
          </p>
        </div>
        <Link
          href="/dashboard/nuevo"
          className="inline-flex items-center justify-center px-5 py-3 bg-gradient-to-r from-indigo-650 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-500/10 hover:scale-[1.02] active:scale-[0.98] text-sm"
        >
          <Plus className="mr-2 h-4 w-4 stroke-[2.5]" />
          Registrar Prospecto
        </Link>
      </div>

      {/* Incidencia Alert Bar (Incompletos) */}
      {faltaDocumentos.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 animate-pulse" />
            <div>
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300">Prospectos Incompletos ({faltaDocumentos.length})</h4>
              <p className="text-[11px] text-amber-700 dark:text-amber-405 mt-0.5">Se han detectado expedientes en evaluación con documentación faltante. Completa los requisitos para emitir dictamen.</p>
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
