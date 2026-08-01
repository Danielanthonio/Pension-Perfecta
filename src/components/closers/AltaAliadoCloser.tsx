"use client";

// Alta de un aliado hecha por el propio closer.
//
// Es la pieza que cierra el módulo: la PRODUCCIÓN de un closer se genera cuando
// incorpora un aliado nuevo, así que el alta tiene que estar en sus manos, no en
// las de Dirección. En cuanto guarda, ese aliado ya cuenta en `aliados_total` y
// arranca el reloj de su productividad (clientes y ventas).
//
// La atribución NO se elige aquí: la fija el llamador y la base la vuelve a
// exigir en el WITH CHECK de la política "Closers dan de alta a sus aliados"
// (migración 20260801000001). Un closer no puede acreditarle el alta a otro ni
// crear un rol distinto de `aliado`, aunque manipule la petición.

import React, { useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, FileText, Loader2, RefreshCw, UserPlus, X } from "lucide-react";
import { useApp } from "@/utils/context/AppContext";

const COUNTRIES = [
  { code: "+52", flag: "🇲🇽", label: "México (+52)" },
  { code: "+1", flag: "🇺🇸", label: "EE.UU. (+1)" },
  { code: "+57", flag: "🇨🇴", label: "Colombia (+57)" },
  { code: "+34", flag: "🇪🇸", label: "España (+34)" },
  { code: "+54", flag: "🇦🇷", label: "Argentina (+54)" },
  { code: "+56", flag: "🇨🇱", label: "Chile (+56)" },
  { code: "+51", flag: "🇵🇪", label: "Perú (+51)" },
];

// Contraseña legible al dictarla por teléfono: sin caracteres que se confundan
// (0/O, 1/l/I) y con un separador, porque el aliado la va a teclear a mano.
const generarPassword = () => {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const numeros = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  return `${pick(letras)}${pick(letras.toLowerCase())}${pick(letras.toLowerCase())}${pick(letras.toLowerCase())}-${pick(numeros)}${pick(numeros)}${pick(numeros)}${pick(numeros)}`;
};

