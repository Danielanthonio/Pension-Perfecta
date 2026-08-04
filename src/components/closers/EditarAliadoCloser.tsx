"use client";

// Administración de un aliado por parte de su closer: corregir el nombre,
// actualizar el teléfono y cargar el enlace del contrato.
//
// Solo se abre para los aliados que ESE closer dio de alta: desde el 2026-08-04
// la atribución no basta para administrar (§8/§9), y quien lo decide es
// `closer_actualiza_aliado` en la base, no esta pantalla.
//
// Dos cosas quedan deliberadamente FUERA y conviene saber por qué:
//
//  * El CORREO. Es la credencial con la que el aliado entra, y vive en
//    `auth.users`, no en `profiles`. Cambiarlo solo aquí dejaría el perfil
//    diciendo una cosa y el acceso otra: el aliado seguiría entrando con el
//    correo viejo y nadie entendería por qué. Lo hace la Dirección.
//  * La ATRIBUCIÓN y el ROL. No los toca ni esta pantalla ni la función de la
//    base que hay detrás (`closer_actualiza_aliado`, con lista blanca de
//    columnas). Reasignar es cosa de Dirección.

import React, { useState } from "react";
import { AlertTriangle, FileText, Loader2, Save, X } from "lucide-react";
import { useApp } from "@/utils/context/AppContext";
import type { CloserAliadoRow } from "./closerTypes";

const COUNTRIES = [
  { code: "+52", flag: "🇲🇽" },
  { code: "+1", flag: "🇺🇸" },
  { code: "+57", flag: "🇨🇴" },
  { code: "+34", flag: "🇪🇸" },
  { code: "+54", flag: "🇦🇷" },
  { code: "+56", flag: "🇨🇱" },
  { code: "+51", flag: "🇵🇪" },
];

const partirTelefono = (tel?: string | null) => {
  const s = (tel || "").trim();
  const pais = COUNTRIES.find((c) => s.startsWith(c.code));
  return pais
    ? { code: pais.code, resto: s.slice(pais.code.length).replace(/\D/g, "") }
    : { code: "+52", resto: s.replace(/\D/g, "") };
};

export function EditarAliadoCloser({
  aliado,
  contratoActual,
  telefonoActual,
  onCerrar,
  onGuardado,
}: {
  aliado: CloserAliadoRow;
  contratoActual: string | null;
  telefonoActual: string | null;
  onCerrar: () => void;
  onGuardado: () => void | Promise<void>;
}) {
  const { updateProfileAdmin } = useApp();
  const inicial = partirTelefono(telefonoActual);

  const [nombre, setNombre] = useState(aliado.aliado_nombre || "");
  const [countryCode, setCountryCode] = useState(inicial.code);
  const [telefono, setTelefono] = useState(inicial.resto);
  const [contrato, setContrato] = useState(contratoActual || "");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const nombreOk = nombre.trim().length >= 3;
  const telOk = !telefono || /^\d{10}$/.test(telefono.replace(/\D/g, ""));
  const contratoLimpio = contrato.trim();
  const avisoContrato = !contratoLimpio
    ? "falta"
    : !/^https?:\/\/\S+\.\S+/i.test(contratoLimpio)
      ? "no-es-enlace"
      : null;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreOk || !telOk || guardando) return;
    setGuardando(true);
    setErrorMsg("");
    try {
      await updateProfileAdmin(aliado.aliado_id, {
        full_name: nombre.trim(),
        // `phone` es string en el perfil, no nullable: borrarlo se representa
        // con cadena vacía, y la función de la base ya la convierte en NULL.
        phone: telefono ? `${countryCode} ${telefono.replace(/\D/g, "")}` : "",
        contrato_url: contratoLimpio || null,
      });
      await onGuardado();
      onCerrar();
    } catch (err: any) {
      console.error("Error guardando al aliado:", err);
      setErrorMsg(err?.message || "No se pudo guardar el cambio. Inténtalo de nuevo.");
      setGuardando(false);
    }
  };

  const campo =
    "w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border rounded-xl text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all";
  const borde = (malo: boolean) =>
    malo ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-750";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight truncate">
              Administrar aliado
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{aliado.aliado_email || "—"}</p>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={guardar} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Nombre completo
            </label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={`${campo} ${borde(!nombreOk)}`}
            />
            {!nombreOk && <p className="text-[10px] text-red-500 mt-1">Mínimo 3 caracteres.</p>}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Teléfono
            </label>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="px-2.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-750 rounded-xl text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>
              <input
                inputMode="numeric"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10 dígitos"
                className={`${campo} ${borde(!telOk)} flex-1`}
              />
            </div>
            {!telOk && <p className="text-[10px] text-red-500 mt-1">Deben ser 10 dígitos.</p>}
          </div>

          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <FileText className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="min-w-0">
                <label className="block text-[11px] font-bold text-amber-800 dark:text-amber-300">
                  Contrato firmado
                </label>
                <p className="text-[10px] text-amber-700/90 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                  Al pagar comisiones se revisa que la documentación esté completa.
                </p>
              </div>
            </div>
            <input
              value={contrato}
              onChange={(e) => setContrato(e.target.value)}
              placeholder="https://… enlace al contrato"
              className={`${campo} border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900`}
            />
            {avisoContrato === "no-es-enlace" ? (
              <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Eso no parece un enlace: debe empezar por http:// o https://.
              </p>
            ) : avisoContrato === "falta" ? (
              <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Este aliado sigue sin contrato registrado.
              </p>
            ) : null}
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
            El correo no se edita aquí: es la credencial con la que entra el aliado y cambiarlo solo en la
            ficha lo dejaría fuera. Eso lo hace Dirección.
          </p>

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <p className="text-[11px] text-rose-700 dark:text-rose-300">{errorMsg}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCerrar}
              className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!nombreOk || !telOk || guardando}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
