"use client";

import { Suspense } from "react";
import { useApp } from "@/utils/context/AppContext";
import FinanzasOverview from "@/components/finanzas/FinanzasOverview";
import MisComisionesOverview from "@/components/finanzas/MisComisionesOverview";

// Una ruta, dos pantallas. Quién ve cuál:
//
//   finanzas         → el libro mayor completo, y es lo ÚNICO que ve de la app
//   director/admin   → el libro mayor completo (si está en la lista de acceso)
//   account manager  → SOLO lo suyo: sus liquidaciones y sus tarifas
//   closer           → SOLO lo suyo, exactamente igual que el account manager
//   aliado           → el layout de /admin ya lo devuelve a /dashboard
//
// Que las dos vistas compartan ruta es deliberado: «Finanzas» es un sitio, no un
// privilegio, y así un enlace con su filtro de período sigue funcionando cuando
// se lo pasa un compañero de otro rol —cada quien aterriza en la versión que le
// toca—.
//
// Este reparto es la cortesía de la interfaz, no la defensa. La de verdad está en
// la base y son DOS puertas distintas: las tablas del libro mayor solo tienen
// política de SELECT para quien pasa `fin_is_direccion()`, y la vista personal se
// sirve por RPC que filtran con `auth.uid()` y no aceptan un parámetro de usuario
// (20260810000000). Un Account Manager que llegara a mano a la pantalla de la
// Dirección no vería un solo peso, ni suyo ni de nadie.
const ROLES_LIBRO_MAYOR = ["director", "finanzas"];
const ROLES_VISTA_PERSONAL = ["account_manager", "closer"];

function FinanzasGate() {
  const { user, isLoading } = useApp();

  if (isLoading || !user) {
    return <div className="p-6 text-sm text-slate-400">Cargando finanzas…</div>;
  }

  if (ROLES_LIBRO_MAYOR.includes(user.role)) {
    return <FinanzasOverview />;
  }

  if (ROLES_VISTA_PERSONAL.includes(user.role)) {
    return <MisComisionesOverview />;
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-6 py-14 text-center">
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
        El módulo de Finanzas y Comisiones es exclusivo de la Dirección y del equipo de Finanzas.
      </p>
      <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
        Si necesitas consultar tus propias comisiones, pídeselo a la Dirección.
      </p>
    </div>
  );
}

export default function FinanzasPage() {
  // Las dos vistas leen los filtros de la URL con useSearchParams.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando finanzas…</div>}>
      <FinanzasGate />
    </Suspense>
  );
}