export function AltaAliadoCloser({
  closerId,
  closerNombre,
  esMiPropiaFicha,
  onCerrar,
  onCreado,
}: {
  closerId: string;
  closerNombre: string;
  /** false cuando es la Dirección dando de alta en nombre de ese closer. */
  esMiPropiaFicha: boolean;
  onCerrar: () => void;
  onCreado: () => void | Promise<void>;
}) {
  const { createProfile, profiles } = useApp();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+52");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState(generarPassword);
  const [contrato, setContrato] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiado, setCopiado] = useState<"email" | "pass" | null>(null);
  const [creado, setCreado] = useState<{ nombre: string; email: string; password: string } | null>(null);

  const nombreOk = fullName.trim().length >= 3;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const telOk = /^\d{10}$/.test(phone.replace(/\D/g, ""));
  const passOk = password.trim().length >= 8;
  // El contrato NO bloquea el alta (decisión de Dirección del 2026-08-01): se
  // pide, se advierte y se guarda, pero nunca impide incorporar a un aliado. La
  // base tampoco lo exige ya, ver 20260801000003.
  const contratoLimpio = contrato.trim();
  const contratoEsUrl = /^https?:\/\/\S+\.\S+/i.test(contratoLimpio);
  // Dos avisos distintos, no uno: "no pusiste nada" y "lo que pusiste no se va a
  // poder abrir" son problemas distintos el día que se revise el pago.
  const avisoContrato = !contratoLimpio ? "falta" : !contratoEsUrl ? "no-es-enlace" : null;

  // Un correo repetido no lo rechaza el RLS sino el UNIQUE de la tabla, y el
  // error de Supabase llega en inglés y sin contexto. Mejor avisar antes.
  const emailRepetido = useMemo(
    () => emailOk && profiles.some((p) => (p.email || "").toLowerCase() === email.trim().toLowerCase()),
    [profiles, email, emailOk]
  );

  const puedeGuardar = nombreOk && emailOk && telOk && passOk && !emailRepetido && !guardando;

  const copiar = async (texto: string, cual: "email" | "pass") => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      /* si el navegador lo bloquea, el dato está a la vista de todos modos */
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviado(true);
    setErrorMsg("");
    if (!puedeGuardar) return;

    setGuardando(true);
    try {
      await createProfile({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: `${countryCode} ${phone.replace(/\D/g, "")}`,
        role: "aliado",
        is_active: true,
        password_provisional: password.trim(),
        // El alta queda acreditada a este closer. La base lo vuelve a exigir.
        closer_origen_id: closerId,
        contrato_url: contratoLimpio,
      });
      setCreado({ nombre: fullName.trim(), email: email.trim().toLowerCase(), password: password.trim() });
      await onCreado();
    } catch (err: any) {
      console.error("Error dando de alta al aliado:", err);
      const msg = String(err?.message || "");
      setErrorMsg(
        msg.startsWith("LÍMITE_CORREOS")
          ? "Supabase bloqueó el envío de correos de verificación por límite de tasa. Espera unos minutos e inténtalo otra vez."
          : /already registered|already exists|duplicate/i.test(msg)
            ? "Ese correo ya tiene una cuenta en la plataforma."
            : "No se pudo crear el aliado. Revisa los datos e inténtalo de nuevo."
      );
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
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <UserPlus className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">
                {creado ? "Aliado incorporado" : "Nuevo aliado"}
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                {esMiPropiaFicha ? "Cuenta para tu producción" : `Se acredita a ${closerNombre}`}
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {creado ? (
          // ── Credenciales para entregar ──────────────────────────────────
          // Se muestran una sola vez y en claro a propósito: el closer tiene que
          // dictárselas al aliado ahora mismo. Quedan guardadas en su perfil.
          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
              <p className="text-[12px] font-semibold text-emerald-800 dark:text-emerald-300">
                {creado.nombre} ya cuenta en tu producción.
              </p>
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-1">
                Entrégale estos datos para que entre. Podrá cambiar la contraseña desde su perfil.
              </p>
            </div>

            {[
              { etiqueta: "Correo", valor: creado.email, cual: "email" as const },
              { etiqueta: "Contraseña provisional", valor: creado.password, cual: "pass" as const },
            ].map((d) => (
              <div key={d.cual} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {d.etiqueta}
                  </span>
                  <span className="block text-xs font-mono font-bold text-slate-800 dark:text-white truncate">
                    {d.valor}
                  </span>
                </div>
                <button
                  onClick={() => copiar(d.valor, d.cual)}
                  className="shrink-0 px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {copiado === d.cual ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setCreado(null);
                  setFullName("");
                  setEmail("");
                  setPhone("");
                  setPassword(generarPassword());
                  setContrato("");
                  setEnviado(false);
                  setGuardando(false);
                }}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-all active:scale-95"
              >
                Dar de alta a otro
              </button>
              <button
                onClick={onCerrar}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white font-bold rounded-xl text-xs transition-all active:scale-95"
              >
                Listo
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={guardar} className="p-5 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Nombre completo
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nombre y apellidos"
                className={`${campo} ${borde(enviado && !nombreOk)}`}
              />
              {enviado && !nombreOk && (
                <p className="text-[10px] text-red-500 mt-1">Escribe el nombre completo (mínimo 3 letras).</p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="aliado@correo.com"
                className={`${campo} ${borde(enviado && (!emailOk || emailRepetido))}`}
              />
              {enviado && !emailOk && <p className="text-[10px] text-red-500 mt-1">Ese correo no es válido.</p>}
              {emailRepetido && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                  Ya existe una cuenta con ese correo.
                </p>
              )}
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
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10 dígitos"
                  className={`${campo} ${borde(enviado && !telOk)} flex-1`}
                />
              </div>
              {enviado && !telOk && <p className="text-[10px] text-red-500 mt-1">Deben ser 10 dígitos.</p>}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Contraseña provisional
              </label>
              <div className="flex gap-2">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${campo} ${borde(enviado && !passOk)} flex-1 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setPassword(generarPassword())}
                  title="Generar otra"
                  className="shrink-0 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                Se la dictas al aliado; él la cambia desde su perfil.
              </p>
            </div>

            {/* ── Contrato firmado ──────────────────────────────────────────
                No es un campo más: es la condición para que después se pague la
                comisión. Por eso va destacado y con el motivo escrito, no como
                un asterisco de "obligatorio" que nadie interpreta. */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <FileText className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="min-w-0">
                  <label className="block text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    Contrato firmado con el aliado
                  </label>
                  <p className="text-[10px] text-amber-700/90 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                    Al momento del pago de comisiones se revisa que la documentación esté completa.
                    Puedes incorporarlo ahora y añadir el contrato después, pero sin él el pago se detiene.
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
                  Eso no parece un enlace. Debe empezar por http:// o https://, o nadie podrá abrirlo al
                  revisar el pago.
                </p>
              ) : avisoContrato === "falta" ? (
                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  Lo vas a dar de alta sin contrato. Quedará marcado como pendiente en tu lista de aliados.
                </p>
              ) : (
                <p className="text-[10px] text-amber-700/80 dark:text-amber-400/70">
                  Comprueba que el enlace se pueda abrir desde fuera de tu cuenta: un archivo restringido
                  vale lo mismo que ninguno.
                </p>
              )}
            </div>

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
                disabled={!puedeGuardar}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                {/* El botón dice en voz alta lo que va a pasar: así el aviso no
                    depende de que el closer haya leído el bloque de arriba. */}
                {guardando ? "Creando…" : contratoLimpio ? "Incorporar aliado" : "Incorporar sin contrato"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
