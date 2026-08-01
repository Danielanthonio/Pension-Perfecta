"use client";

import { Suspense } from "react";
import { useApp } from "@/utils/context/AppContext";
import FinanzasOverview from "@/components/finanzas/FinanzasOverview";

// Quién entra aquí:
//   · director/admin  → el módulo completo
//   · account manager → fuera (§2.3)
//   · closer          → fuera; su menú ni siquiera lo lista
//   · aliado          → el layout de /admin ya lo devuelve a /dashboard
//
// Este bloqueo es la cortesía de la interfaz, no la defensa: la de verdad está
// en la base. Las tablas de comisiones solo tienen política de SELECT para la
// Dirección y todas las RPC llaman a `fin_require_direccion()` por dentro, así
// que un usuario que llegara aquí a mano no vería un solo peso.
function FinanzasGate() {
  const { user, isLoading } = useApp();

  if (isLoading || !user) {
    return <div className="p-6 text-sm text-slate-400">Cargando finanzas…</div>;
  }

  if (user.role !== "director") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-6 py-14 text-center">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          El módulo de Finanzas y Comisiones es exclusivo de la Dirección.
        </p>
        <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
          Si necesitas consultar tus propias comisiones, pídeselo a la Dirección.
        </p>
      </div>
    );
  }

  return <FinanzasOverview />;
}

export default function FinanzasPage() {
  // FinanzasOverview lee los filtros de la URL con useSearchParams.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando finanzas…</div>}>
      <FinanzasGate />
    </Suspense>
  );
}
