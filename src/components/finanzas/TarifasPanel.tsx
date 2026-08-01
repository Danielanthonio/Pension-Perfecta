"use client";

// Pestaña "Tarifas" (§16): los importes son datos, no código.
//
// Cambiar una tarifa NUNCA edita la fila anterior: le cierra la vigencia el día
// antes y abre una nueva. Es lo que hace que una comisión devengada en julio
// conserve para siempre el importe de julio, aunque en agosto se suba.
//
// Aquí se da de alta también el esquema del ALIADO, que el brief dejó pendiente
// de definir (§5.4): la arquitectura ya lo soporta entero, solo faltan sus
// importes. En cuanto se capturen, el motor de devengo empieza a aplicarlos sin
// tocar código ni base de datos.

import React, { useEffect, useMemo, useState } from "react";
import { CalendarX2, History, Loader2, Plus, RotateCcw, Settings2, Tag } from "lucide-react";
import {
  Aviso,
  Campo,
  Modal,
  Panel,
  Vacio,
  btnPrimario,
  btnSecundario,
  inputBase,
  pastilla,
  segmentado,
} from "./FinanzasUI";
import {
  type ConceptoTarifa,
  type ProductoComision,
  type RolBeneficiario,
  type TarifaRow,
  CONCEPTOS_CON_UMBRAL,
  CONCEPTOS_SIN_PRODUCTO,
  CONCEPTO_LABEL,
  PRODUCTO_LABEL,
  ROL_LABEL,
  fmtFecha,
  fmtMoneda,
  fmtNumero,
} from "./finanzasTypes";

const ROLES: RolBeneficiario[] = ["director", "account_manager", "closer", "aliado"];
const PRODUCTOS: ProductoComision[] = ["mod_40", "mod_10", "credito_nomina"];

/** Qué conceptos tienen sentido para cada rol, según el §5. */
const CONCEPTOS_POR_ROL: Record<RolBeneficiario, ConceptoTarifa[]> = {
  director: ["comision_financiamiento", "comision_cierre_aliado", "bono_mensual"],
  account_manager: ["comision_financiamiento", "salario_fijo", "bono_mensual", "bono_trimestral"],
  closer: ["comision_cierre_aliado", "comision_primer_financiamiento"],
  // El aliado admite el catálogo completo a propósito: su esquema todavía no
  // está definido y no se le quiere cerrar la puerta a bonos o a un fijo.
  aliado: ["comision_aliado", "bono_mensual", "bono_trimestral", "salario_fijo"],
};

const hoyIso = () => new Date().toISOString().substring(0, 10);

