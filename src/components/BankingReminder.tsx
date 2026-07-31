"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useApp, getBankingCompletion } from "@/utils/context/AppContext";
import BankingDataForm from "@/components/BankingDataForm";
import { Landmark, Coins, X } from "lucide-react";

// Recordatorio de datos de cobro. Se monta una sola vez en el layout raíz (junto
// a GlobalChat) y aparece UNA vez por inicio de sesión mientras el usuario no
// tenga registrado cómo se le paga.
//
// Trae el formulario dentro a propósito: el recordatorio que solo dice "ve a
// Configuración" se ignora. Aquí se resuelve en el momento y se cierra solo al
// guardar. Nunca bloquea: siempre se puede posponer con "Más tarde" y no vuelve
// a molestar hasta el siguiente inicio de sesión.

export const BANKING_REMINDER_KEY = "pensionflow_banking_reminder_shown";

export default function BankingReminder() {
  const { user, isProvisionalSession, isLoading } = useApp();
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);

  const banking = getBankingCompletion(user);
  const hiddenRoute = /^\/(login|register|update-password)(\/|$)/.test(pathname);
  const shouldRemind = !!user && !isLoading && !isProvisionalSession && !hiddenRoute && !banking.complete;

  useEffect(() => {
    if (!shouldRemind || !user) {
      setOpen(false);
      return;
    }
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(BANKING_REMINDER_KEY) === user.id;
    } catch {
      // Sin sessionStorage (modo privado estricto) preferimos no insistir.
      alreadyShown = true;
    }
    if (alreadyShown) return;

    // Pequeño retraso: deja que termine la hidratación y cualquier redirección
    // de rol, para que el aviso no parpadee sobre la pantalla de carga.
    const t = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(t);
  }, [shouldRemind, user]);

  const dismiss = () => {
    try {
      if (user) sessionStorage.setItem(BANKING_REMINDER_KEY, user.id);
    } catch {}
    setOpen(false);
  };

  if (!open || !user) return null;

  const isAM = user.role === "account_manager";
  const isDirector = user.role === "director";
  const isBinance = banking.mode === "binance";

  const accentSoft = isAM
    ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
    : isDirector
    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
    : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400";

  const Icon = isBinance ? Coins : Landmark;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-[28px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        {/* Encabezado */}
        <div className="flex items-start gap-4 p-6 pb-5 border-b border-slate-100 dark:border-slate-850">
          <div className={`h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center ${accentSoft}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-[0.12em] leading-none">
              Recordatorio
            </span>
            <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-tight mt-2 leading-snug">
              Aún no registras tus datos de cobro
            </h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed mt-1.5">
              {isBinance
                ? "Sin tu ID de Binance no podemos enviarte tus pagos. Toma menos de un minuto."
                : "Sin tus datos bancarios no podemos depositarte tus comisiones. Toma menos de un minuto."}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            aria-label="Cerrar recordatorio"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulario (se cierra solo al guardar) */}
        <div className="p-6">
          <BankingDataForm
            onSaved={dismiss}
            submitLabel="Guardar y continuar"
            footerNote={
              <button
                type="button"
                onClick={dismiss}
                className="text-[12px] font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors underline underline-offset-4 decoration-slate-300 dark:decoration-slate-700"
              >
                Más tarde
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}
