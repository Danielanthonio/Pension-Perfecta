"use client";

import { Suspense } from "react";
import { useApp } from "@/utils/context/AppContext";
import AsignacionCloserModule from "@/components/closers/AsignacionCloserModule";

// Módulo EXCLUSIVO de la Dirección: es quien decide a quién se le atribuye cada
// aliado. Un closer no puede repartirse cartera a sí mismo (§21), y un AM no
// participa en la captación de aliados.
function AsignacionCloserGate() {
  const { user, isLoading } = useApp();

  if (isLoading || !user) {
    return <div className="p-6 text-sm text-slate-400">Cargando…</div>;
  }

  if (user.role !== "director") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-6 py-14 text-center">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          Solo la Dirección puede asignar closers.
        </p>
        <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
          La atribución de un aliado a un closer define métricas históricas, así que no se delega.
        </p>
      </div>
    );
  }

  return <AsignacionCloserModule />;
}

export default function AsignacionCloserPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando…</div>}>
      <AsignacionCloserGate />
    </Suspense>
  );
}
