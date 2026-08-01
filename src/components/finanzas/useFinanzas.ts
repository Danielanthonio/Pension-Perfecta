"use client";

// Capa de datos del módulo de Finanzas y Comisiones.
//
// Mismo patrón que `useClosers` y `useClassroom`: no pasa por AppContext (que ya
// carga ~5k líneas y todo el estado del pipeline), habla directo con Supabase y
// cae a un motor local en modo demo para poder previsualizar sin tocar
// producción.
//
// En producción TODA la agregación ocurre en Postgres, vía las RPC de
// 20260802000001 y 20260802000002. El navegador nunca descarga el libro mayor
// para sumarlo: cada bloque de la pantalla se resuelve con una llamada.
//
// Los errores crudos de Supabase NUNCA llegan al usuario: se registran en
// consola y se traduce un mensaje entendible.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/utils/context/AppContext";
import { createClient } from "@/utils/supabase/client";
import type {
  AuditoriaRow,
  ConceptoTarifa,
  CorteRow,
  EstadoComision,
  EventoRow,
  FinanzasResumen,
  Grano,
  InconsistenciaRow,
  LiquidacionRow,
  MetodoPago,
  PagoRow,
  ProduccionRow,
  ProductoComision,
  RolBeneficiario,
  SeriePoint,
  TarifaRow,
  TipoCorte,
  TipoEvento,
} from "./finanzasTypes";
import { RESUMEN_VACIO, periodoCorte } from "./finanzasTypes";
import {
  CONFIG_POR_DEFECTO,
  TARIFAS_SEMILLA,
  type FinanzasConfig,
  construirEventos,
  demoStore,
  filtrarEventos,
  inconsistenciasLocal,
  liquidacionesLocal,
  produccionLocal,
  resumenLocal,
  serieLocal,
  tarifasVigentes,
} from "./finanzasMetrics";

const n = (v: unknown): number => {
  const x = Number(v);
  return isFinite(x) ? x : 0;
};

/** PostgREST serializa `numeric` y `bigint` como texto: se normaliza aquí. */
function normalizaResumen(row: any): FinanzasResumen {
  if (!row) return { ...RESUMEN_VACIO };
  return {
    produccion_financiamientos: n(row.produccion_financiamientos),
    produccion_aliados: n(row.produccion_aliados),
    produccion_primeros: n(row.produccion_primeros),
    total_generado: n(row.total_generado),
    total_pendiente_revision: n(row.total_pendiente_revision),
    total_aprobado: n(row.total_aprobado),
    total_enviado_finanzas: n(row.total_enviado_finanzas),
    total_pagado: n(row.total_pagado),
    total_pendiente_pago: n(row.total_pendiente_pago),
    total_observado: n(row.total_observado),
    total_ajustes: n(row.total_ajustes),
    eventos_total: n(row.eventos_total),
    eventos_observados: n(row.eventos_observados),
    beneficiarios: n(row.beneficiarios),
  };
}

function normalizaLiquidacion(row: any): LiquidacionRow {
  return {
    usuario_id: row.usuario_id,
    usuario_nombre: row.usuario_nombre || "Sin nombre",
    rol_beneficiario: row.rol_beneficiario,
    avatar_url: row.avatar_url ?? null,
    produccion: n(row.produccion),
    comision_base: n(row.comision_base),
    bonos: n(row.bonos),
    salario: n(row.salario),
    ajustes: n(row.ajustes),
    total_a_pagar: n(row.total_a_pagar),
    total_pagado: n(row.total_pagado),
    total_pendiente: n(row.total_pendiente),
    eventos: n(row.eventos),
    eventos_observados: n(row.eventos_observados),
    estado_resumen: row.estado_resumen,
    fecha_envio: row.fecha_envio ?? null,
    fecha_pago: row.fecha_pago ?? null,
    clabe: row.clabe ?? null,
    banco: row.banco ?? null,
    titular_cuenta: row.titular_cuenta ?? null,
    binance_id: row.binance_id ?? null,
  };
}

function normalizaEvento(row: any): EventoRow {
  return {
    ...row,
    monto: n(row.monto),
    produccion: row.produccion === null || row.produccion === undefined ? null : n(row.produccion),
  } as EventoRow;
}

function normalizaCorte(row: any): CorteRow {
  return {
    ...row,
    total_produccion: n(row.total_produccion),
    total_comisiones: n(row.total_comisiones),
    total_bonos: n(row.total_bonos),
    total_salarios: n(row.total_salarios),
    total_ajustes: n(row.total_ajustes),
    total_a_pagar: n(row.total_a_pagar),
    total_pagado: n(row.total_pagado),
    beneficiarios: n(row.beneficiarios),
    eventos: n(row.eventos),
  } as CorteRow;
}

const MENSAJE_GENERICO =
  "No se pudo completar la operación. Vuelve a intentarlo en unos segundos.";

