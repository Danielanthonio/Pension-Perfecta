"use client";

import { Suspense } from "react";
import { useApp } from "@/utils/context/AppContext";
import AsignacionCloserModule from "@/components/closers/AsignacionCloserModule";

// Dirección y Account Manager. El AM entra desde el 2026-08-03 para cerrar el
// hueco de los aliados sin closer, pero SOLO puede hacer la atribución inicial:
// reescribir la de un aliado que ya la tiene mueve métricas y comisiones, y eso
// no se delega. El límite lo impone la base (`asigna_closer_a_aliado`), no esta
// pantalla. Un closer sigue fuera: no se reparte cartera a sí mismo (§21).
function AsignacionCloserGate() {
  const { user, isLoading } = useApp();

  if (isLoading || !user) {
    return <div className="p-6 text-sm text-slate-400">Cargando…</div>;
  }

  if (user.role !== "director" && user.role !== "account_manager") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-6 py-14 text-center">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          Aquí solo entran Dirección y los Account Managers.
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