export function TarifasPanel({
  tarifas,
  config,
  directores,
  isLocal,
  guardarTarifa,
  cerrarTarifa,
  guardarConfig,
  restaurarTarifas,
  onAviso,
}: {
  tarifas: TarifaRow[];
  config: { director_beneficiario_id: string | null; arranque: string };
  directores: { id: string; nombre: string }[];
  isLocal: boolean;
  guardarTarifa: (t: {
    rol: RolBeneficiario;
    concepto: ConceptoTarifa;
    producto: ProductoComision | null;
    umbral: number;
    monto: number;
    vigenteDesde: string;
    vigenteHasta: string | null;
    notas?: string;
  }) => Promise<void>;
  cerrarTarifa: (id: string, vigenteHasta: string) => Promise<void>;
  guardarConfig: (directorId: string | null, arranque: string) => Promise<void>;
  restaurarTarifas: () => Promise<void>;
  onAviso: (mensaje: string, tono: "ok" | "error") => void;
}) {
  const [rolActivo, setRolActivo] = useState<RolBeneficiario>("director");
  const [verHistoricas, setVerHistoricas] = useState(false);
  const [editando, setEditando] = useState<{ base?: TarifaRow; rol: RolBeneficiario } | null>(null);
  const [cerrando, setCerrando] = useState<TarifaRow | null>(null);

  const hoy = hoyIso();

  const vigente = (t: TarifaRow) =>
    t.activo && t.vigente_desde <= hoy && (!t.vigente_hasta || t.vigente_hasta >= hoy);

  const delRol = useMemo(
    () =>
      tarifas
        .filter((t) => t.rol_beneficiario === rolActivo)
        .filter((t) => verHistoricas || vigente(t))
        .sort(
          (a, b) =>
            a.concepto.localeCompare(b.concepto) ||
            (a.producto || "").localeCompare(b.producto || "") ||
            a.umbral_min - b.umbral_min ||
            b.vigente_desde.localeCompare(a.vigente_desde)
        ),
    // `vigente` depende de `hoy`, que es estable durante el render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tarifas, rolActivo, verHistoricas, hoy]
  );

  const grupos = useMemo(() => {
    const mapa = new Map<ConceptoTarifa, TarifaRow[]>();
    for (const t of delRol) mapa.set(t.concepto, [...(mapa.get(t.concepto) || []), t]);
    return [...mapa.entries()];
  }, [delRol]);

  const sinTarifas = tarifas.filter((t) => t.rol_beneficiario === rolActivo).length === 0;

  return (
    <div className="space-y-5">
      <ConfiguracionModulo
        config={config}
        directores={directores}
        guardarConfig={guardarConfig}
        onAviso={onAviso}
      />

      <Panel
        titulo="Tarifas por vigencia"
        descripcion="Cambiar un importe cierra la vigencia anterior y abre una nueva. Las comisiones ya devengadas conservan el monto que estaba vigente en su fecha."
        icono={Tag}
        acciones={
          <>
            <div className={segmentado}>
              {ROLES.map((r) => (
                <button key={r} onClick={() => setRolActivo(r)} className={pastilla(rolActivo === r)}>
                  {r === "account_manager" ? "Account Manager" : ROL_LABEL[r]}
                </button>
              ))}
            </div>
            <button onClick={() => setVerHistoricas((v) => !v)} className={pastilla(verHistoricas)}>
              <History className="h-3.5 w-3.5 inline mr-1" />
              {verHistoricas ? "Solo vigentes" : "Ver histórico"}
            </button>
            <button onClick={() => setEditando({ rol: rolActivo })} className={btnPrimario}>
              <Plus className="h-3.5 w-3.5" /> Nueva tarifa
            </button>
          </>
        }
      >
        {rolActivo === "aliado" && sinTarifas && (
          <div className="px-5 pt-4">
            <Aviso>
              El esquema económico del <strong>Aliado</strong> todavía no está definido: el documento fija las reglas de
              Dirección, Closer y Account Manager, pero no el monto del aliado, ni qué productos le generan comisión, ni
              cuándo se devenga. Por eso no hay tarifas sembradas. El módulo ya está preparado: en cuanto se den de alta
              aquí, las comisiones del aliado empiezan a devengarse solas, sin cambiar nada más.
            </Aviso>
          </div>
        )}

        {grupos.length === 0 && !(rolActivo === "aliado" && sinTarifas) ? (
          <Vacio
            mensaje="No hay tarifas vigentes para este rol."
            hint={verHistoricas ? undefined : "Activa «Ver histórico» para revisar vigencias cerradas."}
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {grupos.map(([concepto, filas]) => (
              <div key={concepto} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-3 mb-2.5">
                  <h3 className="text-[12px] font-bold text-slate-700 dark:text-slate-200">
                    {CONCEPTO_LABEL[concepto]}
                  </h3>
                  {CONCEPTOS_CON_UMBRAL.includes(concepto) && (
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                      Se paga solo el tramo más alto alcanzado
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left">
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                      {filas.map((t) => {
                        const activa = vigente(t);
                        return (
                          <tr key={t.id} className={activa ? "" : "opacity-50"}>
                            <td className="py-2 pr-4">
                              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                {t.producto ? PRODUCTO_LABEL[t.producto] : "—"}
                              </p>
                              {t.notas && (
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[260px]">
                                  {t.notas}
                                </p>
                              )}
                            </td>
                            <td className="py-2 px-4 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {t.umbral_min > 0 ? `Desde ${fmtNumero(t.umbral_min)} financiamientos` : "—"}
                            </td>
                            <td className="py-2 px-4 text-right text-[13px] font-bold tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                              {fmtMoneda(t.monto)}
                            </td>
                            <td className="py-2 px-4 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                              {fmtFecha(t.vigente_desde)} → {t.vigente_hasta ? fmtFecha(t.vigente_hasta) : "sin término"}
                            </td>
                            <td className="py-2 pl-4 text-right whitespace-nowrap">
                              {activa && (
                                <>
                                  <button
                                    onClick={() => setEditando({ base: t, rol: rolActivo })}
                                    className={pastilla(false)}
                                    title="Cambiar el importe (abre una vigencia nueva)"
                                  >
                                    Cambiar importe
                                  </button>
                                  <button
                                    onClick={() => setCerrando(t)}
                                    className={pastilla(false)}
                                    title="Cerrar la vigencia"
                                  >
                                    <CalendarX2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {isLocal && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Previsualización local: las tarifas que cambies aquí se guardan solo en este navegador.
            </p>
            <button
              onClick={async () => {
                await restaurarTarifas();
                onAviso("Tarifas restauradas a los importes del documento.", "ok");
              }}
              className={btnSecundario}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar las del documento
            </button>
          </div>
        )}
      </Panel>

      {editando && (
        <DialogoTarifa
          base={editando.base}
          rolInicial={editando.rol}
          onCerrar={() => setEditando(null)}
          onGuardar={async (t) => {
            await guardarTarifa(t);
            setEditando(null);
            onAviso(
              "Tarifa guardada. La vigencia anterior quedó cerrada; las comisiones ya devengadas conservan su importe.",
              "ok"
            );
          }}
        />
      )}

      {cerrando && (
        <DialogoCerrarVigencia
          tarifa={cerrando}
          onCerrar={() => setCerrando(null)}
          onConfirmar={async (hasta) => {
            await cerrarTarifa(cerrando.id, hasta);
            setCerrando(null);
            onAviso("Vigencia cerrada. A partir del día siguiente esta tarifa deja de aplicarse.", "ok");
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configuración del módulo
// ---------------------------------------------------------------------------
// Dos ajustes que no son tarifas pero deciden cuánto y desde cuándo se devenga.

function ConfiguracionModulo({
  config,
  directores,
  guardarConfig,
  onAviso,
}: {
  config: { director_beneficiario_id: string | null; arranque: string };
  directores: { id: string; nombre: string }[];
  guardarConfig: (directorId: string | null, arranque: string) => Promise<void>;
  onAviso: (mensaje: string, tono: "ok" | "error") => void;
}) {
  const [directorId, setDirectorId] = useState(config.director_beneficiario_id || "");
  const [arranque, setArranque] = useState(config.arranque);
  const [guardando, setGuardando] = useState(false);

  // Se resincroniza cuando el valor llega de la base tras la carga inicial.
  useEffect(() => {
    setDirectorId(config.director_beneficiario_id || "");
    setArranque(config.arranque);
  }, [config.director_beneficiario_id, config.arranque]);

  const sucio = (config.director_beneficiario_id || "") !== directorId || config.arranque !== arranque;

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarConfig(directorId || null, arranque);
      onAviso("Configuración guardada. Se aplica en el próximo recálculo del devengo.", "ok");
    } catch (e: any) {
      onAviso(e?.message || "No se pudo guardar la configuración.", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Panel
      titulo="Configuración del módulo"
      descripcion="Quién cobra las comisiones de Dirección y desde qué fecha empieza a devengarse."
      icono={Settings2}
      acciones={
        <button onClick={guardar} disabled={!sucio || guardando} className={btnPrimario}>
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
        </button>
      }
    >
      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Campo
          etiqueta="Beneficiario de las comisiones de Dirección"
          hint="Si hay varias cuentas con rol de dirección hay que señalar una: si no, cada venta multiplicaría la comisión por el número de cuentas. Vacío = la más antigua."
        >
          <select value={directorId} onChange={(e) => setDirectorId(e.target.value)} className={inputBase}>
            <option value="">La cuenta de dirección más antigua</option>
            {directores.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          etiqueta="Fecha de arranque del devengo"
          hint="Nada anterior a esta fecha genera comisiones. Evita que la primera sincronización fabrique comisiones y salarios de todo el histórico del CRM."
        >
          <input type="date" value={arranque} onChange={(e) => setArranque(e.target.value)} className={inputBase} />
        </Campo>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Alta / cambio de tarifa
// ---------------------------------------------------------------------------

function DialogoTarifa({
  base,
  rolInicial,
  onCerrar,
  onGuardar,
}: {
  base?: TarifaRow;
  rolInicial: RolBeneficiario;
  onCerrar: () => void;
  onGuardar: (t: {
    rol: RolBeneficiario;
    concepto: ConceptoTarifa;
    producto: ProductoComision | null;
    umbral: number;
    monto: number;
    vigenteDesde: string;
    vigenteHasta: string | null;
    notas?: string;
  }) => Promise<void>;
}) {
  const [rol, setRol] = useState<RolBeneficiario>(base?.rol_beneficiario || rolInicial);
  const [concepto, setConcepto] = useState<ConceptoTarifa>(
    base?.concepto || CONCEPTOS_POR_ROL[rolInicial][0] || "comision_financiamiento"
  );
  const [producto, setProducto] = useState<ProductoComision | "">(base?.producto || "");
  const [umbral, setUmbral] = useState(String(base?.umbral_min ?? 0));
  const [monto, setMonto] = useState(base ? String(base.monto) : "");
  const [desde, setDesde] = useState(hoyIso());
  const [hasta, setHasta] = useState(base?.vigente_hasta || "");
  const [notas, setNotas] = useState(base?.notas || "");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const conceptos = CONCEPTOS_POR_ROL[rol] || [];
  const necesitaProducto = !CONCEPTOS_SIN_PRODUCTO.includes(concepto);
  const necesitaUmbral = CONCEPTOS_CON_UMBRAL.includes(concepto);

  const valor = Number(monto.replace(/,/g, ""));
  const puede =
    isFinite(valor) && valor >= 0 && !!desde && (!necesitaProducto || !!producto) && (!hasta || hasta >= desde);

  const cambiarRol = (r: RolBeneficiario) => {
    setRol(r);
    const permitidos = CONCEPTOS_POR_ROL[r] || [];
    if (!permitidos.includes(concepto)) setConcepto(permitidos[0]);
  };

  const guardar = async () => {
    if (!puede) return;
    setGuardando(true);
    setErrorMsg("");
    try {
      await onGuardar({
        rol,
        concepto,
        producto: necesitaProducto ? (producto as ProductoComision) : null,
        umbral: necesitaUmbral ? Number(umbral) || 0 : 0,
        monto: valor,
        vigenteDesde: desde,
        vigenteHasta: hasta || null,
        notas: notas.trim() || undefined,
      });
    } catch (e: any) {
      setErrorMsg(e?.message || "No se pudo guardar la tarifa.");
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo={base ? "Cambiar importe" : "Nueva tarifa"}
      subtitulo={base ? `${ROL_LABEL[base.rol_beneficiario]} · ${CONCEPTO_LABEL[base.concepto]}` : undefined}
      icono={Tag}
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar} className={btnSecundario}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={!puede || guardando} className={btnPrimario}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar tarifa
          </button>
        </>
      }
    >
      <Aviso tono="slate">
        La tarifa anterior no se edita: se le cierra la vigencia el día antes de esta y se conserva. Las comisiones ya
        devengadas siguen apuntando a la suya, así que sus importes históricos no cambian.
      </Aviso>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Rol beneficiario" requerido>
          <select
            value={rol}
            onChange={(e) => cambiarRol(e.target.value as RolBeneficiario)}
            disabled={!!base}
            className={`${inputBase} disabled:opacity-60`}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROL_LABEL[r]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Concepto" requerido>
          <select
            value={concepto}
            onChange={(e) => setConcepto(e.target.value as ConceptoTarifa)}
            disabled={!!base}
            className={`${inputBase} disabled:opacity-60`}
          >
            {conceptos.map((c) => (
              <option key={c} value={c}>
                {CONCEPTO_LABEL[c]}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {necesitaProducto ? (
          <Campo etiqueta="Producto" requerido>
            <select
              value={producto}
              onChange={(e) => setProducto(e.target.value as ProductoComision)}
              disabled={!!base}
              className={`${inputBase} disabled:opacity-60`}
            >
              <option value="">Selecciona…</option>
              {PRODUCTOS.map((p) => (
                <option key={p} value={p}>
                  {PRODUCTO_LABEL[p]}
                </option>
              ))}
            </select>
          </Campo>
        ) : (
          <Campo etiqueta="Producto" hint="Este concepto no depende del producto.">
            <input value="No aplica" disabled className={`${inputBase} opacity-60`} />
          </Campo>
        )}

        <Campo
          etiqueta="Tramo mínimo"
          hint={necesitaUmbral ? "Financiamientos a partir de los cuales se paga este tramo." : "Solo aplica a los bonos."}
        >
          <input
            value={necesitaUmbral ? umbral : "0"}
            onChange={(e) => setUmbral(e.target.value)}
            disabled={!necesitaUmbral || !!base}
            inputMode="numeric"
            className={`${inputBase} text-right tabular-nums disabled:opacity-60`}
          />
        </Campo>
      </div>

      <Campo etiqueta="Importe (MXN)" requerido>
        <input
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          autoFocus
          className={`${inputBase} text-right tabular-nums`}
        />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Vigente desde" requerido>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputBase} />
        </Campo>
        <Campo etiqueta="Vigente hasta" hint="Vacío = sin fecha de término.">
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputBase} />
        </Campo>
      </div>

      <Campo etiqueta="Nota" hint="Opcional. Ayuda a recordar por qué se fijó así.">
        <input value={notas} onChange={(e) => setNotas(e.target.value)} className={inputBase} />
      </Campo>

      {errorMsg && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errorMsg}</p>}
    </Modal>
  );
}

function DialogoCerrarVigencia({
  tarifa,
  onCerrar,
  onConfirmar,
}: {
  tarifa: TarifaRow;
  onCerrar: () => void;
  onConfirmar: (hasta: string) => Promise<void>;
}) {
  const [hasta, setHasta] = useState(hoyIso());
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const confirmar = async () => {
    setGuardando(true);
    setErrorMsg("");
    try {
      await onConfirmar(hasta);
    } catch (e: any) {
      setErrorMsg(e?.message || "No se pudo cerrar la vigencia.");
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Cerrar vigencia"
      subtitulo={`${ROL_LABEL[tarifa.rol_beneficiario]} · ${CONCEPTO_LABEL[tarifa.concepto]} · ${fmtMoneda(tarifa.monto)}`}
      icono={CalendarX2}
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar} className={btnSecundario}>
            Cancelar
          </button>
          <button onClick={confirmar} disabled={guardando || hasta < tarifa.vigente_desde} className={btnPrimario}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Cerrar vigencia
          </button>
        </>
      }
    >
      <Aviso tono="slate">
        A partir del día siguiente esta tarifa deja de aplicarse. Las comisiones ya devengadas conservan su importe; las
        nuevas quedarán observadas hasta que exista otra tarifa vigente para ese concepto.
      </Aviso>
      <Campo etiqueta="Último día de vigencia" requerido>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputBase} />
      </Campo>
      {hasta < tarifa.vigente_desde && (
        <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          Tiene que ser posterior al inicio de la vigencia ({fmtFecha(tarifa.vigente_desde)}).
        </p>
      )}
      {errorMsg && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errorMsg}</p>}
    </Modal>
  );
}