/** Los RAISE EXCEPTION de las RPC llevan mensajes escritos para el usuario. */
function mensajeDeError(e: any): string {
  const raw = String(e?.message || "");
  // PostgREST antepone el contexto; el texto útil es el del RAISE.
  const limpio = raw.replace(/^.*?:\s*/, "").trim();
  if (limpio && limpio.length < 300 && !/^(permission|relation|column|function|syntax)/i.test(limpio)) {
    return limpio;
  }
  return MENSAJE_GENERICO;
}

export interface UseFinanzasArgs {
  desde: string;
  hasta: string;
  grano: Grano;
  rol: RolBeneficiario | null;
  estado: EstadoComision | null;
  dimension: "producto" | "account_manager" | "closer" | "aliado";
}

export function useFinanzas({ desde, hasta, grano, rol, estado, dimension }: UseFinanzasArgs) {
  const { user, profiles, prospects, isDemoMode, isProvisionalSession } = useApp();

  const supabase = useMemo(() => {
    if (isDemoMode || isProvisionalSession) return null;
    return createClient();
  }, [isDemoMode, isProvisionalSession]);

  const isLocal = isDemoMode || isProvisionalSession || !supabase;
  const esDireccion = user?.role === "director";

  const [resumen, setResumen] = useState<FinanzasResumen>({ ...RESUMEN_VACIO });
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionRow[]>([]);
  const [serie, setSerie] = useState<SeriePoint[]>([]);
  const [produccion, setProduccion] = useState<ProduccionRow[]>([]);
  const [inconsistencias, setInconsistencias] = useState<InconsistenciaRow[]>([]);
  const [cortes, setCortes] = useState<CorteRow[]>([]);
  const [tarifas, setTarifas] = useState<TarifaRow[]>([]);
  const [config, setConfig] = useState<FinanzasConfig>({ ...CONFIG_POR_DEFECTO });
  /**
   * Si esta cuenta está en `comision_config.acceso_ids` (20260802000003). El rol
   * ya no basta: `admin` lo tienen varias cuentas del equipo y el libro mayor
   * expone sueldos y datos bancarios de todos. `null` = todavía sin comprobar.
   */
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const argsBase = useMemo(
    () => ({ p_desde: desde || null, p_hasta: hasta || null }),
    [desde, hasta]
  );

  const load = useCallback(async () => {
    if (!esDireccion) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    if (isLocal) {
      const eventos = construirEventos(profiles, prospects);
      const enRango = filtrarEventos(eventos, { desde, hasta, rol, estado });
      setResumen(resumenLocal(enRango));
      setLiquidaciones(liquidacionesLocal(enRango, profiles));
      setSerie(serieLocal(enRango, grano));
      setProduccion(produccionLocal(prospects, profiles, dimension, desde, hasta));
      setInconsistencias(inconsistenciasLocal(prospects, profiles, filtrarEventos(eventos, { desde, hasta }), desde, hasta));
      setCortes(demoStore.cortes());
      setTarifas(tarifasVigentes());
      setConfig(demoStore.config());
      // En la previsualización no hay lista de acceso: entra quien abra el módulo.
      setAutorizado(true);
      setLoading(false);
      return;
    }

    // El rol ya no basta (20260802000003). Se pregunta primero para poder decirle
    // a una cuenta no autorizada que no tiene acceso, en vez de enseñarle un
    // módulo vacío y un error al sincronizar.
    try {
      const { data: puede, error: errPermiso } = await supabase!.rpc("fin_puedo_ver");
      if (errPermiso) throw errPermiso;
      if (puede !== true) {
        setAutorizado(false);
        setLoading(false);
        return;
      }
      setAutorizado(true);
    } catch (e: any) {
      console.error("Error comprobando el acceso a Finanzas:", e);
      setError("No se pudo comprobar tu acceso al módulo. Vuelve a intentarlo en unos segundos.");
      setLoading(false);
      return;
    }

    try {
      const [res, liq, ser, prod, inc, cor, tar, cfg] = await Promise.all([
        supabase!.rpc("comisiones_resumen", { ...argsBase, p_rol: rol, p_usuario_id: null }),
        supabase!.rpc("comisiones_liquidaciones", { ...argsBase, p_rol: rol, p_estado: estado, p_corte_id: null }),
        supabase!.rpc("comisiones_serie", { ...argsBase, p_grano: grano, p_rol: rol }),
        supabase!.rpc("comisiones_produccion", { ...argsBase, p_dimension: dimension }),
        supabase!.rpc("comisiones_inconsistencias", argsBase),
        supabase!.rpc("cortes_listar", { p_limite: 60 }),
        supabase!.from("comision_tarifas").select("*").order("rol_beneficiario").order("concepto").order("umbral_min"),
        supabase!.from("comision_config").select("director_beneficiario_id, arranque").maybeSingle(),
      ]);

      for (const r of [res, liq, ser, prod, inc, cor, tar, cfg]) {
        if (r.error) throw r.error;
      }

      setResumen(normalizaResumen((res.data || [])[0]));
      setLiquidaciones((liq.data || []).map(normalizaLiquidacion));
      setSerie(
        (ser.data || []).map((r: any) => ({
          periodo: String(r.periodo).substring(0, 10),
          rol: r.rol,
          generado: n(r.generado),
          pagado: n(r.pagado),
          pendiente: n(r.pendiente),
        }))
      );
      setProduccion(
        (prod.data || []).map((r: any) => ({
          clave: r.clave,
          etiqueta: r.etiqueta,
          financiamientos: n(r.financiamientos),
          mod_40: n(r.mod_40),
          mod_10: n(r.mod_10),
          credito_nomina: n(r.credito_nomina),
        }))
      );
      setInconsistencias((inc.data || []) as InconsistenciaRow[]);
      setCortes((cor.data || []).map(normalizaCorte));
      setTarifas(
        ((tar.data || []) as any[]).map((t) => ({ ...t, monto: n(t.monto), umbral_min: n(t.umbral_min) })) as TarifaRow[]
      );
      setConfig({
        director_beneficiario_id: (cfg.data as any)?.director_beneficiario_id ?? null,
        arranque: (cfg.data as any)?.arranque ?? CONFIG_POR_DEFECTO.arranque,
      });
    } catch (e: any) {
      console.error("Error cargando el módulo de Finanzas:", e);
      setError("No se pudieron cargar las comisiones. Vuelve a intentarlo en unos segundos.");
      setResumen({ ...RESUMEN_VACIO });
      setLiquidaciones([]);
      setSerie([]);
      setProduccion([]);
      setInconsistencias([]);
    } finally {
      setLoading(false);
    }
    // `profiles`/`prospects` solo importan en la ruta local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocal, supabase, esDireccion, argsBase, desde, hasta, grano, rol, estado, dimension, profiles, prospects]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Devengo ────────────────────────────────────────────────────────────────
  /**
   * Reconcilia el libro mayor con el CRM. En producción es una RPC; en modo demo
   * el motor local ya recalcula en cada render, así que basta con recargar.
   *
   * Va SIEMPRE a rango completo (`null, null` = desde el arranque configurado
   * hasta hoy), no al período que se está mirando en pantalla. Si se acotara al
   * filtro visible, abrir Finanzas en "semana actual" dejaría sin devengar un
   * financiamiento cerrado hace quince días, y esa comisión no aparecería nunca
   * hasta que alguien tuviera la puntería de mirar justo esa semana.
   */
  const sincronizar = useCallback(async (): Promise<string> => {
    setSincronizando(true);
    try {
      if (isLocal) {
        await load();
        return "Comisiones recalculadas.";
      }
      const { data, error: err } = await supabase!.rpc("comisiones_sincronizar", {
        p_desde: null,
        p_hasta: null,
      });
      if (err) throw err;
      const r = (data || [])[0] || {};
      await load();
      const partes: string[] = [];
      if (n(r.eventos_nuevos) > 0) partes.push(`${n(r.eventos_nuevos)} comisión(es) nueva(s)`);
      if (n(r.eventos_revertidos) > 0) partes.push(`${n(r.eventos_revertidos)} revertida(s)`);
      if (n(r.eventos_anulados) > 0) partes.push(`${n(r.eventos_anulados)} anulada(s)`);
      if (n(r.eventos_observados) > 0) partes.push(`${n(r.eventos_observados)} observada(s) por resolver`);
      return partes.length ? `Devengo actualizado: ${partes.join(", ")}.` : "Todo estaba al día: no había nada que devengar.";
    } catch (e: any) {
      console.error("Error sincronizando comisiones:", e);
      throw new Error(mensajeDeError(e));
    } finally {
      setSincronizando(false);
    }
  }, [isLocal, supabase, load]);

  // ── Revisión ───────────────────────────────────────────────────────────────
  const setEstadoEventos = useCallback(
    async (ids: string[], nuevo: EstadoComision, comentario?: string): Promise<number> => {
      if (ids.length === 0) return 0;
      if (isLocal) {
        const overlay = demoStore.estados();
        const eventos = construirEventos(profiles, prospects);
        const porId = new Map(eventos.map((e) => [e.id, e]));
        const bloqueados = ids.filter((id) => {
          const e = porId.get(id);
          return e && (e.estado === "pagado" || e.anulado_at);
        });
        if (bloqueados.length > 0) {
          throw new Error(
            `La selección incluye ${bloqueados.length} comisión(es) ya pagada(s) o anulada(s), que son inmutables.`
          );
        }
        for (const id of ids) {
          overlay[id] = {
            ...(overlay[id] || {}),
            estado: nuevo,
            motivo_observacion: nuevo === "observado" ? comentario || null : null,
            fecha_aprobacion: nuevo === "aprobado" ? new Date().toISOString() : null,
          };
        }
        demoStore.setEstados(overlay);
        demoStore.auditar({
          entidad: "evento",
          entidad_id: null,
          accion: nuevo === "aprobado" ? "aprobacion" : nuevo === "observado" ? "observacion" : "reapertura",
          estado_anterior: null,
          estado_nuevo: nuevo,
          monto_anterior: null,
          monto_nuevo: null,
          comentario: comentario || `${ids.length} comisión(es)`,
          actor_nombre: user?.full_name || "Dirección",
        });
        await load();
        return ids.length;
      }
      const { data, error: err } = await supabase!.rpc("comisiones_set_estado", {
        p_ids: ids,
        p_estado: nuevo,
        p_comentario: comentario || null,
      });
      if (err) {
        console.error("Error cambiando el estado de las comisiones:", err);
        throw new Error(mensajeDeError(err));
      }
      await load();
      return n(data);
    },
    [isLocal, supabase, profiles, prospects, user, load]
  );

  // ── Ajustes y reversiones ──────────────────────────────────────────────────
  const crearAjuste = useCallback(
    async (usuarioId: string, monto: number, motivo: string, fecha?: string) => {
      if (isLocal) {
        const p = profiles.find((x) => x.id === usuarioId);
        if (!p) throw new Error("Ese beneficiario ya no existe.");
        const cuando = fecha ? `${fecha}T00:00:00.000Z` : new Date().toISOString();
        const ajustes = demoStore.ajustes();
        ajustes.push({
          id: `aj:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          usuario_id: usuarioId,
          usuario_nombre: p.full_name,
          rol_beneficiario: (p.role === "director" ? "director" : p.role) as RolBeneficiario,
          tipo_evento: monto >= 0 ? "ajuste_positivo" : "ajuste_negativo",
          tipo_producto: null,
          monto,
          moneda: "MXN",
          produccion: null,
          fecha_devengo: cuando,
          periodo_corte: periodoCorte(cuando, "semanal"),
          estado: "pendiente_revision",
          motivo_observacion: null,
          observaciones: motivo,
          prospecto_id: null,
          cliente_nombre: null,
          aliado_id: null,
          aliado_nombre: null,
          account_manager: null,
          corte_id: null,
          anulado_at: null,
          fecha_aprobacion: null,
          fecha_envio_finanzas: null,
          fecha_pago: null,
          referencia_pago: null,
        });
        demoStore.setAjustes(ajustes);
        demoStore.auditar({
          entidad: "evento",
          entidad_id: null,
          accion: "ajuste_manual",
          estado_anterior: null,
          estado_nuevo: "pendiente_revision",
          monto_anterior: null,
          monto_nuevo: monto,
          comentario: motivo,
          actor_nombre: user?.full_name || "Dirección",
        });
        await load();
        return;
      }
      const { error: err } = await supabase!.rpc("comision_ajuste", {
        p_usuario_id: usuarioId,
        p_monto: monto,
        p_motivo: motivo,
        p_fecha: fecha || null,
      });
      if (err) {
        console.error("Error creando el ajuste:", err);
        throw new Error(mensajeDeError(err));
      }
      await load();
    },
    [isLocal, supabase, profiles, user, load]
  );

  const revertirEvento = useCallback(
    async (eventoId: string, motivo: string) => {
      if (isLocal) {
        const overlay = demoStore.estados();
        overlay[eventoId] = { ...(overlay[eventoId] || {}), estado: "revertido", observaciones: motivo };
        demoStore.setEstados(overlay);
        demoStore.auditar({
          entidad: "evento",
          entidad_id: eventoId,
          accion: "reversion_manual",
          estado_anterior: null,
          estado_nuevo: "revertido",
          monto_anterior: null,
          monto_nuevo: null,
          comentario: motivo,
          actor_nombre: user?.full_name || "Dirección",
        });
        await load();
        return;
      }
      const { error: err } = await supabase!.rpc("comision_revertir", { p_evento_id: eventoId, p_motivo: motivo });
      if (err) {
        console.error("Error revirtiendo la comisión:", err);
        throw new Error(mensajeDeError(err));
      }
      await load();
    },
    [isLocal, supabase, user, load]
  );

  // ── Cortes ─────────────────────────────────────────────────────────────────
  const generarCorte = useCallback(
    async (tipo: TipoCorte, d: string, h: string, observaciones?: string): Promise<string> => {
      if (isLocal) {
        const eventos = filtrarEventos(construirEventos(profiles, prospects), { desde: d, hasta: h });
        const sueltos = eventos.filter((e) => !e.corte_id && (e.estado === "pendiente_revision" || e.estado === "aprobado"));
        const observados = eventos.filter((e) => !e.corte_id && e.estado === "observado").length;
        if (sueltos.length === 0) {
          throw new Error(
            `No hay comisiones sueltas en ese período. ${observados} observada(s) quedaron fuera por tener inconsistencias sin resolver.`
          );
        }
        const id = `corte-${Date.now()}`;
        const sum = (pred: (e: EventoRow) => boolean) =>
          sueltos.filter(pred).reduce((s, e) => s + e.monto, 0);
        const corte: CorteRow = {
          id,
          tipo_corte: tipo,
          fecha_inicio: d,
          fecha_fin: h,
          moneda: "MXN",
          total_produccion: new Set(sueltos.map((e) => e.prospecto_id).filter(Boolean)).size,
          total_comisiones: sum((e) => e.tipo_evento.startsWith("comision_")),
          total_bonos: sum((e) => e.tipo_evento.startsWith("bono_")),
          total_salarios: sum((e) => e.tipo_evento === "salario_fijo"),
          total_ajustes: sum((e) => e.tipo_evento.startsWith("ajuste_") || e.tipo_evento === "reversion"),
          total_a_pagar: sueltos.reduce((s, e) => s + e.monto, 0),
          total_pagado: 0,
          estado: "borrador",
          creado_por_nombre: user?.full_name || "Dirección",
          aprobado_por_nombre: null,
          enviado_por_nombre: null,
          fecha_aprobacion: null,
          fecha_envio_finanzas: null,
          fecha_pago: null,
          observaciones: observaciones || null,
          beneficiarios: new Set(sueltos.map((e) => e.usuario_id)).size,
          eventos: sueltos.length,
          created_at: new Date().toISOString(),
        };
        demoStore.setCortes([corte, ...demoStore.cortes()]);
        const overlay = demoStore.estados();
        for (const e of sueltos) overlay[e.id] = { ...(overlay[e.id] || {}), corte_id: id };
        demoStore.setEstados(overlay);
        demoStore.auditar({
          entidad: "corte",
          entidad_id: id,
          accion: "generacion",
          estado_anterior: null,
          estado_nuevo: "borrador",
          monto_anterior: null,
          monto_nuevo: corte.total_a_pagar,
          comentario: `Corte ${tipo} del ${d} al ${h} · ${sueltos.length} evento(s) · ${observados} observado(s) excluido(s).`,
          actor_nombre: user?.full_name || "Dirección",
        });
        await load();
        return id;
      }
      const { data, error: err } = await supabase!.rpc("corte_generar", {
        p_tipo: tipo,
        p_desde: d,
        p_hasta: h,
        p_observaciones: observaciones || null,
      });
      if (err) {
        console.error("Error generando el corte:", err);
        throw new Error(mensajeDeError(err));
      }
      await load();
      return (data || [])[0]?.corte_id || "";
    },
    [isLocal, supabase, profiles, prospects, user, load]
  );

  const accionCorte = useCallback(
    async (corteId: string, accion: "aprobar" | "enviar" | "anular", motivo?: string) => {
      if (isLocal) {
        const lista = demoStore.cortes();
        const c = lista.find((x) => x.id === corteId);
        if (!c) throw new Error("Ese corte ya no existe.");
        const overlay = demoStore.estados();
        const eventos = construirEventos(profiles, prospects).filter((e) => e.corte_id === corteId);

        if (accion === "aprobar") {
          if (!["borrador", "en_revision"].includes(c.estado)) throw new Error("Este corte ya fue aprobado o enviado.");
          if (eventos.some((e) => e.estado === "observado")) {
            throw new Error("El corte tiene comisiones observadas. Resuélvelas o sácalas antes de aprobar.");
          }
          c.estado = "aprobado";
          c.fecha_aprobacion = new Date().toISOString();
          c.aprobado_por_nombre = user?.full_name || "Dirección";
          for (const e of eventos) {
            if (e.estado === "pendiente_revision") {
              overlay[e.id] = { ...(overlay[e.id] || {}), estado: "aprobado", fecha_aprobacion: c.fecha_aprobacion };
            }
          }
        } else if (accion === "enviar") {
          if (c.estado !== "aprobado") throw new Error("Solo se envía a Finanzas un corte aprobado.");
          c.estado = "enviado_finanzas";
          c.fecha_envio_finanzas = new Date().toISOString();
          c.enviado_por_nombre = user?.full_name || "Dirección";
          for (const e of eventos) {
            if (e.estado === "aprobado") {
              overlay[e.id] = { ...(overlay[e.id] || {}), estado: "enviado_finanzas", fecha_envio_finanzas: c.fecha_envio_finanzas };
            }
          }
        } else {
          if (["pagado", "pagado_parcial"].includes(c.estado)) {
            throw new Error("Este corte ya tiene depósitos registrados: no se puede anular. Corrige con un ajuste.");
          }
          c.estado = "anulado";
          c.observaciones = motivo || c.observaciones;
          for (const e of eventos) {
            overlay[e.id] = { ...(overlay[e.id] || {}), corte_id: null, estado: "pendiente_revision", fecha_aprobacion: null, fecha_envio_finanzas: null };
          }
        }

        demoStore.setEstados(overlay);
        demoStore.setCortes(lista);
        demoStore.auditar({
          entidad: "corte",
          entidad_id: corteId,
          accion,
          estado_anterior: null,
          estado_nuevo: c.estado,
          monto_anterior: null,
          monto_nuevo: c.total_a_pagar,
          comentario: motivo || null,
          actor_nombre: user?.full_name || "Dirección",
        });
        await load();
        return;
      }

      const rpc =
        accion === "aprobar" ? "corte_aprobar" : accion === "enviar" ? "corte_enviar_finanzas" : "corte_anular";
      const args =
        accion === "aprobar"
          ? { p_corte_id: corteId, p_observaciones: motivo || null }
          : accion === "anular"
            ? { p_corte_id: corteId, p_motivo: motivo || "" }
            : { p_corte_id: corteId };

      const { error: err } = await supabase!.rpc(rpc, args);
      if (err) {
        console.error(`Error al ${accion} el corte:`, err);
        throw new Error(mensajeDeError(err));
      }
      await load();
    },
    [isLocal, supabase, profiles, prospects, user, load]
  );

  const registrarPago = useCallback(
    async (args: {
      corteId: string;
      usuarioId: string;
      monto: number;
      fecha: string;
      metodo: MetodoPago;
      referencia?: string;
      comprobanteUrl?: string;
      observaciones?: string;
    }) => {
      if (isLocal) {
        const lista = demoStore.cortes();
        const c = lista.find((x) => x.id === args.corteId);
        if (!c) throw new Error("Ese corte ya no existe.");
        if (!["aprobado", "enviado_finanzas", "pagado_parcial"].includes(c.estado)) {
          throw new Error("Este corte todavía no está aprobado: no se pueden registrar depósitos.");
        }
        const eventos = construirEventos(profiles, prospects).filter(
          (e) => e.corte_id === args.corteId && e.usuario_id === args.usuarioId && e.estado !== "revertido"
        );
        const totalUsuario = eventos.reduce((s, e) => s + e.monto, 0);
        if (totalUsuario <= 0) throw new Error("Esa persona no tiene saldo a favor en este corte.");

        const pagos = demoStore.pagos();
        const yaPagado = pagos
          .filter((p) => p.corte_id === args.corteId && p.usuario_id === args.usuarioId)
          .reduce((s, p) => s + p.monto_pagado, 0);
        if (yaPagado + args.monto > totalUsuario) {
          throw new Error(
            `El depósito excede el saldo. A esta persona le quedan ${(totalUsuario - yaPagado).toFixed(2)} pendientes en este corte.`
          );
        }

        const p = profiles.find((x) => x.id === args.usuarioId);
        pagos.push({
          id: `pago-${Date.now()}`,
          corte_id: args.corteId,
          usuario_id: args.usuarioId,
          usuario_nombre: p?.full_name || "Beneficiario",
          monto_pagado: args.monto,
          moneda: "MXN",
          fecha_pago: args.fecha,
          metodo_pago: args.metodo,
          referencia_bancaria: args.referencia || null,
          comprobante_url: args.comprobanteUrl || null,
          observaciones: args.observaciones || null,
          registrado_por_nombre: user?.full_name || "Dirección",
          created_at: new Date().toISOString(),
        });
        demoStore.setPagos(pagos);

        if (yaPagado + args.monto >= totalUsuario) {
          const overlay = demoStore.estados();
          for (const e of eventos) {
            overlay[e.id] = {
              ...(overlay[e.id] || {}),
              estado: "pagado",
              fecha_pago: `${args.fecha}T00:00:00.000Z`,
              referencia_pago: args.referencia || null,
            };
          }
          demoStore.setEstados(overlay);
        }

        const pagadoCorte = pagos.filter((x) => x.corte_id === args.corteId).reduce((s, x) => s + x.monto_pagado, 0);
        c.total_pagado = pagadoCorte;
        c.estado = c.total_a_pagar > 0 && pagadoCorte >= c.total_a_pagar ? "pagado" : "pagado_parcial";
        if (c.estado === "pagado") c.fecha_pago = new Date().toISOString();
        demoStore.setCortes(lista);
        demoStore.auditar({
          entidad: "pago",
          entidad_id: args.corteId,
          accion: "registro_pago",
          estado_anterior: null,
          estado_nuevo: c.estado,
          monto_anterior: null,
          monto_nuevo: args.monto,
          comentario: `Depósito a ${p?.full_name || "beneficiario"} vía ${args.metodo}. Referencia: ${args.referencia || "sin folio"}`,
          actor_nombre: user?.full_name || "Dirección",
        });
        await load();
        return;
      }

      const { error: err } = await supabase!.rpc("corte_registrar_pago", {
        p_corte_id: args.corteId,
        p_usuario_id: args.usuarioId,
        p_monto: args.monto,
        p_fecha: args.fecha,
        p_metodo: args.metodo,
        p_referencia: args.referencia || null,
        p_comprobante_url: args.comprobanteUrl || null,
        p_observaciones: args.observaciones || null,
      });
      if (err) {
        console.error("Error registrando el pago:", err);
        throw new Error(mensajeDeError(err));
      }
      await load();
    },
    [isLocal, supabase, profiles, prospects, user, load]
  );

  // ── Tarifas ────────────────────────────────────────────────────────────────
  const guardarTarifa = useCallback(
    async (t: {
      rol: RolBeneficiario;
      concepto: ConceptoTarifa;
      producto: ProductoComision | null;
      umbral: number;
      monto: number;
      vigenteDesde: string;
      vigenteHasta: string | null;
      notas?: string;
    }) => {
      if (isLocal) {
        const lista = [...tarifasVigentes()];
        // Misma regla que la RPC: no se edita la vigencia anterior, se le pone fin.
        const previa = lista.find(
          (x) =>
            x.activo &&
            x.rol_beneficiario === t.rol &&
            x.concepto === t.concepto &&
            (x.producto ?? null) === (t.producto ?? null) &&
            x.umbral_min === t.umbral &&
            (!x.vigente_hasta || x.vigente_hasta >= t.vigenteDesde)
        );
        if (previa) {
          if (previa.vigente_desde >= t.vigenteDesde) previa.activo = false;
          else {
            const d = new Date(`${t.vigenteDesde}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() - 1);
            previa.vigente_hasta = d.toISOString().substring(0, 10);
          }
        }
        lista.push({
          id: `t-${Date.now()}`,
          rol_beneficiario: t.rol,
          concepto: t.concepto,
          producto: t.producto,
          umbral_min: t.umbral,
          monto: t.monto,
          moneda: "MXN",
          vigente_desde: t.vigenteDesde,
          vigente_hasta: t.vigenteHasta,
          activo: true,
          notas: t.notas || null,
          created_at: new Date().toISOString(),
        });
        demoStore.setTarifas(lista);
        demoStore.auditar({
          entidad: "tarifa",
          entidad_id: null,
          accion: "alta_tarifa",
          estado_anterior: null,
          estado_nuevo: "vigente",
          monto_anterior: previa?.monto ?? null,
          monto_nuevo: t.monto,
          comentario: `${t.rol} · ${t.concepto} · desde ${t.vigenteDesde}`,
          actor_nombre: user?.full_name || "Dirección",
        });
        await load();
        return;
      }
      const { error: err } = await supabase!.rpc("comision_tarifa_guardar", {
        p_rol: t.rol,
        p_concepto: t.concepto,
        p_producto: t.producto,
        p_umbral_min: t.umbral,
        p_monto: t.monto,
        p_vigente_desde: t.vigenteDesde,
        p_vigente_hasta: t.vigenteHasta,
        p_notas: t.notas || null,
      });
      if (err) {
        console.error("Error guardando la tarifa:", err);
        throw new Error(mensajeDeError(err));
      }
      await load();
    },
    [isLocal, supabase, user, load]
  );

  const cerrarTarifa = useCallback(
    async (id: string, vigenteHasta: string) => {
      if (isLocal) {
        const lista = [...tarifasVigentes()];
        const t = lista.find((x) => x.id === id);
        if (!t) throw new Error("Esa tarifa ya no existe.");
        if (vigenteHasta < t.vigente_desde) {
          throw new Error("La fecha de término tiene que ser posterior al inicio de la vigencia.");
        }
        t.vigente_hasta = vigenteHasta;
        demoStore.setTarifas(lista);
        await load();
        return;
      }
      const { error: err } = await supabase!.rpc("comision_tarifa_cerrar", { p_id: id, p_vigente_hasta: vigenteHasta });
      if (err) {
        console.error("Error cerrando la vigencia de la tarifa:", err);
        throw new Error(mensajeDeError(err));
      }
      await load();
    },
    [isLocal, supabase, load]
  );

  /**
   * Configuración del módulo. `directorId` decide quién cobra las comisiones de
   * Dirección cuando hay más de una cuenta con ese rol; `arranque` es la fecha
   * antes de la cual no se devenga nada.
   */
  const guardarConfig = useCallback(
    async (directorId: string | null, arranque: string) => {
      if (isLocal) {
        demoStore.setConfig({ director_beneficiario_id: directorId, arranque });
        demoStore.auditar({
          entidad: "config",
          entidad_id: null,
          accion: "configuracion",
          estado_anterior: null,
          estado_nuevo: null,
          monto_anterior: null,
          monto_nuevo: null,
          comentario: "Se actualizó la configuración del módulo de comisiones.",
          actor_nombre: user?.full_name || "Dirección",
        });
        await load();
        return;
      }
      const { error: err } = await supabase!.rpc("comision_config_guardar", {
        p_director_id: directorId,
        p_arranque: arranque,
      });
      if (err) {
        console.error("Error guardando la configuración:", err);
        throw new Error(mensajeDeError(err));
      }
      await load();
    },
    [isLocal, supabase, user, load]
  );

  const restaurarTarifas = useCallback(async () => {
    if (!isLocal) return;
    demoStore.setTarifas(TARIFAS_SEMILLA);
    await load();
  }, [isLocal, load]);

  // ── Consultas puntuales ────────────────────────────────────────────────────
  const fetchEventos = useCallback(
    async (f: {
      desde?: string;
      hasta?: string;
      usuarioId?: string | null;
      rol?: RolBeneficiario | null;
      estado?: EstadoComision | null;
      tipoEvento?: TipoEvento | null;
      corteId?: string | null;
      limite?: number;
    }): Promise<EventoRow[]> => {
      if (isLocal) {
        return filtrarEventos(construirEventos(profiles, prospects), {
          desde: f.desde ?? desde,
          hasta: f.hasta ?? hasta,
          rol: f.rol ?? null,
          estado: f.estado ?? null,
          usuarioId: f.usuarioId ?? null,
          tipoEvento: f.tipoEvento ?? null,
          corteId: f.corteId ?? null,
        }).sort((a, b) => b.fecha_devengo.localeCompare(a.fecha_devengo));
      }
      const { data, error: err } = await supabase!.rpc("comisiones_eventos", {
        p_desde: f.desde ?? desde ?? null,
        p_hasta: f.hasta ?? hasta ?? null,
        p_usuario_id: f.usuarioId ?? null,
        p_rol: f.rol ?? null,
        p_estado: f.estado ?? null,
        p_tipo_evento: f.tipoEvento ?? null,
        p_producto: null,
        p_corte_id: f.corteId ?? null,
        p_limite: f.limite ?? 500,
      });
      if (err) {
        console.error("Error cargando el detalle de comisiones:", err);
        throw new Error("No se pudo cargar el detalle de las comisiones.");
      }
      return (data || []).map(normalizaEvento);
    },
    [isLocal, supabase, profiles, prospects, desde, hasta]
  );

  const fetchPagos = useCallback(
    async (corteId?: string, usuarioId?: string): Promise<PagoRow[]> => {
      if (isLocal) {
        return demoStore
          .pagos()
          .filter((p) => (!corteId || p.corte_id === corteId) && (!usuarioId || p.usuario_id === usuarioId))
          .sort((a, b) => b.fecha_pago.localeCompare(a.fecha_pago));
      }
      const { data, error: err } = await supabase!.rpc("comisiones_pagos", {
        p_corte_id: corteId || null,
        p_usuario_id: usuarioId || null,
        p_limite: 200,
      });
      if (err) {
        console.error("Error cargando los pagos:", err);
        return [];
      }
      return (data || []).map((p: any) => ({ ...p, monto_pagado: n(p.monto_pagado) })) as PagoRow[];
    },
    [isLocal, supabase]
  );

  const fetchAuditoria = useCallback(
    async (entidad?: string, entidadId?: string): Promise<AuditoriaRow[]> => {
      if (isLocal) {
        return demoStore
          .auditoria()
          .filter((a) => (!entidad || a.entidad === entidad) && (!entidadId || a.entidad_id === entidadId));
      }
      const { data, error: err } = await supabase!.rpc("comisiones_auditoria", {
        p_entidad: entidad || null,
        p_entidad_id: entidadId || null,
        p_limite: 300,
      });
      if (err) {
        console.error("Error cargando la bitácora:", err);
        return [];
      }
      return (data || []) as AuditoriaRow[];
    },
    [isLocal, supabase]
  );

  return {
    resumen,
    liquidaciones,
    serie,
    produccion,
    inconsistencias,
    cortes,
    tarifas,
    config,
    autorizado,
    loading,
    sincronizando,
    error,
    isLocal,
    reload: load,
    sincronizar,
    setEstadoEventos,
    crearAjuste,
    revertirEvento,
    generarCorte,
    accionCorte,
    registrarPago,
    guardarTarifa,
    cerrarTarifa,
    guardarConfig,
    restaurarTarifas,
    fetchEventos,
    fetchPagos,
    fetchAuditoria,
  };
}
