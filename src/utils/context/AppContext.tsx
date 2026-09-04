"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { saveFile, getFile } from "@/utils/db";
import { getExpedienteDocSlots, getTipoFinanciamientoLabel } from "@/components/ui/tipoFinanciamiento";
import { diaLocal } from "@/utils/notas";
import { createClient } from "@/utils/supabase/client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// `closer` es la capa que va ANTES del aliado: prospecta y cierra aliados nuevos.
// `finanzas` es el inverso del resto: NO ve pipeline, ni aliados, ni usuarios —
// solo el módulo de Finanzas y Comisiones, completo (ver 20260808000001).
// Ambos se guardan literales en la BD, sin el mapeo director↔admin que sí tienen
// los otros roles. Ver 20260801000000_closers.sql.
export type UserRole = "aliado" | "director" | "account_manager" | "closer" | "finanzas";

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  invitation_code_used?: string;
  created_at: string;
  is_active?: boolean;
  password_provisional?: string | null;
  aliado_tipo?: "aliado" | "lider";
  lider_grupo?: string | null;
  lider_id?: string | null;
  lider_ids?: string[];
  lider_aliado_rels?: { id: string; lider_id: string }[];
  lider_aliado_rel_id?: string | null;
  empresa_multialiado_id?: string | null;
  curp?: string | null;
  ciudad?: string | null;
  pais?: string | null;
  avatar_url?: string | null;
  // Datos de cobro. La forma de pago depende del rol: los aliados cobran por
  // transferencia (banco/cuenta/CLABE) y la Dirección y los Account Managers
  // cobran por Binance. Ver migración 20260731000000_datos_bancarios.sql.
  banco?: string | null;
  cuenta_bancaria?: string | null;
  clabe?: string | null;
  numero_tarjeta?: string | null;
  titular_cuenta?: string | null;
  email_pagos?: string | null;
  binance_id?: string | null;
  datos_bancarios_updated_at?: string | null;
  // Solo para Account Managers: si está en `true`, el AM participa en la "ruleta".
  // Desde 20260904000000 la ruleta es la RED DE SEGURIDAD, no la vía principal:
  // solo reparte los proyectos de los aliados que TODAVÍA no tienen Account
  // Manager. Lo enciende/apaga el director en el módulo de Account Managers.
  auto_assign_enabled?: boolean;
  // CARTERA (solo tiene sentido en perfiles con rol 'aliado'): el Account
  // Manager al que pertenece este aliado. Desde 20260904000000 decide a quién
  // le NACEN los proyectos que capture — y solo eso: los proyectos que ya
  // existen conservan el AM que tienen, que sigue viviendo en
  // `prospects.account_manager_id`. Lo reparte Dirección en /admin/asignacion-am.
  account_manager_id?: string | null;
  // Atribución al CLOSER (solo tiene sentido en perfiles con rol 'aliado').
  // `closer_origen_id` es el mérito histórico —quién cerró a este aliado— y NO
  // cambia al reasignar: es la base de todas las métricas del módulo Closers.
  // `closer_actual_id` es quién lo acompaña hoy, solo gestión operativa.
  // Ver migración 20260801000000_closers.sql.
  closer_origen_id?: string | null;
  closer_actual_id?: string | null;
  // Fecha de cierre del aliado. Deliberadamente distinta de `created_at`: un
  // usuario pudo importarse mucho antes de que se le atribuyera un closer.
  fecha_incorporacion_closer?: string | null;
  closer_asignado_por?: string | null;
  // Enlace al contrato firmado con el aliado. Obligatorio al darlo de alta: al
  // pagar comisiones se revisa que la documentación esté completa, y un aliado
  // sin contrato traba su pago y el del closer que lo trajo.
  // Ver migración 20260801000002_contrato_aliado.sql.
  contrato_url?: string | null;
  contrato_url_at?: string | null;
  // Autoría del alta. NO es lo mismo que `closer_origen_id`: uno dice quién
  // ABRIÓ la cuenta y el otro quién la CERRÓ comercialmente. Un aliado que dio
  // de alta el AM y atribuyó a un closer tiene `created_by` = AM y
  // `closer_origen_id` = closer, y de esa diferencia dependen los permisos de
  // administración del closer (§8/§9 de la especificación del 2026-08-04).
  // La estampa la base en un trigger: no se manda desde el navegador.
  // Ver migración 20260804000000_creador_de_aliado.sql.
  created_by?: string | null;
  created_by_role?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
}

// Acciones administrativas que se auditan sobre un aliado (§14 de la
// especificación del 2026-08-04). Espejo del CHECK de `aliado_auditoria.accion`
// en 20260804000000_creador_de_aliado.sql: si cambia una lista, cambia la otra.
export type AliadoAuditoriaAccion =
  | "alta"
  | "edicion"
  | "credenciales_vistas"
  | "credenciales_cambiadas"
  | "estado"
  | "eliminacion"
  | "atribucion_closer";

export interface AliadoAuditoriaRow {
  id: string;
  aliado_id: string;
  actor_id: string | null;
  actor_rol: string | null;
  accion: AliadoAuditoriaAccion;
  datos_antes: Record<string, unknown> | null;
  datos_despues: Record<string, unknown> | null;
  motivo: string | null;
  created_at: string;
}

// Movimiento del historial append-only closer↔aliado (tabla
// `closer_aliado_asignaciones`). El pasado no se reescribe: solo se agregan filas.
export interface CloserAsignacionInput {
  aliadoId: string;
  closerNuevoId: string | null;
  closerAnteriorId?: string | null;
  closerOrigenId?: string | null;
  tipo: "asignacion_inicial" | "reasignacion" | "backfill" | "desasignacion";
  motivo?: string | null;
  /** Fecha de incorporación a atribuir. Por defecto, ahora. */
  fechaIncorporacion?: string | null;
}

// Convierte la fecha y hora tecleadas al agendar ("2026-08-15" + "15:30") en un
// timestamp con zona. Devuelve null cuando no hay cita concreta (LeadConnector) o
// si el dato viene incompleto, para no grabar una fecha inventada.
export function buildAsesoriaTimestamp(date: string, time: string): string | null {
  if (!date || !time || date === "LeadConnector") return null;
  const d = new Date(`${date}T${time}:00-06:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Elige al azar un Account Manager que participe en la ruleta de asignación
// automática (activo + interruptor encendido). Devuelve null si no hay ninguno,
// en cuyo caso el PROYECTO queda sin AM (mesa del director). Se usa en modo
// demo; en producción lo hace el trigger `assign_am_to_prospect` de la BD.
function pickRandomAutoAssignAM(pool: UserProfile[]): string | null {
  const eligible = pool.filter(
    (p) => p.role === "account_manager" && p.is_active !== false && p.auto_assign_enabled === true
  );
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)].id;
}

// Campos que el usuario puede editar de su propio perfil (email y rol son fijos).
export interface ProfileEditableFields {
  full_name?: string;
  phone?: string;
  curp?: string | null;
  ciudad?: string | null;
  pais?: string | null;
  avatar_url?: string | null;
  // Datos de cobro (ver getBankingCompletion más abajo).
  banco?: string | null;
  cuenta_bancaria?: string | null;
  clabe?: string | null;
  numero_tarjeta?: string | null;
  titular_cuenta?: string | null;
  email_pagos?: string | null;
  binance_id?: string | null;
  datos_bancarios_updated_at?: string | null;
  contrato_url?: string | null;
  contrato_url_at?: string | null;
}

// Estado de completado del perfil. NO limita la operación; solo motiva a completar
// los datos y alimenta los recordatorios in-app. Al 100% el perfil es "verificado".
export interface ProfileCompletion {
  percent: number; // 0..100
  done: number;
  total: number;
  items: { key: string; label: string; done: boolean }[];
  missing: { key: string; label: string }[];
  verified: boolean;
}

const PROFILE_COMPLETION_FIELDS: { key: keyof UserProfile; label: string }[] = [
  { key: "full_name", label: "Nombre completo" },
  { key: "phone", label: "Teléfono" },
  { key: "curp", label: "CURP" },
  { key: "ciudad", label: "Ciudad" },
  { key: "pais", label: "País" },
  { key: "avatar_url", label: "Foto de perfil" },
];

export function getProfileCompletion(profile: UserProfile | null): ProfileCompletion {
  const total = PROFILE_COMPLETION_FIELDS.length;
  const items = PROFILE_COMPLETION_FIELDS.map(({ key, label }) => {
    const value = profile ? profile[key] : undefined;
    const done = typeof value === "string" && value.trim() !== "";
    return { key: String(key), label, done };
  });
  const missing = items.filter((i) => !i.done).map(({ key, label }) => ({ key, label }));
  const done = total - missing.length;
  const percent = Math.round((done / total) * 100);
  return { percent, done, total, items, missing, verified: missing.length === 0 };
}

// ---------------------------------------------------------------------------
// Datos de cobro (datos bancarios)
// ---------------------------------------------------------------------------
// Cada rol cobra distinto, así que "tener los datos completos" significa cosas
// diferentes según quién pregunte:
//   * aliado (y líder)            → transferencia: banco + cuenta + CLABE + titular
//   * director / account_manager  → Binance: su ID de Binance
// Los campos opcionales (tarjeta, correo de avisos) NO cuentan para el completado:
// no queremos molestar con el recordatorio a quien ya dio lo indispensable.
export type BankingMode = "transferencia" | "binance";

export interface BankingCompletion {
  mode: BankingMode;
  items: { key: string; label: string; done: boolean }[];
  missing: { key: string; label: string }[];
  complete: boolean;
}

const BANKING_REQUIRED_TRANSFERENCIA: { key: keyof UserProfile; label: string }[] = [
  { key: "banco", label: "Banco" },
  { key: "cuenta_bancaria", label: "Número de cuenta" },
  { key: "clabe", label: "CLABE interbancaria" },
  { key: "titular_cuenta", label: "Nombre del titular" },
];

const BANKING_REQUIRED_BINANCE: { key: keyof UserProfile; label: string }[] = [
  { key: "binance_id", label: "ID de Binance" },
];

export function getBankingMode(profile: UserProfile | null): BankingMode {
  // Solo los aliados cobran por transferencia; Dirección y AM cobran por Binance.
  return profile && profile.role === "aliado" ? "transferencia" : "binance";
}

export function getBankingCompletion(profile: UserProfile | null): BankingCompletion {
  const mode = getBankingMode(profile);
  const required = mode === "transferencia" ? BANKING_REQUIRED_TRANSFERENCIA : BANKING_REQUIRED_BINANCE;
  const items = required.map(({ key, label }) => {
    const value = profile ? profile[key] : undefined;
    return { key: String(key), label, done: typeof value === "string" && value.trim() !== "" };
  });
  const missing = items.filter((i) => !i.done).map(({ key, label }) => ({ key, label }));
  return { mode, items, missing, complete: missing.length === 0 };
}

export interface EmpresaMultialiado {
  id: string;
  nombre: string;
  lideres_count?: number;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}


export interface DocumentItem {
  id: string;
  prospect_id: string;
  file_name: string;
  file_url: string;
  file_type: "AFORE" | "IMSS" | "OTROS" | "RESOLUCION" | "INE";
  storage_path?: string;
  uploaded_at: string;
  drive_file_id?: string;
  drive_file_url?: string;
  drive_folder_id?: string;
  uploaded_by?: string;
}

// Una nota de seguimiento del proyecto (tabla `prospect_notas`, migración
// 20260825000000). La bitácora es COMPARTIDA: la escriben el aliado, su account
// manager y la dirección, y la leen los tres. A diferencia de `notes_aliado` /
// `notes_director` —que son un texto único que se pisa— aquí cada nota es una
// fila con su fecha, y de esa fila sale el seguimiento del proyecto.
//
// `autor_nombre` y `autor_rol` son SNAPSHOT del momento de escribir: la nota se
// pinta aunque quien la lee no tenga permiso de leer ese perfil, y sobrevive a
// la baja del autor.
export interface ProspectNota {
  id: string;
  prospect_id: string;
  autor_id: string | null;
  autor_nombre: string;
  autor_rol: string;
  texto: string;
  created_at: string;
  /** Marca de corrección. NULL = la nota está tal cual se escribió. */
  edited_at: string | null;
  /**
   * Dónde se escribió: 'plataforma' (aquí) o 'ghl' (traída de GoHighLevel).
   * Las de GHL son de SOLO LECTURA — no son nuestras para corregirlas ni para
   * borrarlas, y su fecha es la real de allá, no la de la importación.
   * Ver migración 20260826000000_notas_desde_ghl.sql.
   */
  origen: "plataforma" | "ghl";
}

// Resumen por proyecto para el LISTADO de clientes: lo devuelve agregado la RPC
// `notas_resumen()` (una fila por proyecto) en vez de bajarse la bitácora entera
// al navegador. Alimenta la columna «Último seguimiento».
export interface NotasResumen {
  total: number;
  diasConNota: number;
  ultimaAt: string | null;
  ultimoAutor: string | null;
}

export interface Simulation {
  semanas: number;
  pensionActual: number;
  pensionMejorada: number;
  financiamiento: number;
  costoGestion: number;
  totalCredito: number;
  roiMonths: number;
  comments?: string;
  aforePensionarse?: number;
  aportacion?: number;
  creditoNomina?: number;
}

/**
 * Cómo cotejó un proyecto contra los contactos de GoHighLevel.
 *
 * Lo escribe el servidor (barrido nocturno y botón «Traer notas de GHL») en
 * `prospect_ghl_cotejo`; el navegador solo lo lee. Un proyecto que nunca se ha
 * cotejado sencillamente no está en el mapa — que es distinto de estar con
 * `sello: null`, que significa «se buscó y no está en GoHighLevel».
 * Ver migración 20260826000002_cotejo_ghl_persistente.sql.
 */
export interface CotejoGhlResumen {
  sello: "verificado" | "probable" | "nombre" | "revisar" | null;
  nivel: number;
  contactoNombre: string | null;
  /** Lo que GoHighLevel tiene, para poder enseñar cuál de los dos corregir. */
  contactoCorreo: string | null;
  contactoTelefono: string | null;
  cotejadoAt: string;
}

export interface Prospect {
  id: string;
  aliado_id: string;
  aliado_name?: string;
  full_name: string;
  nss: string;
  curp: string;
  email: string;
  phone: string;
  status:
    | "evaluacion_pendiente"
    | "rechazado"
    | "aprobado_listo"
    | "asesoria_agendada"
    | "doc_proceso"
    | "analisis_riesgo"
    | "firma_contrato"
    | "firma_programada"
    | "pagado_comision"
    | "aportacion"
    | "falta_reporte"
    | "falta_afore"
    | "pendiente_documentos"
    | "cerrado_perdido"
    | "cerrado_riesgo"
    | "cerrado_desiste"
    | "falta_semanas"
    | "falta_afore_cuenta"
    | "posible_simulacion"
    | "agenda_futura";
  notes_aliado?: string;
  notes_director?: string;
  empresa_multialiado_id?: string | null;
  // Modalidad de aprobación (40 / 10) que definen el Director o el Account Manager.
  // El aliado la ve en su portal y solo se le abre la agenda de esa modalidad.
  modalidad?: "40" | "10" | null;
  // Tipo de financiamiento con el que el ALIADO captura el prospecto
  // ('credito_nomina' | 'modalidad_40_10'). Independiente de `modalidad`; sirve
  // para diferenciar el origen del expediente ante el Director y el Account Manager.
  tipo_financiamiento?: "credito_nomina" | "modalidad_40_10" | null;
  // Fecha de nueva evaluación agendada cuando el expediente se condiciona como
  // "Agenda futura" (subetapa de Condicionado). Nullable mientras no aplique.
  reeval_date?: string | null;
  // Fecha y hora de la REUNIÓN de asesoría con el cliente, tal como la teclea
  // quien agenda. Es la que muestra el hito "Agenda de Asesoría": el historial
  // de estados solo sabe cuándo se capturó la cita, no cuándo es.
  asesoria_at?: string | null;
  // Account Manager asignado al PROYECTO: lo hereda del aliado al capturar, o lo sortea la ruleta al
  // capturar el aliado su propio proyecto; si lo captura un AM, queda de ese AM;
  // si lo captura Dirección, queda null (gestión directa / mesa de dirección).
  account_manager_id?: string | null;
  // Quién CAPTURÓ el proyecto. Distinto de `aliado_id` (de quién ES) y de
  // `account_manager_id` (quién lo GESTIONA): el AM puede dar de alta a nombre
  // de un aliado y hasta ahora eso era indistinguible de un alta del aliado.
  // El rol es un SNAPSHOT del que tenía al capturar, y el nombre también, para
  // que el reporte de Dirección no dependa de RLS sobre `profiles`.
  // Ver migración 20260824000000_creador_de_proyecto.sql.
  created_by?: string | null;
  created_by_role?: string | null;
  created_by_name?: string | null;
  // Hitos ALCANZADOS: la primera vez que el proyecto llegó a cada escalón del
  // embudo. Los sella el trigger en BD y no se borran nunca — perder al cliente
  // (o ganarlo) no des-aprueba lo que ya se aprobó. El embudo y los indicadores
  // de gestión se cuentan con estos sellos, no con `status`.
  // Ver migración 20260831000000_hitos_alcanzados.sql y _pipelineBuckets.ts.
  hito_condicionado_at?: string | null;
  hito_rechazado_at?: string | null;
  hito_aprobado_at?: string | null;
  hito_otorgado_at?: string | null;
  simulation?: Simulation;
  sim_emitted_at?: string | null;
  documents: DocumentItem[];
  google_drive_folder?: string;
  google_drive_url?: string;
  drive_folder_id?: string;
  drive_folder_url?: string;
  created_at: string;
  updated_at: string;
}

// Resultado de la alerta de cliente duplicado entre aliados del mismo equipo
// (PAL-003): identifica al compañero (mismo líder + misma empresa) que ya tiene
// registrado al cliente y por qué campo coincide.
export interface TeamDuplicate {
  aliadoName: string;
  fullName: string;
  matchedBy: "curp" | "nss" | "ambos";
}

export interface InvitationCode {
  id: string;
  code: string;
  created_by: string;
  is_used: boolean;
  used_by?: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "alert";
  read: boolean;
  created_at: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: "whatsapp" | "email";
  recipient: string;
}

// Configuración global de la app (una sola fila en la tabla `app_settings`).
// Los links de agenda de asesoría los administra la Dirección de forma manual y
// cambian con el tiempo; el aliado los usa al agendar según la modalidad.
export interface AppSettings {
  meeting_link_m40: string;
  meeting_link_m10: string;
}

// Link de LeadConnector vigente al momento de introducir esta función. Sirve de
// default en modo demo y como fallback si aún no se ha configurado en la BD.
const DEFAULT_MEETING_LINK = "https://api.leadconnectorhq.com/widget/booking/tTynbYT83ugTjMBmwCf5";

interface AppContextType {
  user: UserProfile | null;
  activeRole: UserRole;
  prospects: Prospect[];
  invitationCodes: InvitationCode[];
  notifications: NotificationItem[];
  profiles: UserProfile[];
  messagingContacts: UserProfile[];
  // Perfiles para el SELECTOR de asignación de proyecto (director/AM eligen a qué
  // aliado va el proyecto al capturarlo). A diferencia de `profiles` (filtrado por
  // `exposedProfiles` a la cartera del AM), aquí un AM ve TODOS los aliados del
  // sistema para poder asignar a cualquiera, no solo a su grupo. Ver [[project-am-asigna-cualquier-aliado]].
  assignmentProfiles: UserProfile[];
  toast: ToastMessage | null;
  appSettings: AppSettings;
  updateAppSettings: (updates: Partial<AppSettings>) => Promise<void>;
  isDemoMode: boolean;
  isProvisionalSession: boolean;
  isLoading: boolean;
  dbError?: string | null;
  login: (email: string, role: UserRole, password?: string) => Promise<UserRole | null>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateUserPassword: (newPassword: string) => Promise<void>;
  updateUserProfile: (updates: ProfileEditableFields) => Promise<void>;
  uploadAvatar: (file: File) => Promise<string>;
  uploadDocument: (prospectId: string, fileType: "AFORE" | "IMSS" | "OTROS" | "RESOLUCION" | "INE", fileName: string, fileDataUrl: string) => Promise<DocumentItem>;
  deleteDocument: (prospectId: string, docId: string) => Promise<void>;
  registerAliado: (fullName: string, email: string, phone: string, password: string, code: string) => Promise<boolean>;
  initializeDirector: (fullName: string, email: string, phone: string, password: string) => Promise<boolean>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
  addProspect: (
    prospectData: Omit<
      Prospect,
      "id" | "aliado_id" | "status" | "created_at" | "updated_at" | "documents" | "simulation"
    > & {
      simulation?: Simulation;
      google_drive_folder?: string;
      google_drive_url?: string;
      // Aliado al que se asigna el proyecto al crearlo (lo elige Dirección/AM).
      // Si no se envía, el proyecto queda a nombre de quien lo captura.
      assignToAliadoId?: string | null;
    },
    aforeFile?: string | { name: string; dataUrl: string },
    imssFile?: string | { name: string; dataUrl: string }
  ) => Promise<Prospect>;
  deleteProspect: (id: string) => Promise<void>;
  checkCurpExists: (curp: string) => Promise<boolean>;
  checkTeamDuplicate: (curp: string, nss: string) => Promise<TeamDuplicate | null>;
  restoreProspect: (id: string) => Promise<void>;
  permanentlyDeleteProspect: (id: string) => Promise<void>;
  editProspectPersonalData: (
    id: string,
    updates: {
      full_name: string;
      nss: string;
      curp: string;
      phone: string;
      email: string;
    }
  ) => Promise<void>;
  reassignProspect: (id: string, newAliadoId: string) => Promise<void>;
  reassignAccountManager: (id: string, newAmId: string | null) => Promise<void>;
  // Reparte la CARTERA: fija el Account Manager de uno o varios aliados. Decide
  // a quién le nacen los proyectos que capturen a partir de ahora y NO toca los
  // que ya existen. Devuelve cuántos aliados cambiaron de verdad.
  assignAccountManager: (aliadoIds: string[], amId: string | null, motivo?: string | null) => Promise<number>;
  isProspectDeleted: (p: Prospect) => boolean;
  isProspectPurged: (p: Prospect) => boolean;
  getProspectDeletedAt: (p: Prospect) => Date | null;
  updateProspectStatus: (id: string, newStatus: Prospect["status"], comments?: string, reevalDate?: string | null) => Promise<void>;
  updateProspectModalidad: (id: string, modalidad: "40" | "10") => Promise<void>;
  saveSimulation: (
    id: string,
    simulationData: Omit<Simulation, "totalCredito" | "roiMonths">
  ) => Promise<void>;
  saveSimulationDraft: (
    id: string,
    simulationData: Omit<Simulation, "totalCredito" | "roiMonths">
  ) => Promise<void>;
  scheduleAssessment: (id: string, date: string, time: string) => Promise<void>;
  generateInvitationCode: () => Promise<InvitationCode>;
  createProfile: (profileData: Omit<UserProfile, "id" | "created_at">) => Promise<UserProfile>;
  // Atribuye uno o varios aliados a un closer. `reasignacion` mueve solo el
  // closer ACTUAL y conserva el de ORIGEN, para no reescribir el mérito
  // histórico (§23). Ver 20260801000000_closers.sql.
  assignCloser: (
    aliadoIds: string[],
    closerId: string | null,
    options?: {
      tipo?: CloserAsignacionInput["tipo"];
      motivo?: string | null;
      fechaIncorporacion?: string | null;
    }
  ) => Promise<void>;
  deleteProfile: (
    id: string,
    options?: { reassignToAliadoId?: string | null; reassignToAmId?: string | null; motivo?: string | null }
  ) => Promise<void>;
  // Credenciales de acceso de un aliado. Va por RPC y no leyendo la fila porque
  // el RLS es ciego a COLUMNAS: la política que le deja a un closer ver a sus
  // aliados atribuidos le entrega la fila entera. La función comprueba que quien
  // pregunta sea Dirección, el AM o el closer que ABRIÓ esa cuenta (§8/§9), y
  // deja constancia en la auditoría de que se consultaron.
  credencialesAliado: (aliadoId: string) => Promise<{ email: string; password: string | null }>;
  // Registra una acción administrativa sobre un aliado (§14). El actor lo firma
  // la base con `auth.uid()`: no se puede registrar a nombre de otro.
  registrarAuditoriaAliado: (input: {
    aliadoId: string;
    accion: AliadoAuditoriaAccion;
    antes?: Record<string, unknown> | null;
    despues?: Record<string, unknown> | null;
    motivo?: string | null;
  }) => Promise<void>;
  auditoriaDeAliado: (aliadoId: string) => Promise<AliadoAuditoriaRow[]>;
  // Actividad del Account Manager (migración 20260809000000). Las dos son
  // silenciosas y no devuelven nada: alimentan el panel «Actividad en plataforma»
  // de Reportes y JAMÁS pueden hacer fallar la acción que las dispara.
  // Solo escriben para el rol account_manager; para el resto la base las ignora.
  registrarActividad: (tipo: string, detalle?: string | null, entidadId?: string | null) => void;
  latidoActividad: (activo: boolean) => void;
  updateProfileAdmin: (id: string, updates: Partial<Omit<UserProfile, "id" | "created_at">>) => Promise<void>;
  changeAllyType: (allyId: string, tipo: "aliado" | "lider", empresaMultialiadoId?: string | null) => Promise<void>;
  assignAllyToLider: (allyId: string, liderIds: string[]) => Promise<void>;
  empresasMultialiado: EmpresaMultialiado[];
  createEmpresa: (nombre: string) => Promise<EmpresaMultialiado>;
  updateEmpresa: (id: string, nombre: string) => Promise<void>;
  deleteEmpresa: (id: string) => Promise<void>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearToast: () => void;
  triggerPushNotification: (message: string, type: "whatsapp" | "email", recipient: string) => void;
  getFileContent: (doc: DocumentItem) => Promise<string | null>;
  // ── Notas de seguimiento del proyecto (migración 20260825000000) ───────────
  // Resumen POR PROYECTO para el listado de clientes (columna «Último
  // seguimiento»). Llega agregado de la RPC `notas_resumen()`; la clave es el id
  // del proyecto. Un proyecto sin notas sencillamente no está en el mapa.
  notasResumen: Record<string, NotasResumen>;
  // El sello de GoHighLevel POR PROYECTO, ya calculado por el servidor. Se pinta
  // en el listado sin que nadie pulse nada: antes se calculaba al vuelo y moría
  // al recargar la página.
  cotejosGhl: Record<string, CotejoGhlResumen>;
  // La bitácora completa de UN proyecto, de la más nueva a la más vieja. Se pide
  // al abrir la ficha y no se cachea en el contexto: son datos de una sola
  // pantalla y crecen sin techo.
  fetchProspectNotas: (prospectId: string) => Promise<ProspectNota[]>;
  // Escribir / corregir / borrar. La fecha y el autor los pone la base, no el
  // navegador: lo que se manda de más se ignora (trigger `sella_autor_nota`).
  addProspectNota: (prospectId: string, texto: string) => Promise<ProspectNota>;
  updateProspectNota: (notaId: string, texto: string) => Promise<void>;
  deleteProspectNota: (notaId: string, prospectId: string) => Promise<void>;
  // Vuelve a pedir el resumen agregado. Lo necesita la importación desde GHL:
  // las notas entran por el servidor (`service_role`), así que el navegador no
  // se entera de que la columna «Último seguimiento» acaba de cambiar.
  recargarResumenNotas: () => Promise<void>;
  // Vuelve a pedir los sellos. Lo necesita el botón «Traer notas de GHL»: el
  // cotejo lo escribe el servidor, así que el navegador no se entera solo.
  recargarCotejosGhl: () => Promise<void>;
}

// Cierre de sesión automático por inactividad. En el plan limitado de Hostinger,
// cada sesión abierta mantiene un canal realtime de Supabase y datos cargados, así
// que botar las sesiones inactivas reduce la carga. Cambia estos valores para
// ajustar el tiempo de inactividad permitido y el aviso previo.
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos hasta cerrar sesión
const IDLE_WARNING_MS = 30 * 1000; // muestra el aviso 30s antes de cerrar
// Exportado: el vigilante de actividad (`components/ActividadTracker`) lo lee para
// saber si el latido que va a mandar cuenta como tiempo ACTIVO o como pantalla
// abierta sin tocar. Aprovecha el mismo timestamp que ya mantiene el cierre por
// inactividad en vez de montar un segundo detector de eventos.
export const IDLE_ACTIVITY_KEY = "pensionflow_last_activity"; // timestamp compartido entre pestañas

// Historial closer↔aliado en modo demo. En producción vive en la tabla
// `closer_aliado_asignaciones`; aquí se replica en localStorage para que la
// previsualización local muestre el mismo comportamiento.
const CLOSER_ASIGNACIONES_KEY = "pensionflow_closer_asignaciones";

const AppContext = createContext<AppContextType | undefined>(undefined);

// Initial realistic data for Demo mode
const INITIAL_PROFILES: UserProfile[] = [
  {
    id: "aliado-123",
    full_name: "Roberto Asesor",
    email: "roberto@asesores.com",
    phone: "5512345678",
    role: "aliado",
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: true,
  },
  {
    id: "director-456",
    full_name: "Eduardo Director",
    email: "eduardo@pensionflow.com",
    phone: "5598765432",
    role: "director",
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: true,
  },
  {
    id: "am-789",
    full_name: "Sofía Account Manager",
    email: "sofia@pensionflow.com",
    phone: "5511223344",
    role: "account_manager",
    created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: true,
    auto_assign_enabled: true, // participa en la ruleta de proyectos (demo)
  },
  {
    id: "aliado-unassigned",
    full_name: "Pedro Asesor Nuevo",
    email: "pedro@asesores.com",
    phone: "5587654321",
    role: "aliado",
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: true,
  }
];

const INITIAL_PROSPECTS: Prospect[] = [
  {
    id: "prospect-1",
    aliado_id: "aliado-123",
    aliado_name: "Roberto Asesor",
    account_manager_id: "am-789",
    full_name: "Norberto Javier González Ventura",
    nss: "68876602886",
    curp: "GOVN680820HDFLNS02",
    email: "norberto.gov@gmail.com",
    phone: "5543210987",
    status: "aprobado_listo",
    notes_aliado: "Cliente muy interesado en cotizar con Modalidad 40 tope de 5 años. Ya cuenta con los recursos para el enganche del financiamiento.",
    notes_director: "Semanas verificadas en IMSS. Reporte de Afore concuerda. Viabilidad financiera alta por cantidad de semanas cotizadas.",
    simulation: {
      semanas: 1150,
      pensionActual: 6800,
      pensionMejorada: 29500,
      financiamiento: 380000,
      costoGestion: 38000,
      totalCredito: 418000,
      roiMonths: 19,
      comments: "Se sugiere Modalidad 40 por 58 meses para alcanzar el tope óptimo en base a sus semanas.",
    },
    documents: [
      {
        id: "doc-1-1",
        prospect_id: "prospect-1",
        file_name: "AFORE_Norberto_Gonzalez.pdf",
        file_url: "#",
        file_type: "AFORE",
        uploaded_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "doc-1-2",
        prospect_id: "prospect-1",
        file_name: "Semanas_IMSS_Norberto.pdf",
        file_url: "#",
        file_type: "IMSS",
        uploaded_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "prospect-2",
    aliado_id: "aliado-123",
    aliado_name: "Roberto Asesor",
    account_manager_id: "am-789",
    full_name: "Ana María Torres Ruiz",
    nss: "09876543210",
    curp: "TORA731005MDFRRN09",
    email: "ana.torres@live.com.mx",
    phone: "5587654321",
    status: "evaluacion_pendiente",
    notes_aliado: "Cliente requiere simulación urgente. Trabaja por honorarios actualmente, pero cotizó más de 20 años.",
    documents: [
      {
        id: "doc-2-1",
        prospect_id: "prospect-2",
        file_name: "EdoCuenta_AFORE_AnaMaria.pdf",
        file_url: "#",
        file_type: "AFORE",
        uploaded_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "doc-2-2",
        prospect_id: "prospect-2",
        file_name: "Semanas_IMSS_AnaMaria.pdf",
        file_url: "#",
        file_type: "IMSS",
        uploaded_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "prospect-3",
    aliado_id: "aliado-123",
    aliado_name: "Roberto Asesor",
    account_manager_id: "am-789",
    full_name: "Juan Pérez García",
    nss: "12345678901",
    curp: "PEGJ700512HDFRRN01",
    email: "juan.perez@yahoo.com",
    phone: "5567890123",
    status: "analisis_riesgo",
    notes_aliado: "El prospecto tiene dudas del proceso administrativo de firma, pero está validado técnicamente.",
    notes_director: "Dictamen aprobado. Envió expediente para análisis detallado de buró y riesgos.",
    simulation: {
      semanas: 1420,
      pensionActual: 12000,
      pensionMejorada: 42000,
      financiamiento: 450000,
      costoGestion: 45000,
      totalCredito: 495000,
      roiMonths: 17,
      comments: "Excelente prospecto con una cantidad robusta de semanas.",
    },
    documents: [
      {
        id: "doc-3-1",
        prospect_id: "prospect-3",
        file_name: "AFORE_Juan_Perez.pdf",
        file_url: "#",
        file_type: "AFORE",
        uploaded_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "doc-3-2",
        prospect_id: "prospect-3",
        file_name: "SemanasCotizadas_Juan_Perez.pdf",
        file_url: "#",
        file_type: "IMSS",
        uploaded_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "prospect-4",
    aliado_id: "aliado-123",
    aliado_name: "Roberto Asesor",
    account_manager_id: "am-789",
    full_name: "Héctor Ramírez Soto",
    nss: "55123456789",
    curp: "RASH650315HDFMNR08",
    email: "hector.ramirez@gmail.com",
    phone: "5578901234",
    status: "pagado_comision",
    notes_aliado: "Firma exitosa. Todo el proceso completado.",
    notes_director: "Financiamiento liberado, Modalidad 40 activa. Comisión de aliado pagada.",
    simulation: {
      semanas: 1550,
      pensionActual: 9500,
      pensionMejorada: 52000,
      financiamiento: 510000,
      costoGestion: 50000,
      totalCredito: 560000,
      roiMonths: 14,
      comments: "Proyecto cerrado con éxito comercial y operativo.",
    },
    documents: [
      {
        id: "doc-4-1",
        prospect_id: "prospect-4",
        file_name: "Afore_Hector.jpg",
        file_url: "#",
        file_type: "AFORE",
        uploaded_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "doc-4-2",
        prospect_id: "prospect-4",
        file_name: "ImssSemanas_Hector.pdf",
        file_url: "#",
        file_type: "IMSS",
        uploaded_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const INITIAL_CODES: InvitationCode[] = [
  {
    id: "code-1",
    code: "AL-2026-X8F9",
    created_by: "director-456",
    is_used: false,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "code-2",
    code: "AL-2026-F9A2",
    created_by: "director-456",
    is_used: true,
    used_by: "aliado-123",
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Comisión Liberada",
    message: "¡Excelentes noticias! Se ha liberado la comisión para el proyecto de Héctor Ramírez Soto.",
    type: "success",
    read: false,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "notif-2",
    title: "Simulación Aprobada",
    message: "El Director de Operaciones ha aprobado y emitido la simulación para Norberto Javier González Ventura.",
    type: "info",
    read: false,
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "notif-3",
    title: "Nuevo Prospecto Recibido",
    message: "Se ha registrado exitosamente a Ana María Torres Ruiz en el pipeline de evaluación.",
    type: "info",
    read: true,
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function isProspectDeleted(p: Prospect): boolean {
  return typeof p.notes_director === "string" && p.notes_director.startsWith("[DELETED:");
}

export function isProspectPurged(p: Prospect): boolean {
  return typeof p.notes_director === "string" && p.notes_director.startsWith("[PURGED:");
}

export function getProspectDeletedAt(p: Prospect): Date | null {
  if (typeof p.notes_director !== "string" || !p.notes_director.startsWith("[DELETED:")) return null;
  const match = p.notes_director.match(/^\[DELETED:([^\]]+)\]/);
  return match ? new Date(match[1]) : null;
}

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>("aliado");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [invitationCodes, setInvitationCodes] = useState<InvitationCode[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [empresasMultialiado, setEmpresasMultialiado] = useState<EmpresaMultialiado[]>([]);
  // Resumen de notas POR PROYECTO (columna «Último seguimiento» de los listados).
  // Llega agregado de la base; un proyecto sin notas no está en el mapa.
  const [notasResumen, setNotasResumen] = useState<Record<string, NotasResumen>>({});
  const [cotejosGhl, setCotejosGhl] = useState<Record<string, CotejoGhlResumen>>({});
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    meeting_link_m40: DEFAULT_MEETING_LINK,
    meeting_link_m10: DEFAULT_MEETING_LINK,
  });
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [isProvisionalSession, setIsProvisionalSession] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [supabase, setSupabase] = useState<any>(null);

  // Helper to map profiles between Supabase role ('director') and Frontend role ('director')
  const mapProfileFromDB = (dbProfile: any): UserProfile => {
    if (!dbProfile) return dbProfile;
    return {
      ...dbProfile,
      role: dbProfile.role === "account_manager" ? "account_manager" : (dbProfile.role === "admin" || dbProfile.role === "director") ? "director" : dbProfile.role,
      is_active: dbProfile.is_active !== false,
      aliado_tipo: dbProfile.aliado_tipo || "aliado",
      lider_grupo: dbProfile.lider_grupo || null,
      empresa_multialiado_id: dbProfile.empresa_multialiado_id || null,
      curp: dbProfile.curp || null,
      ciudad: dbProfile.ciudad || null,
      pais: dbProfile.pais || null,
      avatar_url: dbProfile.avatar_url || null,
      // Datos de cobro. Si la migración 20260731000000 aún no está aplicada,
      // las columnas llegan como undefined y quedan en null: el perfil solo se
      // muestra "sin datos bancarios", nada se rompe.
      banco: dbProfile.banco || null,
      cuenta_bancaria: dbProfile.cuenta_bancaria || null,
      clabe: dbProfile.clabe || null,
      numero_tarjeta: dbProfile.numero_tarjeta || null,
      titular_cuenta: dbProfile.titular_cuenta || null,
      email_pagos: dbProfile.email_pagos || null,
      binance_id: dbProfile.binance_id || null,
      datos_bancarios_updated_at: dbProfile.datos_bancarios_updated_at || null,
      auto_assign_enabled: dbProfile.auto_assign_enabled === true,
      account_manager_id: dbProfile.account_manager_id || null,
      // Atribución al closer. Si la migración 20260801000000 aún no está
      // aplicada, estas columnas llegan como undefined y quedan en null: el
      // aliado simplemente sale como "Sin atribución". Nada se rompe.
      closer_origen_id: dbProfile.closer_origen_id || null,
      closer_actual_id: dbProfile.closer_actual_id || null,
      fecha_incorporacion_closer: dbProfile.fecha_incorporacion_closer || null,
      closer_asignado_por: dbProfile.closer_asignado_por || null,
      contrato_url: dbProfile.contrato_url || null,
      contrato_url_at: dbProfile.contrato_url_at || null,
      created_by: dbProfile.created_by || null,
      created_by_role: dbProfile.created_by_role || null,
      updated_at: dbProfile.updated_at || null,
      updated_by: dbProfile.updated_by || null,
    };
  };

  const mapProfileToDB = (profileData: any): any => {
    if (!profileData) return profileData;
    return {
      ...profileData,
      role: profileData.role === "director" ? "admin" : profileData.role,
    };
  };

  const ensureProfileExists = async (client: any, authUser: any): Promise<UserProfile | null> => {
    if (!authUser) return null;
    
    try {
      const { data: prof, error: fetchError } = await client
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();
        
      if (fetchError) {
        console.error("Error fetching profile in ensureProfileExists:", fetchError);
        return null;
      }
        
      if (prof) {
        // Sync metadata to auth.users if missing or mismatch.
        // (El AM ya no vive en el perfil del aliado: solo se sincroniza el rol.)
        const meta = authUser.user_metadata || {};
        if (meta.role !== prof.role) {
          console.log("Syncing missing/outdated role to auth metadata...");
          try {
            await client.auth.updateUser({
              data: {
                role: prof.role
              }
            });
          } catch (updateErr) {
            console.warn("Could not sync metadata to auth user in ensureProfileExists:", updateErr);
          }
        }
        return mapProfileFromDB(prof);
      }
      
      // Profile does not exist, let's create it from metadata
      const meta = authUser.user_metadata || {};
      const email = authUser.email || "";
      const isDirectorEmail = email.toLowerCase().includes("director") || email.toLowerCase().includes("admin") || email.toLowerCase() === "villoutaschellr@gmail.com";
      
      const fullName = meta.full_name || email.split('@')[0].split(/[._-]/).map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || (isDirectorEmail ? "Director Operativo" : "Aliado Comercial");
      const phone = meta.phone || "5500000000";
      const dbRole = meta.role || (isDirectorEmail ? "director" : "aliado");
      const invitationCode = meta.invitation_code_used || null;
      
      // Rescate de la atribución al closer: createProfile la deja en la metadata
      // de auth justo para este camino, en el que el INSERT original fue
      // bloqueado por RLS y el perfil nace aquí, en el primer login.
      const closerOrigen = meta.closer_origen_id || null;
      const incorporado = meta.fecha_incorporacion_closer || null;
      // La AUTORÍA viaja por el mismo camino y por el mismo motivo. Aquí el
      // trigger de la base no puede deducirla: quien inserta es el propio
      // usuario recién llegado (`auth.uid() = id`), así que sin este rescate el
      // aliado nacería sin creador y su closer no podría administrarlo (§8).
      const creador = meta.created_by || null;

      const healBase: any = {
        id: authUser.id,
        full_name: fullName,
        email: email.toLowerCase(),
        phone: phone,
        role: dbRole === "director" ? "admin" : dbRole,
        invitation_code_used: invitationCode,
      };
      const healCloser = closerOrigen
        ? {
            closer_origen_id: closerOrigen,
            closer_actual_id: closerOrigen,
            fecha_incorporacion_closer: incorporado,
          }
        : {};
      const healAutoria = creador ? { created_by: creador } : {};

      let { data: newProfile, error: createError } = await client
        .from("profiles")
        .insert({ ...healBase, ...healCloser, ...healAutoria })
        .select()
        .single();

      // Rescatar la atribución NUNCA puede costar el inicio de sesión: si esas
      // columnas todavía no existen, se reintenta sin ellas. Perder el dato del
      // closer es recuperable a mano; dejar al usuario sin poder entrar, no.
      if (createError && (closerOrigen || creador)) {
        console.warn("Self-healing con atribución de closer falló; reintentando sin ella:", createError);
        const retry = await client.from("profiles").insert(healBase).select().single();
        newProfile = retry.data;
        createError = retry.error;
      }
        
      if (createError) {
        console.error("Error creating profile in self-healing:", createError);
        return null;
      }
      
      // Also try to update the invitation code to used
      if (invitationCode) {
        try {
          await client
            .from("invitation_codes")
            .update({ is_used: true, used_by: authUser.id })
            .eq("code", invitationCode);
        } catch (updateErr) {
          console.warn("Could not mark invitation code as used in self-healing:", updateErr);
        }
      }
      
      return mapProfileFromDB(newProfile);
    } catch (err) {
      console.error("Critical error in ensureProfileExists:", err);
      return null;
    }
  };

  // Helper to transform prospect from DB format to Frontend format
  const transformProspectFromDB = (dbProspect: any): Prospect => {
    const hasSimulation = dbProspect.sim_semanas !== null || dbProspect.sim_pension_actual !== null;
    const semanas = dbProspect.sim_semanas !== null ? Number(dbProspect.sim_semanas) : 0;
    const pensionActual = dbProspect.sim_pension_actual !== null ? Number(dbProspect.sim_pension_actual) : 0;
    const pensionMejorada = dbProspect.sim_pension_mejorada !== null ? Number(dbProspect.sim_pension_mejorada) : 0;
    const financiamiento = dbProspect.sim_financiamiento !== null ? Number(dbProspect.sim_financiamiento) : 0;
    const costoGestion = dbProspect.sim_costo_gestion !== null ? Number(dbProspect.sim_costo_gestion) : 0;
    const totalCredito = financiamiento + costoGestion;
    const increment = pensionMejorada - pensionActual;
    const roiMonths = increment > 0 ? Math.ceil(totalCredito / increment) : 0;

    return {
      id: dbProspect.id,
      aliado_id: dbProspect.aliado_id,
      aliado_name: dbProspect.aliado_name,
      full_name: dbProspect.full_name,
      nss: dbProspect.nss || "",
      curp: dbProspect.curp || "",
      email: dbProspect.email || "",
      phone: dbProspect.phone || "",
      status: dbProspect.status,
      notes_aliado: dbProspect.notes_aliado || "",
      notes_director: dbProspect.notes_director || "",
      empresa_multialiado_id: dbProspect.empresa_multialiado_id || null,
      modalidad: dbProspect.modalidad || null,
      tipo_financiamiento: dbProspect.tipo_financiamiento || null,
      reeval_date: dbProspect.reeval_date || null,
      asesoria_at: dbProspect.asesoria_at || null,
      account_manager_id: dbProspect.account_manager_id ?? null,
      created_by: dbProspect.created_by ?? null,
      created_by_role: dbProspect.created_by_role ?? null,
      created_by_name: dbProspect.created_by_name ?? null,
      hito_condicionado_at: dbProspect.hito_condicionado_at ?? null,
      hito_rechazado_at: dbProspect.hito_rechazado_at ?? null,
      hito_aprobado_at: dbProspect.hito_aprobado_at ?? null,
      hito_otorgado_at: dbProspect.hito_otorgado_at ?? null,
      simulation: hasSimulation ? {
        semanas,
        pensionActual,
        pensionMejorada,
        financiamiento,
        costoGestion,
        totalCredito,
        roiMonths,
        comments: dbProspect.sim_comments || "",
        aforePensionarse: dbProspect.afore_pensionarse !== null ? Number(dbProspect.afore_pensionarse) : 0,
        aportacion: dbProspect.aportacion !== null ? Number(dbProspect.aportacion) : 0,
        creditoNomina: dbProspect.credito_nomina !== null ? Number(dbProspect.credito_nomina) : 0,
      } : undefined,
      sim_emitted_at: dbProspect.sim_emitted_at || null,
      documents: (dbProspect.documents || []).map((doc: any) => ({
        id: doc.id,
        prospect_id: doc.prospect_id,
        file_name: doc.file_name,
        file_url: doc.file_url,
        file_type: doc.file_type,
        storage_path: doc.storage_path,
        uploaded_at: doc.uploaded_at,
        drive_file_id: doc.drive_file_id || undefined,
        drive_file_url: doc.drive_file_url || undefined,
        drive_folder_id: doc.drive_folder_id || undefined,
        uploaded_by: doc.uploaded_by || undefined,
      })),
      google_drive_folder: dbProspect.google_drive_folder || "",
      google_drive_url: dbProspect.google_drive_url || "",
      drive_folder_id: dbProspect.drive_folder_id || "",
      drive_folder_url: dbProspect.drive_folder_url || "",
      created_at: dbProspect.created_at,
      updated_at: dbProspect.updated_at,
    };
  };

  // Helper to generate a valid RFC4122 v4 UUID
  const generateUUID = (): string => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  // Helper to convert base64 to Blob
  const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || "";
    const bstr = atob(arr[arr.length - 1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  // Load state from localStorage/Supabase on mount
  useEffect(() => {
    // Theme initialization
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("pensionflow_theme") || "light";
      if (savedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    const hasKeys =
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== "tu_supabase_url_aqui" &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "tu_supabase_anon_key_aqui";

    const demo = !hasKeys;
    setIsDemoMode(demo);

    if (demo) {
      // Read localStorage fallbacks
      const storedUser = localStorage.getItem("pensionflow_user");
      const storedRole = localStorage.getItem("pensionflow_active_role");
      const storedProspects = localStorage.getItem("pensionflow_prospects");
      const storedCodes = localStorage.getItem("pensionflow_invitation_codes");
      const storedNotifs = localStorage.getItem("pensionflow_notifications");
      const storedProfiles = localStorage.getItem("pensionflow_profiles");

      let localLiderAliados: any[] = [];
      const storedLiderAliados = localStorage.getItem("pensionflow_lider_aliados");
      if (storedLiderAliados) {
        try {
          localLiderAliados = JSON.parse(storedLiderAliados);
        } catch (e) {
          localLiderAliados = [];
        }
      } else {
        localStorage.setItem("pensionflow_lider_aliados", JSON.stringify([]));
      }

      let localEmpresas: EmpresaMultialiado[] = [];
      const storedEmpresas = localStorage.getItem("pensionflow_empresas_multialiado");
      if (storedEmpresas) {
        try {
          localEmpresas = JSON.parse(storedEmpresas);
        } catch (e) {
          localEmpresas = [];
        }
      }
      if (localEmpresas.length === 0) {
        localEmpresas = [
          { id: "empresa-apoyamax", nombre: "Apoyamax", created_by: "Sistema", created_at: new Date().toISOString() },
          { id: "empresa-pensium", nombre: "Pensium", created_by: "Sistema", created_at: new Date().toISOString() }
        ];
        localStorage.setItem("pensionflow_empresas_multialiado", JSON.stringify(localEmpresas));
      }

      let parsedProfilesList: UserProfile[] = [];
      if (storedProfiles) {
        try {
          parsedProfilesList = JSON.parse(storedProfiles).map((p: any) => {
            const mapped = {
              ...p,
              is_active: p.is_active !== false,
              aliado_tipo: p.aliado_tipo || "aliado",
              lider_grupo: p.lider_grupo || null,
              empresa_multialiado_id: p.empresa_multialiado_id || null,
            };
            const rels = localLiderAliados.filter((r: any) => r.aliado_asignado_id === mapped.id) || [];
            mapped.lider_ids = rels.map((r: any) => r.lider_id);
            mapped.lider_aliado_rels = rels.map((r: any) => ({ id: r.id, lider_id: r.lider_id }));
            if (rels.length > 0) {
              mapped.lider_id = rels[0].lider_id;
              mapped.lider_aliado_rel_id = rels[0].id;
            } else {
              mapped.lider_id = null;
              mapped.lider_aliado_rel_id = null;
            }
            return mapped;
          });
          setProfiles(parsedProfilesList);
        } catch (e) {
          parsedProfilesList = INITIAL_PROFILES.map((p: any) => ({
            ...p,
            aliado_tipo: p.aliado_tipo || "aliado",
            lider_grupo: p.lider_grupo || null,
            empresa_multialiado_id: p.empresa_multialiado_id || null,
            lider_id: null,
            lider_ids: [],
            lider_aliado_rel_id: null,
            lider_aliado_rels: [],
          }));
          setProfiles(parsedProfilesList);
        }
      } else {
        parsedProfilesList = INITIAL_PROFILES.map((p: any) => ({
          ...p,
          aliado_tipo: p.aliado_tipo || "aliado",
          lider_grupo: p.lider_grupo || null,
          empresa_multialiado_id: p.empresa_multialiado_id || null,
          lider_id: null,
          lider_ids: [],
          lider_aliado_rel_id: null,
          lider_aliado_rels: [],
        }));
        setProfiles(parsedProfilesList);
        localStorage.setItem("pensionflow_profiles", JSON.stringify(parsedProfilesList));
      }

      const countMap: Record<string, number> = {};
      parsedProfilesList.forEach((p: any) => {
        if (p.aliado_tipo === "lider" && p.empresa_multialiado_id) {
          countMap[p.empresa_multialiado_id] = (countMap[p.empresa_multialiado_id] || 0) + 1;
        }
      });
      const localEmpresasWithCounts = localEmpresas.map((e: any) => ({
        ...e,
        lideres_count: countMap[e.id] || 0
      }));
      setEmpresasMultialiado(localEmpresasWithCounts);

      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        const match = parsedProfilesList.find(p => p.id === parsedUser.id);
        setUser(match || parsedUser);
      } else {
        const defaultUser = parsedProfilesList[0];
        setUser(defaultUser);
        localStorage.setItem("pensionflow_user", JSON.stringify(defaultUser));
      }

      if (storedRole) {
        setActiveRole(storedRole as UserRole);
      } else {
        setActiveRole("aliado");
        localStorage.setItem("pensionflow_active_role", "aliado");
      }

      if (storedProspects) {
        const parsed = JSON.parse(storedProspects);
        // Clean up older than 7 days or purged in demo mode
        const now = new Date();
        const cleaned = parsed.filter((p: any) => {
          const notesDir = p.notes_director || "";
          const isDeleted = notesDir.startsWith("[DELETED:");
          const isPurged = notesDir.startsWith("[PURGED:");
          if (isPurged) return false;
          if (isDeleted) {
            const match = notesDir.match(/^\[DELETED:([^\]]+)\]/);
            if (match) {
              const delDate = new Date(match[1]);
              const diffTime = Math.abs(now.getTime() - delDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              return diffDays <= 7;
            }
          }
          return true;
        });
        setProspects(cleaned);
        saveToStorage("pensionflow_prospects", cleaned);
      } else {
        setProspects(INITIAL_PROSPECTS);
        localStorage.setItem("pensionflow_prospects", JSON.stringify(INITIAL_PROSPECTS));
      }

      if (storedCodes) {
        setInvitationCodes(JSON.parse(storedCodes));
      } else {
        setInvitationCodes(INITIAL_CODES);
        localStorage.setItem("pensionflow_invitation_codes", JSON.stringify(INITIAL_CODES));
      }

      if (storedNotifs) {
        setNotifications(JSON.parse(storedNotifs));
      } else {
        setNotifications(INITIAL_NOTIFICATIONS);
        localStorage.setItem("pensionflow_notifications", JSON.stringify(INITIAL_NOTIFICATIONS));
      }

      const storedAppSettings = localStorage.getItem("pensionflow_app_settings");
      if (storedAppSettings) {
        try {
          const parsed = JSON.parse(storedAppSettings);
          setAppSettings({
            meeting_link_m40: parsed.meeting_link_m40 || DEFAULT_MEETING_LINK,
            meeting_link_m10: parsed.meeting_link_m10 || DEFAULT_MEETING_LINK,
          });
        } catch {
          /* keep defaults */
        }
      }
      setIsLoading(false);
    } else {
      // Production mode with Supabase
      const client = createClient();
      setSupabase(client);

      const loadSupabaseData = async () => {
        try {
          // Check if there is an active session
          const { data: { session } } = await client.auth.getSession();
          let hasActiveSession = !!session?.user;
          let currentUser: UserProfile | null = null;

          if (session?.user) {
            try {
              // Pre-fetch profile to check if it's a provisional password user
              let profile = await ensureProfileExists(client, session.user);
              
              // Fallback to localStorage if fetching profile failed due to DB/network error
              if (!profile) {
                console.warn("Profile fetch returned null, attempting to restore from localStorage fallback");
                const storedUserStr = localStorage.getItem("pensionflow_user");
                if (storedUserStr) {
                  const storedUser = JSON.parse(storedUserStr);
                  if (storedUser && storedUser.id === session.user.id) {
                    profile = storedUser;
                  }
                }
              }

              // If still null (meaning first login or empty cache, but query failed),
              // we can construct a temporary user profile using session user metadata so they are not logged out
              if (!profile) {
                console.warn("Profile still null, constructing temporary session profile to avoid logout");
                const meta = session.user.user_metadata || {};
                const email = session.user.email || "";
                const isDirectorEmail = email.toLowerCase().includes("director") || email.toLowerCase().includes("admin") || email.toLowerCase() === "villoutaschellr@gmail.com";
                profile = {
                  id: session.user.id,
                  full_name: meta.full_name || email.split('@')[0],
                  email: email,
                  phone: meta.phone || "",
                  role: meta.role || (isDirectorEmail ? "director" : "aliado"),
                  created_at: new Date().toISOString(),
                  is_active: true
                };
              }
              
              // Accept the session regardless of email confirmation
              if (profile) {
                currentUser = profile;
                setUser(profile);
                setActiveRole(profile.role);
              }
            } catch (err) {
              console.error("Error loading session profile:", err);
            }
          } else {
            // Restore from localStorage backup if it exists (highly robust fallback)
            const storedUserStr = localStorage.getItem("pensionflow_user");
            if (storedUserStr) {
              try {
                const storedUser = JSON.parse(storedUserStr);
                if (storedUser && storedUser.email) {
                  // Verify that the profile still exists in database and is active
                  const { data: dbProfile, error: fetchError } = await client
                    .from("profiles")
                    .select("*")
                    .eq("email", storedUser.email.toLowerCase())
                    .maybeSingle();

                  if (!fetchError && dbProfile) {
                    const profile = mapProfileFromDB(dbProfile);
                    if (profile && profile.is_active) {
                      currentUser = profile;
                      setUser(profile);
                      setActiveRole(profile.role);
                    }
                  } else if (storedUser.password_provisional) {
                    // Provisional session bypass: RLS blocks the profiles query when anonymous.
                    // Try to upgrade to a REAL Supabase Auth session in the background using the
                    // provisional password. If the upgrade does not fully complete for ANY reason
                    // (auth error, exception, or profile not resolved), we always fall back to the
                    // intact localStorage session so the user is never logged out.
                    let upgraded = false;
                    try {
                      console.log("Attempting background session upgrade using provisional password for:", storedUser.email);
                      const { data: authData, error: authErr } = await client.auth.signInWithPassword({
                        email: storedUser.email,
                        password: storedUser.password_provisional
                      });
                      if (!authErr && authData.user) {
                        const profile = await ensureProfileExists(client, authData.user);
                        if (profile) {
                          console.log("Background session upgrade successful!");
                          currentUser = profile;
                          setUser(profile);
                          setActiveRole(profile.role);
                          saveToStorage("pensionflow_user", profile);
                          hasActiveSession = true;
                          upgraded = true;
                        } else {
                          console.warn("Background session upgrade signed in but profile could not be resolved; keeping provisional session");
                        }
                      } else if (authErr) {
                        console.warn("Background session upgrade failed, keeping provisional session:", authErr?.message);
                      }
                    } catch (upgradeErr) {
                      console.error("Error in background session upgrade:", upgradeErr);
                    }
                    if (!upgraded) {
                      // Keep the localStorage provisional session intact (identical to prior behavior).
                      currentUser = storedUser;
                      setUser(storedUser);
                      setActiveRole(storedUser.role);
                    }
                  } else if (fetchError) {
                    // DB/network error: restore from localStorage anyway to prevent drop!
                    console.warn("DB error when restoring session, keeping localStorage user");
                    currentUser = storedUser;
                    setUser(storedUser);
                    setActiveRole(storedUser.role);
                  }
                }
              } catch (e) {
                console.error("Error restoring user from localStorage:", e);
              }
            }
          }

          // If not signed in via Supabase and no restored user, clean up state and stop loading
          if (!currentUser) {
            setUser(null);
            setIsLoading(false);
            return;
          }

          // Fetch profiles, prospects, notifications, invitation codes
          const isProvisional = !hasActiveSession && !!currentUser?.password_provisional;
          setIsProvisionalSession(isProvisional);

          if (isProvisional) {
            setProfiles([currentUser]);

            const storedProspects = localStorage.getItem("pensionflow_prospects");
            if (storedProspects) {
              try {
                setProspects(JSON.parse(storedProspects));
              } catch (e) {
                console.error("Error loading local prospects in provisional session:", e);
                setProspects([]);
              }
            } else {
              setProspects([]);
            }

            const storedCodes = localStorage.getItem("pensionflow_invitation_codes");
            if (storedCodes) {
              try {
                setInvitationCodes(JSON.parse(storedCodes));
              } catch (e) {
                setInvitationCodes([]);
              }
            } else {
              setInvitationCodes([]);
            }

            const storedNotifs = localStorage.getItem("pensionflow_notifications");
            if (storedNotifs) {
              try {
                setNotifications(JSON.parse(storedNotifs));
              } catch (e) {
                setNotifications([]);
              }
            } else {
              setNotifications([]);
            }
          } else {
            // Fetch all profiles
            const { data: dbProfiles, error: profilesError } = await client.from("profiles").select("*");
            if (profilesError) {
              console.error("Error fetching profiles:", profilesError);
              setDbError(prev => prev ? `${prev} | Error perfiles: ${profilesError.message}` : `Error perfiles: ${profilesError.message}`);
            }

            // Fetch leader-allies relationships
            const { data: dbLiderAliados, error: laError } = await client.from("lider_aliados").select("*");
            if (laError) {
              console.error("Error fetching lider_aliados:", laError);
            }

            const mappedProfiles = dbProfiles ? dbProfiles.map(dbP => {
              const mapped = mapProfileFromDB(dbP);
              const rels = dbLiderAliados?.filter((r: any) => r.aliado_asignado_id === mapped.id) || [];
              mapped.lider_ids = rels.map((r: any) => r.lider_id);
              mapped.lider_aliado_rels = rels.map((r: any) => ({ id: r.id, lider_id: r.lider_id }));
              if (rels.length > 0) {
                mapped.lider_id = rels[0].lider_id;
                mapped.lider_aliado_rel_id = rels[0].id;
              } else {
                mapped.lider_id = null;
                mapped.lider_aliado_rel_id = null;
              }
              return mapped;
            }) : [];
            setProfiles(mappedProfiles);

            const activeUser = currentUser;
            if (activeUser) {
              const matched = mappedProfiles.find((p: any) => p.id === activeUser.id);
              if (matched) {
                currentUser = matched;
                setUser(matched);
              }
            }

            // Fetch empresas_multialiado
            const { data: dbEmpresas, error: empresasError } = await client
              .from("empresas_multialiado")
              .select("*");

            if (empresasError) {
              console.error("Error fetching empresas_multialiado:", empresasError);
            }

            const countMap: Record<string, number> = {};
            mappedProfiles.forEach((p: any) => {
              if (p.aliado_tipo === "lider" && p.empresa_multialiado_id) {
                countMap[p.empresa_multialiado_id] = (countMap[p.empresa_multialiado_id] || 0) + 1;
              }
            });

            const mappedEmpresas = (dbEmpresas || []).map((c: any) => {
              const creatorProfile = mappedProfiles.find((p: any) => p.id === c.created_by);
              return {
                id: c.id,
                nombre: c.nombre,
                created_by: creatorProfile?.full_name || "Sistema",
                created_at: c.created_at,
                updated_at: c.updated_at,
                lideres_count: countMap[c.id] || 0
              };
            });
            setEmpresasMultialiado(mappedEmpresas);

             // Fetch prospects (filtered by role if user is aliado or account_manager)
             let prospectsQuery = client.from("prospects").select("*, documents(*)");
             if (activeUser && activeUser.role === "aliado") {
               if (activeUser.aliado_tipo === "lider") {
                 const assignedAllyIds = mappedProfiles
                   .filter((p: any) => p.role === "aliado" && p.lider_ids?.includes(activeUser.id))
                   .map((p: any) => p.id);
                 const allAllyIds = [activeUser.id, ...assignedAllyIds];

                 if (activeUser.empresa_multialiado_id) {
                   const allyIdsString = allAllyIds.map(id => `aliado_id.eq.${id}`).join(",");
                   prospectsQuery = prospectsQuery.or(`empresa_multialiado_id.eq.${activeUser.empresa_multialiado_id},${allyIdsString}`);
                 } else if (assignedAllyIds.length > 0) {
                   prospectsQuery = prospectsQuery.in("aliado_id", allAllyIds);
                 } else {
                   prospectsQuery = prospectsQuery.eq("aliado_id", activeUser.id);
                 }
               } else {
                 prospectsQuery = prospectsQuery.eq("aliado_id", activeUser.id);
               }
             } else if (activeUser && activeUser.role === "account_manager") {
               // El AM trabaja POR PROYECTO: ve los prospects que tienen su id
               // como account_manager_id (ya no la cartera de aliados).
               prospectsQuery = prospectsQuery.eq("account_manager_id", activeUser.id);
             } else if (activeUser && activeUser.role === "closer") {
               // Un closer no lee expedientes: sus métricas llegan agregadas por
               // RPC. Se acota a nada para no gastar un viaje de red que el RLS
               // devolvería vacío igualmente.
               prospectsQuery = prospectsQuery.eq("aliado_id", "00000000-0000-0000-0000-000000000000");
             }
            const { data: dbProspects, error: prospectsError } = await prospectsQuery.order("created_at", { ascending: false });
            if (prospectsError) {
              console.error("Error fetching prospects:", prospectsError);
              setDbError(prev => prev ? `${prev} | Error prospectos: ${prospectsError.message}` : `Error prospectos: ${prospectsError.message}`);
            }
            if (dbProspects) {
              const mappedProspects = dbProspects.map(transformProspectFromDB);
              setProspects(mappedProspects);

              // Clean up old soft-deleted or purged prospects in background if director/admin
              if (activeUser && activeUser.role === "director") {
                const now = new Date();
                const toPurge = mappedProspects.filter((p: Prospect) => {
                  const deletedAt = getProspectDeletedAt(p);
                  const isPurged = isProspectPurged(p);
                  if (isPurged) return true;
                  if (deletedAt) {
                    const diffTime = Math.abs(now.getTime() - deletedAt.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays > 7;
                  }
                  return false;
                });

                if (toPurge.length > 0) {
                  for (const p of toPurge) {
                    const driveFolderId = p.drive_folder_id || p.google_drive_folder;
                    if (driveFolderId) {
                      try {
                        await fetch("/api/drive", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "deleteFile",
                            fileId: driveFolderId,
                          }),
                        });
                      } catch (err) {
                        console.error("Cleanup: GDrive error:", err);
                      }
                    }
                    try {
                      await client.from("prospects").delete().eq("id", p.id);
                    } catch (err) {
                      console.error("Cleanup: Supabase error:", err);
                    }
                  }
                  // Refetch prospects after background purge
                  const { data: refetched } = await prospectsQuery.order("created_at", { ascending: false });
                  if (refetched) {
                    setProspects(refetched.map(transformProspectFromDB));
                  }
                }
              }
            }

            // Fetch invitation codes
            const { data: dbCodes, error: codesError } = await client.from("invitation_codes").select("*");
            if (codesError) {
              console.error("Error fetching invitation codes:", codesError);
              setDbError(prev => prev ? `${prev} | Error códigos: ${codesError.message}` : `Error códigos: ${codesError.message}`);
            }
            if (dbCodes) {
              setInvitationCodes(dbCodes.map((c: any) => {
                const userWhoUsedIt = mappedProfiles.find(p => p.invitation_code_used === c.code);
                return {
                  id: c.id,
                  code: c.code,
                  created_by: c.created_by,
                  is_used: c.is_used || !!userWhoUsedIt,
                  used_by: c.used_by || userWhoUsedIt?.id,
                  created_at: c.created_at
                };
              }));
            }

            // Fetch notifications for the user
            const { data: dbNotifs } = await client
              .from("notifications")
              .select("*")
              .eq("user_id", currentUser.id)
              .order("created_at", { ascending: false });
            if (dbNotifs) {
              setNotifications(dbNotifs.map((n: any) => ({
                id: n.id,
                title: n.title,
                message: n.message,
                type: n.type as any,
                read: n.read,
                created_at: n.created_at
              })));
            }

            // Fetch global app settings (links de reunión configurables)
            const { data: dbSettings } = await client
              .from("app_settings")
              .select("*")
              .eq("id", 1)
              .maybeSingle();
            if (dbSettings) {
              setAppSettings({
                meeting_link_m40: dbSettings.meeting_link_m40 || DEFAULT_MEETING_LINK,
                meeting_link_m10: dbSettings.meeting_link_m10 || DEFAULT_MEETING_LINK,
              });
            }
          }
        } catch (error: any) {
          console.error("Error loading Supabase data:", error);
          setDbError(prev => prev ? `${prev} | Error inicialización: ${error.message}` : `Error inicialización: ${error.message}`);
        } finally {
          setIsLoading(false);
        }
      };
      loadSupabaseData();
    }
  }, []);

  const saveToStorage = (key: string, value: any) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      setToast({ id: Date.now().toString(), type: "email", recipient: email, message: "Simulación de correo de recuperación enviada." });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    if (error) {
      console.error("Error sending reset password email:", error);
      throw error;
    }
  };

  const updateUserPassword = async (newPassword: string): Promise<void> => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      setToast({ id: Date.now().toString(), type: "email", recipient: "Sistema", message: "Simulación de cambio de contraseña exitosa." });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      console.error("Error updating password:", error);
      throw error;
    }
  };

  const updateUserProfile = async (updates: ProfileEditableFields): Promise<void> => {
    if (!user) return;

    // Solo aplicamos los campos provistos (undefined = no tocar).
    const clean: Partial<UserProfile> = {};
    (Object.keys(updates) as (keyof ProfileEditableFields)[]).forEach((k) => {
      if (updates[k] !== undefined) (clean as any)[k] = updates[k];
    });

    const updatedUser = { ...user, ...clean };
    setUser(updatedUser);
    saveToStorage("pensionflow_user", updatedUser);

    // Update in profiles list as well
    const updatedProfiles = profiles.map((p) => (p.id === user.id ? { ...p, ...clean } : p));
    setProfiles(updatedProfiles);
    saveToStorage("pensionflow_profiles", updatedProfiles);

    if (!isDemoMode && !isProvisionalSession && supabase) {
      const { error } = await supabase
        .from("profiles")
        .update(clean)
        .eq("id", user.id);
      if (error) {
        console.error("Error updating profile in database:", error);
        throw error;
      }
    }
  };

  // Sube la foto de perfil comprimida a Supabase Storage (bucket 'avatars') y
  // guarda la URL pública en el perfil. En demo/provisional (sin Supabase real)
  // usa la data-URL comprimida localmente. Devuelve la URL final para preview.
  const uploadAvatar = async (file: File): Promise<string> => {
    if (!user) throw new Error("No hay usuario activo.");
    const { compressImage } = await import("@/utils/image");
    const { blob, dataUrl } = await compressImage(file);

    // Sin Supabase real: guardamos la data-URL comprimida (liviana) localmente.
    if (isDemoMode || isProvisionalSession || !supabase) {
      await updateUserProfile({ avatar_url: dataUrl });
      return dataUrl;
    }

    const path = `${user.id}/avatar.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
    if (uploadError) {
      console.error("Error subiendo avatar a Storage:", uploadError);
      throw uploadError;
    }

    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    // Bust de caché: la ruta es estable (upsert), así que versionamos por query.
    const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;
    await updateUserProfile({ avatar_url: publicUrl });
    return publicUrl;
  };

  // Recordatorio in-app para completar el perfil. Si el perfil está incompleto,
  // inserta UNA notificación por día (guardada por fecha en localStorage para no
  // duplicar en cada recarga). No bloquea nada; solo alimenta la campana. El nudge
  // persistente del header es el recordatorio siempre visible.
  useEffect(() => {
    if (isDemoMode || isProvisionalSession || !supabase || !user) return;
    const completion = getProfileCompletion(user);
    if (completion.verified) return;

    const KEY = "pensionflow_profile_nudge_date";
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(KEY) === today) return;
      localStorage.setItem(KEY, today); // marcar antes del await evita duplicados
    } catch {
      return;
    }

    (async () => {
      try {
        const message = `Tu perfil está al ${completion.percent}%. Completa ${completion.missing
          .map((m) => m.label)
          .join(", ")} para verificarlo.`;
        const { data, error } = await supabase
          .from("notifications")
          .insert({
            user_id: user.id,
            title: "Completa tu perfil",
            message,
            type: "warning",
            read: false,
          })
          .select()
          .single();
        if (!error && data) {
          setNotifications((prev) => [
            { id: data.id, title: data.title, message: data.message, type: data.type, read: false, created_at: data.created_at },
            ...prev,
          ]);
        }
      } catch (e) {
        console.warn("No se pudo crear el recordatorio de perfil:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isDemoMode, isProvisionalSession, supabase]);

  const uploadDocument = async (
    prospectId: string,
    fileType: "AFORE" | "IMSS" | "OTROS" | "RESOLUCION" | "INE",
    fileName: string,
    fileDataUrl: string
  ): Promise<DocumentItem> => {
    const docId = generateUUID();
    
    const targetProspect = prospects.find((p) => p.id === prospectId);
    let folderId = targetProspect?.drive_folder_id || targetProspect?.google_drive_folder;
    let folderUrl = targetProspect?.drive_folder_url || targetProspect?.google_drive_url;

    if (!folderId) {
      try {
        const driveRes = await fetch("/api/drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "createFolder",
            clientName: targetProspect?.full_name || "Cliente_Sin_Nombre",
            nss: targetProspect?.nss || "S_N",
          }),
        });
        const driveData = await driveRes.json();
        if (driveData.success) {
          folderId = driveData.folderId;
          folderUrl = driveData.folderUrl;
          
          if (targetProspect) {
            targetProspect.drive_folder_id = folderId;
            targetProspect.drive_folder_url = folderUrl;
            if (!isDemoMode && !isProvisionalSession && supabase) {
              await supabase
                .from("prospects")
                .update({
                  drive_folder_id: folderId,
                  drive_folder_url: folderUrl,
                })
                .eq("id", prospectId);
            }
          }
        }
      } catch (err) {
        console.error("Error creating folder dynamically inside uploadDocument:", err);
        folderId = `sim-folder-${Math.random().toString(36).substring(2, 11)}`;
        folderUrl = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;
      }
    }

    let driveFileId = "";
    let driveFileUrl = "";
    try {
      const res = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "uploadFile",
          folderId,
          fileName,
          fileDataUrl,
          fileType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        driveFileId = data.fileId;
        driveFileUrl = data.fileUrl;
      }
    } catch (e) {
      console.error("Error uploading to Drive API:", e);
      driveFileId = `sim-file-${Math.random().toString(36).substring(2, 11)}`;
      driveFileUrl = `https://drive.google.com/open?id=${driveFileId}`;
    }

    const newDoc: DocumentItem = {
      id: docId,
      prospect_id: prospectId,
      file_name: fileName,
      file_url: driveFileUrl,
      file_type: fileType,
      uploaded_at: new Date().toISOString(),
      drive_file_id: driveFileId,
      drive_file_url: driveFileUrl,
      drive_folder_id: folderId,
      uploaded_by: user?.id || "aliado-123",
    };

    await saveFile(docId, fileDataUrl);

    if (!isDemoMode && !isProvisionalSession && supabase) {
      let finalUploadedBy = user?.id;
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        finalUploadedBy = authUser.id;
      }

      const { error: dbErr } = await supabase.from("documents").insert({
        id: docId,
        prospect_id: prospectId,
        file_name: fileName,
        file_url: driveFileUrl,
        file_type: fileType,
        drive_file_id: driveFileId,
        drive_file_url: driveFileUrl,
        drive_folder_id: folderId,
        uploaded_by: finalUploadedBy,
      });

      if (dbErr) {
        console.warn("Metadata insert failed in Supabase, retrying with legacy columns:", dbErr);
        // Fallback: retry inserting only the columns that exist in the base schema
        const { error: dbErrLegacy } = await supabase.from("documents").insert({
          id: docId,
          prospect_id: prospectId,
          file_name: fileName,
          file_url: driveFileUrl,
          file_type: fileType,
        });

        if (dbErrLegacy) {
          console.error("Critical insert error with legacy columns:", dbErrLegacy);
          throw dbErrLegacy;
        }
      }
    }

    const updatedProspects = prospects.map((p) => {
      if (p.id === prospectId) {
        return {
          ...p,
          documents: [...(p.documents || []), newDoc],
          updated_at: new Date().toISOString(),
        };
      }
      return p;
    });
    setProspects(updatedProspects);
    saveToStorage("pensionflow_prospects", updatedProspects);

    registrarActividad("sube_documento", fileType, prospectId);

    return newDoc;
  };

  const deleteDocument = async (prospectId: string, docId: string): Promise<void> => {
    const prospect = prospects.find((p) => p.id === prospectId);
    if (!prospect) return;

    const doc = prospect.documents.find((d) => d.id === docId);
    if (!doc) return;

    const fileId = doc.drive_file_id || doc.storage_path;
    if (fileId) {
      try {
        await fetch("/api/drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deleteFile",
            fileId: fileId,
          }),
        });
      } catch (err) {
        console.error("Error deleting document from Drive:", err);
      }
    }

    if (isDemoMode || isProvisionalSession || !supabase) {
      const updatedProspects = prospects.map((p) => {
        if (p.id === prospectId) {
          return {
            ...p,
            documents: (p.documents || []).filter((d) => d.id !== docId),
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      });
      setProspects(updatedProspects);
      saveToStorage("pensionflow_prospects", updatedProspects);
    } else {
      try {
        await supabase.from("documents").delete().eq("id", docId);

        setProspects((prev) =>
          prev.map((p) => {
            if (p.id === prospectId) {
              return {
                ...p,
                documents: (p.documents || []).filter((d) => d.id !== docId),
                updated_at: new Date().toISOString(),
              };
            }
            return p;
          })
        );

        registrarActividad("borra_documento", doc.file_type || doc.file_name, prospectId);
      } catch (err) {
        console.error("Error deleting document from DB:", err);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTAS DE SEGUIMIENTO DEL PROYECTO (tabla `prospect_notas`, migr. 20260825000000)
  // ═══════════════════════════════════════════════════════════════════════════
  // Bitácora compartida: la escriben el aliado, su account manager y la
  // dirección, y la leen los tres. La FECHA y el AUTOR los sella la base con un
  // trigger, así que lo que se mande desde aquí en esos campos es indiferente
  // (se manda igualmente para que el modo demo y un eventual service_role
  // tengan algo con qué pintar).
  //
  // Nada de esto se cachea en el contexto: la bitácora de un proyecto se pide al
  // abrir su ficha. Lo único que vive en memoria es el RESUMEN por proyecto, que
  // es una fila por proyecto y lo necesitan los dos listados de clientes.

  const NOTAS_DEMO_KEY = "pensionflow_notas";

  const notasDemoLeer = (): Record<string, ProspectNota[]> => {
    try {
      const raw = localStorage.getItem(NOTAS_DEMO_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const notasDemoGuardar = (mapa: Record<string, ProspectNota[]>): void => {
    try {
      saveToStorage(NOTAS_DEMO_KEY, mapa);
    } catch (e) {
      console.warn("No se pudieron guardar las notas del modo demo:", e);
    }
  };

  /** Resumen equivalente al de la RPC, calculado en el navegador. Solo modo demo. */
  const notasDemoResumen = (mapa: Record<string, ProspectNota[]>): Record<string, NotasResumen> => {
    const out: Record<string, NotasResumen> = {};
    Object.entries(mapa).forEach(([prospectId, notas]) => {
      if (!notas || notas.length === 0) return;
      const ordenadas = [...notas].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const dias = new Set(ordenadas.map((n) => diaLocal(n.created_at)).filter(Boolean) as string[]);
      out[prospectId] = {
        total: ordenadas.length,
        diasConNota: dias.size,
        ultimaAt: ordenadas[0].created_at,
        ultimoAutor: ordenadas[0].autor_nombre,
      };
    });
    return out;
  };

  const mapNotaFromDB = (row: any): ProspectNota => ({
    id: row.id,
    prospect_id: row.prospect_id,
    autor_id: row.autor_id ?? null,
    autor_nombre: row.autor_nombre || "Usuario",
    autor_rol: row.autor_rol || "aliado",
    texto: row.texto || "",
    created_at: row.created_at,
    edited_at: row.edited_at ?? null,
    // Sin la migración 20260826000000 la columna no existe todavía y la nota es,
    // por definición, de las escritas aquí.
    origen: row.origen === "ghl" ? "ghl" : "plataforma",
  });

  /**
   * Carga el resumen por proyecto. Silencioso a propósito: alimenta una columna
   * secundaria del listado y JAMÁS puede tumbar la carga de clientes. Si la
   * migración todavía no está aplicada en la base, la RPC no existe, se avisa por
   * consola y la columna se queda en «Sin seguimiento».
   */
  const cargarResumenNotas = async (): Promise<void> => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      setNotasResumen(notasDemoResumen(notasDemoLeer()));
      return;
    }
    try {
      const { data, error } = await supabase.rpc("notas_resumen");
      if (error) {
        console.warn("No se pudo cargar el resumen de notas de seguimiento:", error.message);
        return;
      }
      const mapa: Record<string, NotasResumen> = {};
      (data || []).forEach((r: any) => {
        mapa[r.proyecto_id] = {
          total: Number(r.total_notas) || 0,
          diasConNota: Number(r.dias_con_nota) || 0,
          ultimaAt: r.ultima_nota_at || null,
          ultimoAutor: r.ultimo_autor || null,
        };
      });
      setNotasResumen(mapa);
    } catch (e) {
      console.warn("No se pudo cargar el resumen de notas de seguimiento:", e);
    }
  };

  /**
   * Carga los sellos de cotejo con GoHighLevel. Silencioso igual que el resumen
   * de notas: alimenta un adorno del listado y jamás puede tumbar la carga de
   * clientes. Si la migración 20260826000002 no está aplicada, la tabla no
   * existe, se avisa por consola y sencillamente no se pinta ningún sello.
   */
  const cargarCotejosGhl = async (): Promise<void> => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      setCotejosGhl({});
      return;
    }
    try {
      const { data, error } = await supabase
        .from("prospect_ghl_cotejo")
        .select("prospect_id, sello, nivel, contacto_nombre, contacto_correo, contacto_telefono, cotejado_at");
      if (error) {
        console.warn("No se pudo cargar el cotejo con GoHighLevel:", error.message);
        return;
      }
      const mapa: Record<string, CotejoGhlResumen> = {};
      (data || []).forEach((r: any) => {
        mapa[r.prospect_id] = {
          sello: r.sello ?? null,
          nivel: Number(r.nivel) || 0,
          contactoNombre: r.contacto_nombre ?? null,
          contactoCorreo: r.contacto_correo ?? null,
          contactoTelefono: r.contacto_telefono ?? null,
          cotejadoAt: r.cotejado_at,
        };
      });
      setCotejosGhl(mapa);
    } catch (e) {
      console.warn("No se pudo cargar el cotejo con GoHighLevel:", e);
    }
  };

  // Se recarga al cambiar de sesión o al pasar de demo a base real. Va aparte de
  // la carga de prospectos para que un fallo aquí no arrastre al listado entero.
  useEffect(() => {
    void cargarResumenNotas();
    void cargarCotejosGhl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, isDemoMode, isProvisionalSession, user?.id]);

  const fetchProspectNotas = async (prospectId: string): Promise<ProspectNota[]> => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      const mapa = notasDemoLeer();
      return [...(mapa[prospectId] || [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    const { data, error } = await supabase
      .from("prospect_notas")
      .select("*")
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error cargando las notas de seguimiento:", error);
      throw new Error(error.message || "No se pudieron cargar las notas.");
    }
    return (data || []).map(mapNotaFromDB);
  };

  const addProspectNota = async (prospectId: string, texto: string): Promise<ProspectNota> => {
    const limpio = (texto || "").trim();
    if (!limpio) throw new Error("La nota está vacía.");
    if (limpio.length > 4000) throw new Error("La nota es demasiado larga (máximo 4000 caracteres).");

    // Adelanta el resumen del listado sin volver a preguntar a la base. El día
    // se compara con el de la última nota: si es el mismo, el proyecto no suma un
    // día de seguimiento nuevo. Es exacto porque la nota que se acaba de escribir
    // es, por definición, la más reciente.
    const sumarAlResumen = (nota: ProspectNota) => {
      setNotasResumen((prev) => {
        const antes = prev[prospectId];
        const diaNuevo = diaLocal(nota.created_at);
        const diaAnterior = antes?.ultimaAt ? diaLocal(antes.ultimaAt) : null;
        return {
          ...prev,
          [prospectId]: {
            total: (antes?.total || 0) + 1,
            diasConNota: (antes?.diasConNota || 0) + (diaNuevo && diaNuevo === diaAnterior ? 0 : 1),
            ultimaAt: nota.created_at,
            ultimoAutor: nota.autor_nombre,
          },
        };
      });
    };

    if (isDemoMode || isProvisionalSession || !supabase) {
      const nota: ProspectNota = {
        id: `nota-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        prospect_id: prospectId,
        autor_id: user?.id || null,
        autor_nombre: user?.full_name || "Usuario",
        autor_rol: user?.role || "aliado",
        // El modo demo no habla con GHL: todo lo de aquí se escribió aquí.
        origen: "plataforma",
        texto: limpio,
        created_at: new Date().toISOString(),
        edited_at: null,
      };
      const mapa = notasDemoLeer();
      mapa[prospectId] = [nota, ...(mapa[prospectId] || [])];
      notasDemoGuardar(mapa);
      sumarAlResumen(nota);
      return nota;
    }

    const { data, error } = await supabase
      .from("prospect_notas")
      .insert({
        prospect_id: prospectId,
        texto: limpio,
        // Los tres van por cortesía: el trigger los pisa con los de la sesión.
        autor_id: user?.id ?? null,
        autor_nombre: user?.full_name || "Usuario",
        autor_rol: user?.role || "aliado",
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error guardando la nota de seguimiento:", error);
      throw new Error(error.message || "No se pudo guardar la nota.");
    }

    const nota = mapNotaFromDB(data);
    sumarAlResumen(nota);
    // Escribir una nota es seguimiento: cuenta como actividad del Account Manager.
    registrarActividad("nota", "Nota de seguimiento", prospectId);
    return nota;
  };

  const updateProspectNota = async (notaId: string, texto: string): Promise<void> => {
    const limpio = (texto || "").trim();
    if (!limpio) throw new Error("La nota está vacía.");
    if (limpio.length > 4000) throw new Error("La nota es demasiado larga (máximo 4000 caracteres).");

    if (isDemoMode || isProvisionalSession || !supabase) {
      const mapa = notasDemoLeer();
      Object.keys(mapa).forEach((pid) => {
        mapa[pid] = (mapa[pid] || []).map((n) =>
          n.id === notaId ? { ...n, texto: limpio, edited_at: new Date().toISOString() } : n
        );
      });
      notasDemoGuardar(mapa);
      return;
    }

    // Solo se manda el texto: el resto de columnas las protege el trigger
    // `protege_nota_editada`, y la RLS ya impide tocar la nota de otro.
    const { error } = await supabase.from("prospect_notas").update({ texto: limpio }).eq("id", notaId);
    if (error) {
      console.error("Error corrigiendo la nota de seguimiento:", error);
      throw new Error(error.message || "No se pudo corregir la nota.");
    }
  };

  const deleteProspectNota = async (notaId: string, prospectId: string): Promise<void> => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      const mapa = notasDemoLeer();
      mapa[prospectId] = (mapa[prospectId] || []).filter((n) => n.id !== notaId);
      if (mapa[prospectId].length === 0) delete mapa[prospectId];
      notasDemoGuardar(mapa);
      setNotasResumen(notasDemoResumen(mapa));
      return;
    }

    const { error } = await supabase.from("prospect_notas").delete().eq("id", notaId);
    if (error) {
      console.error("Error borrando la nota de seguimiento:", error);
      throw new Error(error.message || "No se pudo borrar la nota.");
    }
    // Al borrar no se puede recalcular el resumen de cabeza (habría que saber si
    // la nota era la única de su día), así que se vuelve a pedir agregado. Es una
    // llamada suelta y solo ocurre al borrar, que es raro.
    void cargarResumenNotas();
  };

  const login = async (email: string, role: UserRole, password?: string): Promise<UserRole | null> => {
    setIsLoading(true);
    if (isDemoMode || !supabase) {
      const storedProfiles = localStorage.getItem("pensionflow_profiles");
      const parsedProfiles: UserProfile[] = storedProfiles ? JSON.parse(storedProfiles) : INITIAL_PROFILES;
      
      const profile = parsedProfiles.find((p) => p.email === email && p.role === role) || {
        id: `user-${Math.random().toString(36).substr(2, 9)}`,
        full_name:
          role === "aliado"
            ? "Aliado Comercial"
            : role === "account_manager"
              ? "Account Manager"
              : role === "closer"
                ? "Closer Comercial"
                : role === "finanzas"
                  ? "Finanzas"
                  : "Director Operaciones",
        email,
        phone: "5500000000",
        role,
        created_at: new Date().toISOString(),
      };

      setUser(profile);
      setActiveRole(role);
      saveToStorage("pensionflow_user", profile);
      saveToStorage("pensionflow_active_role", role);
      setIsLoading(false);
      return profile.role;
    } else {
      try {
        let profile: UserProfile | null = null;
        
        // 1. Pre-cargar el perfil de la base de datos para la validación de contraseña provisional
        let dbProfileData: any = null;
        let authUser: any = null;
        try {
          const { data, error } = await supabase.from("profiles").select("*").eq("email", email.toLowerCase()).maybeSingle();
          if (!error && data) {
            dbProfileData = data;
          }
        } catch (e) {
          console.warn("No se pudo pre-cargar el perfil para contraseña provisional:", e);
        }

        const isProvisionalMatch = dbProfileData && 
                                   dbProfileData.password_provisional && 
                                   password && 
                                   dbProfileData.password_provisional === password;

        if (password) {
          let authSessionError = false;

          try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
            
            if (authError) {
              if (isProvisionalMatch) {
                console.warn("Supabase Auth login failed, but provisional password matched. Bypassing Auth...", authError);
                authSessionError = true;
              } else {
                throw authError;
              }
            } else {
              authUser = authData.user;
            }
          } catch (err) {
            if (!isProvisionalMatch) {
              throw err;
            }
            authSessionError = true;
          }
          
          if (authUser) {
            // Se eliminó la comprobación obligatoria de email_confirmed_at
            profile = await ensureProfileExists(supabase, authUser);
          } else if (isProvisionalMatch && dbProfileData) {
            // Bypass completo con el perfil de base de datos
            profile = mapProfileFromDB(dbProfileData);
          } else {
            throw new Error("No se pudo iniciar sesión en el sistema.");
          }
        } else {
          if (!dbProfileData) {
            throw new Error("No se encontró el perfil de usuario en Supabase.");
          }
          profile = mapProfileFromDB(dbProfileData);
        }

        if (profile) {
          const activeProfile = profile;
          // Strict role matching check
          if (activeProfile.role !== role) {
            await supabase.auth.signOut();
            throw new Error("Acceso Inválido: Tu cuenta no tiene permisos para acceder con este rol.");
          }

          setUser(activeProfile);
          setActiveRole(profile.role);
          saveToStorage("pensionflow_user", profile);
          saveToStorage("pensionflow_active_role", profile.role);
          
          const isProvisional = !authUser && !!profile.password_provisional;
          setIsProvisionalSession(isProvisional);

          if (isProvisional) {
            setProfiles([profile]);

            const storedProspects = localStorage.getItem("pensionflow_prospects");
            if (storedProspects) {
              try {
                setProspects(JSON.parse(storedProspects));
              } catch (e) {
                setProspects([]);
              }
            } else {
              setProspects([]);
            }

            const storedCodes = localStorage.getItem("pensionflow_invitation_codes");
            if (storedCodes) {
              try {
                setInvitationCodes(JSON.parse(storedCodes));
              } catch (e) {
                setInvitationCodes([]);
              }
            } else {
              setInvitationCodes([]);
            }

            const storedNotifs = localStorage.getItem("pensionflow_notifications");
            if (storedNotifs) {
              try {
                setNotifications(JSON.parse(storedNotifs));
              } catch (e) {
                setNotifications([]);
              }
            } else {
              setNotifications([]);
            }
          } else {
            // Reload all user data (profiles, invitation codes, prospects, notifications)
            const { data: dbProfiles, error: profilesError } = await supabase.from("profiles").select("*");
            if (profilesError) {
              console.error("Error fetching profiles on login:", profilesError);
            }
            const { data: dbLiderAliados } = await supabase.from("lider_aliados").select("*");
            const mappedProfiles = dbProfiles ? dbProfiles.map((dbP: any) => {
              const mapped = mapProfileFromDB(dbP);
              const rels = dbLiderAliados?.filter((r: any) => r.aliado_asignado_id === mapped.id) || [];
              mapped.lider_ids = rels.map((r: any) => r.lider_id);
              mapped.lider_aliado_rels = rels.map((r: any) => ({ id: r.id, lider_id: r.lider_id }));
              if (rels.length > 0) {
                mapped.lider_id = rels[0].lider_id;
                mapped.lider_aliado_rel_id = rels[0].id;
              } else {
                mapped.lider_id = null;
                mapped.lider_aliado_rel_id = null;
              }
              return mapped;
            }) : [];
            setProfiles(mappedProfiles);

            if (profile) {
              const matched = mappedProfiles.find((p: any) => p.id === activeProfile.id);
              if (matched) {
                profile = matched;
                setUser(matched);
              }
            }

            if (activeProfile) {
              // Fetch prospects (filtered by role if user is aliado or account_manager)
              let prospectsQuery = supabase.from("prospects").select("*, documents(*)");
              if (activeProfile.role === "aliado") {
                if (activeProfile.aliado_tipo === "lider") {
                  const assignedAllyIds = mappedProfiles
                    .filter((p: any) => p.role === "aliado" && p.lider_ids?.includes(activeProfile.id))
                    .map((p: any) => p.id);
                  const allAllyIds = [activeProfile.id, ...assignedAllyIds];

                  if (activeProfile.empresa_multialiado_id) {
                    const allyIdsString = allAllyIds.map(id => `aliado_id.eq.${id}`).join(",");
                    prospectsQuery = prospectsQuery.or(`empresa_multialiado_id.eq.${activeProfile.empresa_multialiado_id},${allyIdsString}`);
                  } else if (assignedAllyIds.length > 0) {
                    prospectsQuery = prospectsQuery.in("aliado_id", allAllyIds);
                  } else {
                    prospectsQuery = prospectsQuery.eq("aliado_id", activeProfile.id);
                  }
                } else {
                  prospectsQuery = prospectsQuery.eq("aliado_id", activeProfile.id);
                }
              } else if (activeProfile.role === "account_manager") {
                // El AM trabaja POR PROYECTO: ve los prospects que tienen su id
                // como account_manager_id (ya no la cartera de aliados).
                prospectsQuery = prospectsQuery.eq("account_manager_id", activeProfile.id);
              } else if (activeProfile.role === "closer") {
                // Un closer no lee expedientes. Se acota a nada para no gastar un
                // viaje de red que el RLS devolvería vacío de todas formas.
                prospectsQuery = prospectsQuery.eq("aliado_id", "00000000-0000-0000-0000-000000000000");
              }
              const { data: dbProspects, error: prospectsError } = await prospectsQuery.order("created_at", { ascending: false });
              if (prospectsError) {
                console.error("Error fetching prospects on login:", prospectsError);
              }
              if (dbProspects) {
                setProspects(dbProspects.map(transformProspectFromDB));
              }

              // Fetch invitation codes
              const { data: dbCodes, error: codesError } = await supabase.from("invitation_codes").select("*");
              if (codesError) {
                console.error("Error fetching codes on login:", codesError);
              }
              if (dbCodes) {
                setInvitationCodes(dbCodes.map((c: any) => {
                  const userWhoUsedIt = mappedProfiles.find((p: any) => p.invitation_code_used === c.code);
                  return {
                    id: c.id,
                    code: c.code,
                    created_by: c.created_by,
                    is_used: c.is_used || !!userWhoUsedIt,
                    used_by: c.used_by || userWhoUsedIt?.id,
                    created_at: c.created_at
                  };
                }));
              }

              // Fetch notifications
              const { data: dbNotifs } = await supabase
                .from("notifications")
                .select("*")
                .eq("user_id", activeProfile.id)
                .order("created_at", { ascending: false });
              if (dbNotifs) {
                setNotifications(dbNotifs.map((n: any) => ({
                  id: n.id,
                  title: n.title,
                  message: n.message,
                  type: n.type as any,
                  read: n.read,
                  created_at: n.created_at
                })));
              }
            }
          }
          setIsLoading(false);
          return activeProfile ? activeProfile.role : null;
        }

        setIsLoading(false);
        return null;
      } catch (error: any) {
        console.error("Supabase login error:", error);
        setIsLoading(false);
        throw error;
      }
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("pensionflow_user");
    // El recordatorio de datos de cobro insiste durante toda la sesión con una
    // pausa de por medio. Al cerrar sesión se borra la pausa para que el aviso
    // salga de inmediato al volver a entrar.
    try {
      sessionStorage.removeItem("pensionflow_banking_reminder_snooze");
    } catch {}
    if (supabase) {
      supabase.auth.signOut();
    }
  };

  const switchRole = (role: UserRole) => {
    setActiveRole(role);
    localStorage.setItem("pensionflow_active_role", role);
    if (isDemoMode) {
      const storedProfiles = localStorage.getItem("pensionflow_profiles");
      const parsedProfiles: UserProfile[] = storedProfiles ? JSON.parse(storedProfiles) : INITIAL_PROFILES;
      const defaultProfile = parsedProfiles.find((p) => p.role === role);
      if (defaultProfile) {
        setUser(defaultProfile);
        saveToStorage("pensionflow_user", defaultProfile);
      }
    }
  };

  const addProspect = async (
    prospectData: Omit<
      Prospect,
      "id" | "aliado_id" | "status" | "created_at" | "updated_at" | "documents" | "simulation"
    > & {
      simulation?: Simulation;
      google_drive_folder?: string;
      google_drive_url?: string;
      assignToAliadoId?: string | null;
    },
    aforeFile?: string | { name: string; dataUrl: string },
    imssFile?: string | { name: string; dataUrl: string }
  ): Promise<Prospect> => {
    // Tipos de documento del expediente según el tipo de financiamiento.
    // `ocrSlot` = documento con OCR (imssFile); `secondSlot` = documento de apoyo (aforeFile).
    const [ocrSlot, secondSlot] = getExpedienteDocSlots(prospectData.tipo_financiamiento);
    const tipoLabel = getTipoFinanciamientoLabel(prospectData.tipo_financiamiento);

    // Asignación directa al crear: Dirección/AM pueden elegir a qué aliado queda
    // asignado el proyecto. Si no se envía, el dueño es quien lo captura.
    const { assignToAliadoId, ...cleanProspectData } = prospectData;
    const assignId = assignToAliadoId || null;
    const assignedProfile = assignId ? profiles.find((p) => p.id === assignId) : null;

    let driveFolderId = "";
    let driveFolderUrl = "";
    try {
      const driveRes = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createFolder",
          clientName: prospectData.full_name,
          nss: prospectData.nss,
        }),
      });
      const driveData = await driveRes.json();
      if (driveData.success) {
        driveFolderId = driveData.folderId;
        driveFolderUrl = driveData.folderUrl;
      }
    } catch (err) {
      console.error("Error creating Google Drive folder:", err);
      driveFolderId = `sim-folder-${Math.random().toString(36).substring(2, 11)}`;
      driveFolderUrl = `https://drive.google.com/drive/folders/${driveFolderId}?usp=sharing`;
    }

    const uploadToDrive = async (fileName: string, fileDataUrl: string) => {
      try {
        const res = await fetch("/api/drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "uploadFile",
            folderId: driveFolderId,
            fileName,
            fileDataUrl,
          }),
        });
        const data = await res.json();
        if (data.success) {
          return { id: data.fileId, url: data.fileUrl };
        }
      } catch (e) {
        console.error("Error uploading to Drive API:", e);
      }
      const fakeId = `sim-file-${Math.random().toString(36).substring(2, 11)}`;
      return { id: fakeId, url: `https://drive.google.com/open?id=${fakeId}` };
    };

    if (isDemoMode || isProvisionalSession || !supabase) {
      const newId = `prospect-${Math.random().toString(36).substr(2, 9)}`;
      const docs: DocumentItem[] = [];
      const aforeName = typeof aforeFile === "string" ? aforeFile : aforeFile?.name;
      const aforeDataUrl = typeof aforeFile === "string" ? undefined : aforeFile?.dataUrl;
      const imssName = typeof imssFile === "string" ? imssFile : imssFile?.name;
      const imssDataUrl = typeof imssFile === "string" ? undefined : imssFile?.dataUrl;

      if (aforeName && aforeDataUrl) {
        const docId = generateUUID();
        const driveFile = await uploadToDrive(aforeName, aforeDataUrl);
        docs.push({
          id: docId,
          prospect_id: newId,
          file_name: aforeName,
          file_url: driveFile.url,
          file_type: secondSlot.fileType,
          uploaded_at: new Date().toISOString(),
          drive_file_id: driveFile.id,
          drive_file_url: driveFile.url,
          drive_folder_id: driveFolderId,
          uploaded_by: user?.id || "aliado-123",
        });
        await saveFile(docId, aforeDataUrl);
      }
      if (imssName && imssDataUrl) {
        const docId = generateUUID();
        const driveFile = await uploadToDrive(imssName, imssDataUrl);
        docs.push({
          id: docId,
          prospect_id: newId,
          file_name: imssName,
          file_url: driveFile.url,
          file_type: ocrSlot.fileType,
          uploaded_at: new Date().toISOString(),
          drive_file_id: driveFile.id,
          drive_file_url: driveFile.url,
          drive_folder_id: driveFolderId,
          uploaded_by: user?.id || "aliado-123",
        });
        await saveFile(docId, imssDataUrl);
      }

      // Dueño del proyecto: el aliado asignado si Dirección/AM lo eligió; si no,
      // quien captura. El documento conserva `uploaded_by` = quien captura.
      const creatorId = user?.id || "aliado-123";
      const ownerId = assignedProfile?.id || creatorId;
      const ownerName = assignedProfile?.full_name || user?.full_name || "Roberto Asesor";
      const ownerEmpresa = assignedProfile
        ? assignedProfile.empresa_multialiado_id || null
        : user?.empresa_multialiado_id || null;

      // Account Manager del PROYECTO (espejo del trigger `assign_am_to_prospect`,
      // 20260904000000): aliado capturando lo suyo → el AM de SU cartera, y solo
      // si no tiene, la ruleta; un AM captura → el proyecto es suyo; Dirección
      // captura → sin AM (gestión directa).
      let projectAmId: string | null = null;
      if (user?.role === "aliado" && ownerId === creatorId) {
        const suAm = profiles.find((p) => p.id === user.account_manager_id && p.role === "account_manager");
        projectAmId = suAm ? suAm.id : pickRandomAutoAssignAM(profiles);
      } else if (user?.role === "account_manager") {
        projectAmId = user.id;
      }

      const newProspect: Prospect = {
        ...cleanProspectData,
        id: newId,
        aliado_id: ownerId,
        aliado_name: ownerName,
        empresa_multialiado_id: ownerEmpresa,
        account_manager_id: projectAmId,
        // Espejo del trigger `set_prospect_creator`: la autoría es de quien
        // captura, con el rol que trae puesto en ese momento.
        created_by: creatorId,
        created_by_role: user?.role || null,
        created_by_name: user?.full_name || null,
        status: "evaluacion_pendiente",
        documents: docs,
        google_drive_folder: driveFolderId,
        google_drive_url: driveFolderUrl,
        drive_folder_id: driveFolderId,
        drive_folder_url: driveFolderUrl,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updated = [newProspect, ...prospects];
      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);

      const newNotif: NotificationItem = {
        id: `notif-${Math.random().toString(36).substr(2, 9)}`,
        title: "Nuevo Prospecto Capturado",
        message: `El aliado ${newProspect.aliado_name} registró a ${newProspect.full_name} (${tipoLabel}) para evaluación Ley 73.`,
        type: "info",
        read: false,
        created_at: new Date().toISOString(),
      };
      const notifBatch = [newNotif];
      // Aviso al aliado cuando Dirección/AM le asignó el proyecto al crearlo.
      if (assignedProfile && assignedProfile.id !== creatorId) {
        notifBatch.unshift({
          id: `notif-${Math.random().toString(36).substr(2, 9)}`,
          title: "Proyecto Asignado 📁",
          message: `Se te asignó el proyecto de ${newProspect.full_name}.`,
          type: "info",
          read: false,
          created_at: new Date().toISOString(),
        });
      }
      // Aviso al aliado que capturó SU PROPIO proyecto: qué Account Manager lo
      // atenderá —el de su cartera, o el que le sorteó la ruleta si no tiene—
      // (caso complementario al de "Proyecto Asignado 📁"). En producción esta
      // notificación la emite el trigger `notify_on_prospect_insert`.
      if (user?.role === "aliado" && ownerId === creatorId && newProspect.account_manager_id) {
        const amName = profiles.find((p) => p.id === newProspect.account_manager_id)?.full_name || "tu Account Manager";
        notifBatch.unshift({
          id: `notif-${Math.random().toString(36).substr(2, 9)}`,
          title: "Account Manager asignado 👤",
          message: `Tu proyecto de ${newProspect.full_name} será atendido por ${amName}.`,
          type: "info",
          read: false,
          created_at: new Date().toISOString(),
        });
      }
      setNotifications([...notifBatch, ...notifications]);
      saveToStorage("pensionflow_notifications", [...notifBatch, ...notifications]);

      triggerPushNotification(
        `🔔 Nuevo prospecto (${tipoLabel}): ${newProspect.full_name} ha sido subido por Roberto Asesor. CURP: ${newProspect.curp}. Revisa en tu panel técnico.`,
        "whatsapp",
        "Eduardo Director"
      );

      return newProspect;
    } else {
      try {
        // Quien captura el prospecto (para `uploaded_by` y como dueño por defecto).
        let creatorId: string | undefined = undefined;
        let creatorName: string | undefined = undefined;
        let creatorEmpresa: string | null = null;

        if (supabase) {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            creatorId = authUser.id;
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, empresa_multialiado_id")
              .eq("id", authUser.id)
              .maybeSingle();
            if (profile) {
              creatorName = profile.full_name;
              creatorEmpresa = profile.empresa_multialiado_id;
            } else {
              creatorName = user?.full_name;
              creatorEmpresa = user?.empresa_multialiado_id || null;
            }
          }
        }

        if (!creatorId) {
          creatorId = user?.id;
          creatorName = user?.full_name;
          creatorEmpresa = user?.empresa_multialiado_id || null;
        }

        if (!creatorId) {
          throw new Error("No hay una sesión activa de Supabase o su sesión ha expirado. Por favor, inicia sesión de nuevo.");
        }

        // Dueño del proyecto: el aliado asignado por Dirección/AM al crearlo o, si
        // no se eligió a nadie, quien lo captura. `uploaded_by` de los documentos
        // siempre queda como el creador.
        let finalAliadoId = creatorId;
        let finalAliadoName = creatorName;
        let finalEmpresaId = creatorEmpresa;

        if (assignId && assignId !== creatorId) {
          finalAliadoId = assignId;
          if (assignedProfile) {
            finalAliadoName = assignedProfile.full_name;
            finalEmpresaId = assignedProfile.empresa_multialiado_id || null;
          } else {
            const { data: aProfile } = await supabase
              .from("profiles")
              .select("full_name, empresa_multialiado_id")
              .eq("id", assignId)
              .maybeSingle();
            finalAliadoName = aProfile?.full_name || finalAliadoName;
            finalEmpresaId = aProfile?.empresa_multialiado_id ?? null;
          }
        }

        const { data: dbProspect, error: prospectError } = await supabase
          .from("prospects")
          .insert({
            aliado_id: finalAliadoId,
            aliado_name: finalAliadoName || "Roberto Asesor",
            empresa_multialiado_id: finalEmpresaId,
            full_name: prospectData.full_name,
            nss: prospectData.nss,
            curp: prospectData.curp,
            phone: prospectData.phone,
            email: prospectData.email,
            notes_aliado: prospectData.notes_aliado,
            tipo_financiamiento: prospectData.tipo_financiamiento || null,
            status: "evaluacion_pendiente",
            drive_folder_id: driveFolderId,
            drive_folder_url: driveFolderUrl,
            sim_semanas: prospectData.simulation?.semanas,
            sim_pension_actual: prospectData.simulation?.pensionActual,
            sim_pension_mejorada: prospectData.simulation?.pensionMejorada,
            sim_financiamiento: prospectData.simulation?.financiamiento,
            sim_costo_gestion: prospectData.simulation?.costoGestion,
            sim_comments: prospectData.simulation?.comments,
            afore_pensionarse: prospectData.simulation?.aforePensionarse,
            aportacion: prospectData.simulation?.aportacion,
            credito_nomina: prospectData.simulation?.creditoNomina,
          })
          .select()
          .single();

        if (prospectError) throw prospectError;

        const docsList: any[] = [];
        const aforeName = typeof aforeFile === "string" ? aforeFile : aforeFile?.name;
        const aforeDataUrl = typeof aforeFile === "string" ? undefined : aforeFile?.dataUrl;
        const imssName = typeof imssFile === "string" ? imssFile : imssFile?.name;
        const imssDataUrl = typeof imssFile === "string" ? undefined : imssFile?.dataUrl;

        if (aforeName && aforeDataUrl) {
          const docId = generateUUID();
          const driveFile = await uploadToDrive(aforeName, aforeDataUrl);
          
          const { data: dbDoc } = await supabase
            .from("documents")
            .insert({
              id: docId,
              prospect_id: dbProspect.id,
              file_name: aforeName,
              file_url: driveFile.url,
              file_type: secondSlot.fileType,
              drive_file_id: driveFile.id,
              drive_file_url: driveFile.url,
              drive_folder_id: driveFolderId,
              uploaded_by: creatorId,
            })
            .select()
            .single();

          if (dbDoc) docsList.push(dbDoc);
          await saveFile(docId, aforeDataUrl);
        }

        if (imssName && imssDataUrl) {
          const docId = generateUUID();
          const driveFile = await uploadToDrive(imssName, imssDataUrl);
          
          const { data: dbDoc } = await supabase
            .from("documents")
            .insert({
              id: docId,
              prospect_id: dbProspect.id,
              file_name: imssName,
              file_url: driveFile.url,
              file_type: ocrSlot.fileType,
              drive_file_id: driveFile.id,
              drive_file_url: driveFile.url,
              drive_folder_id: driveFolderId,
              uploaded_by: creatorId,
            })
            .select()
            .single();

          if (dbDoc) docsList.push(dbDoc);
          await saveFile(docId, imssDataUrl);
        }

        const newProspect = transformProspectFromDB({
          ...dbProspect,
          documents: docsList,
        });

        setProspects((prev) => [newProspect, ...prev]);

        const directors = profiles.filter(p => p.role === "director");
        for (const dir of directors) {
          await supabase.from("notifications").insert({
            user_id: dir.id,
            title: "Nuevo Prospecto Capturado",
            message: `El aliado ${newProspect.aliado_name} registró a ${newProspect.full_name} (${tipoLabel}) para evaluación Ley 73.`,
            type: "info",
            read: false,
          });
        }

        // Aviso al aliado cuando la DIRECCIÓN le asignó el proyecto al crearlo.
        // (La RLS de notifications solo permite INSERT a admin/director; cuando el
        // creador es un AM este insert falla en silencio y el aviso equivalente lo
        // emite el trigger `notify_on_prospect_insert` de la BD.)
        if (assignId && assignId !== creatorId) {
          await supabase.from("notifications").insert({
            user_id: assignId,
            title: "Proyecto Asignado 📁",
            message: `Se te asignó el proyecto de ${newProspect.full_name}.`,
            type: "info",
            read: false,
          });
        }

        // Aviso "Account Manager asignado 👤" al aliado que capturó lo suyo y aviso
        // al AM sorteado: los emite la BD (trigger `notify_on_prospect_insert`,
        // SECURITY DEFINER) porque la RLS de notifications bloquea el insert del
        // aliado. El AM del proyecto ya viene en newProspect.account_manager_id
        // (lo fijó el trigger BEFORE INSERT `assign_am_to_prospect`).

        triggerPushNotification(
          `🔔 Nuevo prospecto (${tipoLabel}): ${newProspect.full_name} ha sido subido por Roberto Asesor. CURP: ${newProspect.curp}. Revisa en tu panel técnico.`,
          "whatsapp",
          "Eduardo Director"
        );

        registrarActividad("crea_proyecto", newProspect.full_name, newProspect.id);

        return newProspect;
      } catch (error) {
        console.error("Error adding prospect to Supabase:", error);
        throw error;
      }
    }
  };

  const checkCurpExists = async (curpToCheck: string): Promise<boolean> => {
    const cleanCurp = curpToCheck.trim().toUpperCase();
    if (!cleanCurp) return false;

    if (isDemoMode || isProvisionalSession || !supabase) {
      const storedProspects = localStorage.getItem("pensionflow_prospects");
      let allProspects: Prospect[] = [];
      if (storedProspects) {
        try {
          allProspects = JSON.parse(storedProspects);
        } catch (e) {
          allProspects = prospects;
        }
      } else {
        allProspects = prospects;
      }
      return allProspects.some(
        (p) =>
          p.curp.toUpperCase() === cleanCurp &&
          !p.notes_director?.startsWith("[DELETED:") &&
          !p.notes_director?.startsWith("[PURGED:")
      );
    } else {
      try {
        const { data, error } = await supabase.rpc("check_curp_exists", {
          target_curp: cleanCurp
        });
        if (error) {
          console.warn("Error calling RPC check_curp_exists, falling back to query:", error);
          const { data: tableData } = await supabase
            .from("prospects")
            .select("id, notes_director")
            .eq("curp", cleanCurp);

          if (tableData && tableData.length > 0) {
            return tableData.some(
              (p: any) =>
                !p.notes_director?.startsWith("[DELETED:") &&
                !p.notes_director?.startsWith("[PURGED:")
            );
          }
          return false;
        }
        return !!data;
      } catch (err) {
        console.error("Error checking CURP uniqueness:", err);
        return false;
      }
    }
  };

  // Alerta de cliente duplicado entre aliados del mismo equipo (PAL-003):
  // devuelve al compañero que comparte líder y empresa y que ya tiene registrado
  // al cliente (coincidencia por CURP o por NSS), o null si no hay duplicado.
  const checkTeamDuplicate = async (
    curpToCheck: string,
    nssToCheck: string
  ): Promise<TeamDuplicate | null> => {
    const cleanCurp = (curpToCheck || "").trim().toUpperCase();
    const cleanNss = (nssToCheck || "").trim();
    if (!cleanCurp && !cleanNss) return null;

    // El concepto de "equipo" solo aplica dentro de una empresa multialiado.
    if (!user?.empresa_multialiado_id) return null;

    if (isDemoMode || isProvisionalSession || !supabase) {
      const storedProspects = localStorage.getItem("pensionflow_prospects");
      let allProspects: Prospect[] = [];
      if (storedProspects) {
        try {
          allProspects = JSON.parse(storedProspects);
        } catch (e) {
          allProspects = prospects;
        }
      } else {
        allProspects = prospects;
      }

      for (const p of allProspects) {
        if (p.aliado_id === user.id) continue;
        if (p.empresa_multialiado_id !== user.empresa_multialiado_id) continue;
        if (p.notes_director?.startsWith("[DELETED:") || p.notes_director?.startsWith("[PURGED:")) continue;

        const curpMatch = !!cleanCurp && p.curp?.toUpperCase() === cleanCurp;
        const nssMatch = !!cleanNss && p.nss === cleanNss;
        if (!curpMatch && !nssMatch) continue;

        const owner = profiles.find((prof) => prof.id === p.aliado_id);
        return {
          aliadoName: p.aliado_name || owner?.full_name || "otro aliado",
          fullName: p.full_name,
          matchedBy: curpMatch && nssMatch ? "ambos" : curpMatch ? "curp" : "nss",
        };
      }
      return null;
    }

    try {
      const { data, error } = await supabase.rpc("check_team_duplicate", {
        target_curp: cleanCurp,
        target_nss: cleanNss,
      });
      if (error) {
        console.warn("Error calling RPC check_team_duplicate:", error);
        return null;
      }
      if (!data) return null;
      return {
        aliadoName: data.aliado_name || "otro aliado",
        fullName: data.full_name || "",
        matchedBy: data.matched_by || "curp",
      };
    } catch (err) {
      console.error("Error checking team duplicate:", err);
      return null;
    }
  };

  const deleteProspect = async (id: string): Promise<void> => {
    const target = prospects.find((p) => p.id === id);
    if (!target) return;

    const deletionMarker = `[DELETED:${new Date().toISOString()}]`;
    const updatedNotes = `${deletionMarker}${target.notes_director || ""}`;

    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            notes_director: updatedNotes,
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      });
      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);

      const newNotif: NotificationItem = {
        id: `notif-${Math.random().toString(36).substr(2, 9)}`,
        title: "Prospecto a la Papelera",
        message: `El expediente de ${target.full_name} fue enviado a la papelera por 7 días.`,
        type: "warning",
        read: false,
        created_at: new Date().toISOString(),
      };
      setNotifications([newNotif, ...notifications]);
      saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);
    } else {
      try {
        const { error } = await supabase
          .from("prospects")
          .update({
            notes_director: updatedNotes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        
        if (error) throw error;

        setProspects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, notes_director: updatedNotes, updated_at: new Date().toISOString() } : p))
        );

        registrarActividad("papelera", target.full_name, id);

        await supabase.from("notifications").insert({
          user_id: user?.id,
          title: "Prospecto a la Papelera",
          message: `El expediente de ${target.full_name} fue enviado a la papelera por 7 días.`,
          type: "warning",
          read: false,
        });
      } catch (error) {
        console.error("Error soft-deleting prospect from Supabase:", error);
        throw error;
      }
    }
  };

  const restoreProspect = async (id: string): Promise<void> => {
    const target = prospects.find((p) => p.id === id);
    if (!target) return;

    let cleanNotes = target.notes_director || "";
    if (cleanNotes.startsWith("[DELETED:")) {
      const closingBracketIndex = cleanNotes.indexOf("]");
      if (closingBracketIndex !== -1) {
        cleanNotes = cleanNotes.substring(closingBracketIndex + 1);
      }
    }

    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            notes_director: cleanNotes,
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      });
      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);

      const newNotif: NotificationItem = {
        id: `notif-${Math.random().toString(36).substr(2, 9)}`,
        title: "Prospecto Restaurado",
        message: `El expediente de ${target.full_name} fue restaurado al pipeline activo.`,
        type: "success",
        read: false,
        created_at: new Date().toISOString(),
      };
      setNotifications([newNotif, ...notifications]);
      saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);
    } else {
      try {
        const { error } = await supabase
          .from("prospects")
          .update({
            notes_director: cleanNotes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        
        if (error) throw error;

        setProspects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, notes_director: cleanNotes, updated_at: new Date().toISOString() } : p))
        );

        await supabase.from("notifications").insert({
          user_id: user?.id,
          title: "Prospecto Restaurado",
          message: `El expediente de ${target.full_name} fue restaurado al pipeline activo.`,
          type: "success",
          read: false,
        });
      } catch (error) {
        console.error("Error restoring prospect:", error);
        throw error;
      }
    }
  };

  const permanentlyDeleteProspect = async (id: string): Promise<void> => {
    const target = prospects.find((p) => p.id === id);
    if (!target) return;

    const driveFolderId = target?.drive_folder_id || target?.google_drive_folder;
    if (driveFolderId) {
      try {
        await fetch("/api/drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deleteFile",
            fileId: driveFolderId,
          }),
        });
      } catch (err) {
        console.error("Error deleting Google Drive folder during permanent deletion:", err);
      }
    }

    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.filter((p) => p.id !== id);
      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);

      const newNotif: NotificationItem = {
        id: `notif-${Math.random().toString(36).substr(2, 9)}`,
        title: "Expediente Eliminado Permanentemente",
        message: `El expediente de ${target.full_name} ha sido borrado del sistema definitivamente.`,
        type: "warning",
        read: false,
        created_at: new Date().toISOString(),
      };
      setNotifications([newNotif, ...notifications]);
      saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);
    } else {
      try {
        const { error: deleteError } = await supabase.from("prospects").delete().eq("id", id);
        
        if (deleteError) {
          console.warn("Physical delete failed (expected if you are an Ally due to RLS). Falling back to [PURGED] status update:", deleteError);
          const purgedMarker = `[PURGED:${new Date().toISOString()}]`;
          const updatedNotes = `${purgedMarker}${target.notes_director || ""}`;
          
          const { error: updateError } = await supabase
            .from("prospects")
            .update({
              notes_director: updatedNotes,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);
            
          if (updateError) throw updateError;
          
          setProspects((prev) => prev.map((p) => p.id === id ? { ...p, notes_director: updatedNotes, updated_at: new Date().toISOString() } : p));
        } else {
          setProspects((prev) => prev.filter((p) => p.id !== id));
        }

        await supabase.from("notifications").insert({
          user_id: user?.id,
          title: "Expediente Eliminado Permanentemente",
          message: `El expediente de ${target.full_name} ha sido borrado definitivamente.`,
          type: "warning",
          read: false,
        });
      } catch (error) {
        console.error("Error permanently deleting prospect:", error);
        throw error;
      }
    }
  };

  const editProspectPersonalData = async (
    id: string,
    updates: {
      full_name: string;
      nss: string;
      curp: string;
      phone: string;
      email: string;
    }
  ): Promise<void> => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            ...updates,
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      });
      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);
    } else {
      try {
        const { error } = await supabase
          .from("prospects")
          .update({
            full_name: updates.full_name,
            nss: updates.nss,
            curp: updates.curp,
            phone: updates.phone,
            email: updates.email,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) throw error;

        setProspects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p))
        );

        registrarActividad("edita_cliente", updates.full_name, id);
      } catch (err) {
        console.error("Error editing prospect personal data:", err);
        throw err;
      }
    }
  };

  // Reasigna un proyecto a otro aliado. Disponible para director y account manager
  // en Gestión de Clientes. Actualiza aliado_id + aliado_name y hereda la empresa
  // multialiado del nuevo aliado. Notifica al aliado receptor.
  const reassignProspect = async (id: string, newAliadoId: string): Promise<void> => {
    const target = prospects.find((p) => p.id === id);
    const newAliado = profiles.find((p) => p.id === newAliadoId);
    if (!newAliado) throw new Error("El aliado destino no existe.");
    if (target && target.aliado_id === newAliadoId) return; // sin cambios

    const newEmpresaId = newAliado.empresa_multialiado_id || null;
    const patch = {
      aliado_id: newAliadoId,
      aliado_name: newAliado.full_name,
      empresa_multialiado_id: newEmpresaId,
      updated_at: new Date().toISOString(),
    };

    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) => (p.id === id ? { ...p, ...patch } : p));
      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);

      if (target) {
        const newNotif: NotificationItem = {
          id: `notif-${Math.random().toString(36).substr(2, 9)}`,
          title: "Proyecto Asignado 📁",
          message: `Se te asignó el proyecto de ${target.full_name}.`,
          type: "info",
          read: false,
          created_at: new Date().toISOString(),
        };
        setNotifications([newNotif, ...notifications]);
        saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);
      }
      return;
    }

    try {
      const { error } = await supabase.from("prospects").update(patch).eq("id", id);
      if (error) throw error;

      setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

      registrarActividad("reasigna", `Aliado → ${newAliado.full_name}`, id);

      if (target) {
        await supabase.from("notifications").insert({
          user_id: newAliadoId,
          title: "Proyecto Asignado 📁",
          message: `Se te asignó el proyecto de ${target.full_name}.`,
          type: "info",
          read: false,
        });
      }
    } catch (err) {
      console.error("Error reassigning prospect:", err);
      throw err;
    }
  };

  // Reasigna (o quita) el Account Manager de un PROYECTO. El AM va por proyecto
  // (prospects.account_manager_id), no por aliado. `newAmId` = null → sin AM.
  const reassignAccountManager = async (id: string, newAmId: string | null): Promise<void> => {
    const target = prospects.find((p) => p.id === id);
    if (!target) return;
    if ((target.account_manager_id || null) === (newAmId || null)) return; // sin cambios

    const newAm = newAmId ? profiles.find((p) => p.id === newAmId) : null;
    if (newAmId && !newAm) throw new Error("El Account Manager destino no existe.");

    const patch = {
      account_manager_id: newAmId || null,
      updated_at: new Date().toISOString(),
    };

    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) => (p.id === id ? { ...p, ...patch } : p));
      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);
      return;
    }

    try {
      const { error } = await supabase.from("prospects").update(patch).eq("id", id);
      if (error) throw error;

      setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

      registrarActividad("reasigna", newAm ? `AM → ${newAm.full_name}` : "AM → mesa de dirección", id);

      if (newAmId) {
        await supabase.from("notifications").insert({
          user_id: newAmId,
          title: "Proyecto Asignado 📁",
          message: `Se te asignó como Account Manager el proyecto de ${target.full_name}.`,
          type: "info",
          read: false,
        });
      }
    } catch (err) {
      console.error("Error reassigning account manager:", err);
      throw err;
    }
  };

  // Reparte la cartera de aliados entre los Account Managers (20260904000000).
  //
  // Ojo con lo que NO hace, que es justo lo que la diferencia del modelo que se
  // revirtió el 2026-09-02: no arrastra proyectos. Mover a un aliado de AM solo
  // cambia con quién nacerán sus PRÓXIMOS proyectos; los que ya existen siguen
  // con el AM que los gestiona, y con ellos las métricas y las comisiones.
  //
  // En producción pasa entera por la RPC `asigna_am_a_aliado`, que valida que
  // quien llama sea Dirección y deja rastro en `aliado_auditoria`; la base
  // además guarda el valor anterior en `am_historial`.
  const assignAccountManager = async (
    aliadoIds: string[],
    amId: string | null,
    motivo?: string | null
  ): Promise<number> => {
    const ids = aliadoIds.filter(Boolean);
    if (ids.length === 0) return 0;

    if (amId && !profiles.some((p) => p.id === amId && p.role === "account_manager")) {
      throw new Error("El Account Manager destino no existe.");
    }

    // Solo los que hoy tienen otro AM (o ninguno): repetir la asignación no es un
    // movimiento y no debe generar una línea de auditoría.
    const objetivo = ids.filter((id) => {
      const a = profiles.find((p) => p.id === id);
      return !!a && a.role === "aliado" && (a.account_manager_id || null) !== (amId || null);
    });
    if (objetivo.length === 0) return 0;

    const aplicarLocal = () => {
      const set = new Set(objetivo);
      setProfiles((prev) => {
        const next = prev.map((p) => (set.has(p.id) ? { ...p, account_manager_id: amId } : p));
        saveToStorage("pensionflow_profiles", next);
        return next;
      });
    };

    if (isDemoMode || isProvisionalSession || !supabase) {
      aplicarLocal();
      return objetivo.length;
    }

    const { data, error } = await supabase.rpc("asigna_am_a_aliado", {
      p_aliado_ids: objetivo,
      p_am_id: amId,
      p_motivo: motivo ?? null,
    });
    if (error) {
      console.error("Error asignando Account Manager:", error);
      throw new Error(error.message || "No se pudo asignar el Account Manager.");
    }

    aplicarLocal();
    return typeof data === "number" ? data : objetivo.length;
  };

  const updateProspectStatus = async (
    id: string,
    newStatus: Prospect["status"],
    comments?: string,
    reevalDate?: string | null
  ) => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) => {
        if (p.id === id) {
          const notesDir = comments ? comments : p.notes_director;
          return {
            ...p,
            status: newStatus,
            notes_director: notesDir,
            ...(reevalDate !== undefined ? { reeval_date: reevalDate } : {}),
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      });

      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);

      const target = prospects.find((p) => p.id === id);
      if (target) {
        let notifTitle = "Actualización de Estatus";
        let notifMsg = `El caso de ${target.full_name} cambió al estado: ${newStatus}`;
        let toastMsg = "";

        if (newStatus === "rechazado") {
          const reviewerLabel = user?.role === "account_manager" ? "Account Manager" : "Director";
          notifTitle = "Expediente Rechazado ❌";
          notifMsg = `El ${reviewerLabel} rechazó el caso de ${target.full_name}. Comentarios: ${comments || "Sin comentarios técnicos."}`;
          toastMsg = `⚠️ Estimado Roberto: Lamentamos informarte que el expediente de ${target.full_name} no cumple con los criterios técnicos requeridos. Motivo: ${comments || "Documentación inconsistente."}`;
        } else if (isLostStatus(newStatus)) {
          notifTitle = "Proyecto Cerrado Perdido";
          notifMsg = `El proyecto de ${target.full_name} se cerró como perdido. ${comments || "Sin motivo especificado."}`;
        } else if (newStatus === "pagado_comision") {
          notifTitle = "¡Comisión Liberada! 💰✨";
          notifMsg = `Se liberó la comisión para ti por el proyecto de ${target.full_name}.`;
          toastMsg = `🎉 ¡Felicidades! Se ha liberado y transferido la comisión correspondiente al caso de ${target.full_name}. Ya puedes revisarla en tus estados financieros.`;
        } else if (newStatus === "firma_contrato") {
          notifTitle = "Firma de Contrato ✍️";
          notifMsg = `El contrato de financiamiento de ${target.full_name} pasó a firma.`;
        } else if (newStatus === "firma_programada") {
          notifTitle = "Firma Programada ✍️";
          notifMsg = `La firma del financiamiento para ${target.full_name} ha sido programada.`;
          toastMsg = `📅 Notificación Oficial: Se programó la firma del convenio de financiamiento de ${target.full_name} para la siguiente semana. Mantente al pendiente del canal comercial.`;
        }

        if (notifTitle) {
          const newNotif: NotificationItem = {
            id: `notif-${Math.random().toString(36).substr(2, 9)}`,
            title: notifTitle,
            message: notifMsg,
            type: newStatus === "rechazado" ? "alert" : isLostStatus(newStatus) ? "warning" : newStatus === "pagado_comision" ? "success" : "info",
            read: false,
            created_at: new Date().toISOString(),
          };
          setNotifications([newNotif, ...notifications]);
          saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);
        }

        if (toastMsg) {
          triggerPushNotification(toastMsg, "whatsapp", target.phone);
        }
      }
    } else {
      try {
        const updateData: any = { status: newStatus };
        if (comments) updateData.notes_director = comments;
        if (reevalDate !== undefined) updateData.reeval_date = reevalDate;

        const { error } = await supabase.from("prospects").update(updateData).eq("id", id);
        if (error) throw error;

        setProspects((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  status: newStatus,
                  notes_director: comments || p.notes_director,
                  ...(reevalDate !== undefined ? { reeval_date: reevalDate } : {}),
                }
              : p
          )
        );

        // Se anota la SUBETAPA, que es como la nombra el resto de la app; el
        // `status` crudo no le dice nada a quien lee el reporte.
        registrarActividad("cambia_etapa", getStageAndSubStage(newStatus).subStage || newStatus, id);

        const target = prospects.find((p) => p.id === id);
        if (target) {
          let notifTitle = "Actualización de Estatus";
          let notifMsg = `El caso de ${target.full_name} cambió al estado: ${newStatus}`;
          let toastMsg = "";

          if (newStatus === "rechazado") {
            const reviewerLabel = user?.role === "account_manager" ? "Account Manager" : "Director";
            notifTitle = "Expediente Rechazado ❌";
            notifMsg = `El ${reviewerLabel} rechazó el caso de ${target.full_name}. Comentarios: ${comments || "Sin comentarios técnicos."}`;
            toastMsg = `⚠️ Estimado Roberto: Lamentamos informarte que el expediente de ${target.full_name} no cumple con los criterios técnicos requeridos. Motivo: ${comments || "Documentación inconsistente."}`;
          } else if (isLostStatus(newStatus)) {
            notifTitle = "Proyecto Cerrado Perdido";
            notifMsg = `El proyecto de ${target.full_name} se cerró como perdido. ${comments || "Sin motivo especificado."}`;
          } else if (newStatus === "pagado_comision") {
            notifTitle = "¡Comisión Liberada! 💰✨";
            notifMsg = `Se liberó la comisión para ti por el proyecto de ${target.full_name}.`;
            toastMsg = `🎉 ¡Felicidades! Se ha liberado y transferido la comisión correspondiente al caso de ${target.full_name}. Ya puedes revisarla en tus estados financieros.`;
          } else if (newStatus === "firma_contrato") {
            notifTitle = "Firma de Contrato ✍️";
            notifMsg = `El contrato de financiamiento de ${target.full_name} pasó a firma.`;
          } else if (newStatus === "firma_programada") {
            notifTitle = "Firma Programada ✍️";
            notifMsg = `La firma del financiamiento para ${target.full_name} ha sido programada.`;
            toastMsg = `📅 Notificación Oficial: Se programó la firma del convenio de financiamiento de ${target.full_name} para la siguiente semana. Mantente al pendiente del canal comercial.`;
          }

          // Insert notification in DB for Ally
          await supabase.from("notifications").insert({
            user_id: target.aliado_id,
            title: notifTitle,
            message: notifMsg,
            type: newStatus === "rechazado" ? "error" : isLostStatus(newStatus) ? "warning" : newStatus === "pagado_comision" ? "success" : "info",
            read: false,
          });

          if (toastMsg) {
            triggerPushNotification(toastMsg, "whatsapp", target.phone);
          }
        }
      } catch (error) {
        console.error("Error updating prospect status in Supabase:", error);
      }
    }
  };

  // Modalidad de aprobación (40 / 10). La define el Director o el Account Manager
  // al aprobar (o desde la tarjeta del expediente). No cambia el status: solo marca
  // qué agenda verá el aliado.
  const updateProspectModalidad = async (id: string, modalidad: "40" | "10") => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) =>
        p.id === id ? { ...p, modalidad, updated_at: new Date().toISOString() } : p
      );
      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);
      return;
    }
    try {
      const { error } = await supabase.from("prospects").update({ modalidad }).eq("id", id);
      if (error) throw error;
      setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, modalidad } : p)));
      registrarActividad("modalidad", `Modalidad ${modalidad}`, id);
    } catch (error) {
      console.error("Error updating prospect modalidad in Supabase:", error);
    }
  };

  const saveSimulationDraft = async (
    id: string,
    simulationData: Omit<Simulation, "totalCredito" | "roiMonths">
  ) => {
    const totalCredito = (simulationData.financiamiento || 0) + (simulationData.costoGestion || 0);
    const increment = (simulationData.pensionMejorada || 0) - (simulationData.pensionActual || 0);
    const roiMonths = increment > 0 ? Math.ceil(totalCredito / increment) : 0;
    const aforePensionarse = simulationData.aforePensionarse || 0;
    const creditoNomina = simulationData.creditoNomina || 0;
    const aportacion = Math.max(0, totalCredito - aforePensionarse - creditoNomina);

    const fullSimulation: Simulation = {
      ...simulationData,
      totalCredito,
      roiMonths,
      aforePensionarse,
      aportacion,
      creditoNomina,
    };

    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            simulation: fullSimulation,
            notes_director: simulationData.comments,
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      });
      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);
    } else {
      try {
        const { error } = await supabase
          .from("prospects")
          .update({
            sim_semanas: simulationData.semanas,
            sim_pension_actual: simulationData.pensionActual,
            sim_pension_mejorada: simulationData.pensionMejorada,
            sim_financiamiento: simulationData.financiamiento,
            sim_costo_gestion: simulationData.costoGestion,
            sim_comments: simulationData.comments,
            notes_director: simulationData.comments,
            afore_pensionarse: aforePensionarse,
            aportacion: aportacion,
            credito_nomina: creditoNomina,
          })
          .eq("id", id);
          
        if (error) throw error;

        setProspects((prev) =>
          prev.map((p) => {
            if (p.id === id) {
              return {
                ...p,
                simulation: fullSimulation,
                notes_director: simulationData.comments,
              };
            }
            return p;
          })
        );
      } catch (error) {
        console.error("Error saving simulation draft in Supabase:", error);
      }
    }
  };

  const saveSimulation = async (
    id: string,
    simulationData: Omit<Simulation, "totalCredito" | "roiMonths">
  ) => {
    const totalCredito = simulationData.financiamiento + simulationData.costoGestion;
    const incremento = simulationData.pensionMejorada - simulationData.pensionActual;
    const roiMonths = incremento > 0 ? Math.ceil(totalCredito / incremento) : 0;

    const aforePensionarse = simulationData.aforePensionarse || 0;
    const creditoNomina = simulationData.creditoNomina || 0;
    const aportacion = Math.max(0, totalCredito - aforePensionarse - creditoNomina);

    const fullSimulation: Simulation = {
      ...simulationData,
      totalCredito,
      roiMonths,
      aforePensionarse,
      aportacion,
      creditoNomina,
    };

    const newStatus = aportacion > 0 ? ("aportacion" as const) : ("aprobado_listo" as const);

    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            status: newStatus,
            simulation: fullSimulation,
            sim_emitted_at: new Date().toISOString(),
            notes_director: simulationData.comments,
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      });

      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);

      const target = prospects.find((p) => p.id === id);
      if (target) {
        const notifTitle = newStatus === "aportacion" ? "Dictamen Emitido (Aportación) 💰" : "Dictamen Emitido (Aprobado) ✅";
        const notifMsg = newStatus === "aportacion"
          ? `El Director Eduardo emitió el dictamen financiero para ${target.full_name}. Aportación Requerida: $${aportacion.toLocaleString()} (Afore: $${aforePensionarse.toLocaleString()}).`
          : `El Director Eduardo emitió el dictamen financiero para ${target.full_name}. Tu Pensión Perfecta: $${simulationData.pensionMejorada.toLocaleString()}/mes.`;

        const newNotif: NotificationItem = {
          id: `notif-${Math.random().toString(36).substr(2, 9)}`,
          title: notifTitle,
          message: notifMsg,
          type: "success",
          read: false,
          created_at: new Date().toISOString(),
        };
        setNotifications([newNotif, ...notifications]);
        saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);

        const whatsappMsg = newStatus === "aportacion"
          ? `📈 ¡Simulación lista, Roberto! El director Eduardo aprobó la simulación para ${target.full_name} con Aportación Requerida de $${aportacion.toLocaleString()} (Afore: $${aforePensionarse.toLocaleString()}). ¡Ingresa ya para presentar la propuesta!`
          : `📈 ¡Gran oportunidad, Roberto! El director Eduardo aprobó la simulación para ${target.full_name}. Pensión actual: $${simulationData.pensionActual.toLocaleString()} ➡️ Tu Pensión Perfecta: $${simulationData.pensionMejorada.toLocaleString()}. Financiamiento: $${simulationData.financiamiento.toLocaleString()}. ¡Ingresa ya para presentar y agendar la asesoría!`;

        triggerPushNotification(
          whatsappMsg,
          "whatsapp",
          "Roberto Asesor"
        );
      }
    } else {
      try {
        const emittedAt = new Date().toISOString();
        const basePayload: any = {
          status: newStatus,
          sim_semanas: simulationData.semanas,
          sim_pension_actual: simulationData.pensionActual,
          sim_pension_mejorada: simulationData.pensionMejorada,
          sim_financiamiento: simulationData.financiamiento,
          sim_costo_gestion: simulationData.costoGestion,
          sim_comments: simulationData.comments,
          notes_director: simulationData.comments,
          afore_pensionarse: aforePensionarse,
          aportacion: aportacion,
          credito_nomina: creditoNomina,
        };

        let { error } = await supabase
          .from("prospects")
          .update({ ...basePayload, sim_emitted_at: emittedAt })
          .eq("id", id);

        if (error) {
          // La columna sim_emitted_at puede no estar migrada aún — reintentar sin ella
          // para que la emisión del dictamen nunca falle.
          ({ error } = await supabase.from("prospects").update(basePayload).eq("id", id));
        }
        if (error) throw error;

        setProspects((prev) =>
          prev.map((p) => {
            if (p.id === id) {
              return {
                ...p,
                status: newStatus,
                simulation: fullSimulation,
                sim_emitted_at: emittedAt,
                notes_director: simulationData.comments,
              };
            }
            return p;
          })
        );

        registrarActividad("simulacion", newStatus === "aportacion" ? "Con aportación" : "Aprobado listo", id);

        const target = prospects.find((p) => p.id === id);
        if (target) {
          const notifTitle = newStatus === "aportacion" ? "Dictamen Emitido (Aportación) 💰" : "Dictamen Emitido (Aprobado) ✅";
          const notifMsg = newStatus === "aportacion"
            ? `El Director Eduardo emitió el dictamen financiero para ${target.full_name}. Aportación Requerida: $${aportacion.toLocaleString()} (Afore: $${aforePensionarse.toLocaleString()}).`
            : `El Director Eduardo emitió el dictamen financiero para ${target.full_name}. Tu Pensión Perfecta: $${simulationData.pensionMejorada.toLocaleString()}/mes.`;

          // Notify Ally
          await supabase.from("notifications").insert({
            user_id: target.aliado_id,
            title: notifTitle,
            message: notifMsg,
            type: "success",
            read: false,
          });

          const whatsappMsg = newStatus === "aportacion"
            ? `📈 ¡Simulación lista, Roberto! El director Eduardo aprobó la simulación para ${target.full_name} con Aportación Requerida de $${aportacion.toLocaleString()} (Afore: $${aforePensionarse.toLocaleString()}). ¡Ingresa ya para presentar la propuesta!`
            : `📈 ¡Gran oportunidad, Roberto! El director Eduardo aprobó la simulación para ${target.full_name}. Pensión actual: $${simulationData.pensionActual.toLocaleString()} ➡️ Tu Pensión Perfecta: $${simulationData.pensionMejorada.toLocaleString()}. Financiamiento: $${simulationData.financiamiento.toLocaleString()}. ¡Ingresa ya para presentar y agendar la asesoría!`;

          triggerPushNotification(
            whatsappMsg,
            "whatsapp",
            "Roberto Asesor"
          );
        }
      } catch (error) {
        console.error("Error saving simulation in Supabase:", error);
      }
    }
  };

  const scheduleAssessment = async (id: string, date: string, time: string) => {
    const notesText = date === "LeadConnector"
      ? "Asesoría agendada vía LeadConnector"
      : `Asesoría agendada para el día ${date} a las ${time} hrs.`;

    // Agendar ya no es exclusivo del aliado: el director y el AM también graban la
    // fecha desde Gestión de Clientes. La notificación nombra a quien lo hizo.
    const quienAgenda = user?.full_name || "El equipo";

    // Fecha REAL de la reunión, que es distinta del momento en que se captura (eso
    // lo registra solo el historial de estados). Se ancla a CDMX en vez de usar la
    // zona de la laptop: México no aplica horario de verano desde 2022, así que
    // -06:00 es fijo y la hora tecleada se conserva agende quien agende.
    const asesoriaAt = buildAsesoriaTimestamp(date, time);

    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            status: "asesoria_agendada" as const,
            notes_aliado: notesText,
            asesoria_at: asesoriaAt,
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      });

      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);

      const target = prospects.find((p) => p.id === id);
      if (target) {
        const newNotif: NotificationItem = {
          id: `notif-${Math.random().toString(36).substr(2, 9)}`,
          title: "Asesoría Agendada 📅",
          message: date === "LeadConnector"
            ? `${quienAgenda} agendó la asesoría de presentación para ${target.full_name} vía LeadConnector.`
            : `${quienAgenda} agendó la asesoría de presentación para ${target.full_name} el día ${date} a las ${time} hrs.`,
          type: "info",
          read: false,
          created_at: new Date().toISOString(),
        };
        setNotifications([newNotif, ...notifications]);
        saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);

        triggerPushNotification(
          date === "LeadConnector"
            ? `✉️ Confirmación de Asesoría: Se notificó al Director Eduardo de Operaciones que se agendó la asesoría para ${target.full_name} vía LeadConnector.`
            : `✉️ Confirmación de Asesoría: Se ha enviado un correo electrónico a ${target.email} con la invitación de zoom de Calendly para el ${date} a las ${time} y se notificó al Director Eduardo de Operaciones.`,
          "email",
          target.full_name
        );
      }
    } else {
      try {
        const { error } = await supabase
          .from("prospects")
          .update({
            status: "asesoria_agendada",
            notes_aliado: notesText,
            asesoria_at: asesoriaAt,
          })
          .eq("id", id);

        if (error) throw error;

        setProspects((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, status: "asesoria_agendada" as const, notes_aliado: notesText, asesoria_at: asesoriaAt }
              : p
          )
        );

        registrarActividad("agenda_asesoria", date === "LeadConnector" ? "Vía LeadConnector" : `${date} ${time}`, id);

        const target = prospects.find((p) => p.id === id);
        if (target) {
          // Notify Director
          const directors = profiles.filter(p => p.role === "director");
          for (const dir of directors) {
            await supabase.from("notifications").insert({
              user_id: dir.id,
              title: "Asesoría Agendada 📅",
              message: date === "LeadConnector"
                ? `${quienAgenda} agendó la asesoría de presentación para ${target.full_name} vía LeadConnector.`
                : `${quienAgenda} agendó la asesoría de presentación para ${target.full_name} el día ${date} a las ${time} hrs.`,
              type: "info",
              read: false,
            });
          }

          triggerPushNotification(
            date === "LeadConnector"
              ? `✉️ Confirmación de Asesoría: Se notificó al Director Eduardo de Operaciones que se agendó la asesoría para ${target.full_name} vía LeadConnector.`
              : `✉️ Confirmación de Asesoría: Se ha enviado un correo electrónico a ${target.email} con la invitación de zoom de Calendly para el ${date} a las ${time} y se notificó al Director Eduardo de Operaciones.`,
            "email",
            target.full_name
          );
        }
      } catch (error) {
        // Se relanza a propósito: si el guardado falla (RLS, columna faltante, red)
        // quien agenda tiene que enterarse. Tragarse el error dejaba la pantalla
        // como si la cita hubiera quedado grabada.
        console.error("Error scheduling assessment in Supabase:", error);
        throw error;
      }
    }
  };

  const generateInvitationCode = async (): Promise<InvitationCode> => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      const randomHex = Math.random().toString(16).substr(2, 4).toUpperCase();
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      const newCodeString = `AL-2026-${randomHex}${randomDigits}`;

      const newCode: InvitationCode = {
        id: `code-${Math.random().toString(36).substr(2, 9)}`,
        code: newCodeString,
        created_by: user?.id || "director-456",
        is_used: false,
        created_at: new Date().toISOString(),
      };

      const updated = [newCode, ...invitationCodes];
      setInvitationCodes(updated);
      saveToStorage("pensionflow_invitation_codes", updated);

      return newCode;
    } else {
      try {
        const randomHex = Math.random().toString(16).substr(2, 4).toUpperCase();
        const randomDigits = Math.floor(1000 + Math.random() * 9000);
        const newCodeString = `AL-2026-${randomHex}${randomDigits}`;

        let dbCode = null;
        let insertError = null;

        try {
          const { data, error } = await supabase
            .from("invitation_codes")
            .insert({
              code: newCodeString,
              created_by: user?.id || null,
              is_used: false,
            })
            .select()
            .single();
          dbCode = data;
          insertError = error;
        } catch (innerErr: any) {
          insertError = innerErr;
        }

        // Fallback: If initial insertion failed (e.g. foreign key or constraint error due to lack of profiles row), retry with created_by = null
        if (insertError || !dbCode) {
          console.warn("Initial invitation code creation failed, retrying with created_by = null:", insertError);
          const { data, error: fallbackError } = await supabase
            .from("invitation_codes")
            .insert({
              code: newCodeString,
              created_by: null,
              is_used: false,
            })
            .select()
            .single();

          if (fallbackError) {
            console.error("Fallback invitation code creation failed too:", fallbackError);
            throw fallbackError;
          }
          dbCode = data;
        }

        const newCode: InvitationCode = {
          id: dbCode.id,
          code: dbCode.code,
          created_by: dbCode.created_by,
          is_used: dbCode.is_used,
          used_by: dbCode.used_by,
          created_at: dbCode.created_at,
        };

        setInvitationCodes((prev) => [newCode, ...prev]);
        return newCode;
      } catch (error) {
        console.error("Error generating invitation code in Supabase:", error);
        throw error;
      }
    }
  };

  const registerAliado = async (fullName: string, email: string, phone: string, password: string, code: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      if (isDemoMode || !supabase) {
        const validCode = invitationCodes.find(c => c.code === code && !c.is_used);
        if (!validCode) throw new Error("Código de invitación inválido o ya usado.");
        
        const storedProfiles = localStorage.getItem("pensionflow_profiles");
        const parsedProfiles = storedProfiles ? JSON.parse(storedProfiles) : INITIAL_PROFILES;
        // El aliado ya NO lleva Account Manager: el AM se sortea POR PROYECTO
        // cuando el aliado captura (ver addProspect / trigger assign_am_to_prospect).
        const newProfile: UserProfile = {
          id: `aliado-${Math.random().toString(36).substr(2, 9)}`,
          full_name: fullName,
          email,
          phone,
          role: "aliado",
          created_at: new Date().toISOString()
        };
        
        saveToStorage("pensionflow_profiles", [...parsedProfiles, newProfile]);
        
        const updatedCodes = invitationCodes.map(c => c.code === code ? { ...c, is_used: true, used_by: newProfile.id } : c);
        setInvitationCodes(updatedCodes);
        saveToStorage("pensionflow_invitation_codes", updatedCodes);
        
        return true;
      } else {
        // Attempt to check invitation code in DB
        const { data: dbCode, error: codeError } = await supabase
          .from("invitation_codes")
          .select("*")
          .eq("code", code.trim().toUpperCase())
          .eq("is_used", false)
          .maybeSingle();
          
        if (codeError || !dbCode) {
          throw new Error("El código de invitación no es válido, ya fue utilizado o no existe.");
        }

        // El aliado ya NO lleva Account Manager en su perfil: el AM se sortea
        // POR PROYECTO al capturar (trigger `assign_am_to_prospect` de la BD).

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: phone,
              role: "aliado",
              invitation_code_used: code.trim().toUpperCase()
            }
          }
        });
        
        if (authError) {
          console.error("Auth signUp error in registerAliado:", authError);
          if (authError.status === 429 || authError.code === "over_email_send_rate_limit" || authError.message?.toLowerCase().includes("rate limit") || authError.message?.toLowerCase().includes("exceeded")) {
            throw new Error(
              "LÍMITE_CORREOS: Se ha superado el límite de envío de correos de verificación de Supabase (Error 429). Por favor, solicita al administrador del sistema desactivar la casilla 'Confirm Email' (Confirmar correo electrónico) en el Supabase Dashboard (Authentication -> Providers -> Email -> Confirm email) para permitir registros instantáneos."
            );
          }
          throw authError;
        }
        if (!authData.user) throw new Error("No se pudo crear el usuario.");

        // Try to insert profile immediately, but catch error since it might fail due to RLS when email confirmation is pending
        try {
          await supabase
            .from("profiles")
            .insert({
              id: authData.user.id,
              full_name: fullName,
              email: email.toLowerCase(),
              phone,
              role: "aliado",
              invitation_code_used: code.trim().toUpperCase(),
            });
            
          // If successful, try to mark invitation code as used
          try {
            await supabase
              .from("invitation_codes")
              .update({ is_used: true, used_by: authData.user.id })
              .eq("id", dbCode.id);
          } catch (updateErr) {
            console.warn("Could not update invitation_code status due to RLS:", updateErr);
          }
        } catch (profileError) {
          console.warn("Could not insert profile immediately (expected if email confirmation is enabled and session is not yet active). Will self-heal on first login:", profileError);
        }

        return true;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const initializeDirector = async (fullName: string, email: string, phone: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      if (isDemoMode || !supabase) {
        const newProfile: UserProfile = {
          id: `director-${Math.random().toString(36).substr(2, 9)}`,
          full_name: fullName,
          email,
          phone,
          role: "director",
          created_at: new Date().toISOString()
        };
        const updated = [...profiles, newProfile];
        setProfiles(updated);
        saveToStorage("pensionflow_profiles", updated);
        setUser(newProfile);
        setActiveRole("director");
        saveToStorage("pensionflow_user", newProfile);
        saveToStorage("pensionflow_active_role", "director");
        return true;
      } else {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: phone,
              role: "director"
            }
          }
        });
        
        if (authError) {
          console.error("Auth signUp error in initializeDirector:", authError);
          if (authError.status === 429 || authError.code === "over_email_send_rate_limit" || authError.message?.toLowerCase().includes("rate limit") || authError.message?.toLowerCase().includes("exceeded")) {
            throw new Error(
              "LÍMITE_CORREOS: Se ha superado el límite de envío de correos de verificación de Supabase (Error 429). Por favor, solicita al administrador del sistema desactivar la casilla 'Confirm Email' (Confirmar correo electrónico) en el Supabase Dashboard (Authentication -> Providers -> Email -> Confirm email) para permitir registros instantáneos."
            );
          }
          throw authError;
        }
        if (!authData.user) throw new Error("No se pudo crear el usuario.");

        try {
          await supabase
            .from("profiles")
            .insert({
              id: authData.user.id,
              full_name: fullName,
              email: email.toLowerCase(),
              phone,
              role: "admin",
            });
        } catch (profileError) {
          console.warn("Could not insert director profile immediately, self-healing will fix this upon first login:", profileError);
        }

        const newProfile: UserProfile = {
          id: authData.user.id,
          full_name: fullName,
          email: email.toLowerCase(),
          phone,
          role: "director",
          created_at: new Date().toISOString()
        };
        
        setUser(newProfile);
        setActiveRole("director");
        saveToStorage("pensionflow_user", newProfile);
        saveToStorage("pensionflow_active_role", "director");
        
        // Refresh profiles list
        const { data: dbProfiles } = await supabase.from("profiles").select("*");
        const mappedProfiles = dbProfiles ? dbProfiles.map(mapProfileFromDB) : [];
        setProfiles(mappedProfiles);

        return true;
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Atribución closer → aliado
  // ---------------------------------------------------------------------------
  // El historial es append-only por diseño (§22): reasignar NO borra la
  // asignación anterior, agrega un movimiento. Y `closer_origen_id` —el mérito
  // por haber cerrado al aliado— solo se toca en la asignación inicial o en un
  // backfill explícito; una reasignación operativa jamás lo reescribe.

  const appendCloserAsignacionLocal = (input: CloserAsignacionInput) => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(CLOSER_ASIGNACIONES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.push({
        id: `caa-${Math.random().toString(36).substr(2, 9)}`,
        aliado_id: input.aliadoId,
        closer_anterior_id: input.closerAnteriorId ?? null,
        closer_nuevo_id: input.closerNuevoId,
        closer_origen_id: input.closerOrigenId ?? null,
        tipo_movimiento: input.tipo,
        motivo: input.motivo ?? null,
        asignado_por: user?.id || null,
        fecha_asignacion: input.fechaIncorporacion || new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
      localStorage.setItem(CLOSER_ASIGNACIONES_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn("No se pudo guardar el historial local de asignaciones de closer:", e);
    }
  };

  /**
   * Asigna o reasigna uno o varios aliados a un closer.
   *
   * · `asignacion_inicial` / `backfill` → fija ORIGEN + ACTUAL (el backfill es para
   *   los aliados que ya existían antes del módulo).
   * · `reasignacion` → mueve SOLO el closer actual. El origen se conserva, que es
   *   justo lo que hace que las métricas históricas no se muevan (§23).
   * · `desasignacion` → deja al aliado sin closer actual.
   */
  const assignCloser = async (
    aliadoIds: string[],
    closerId: string | null,
    options?: {
      tipo?: CloserAsignacionInput["tipo"];
      motivo?: string | null;
      fechaIncorporacion?: string | null;
    }
  ): Promise<void> => {
    const ids = aliadoIds.filter(Boolean);
    if (ids.length === 0) return;

    const tipo = options?.tipo || (closerId ? "asignacion_inicial" : "desasignacion");
    const tocaOrigen = tipo === "asignacion_inicial" || tipo === "backfill";
    const ahora = new Date().toISOString();

    // Se resuelve por aliado porque cada uno arrastra su propio "closer anterior".
    const movimientos = ids
      .map((aliadoId) => {
        const actual = profiles.find((p) => p.id === aliadoId);
        if (!actual) return null;
        const fecha = tocaOrigen ? options?.fechaIncorporacion || actual.fecha_incorporacion_closer || ahora : actual.fecha_incorporacion_closer || null;
        const updates: Partial<UserProfile> = {
          closer_actual_id: closerId,
          closer_asignado_por: user?.id || null,
        };
        if (tocaOrigen) {
          updates.closer_origen_id = closerId;
          updates.fecha_incorporacion_closer = fecha;
        }
        return {
          aliadoId,
          anterior: actual.closer_actual_id || null,
          origen: tocaOrigen ? closerId : actual.closer_origen_id || null,
          fecha,
          updates,
        };
      })
      .filter(Boolean) as {
      aliadoId: string;
      anterior: string | null;
      origen: string | null;
      fecha: string | null;
      updates: Partial<UserProfile>;
    }[];

    if (movimientos.length === 0) return;

    if (isDemoMode || isProvisionalSession || !supabase) {
      const byId = new Map(movimientos.map((m) => [m.aliadoId, m]));
      const updated = profiles.map((p) => {
        const m = byId.get(p.id);
        return m ? { ...p, ...m.updates } : p;
      });
      setProfiles(updated);
      saveToStorage("pensionflow_profiles", updated);
      movimientos.forEach((m) =>
        appendCloserAsignacionLocal({
          aliadoId: m.aliadoId,
          closerNuevoId: closerId,
          closerAnteriorId: m.anterior,
          closerOrigenId: m.origen,
          tipo,
          motivo: options?.motivo ?? null,
          fechaIncorporacion: m.fecha,
        })
      );
      return;
    }

    // ── Account Manager ──────────────────────────────────────────────────────
    // El AM no tiene UPDATE sobre los perfiles de aliado (desde que el AM es por
    // PROYECTO, la condición `account_manager_id = auth.uid()` ya casi nunca se
    // cumple) ni INSERT en el historial, que solo acepta a Dirección. Su
    // asignación pasa entera por `asigna_closer_a_aliado` (20260803000000): una
    // función con lista blanca de columnas que además le impide reescribir una
    // atribución que ya existía. Dirección sigue por el camino directo de abajo.
    if (user?.role === "account_manager") {
      if (!closerId) {
        throw new Error("Quitarle el closer a un aliado es cosa de Dirección.");
      }
      if (tipo !== "asignacion_inicial" && tipo !== "backfill") {
        throw new Error("Reasignar a otro closer es cosa de Dirección.");
      }
      const { error: rpcError } = await supabase.rpc("asigna_closer_a_aliado", {
        p_aliado_ids: movimientos.map((m) => m.aliadoId),
        p_closer_id: closerId,
        p_tipo: tipo,
        p_motivo: options?.motivo ?? null,
        p_fecha: options?.fechaIncorporacion ?? null,
      });
      if (rpcError) {
        console.error("Error asignando closer (Account Manager):", rpcError);
        throw new Error(rpcError.message || "No se pudo atribuir el aliado al closer.");
      }
      const byIdAm = new Map(movimientos.map((m) => [m.aliadoId, m]));
      setProfiles((prev) => prev.map((p) => (byIdAm.has(p.id) ? { ...p, ...byIdAm.get(p.id)!.updates } : p)));
      return;
    }

    // Producción. Se actualiza perfil por perfil (son pocos y cada uno lleva su
    // propia fecha) y después se registra el historial de un solo golpe.
    for (const m of movimientos) {
      const dbUpdates: any = {
        closer_actual_id: closerId,
        closer_asignado_por: user?.id || null,
      };
      if (tocaOrigen) {
        dbUpdates.closer_origen_id = closerId;
        dbUpdates.fecha_incorporacion_closer = m.fecha;
      }
      const { error } = await supabase.from("profiles").update(dbUpdates).eq("id", m.aliadoId);
      if (error) throw new Error(`No se pudo actualizar la atribución del aliado: ${error.message}`);
    }

    const { error: histError } = await supabase.from("closer_aliado_asignaciones").insert(
      movimientos.map((m) => ({
        aliado_id: m.aliadoId,
        closer_anterior_id: m.anterior,
        closer_nuevo_id: closerId,
        closer_origen_id: m.origen,
        tipo_movimiento: tipo,
        motivo: options?.motivo ?? null,
        asignado_por: user?.id || null,
        fecha_asignacion: m.fecha || ahora,
      }))
    );
    if (histError) {
      // El perfil ya quedó bien; el historial es auditoría. Se avisa pero no se
      // tira la operación completa encima del usuario.
      console.warn("No se pudo registrar el historial de asignación de closer:", histError);
    }

    const byId = new Map(movimientos.map((m) => [m.aliadoId, m]));
    setProfiles((prev) => prev.map((p) => (byId.has(p.id) ? { ...p, ...byId.get(p.id)!.updates } : p)));
  };

  const createProfile = async (
    profileData: Omit<UserProfile, "id" | "created_at">
  ): Promise<UserProfile> => {
    // Atribución al closer: solo aplica a los ALIADOS. Si el alta la hace un AM
    // (que no elige closer) o el rol es otro, queda sin atribuir.
    //
    // Cuando quien da el alta ES un closer, la atribución no se negocia: es él.
    // Su producción se mide justamente por los aliados que incorpora, así que ni
    // se la puede colgar a un compañero ni puede crear otra cosa que un aliado.
    // La base impone lo mismo en el WITH CHECK de "Closers dan de alta a sus
    // aliados" (20260801000001); esto es la primera de las dos barreras.
    const soyCloser = user?.role === "closer";
    if (soyCloser && profileData.role !== "aliado") {
      throw new Error("Un closer solo puede dar de alta aliados.");
    }
    // El Account Manager incorpora la capa comercial —aliados y closers— pero no
    // reparte poder: ni directores ni otros AM. La base impone lo mismo en el
    // WITH CHECK de "Admins y Account Managers pueden crear perfiles"
    // (20260803000000); esto es la primera de las dos barreras.
    if (user?.role === "account_manager" && profileData.role !== "aliado" && profileData.role !== "closer") {
      throw new Error("Un Account Manager solo puede dar de alta aliados y closers.");
    }
    const closerOrigenId =
      profileData.role === "aliado"
        ? soyCloser
          ? user?.id || null
          : profileData.closer_origen_id || null
        : null;
    const incorporadoAt = closerOrigenId ? new Date().toISOString() : null;

    if (isDemoMode || isProvisionalSession || !supabase) {
      // El aliado nuevo nace SIN Account Manager: se lo asigna Dirección a mano
      // en /admin/asignacion-am. Mientras no lo tenga, lo que capture lo reparte
      // la ruleta (ver addProspect / trigger assign_am_to_prospect).
      const newProfile: UserProfile = {
        ...profileData,
        id: `user-${Math.random().toString(36).substr(2, 9)}`,
        created_at: new Date().toISOString(),
        closer_origen_id: closerOrigenId,
        closer_actual_id: closerOrigenId,
        fecha_incorporacion_closer: incorporadoAt,
        closer_asignado_por: closerOrigenId ? user?.id || null : null,
        contrato_url: (profileData.contrato_url || "").trim() || null,
        contrato_url_at: (profileData.contrato_url || "").trim() ? new Date().toISOString() : null,
        // En producción esto lo estampa el trigger de la base; aquí, que no hay
        // base, se pone a mano para que el modo demo se comporte igual.
        created_by: user?.id || null,
        created_by_role: user?.role || null,
      };

      if (closerOrigenId) {
        appendCloserAsignacionLocal({
          aliadoId: newProfile.id,
          closerNuevoId: closerOrigenId,
          closerAnteriorId: null,
          closerOrigenId,
          tipo: "asignacion_inicial",
          fechaIncorporacion: incorporadoAt,
        });
      }

      const updated = [...profiles, newProfile];
      setProfiles(updated);
      saveToStorage("pensionflow_profiles", updated);

      const newNotif: NotificationItem = {
        id: `notif-${Math.random().toString(36).substr(2, 9)}`,
        title: "Nuevo Usuario Registrado 👤",
        message: `Se ha registrado exitosamente a ${newProfile.full_name} con el rol de ${newProfile.role === "director" ? "Director de Operaciones" : "Aliado Comercial"}.`,
        type: "success",
        read: false,
        created_at: new Date().toISOString(),
      };
      setNotifications([newNotif, ...notifications]);
      saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);

      triggerPushNotification(
        `👤 Registro Completo: Se registró el usuario ${newProfile.full_name} (${newProfile.role === "director" ? "Director" : "Aliado"}). Puede iniciar sesión con su correo: ${newProfile.email}`,
        "email",
        "Eduardo Director"
      );

      return newProfile;
    } else {
      try {
        // Create a temporary client that doesn't persist sessions
        const tempClient = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          }
        );

        // Sign up the user in Supabase Auth with standard or provisional password
        const tempPassword = profileData.password_provisional || "PensionPerfecta2026!";
        const { data: authData, error: authError } = await tempClient.auth.signUp({
          email: profileData.email,
          password: tempPassword,
          options: {
            data: {
              full_name: profileData.full_name,
              phone: profileData.phone,
              role: profileData.role,
              // El closer viaja también en la metadata de auth a propósito: si el
              // INSERT en `profiles` lo bloquea el RLS, el perfil se materializa
              // en el primer login (ensureProfileExists) y sin esto la atribución
              // se perdería para siempre.
              closer_origen_id: closerOrigenId,
              fecha_incorporacion_closer: incorporadoAt,
              // La autoría viaja igual que la atribución: si el INSERT lo frena
              // el RLS, el perfil nace en el primer login y ahí el trigger no
              // puede deducirla (quien inserta es el propio usuario nuevo).
              created_by: user?.id || null,
            }
          }
        });

        if (authError) {
          console.error("Auth signUp error in createProfile:", authError);
          if (authError.status === 429 || authError.code === "over_email_send_rate_limit" || authError.message?.toLowerCase().includes("rate limit") || authError.message?.toLowerCase().includes("exceeded")) {
            throw new Error(
              "LÍMITE_CORREOS: Se ha superado el límite de envío de correos de verificación de Supabase (Error 429). Por favor, desactiva la casilla 'Confirm Email' (Confirmar correo electrónico) en el Supabase Dashboard (Authentication -> Providers -> Email -> Confirm email) para permitir registros instantáneos sin restricciones."
            );
          }
          throw new Error(`Error de autenticación: ${authError.message}`);
        }
        if (!authData.user) {
          throw new Error("No se pudo crear el usuario en el sistema de autenticación.");
        }

        const authUserId = authData.user.id;

        // Map role for Database check constraint (director -> admin)
        const dbRole = profileData.role === "director" ? "admin" : profileData.role;

        // Insert profile into the profiles table
        const basePayload: any = {
          id: authUserId,
          full_name: profileData.full_name,
          email: profileData.email.toLowerCase(),
          phone: profileData.phone,
          role: dbRole,
          invitation_code_used: profileData.invitation_code_used || null,
          password_provisional: profileData.password_provisional || null,
        };
        // Contrato firmado. Va en el payload BASE (no en el del closer) para que
        // también quede registrado cuando el alta la hace Dirección o un AM.
        // NO es obligatorio: la base lo dejó en advertencia el 2026-08-01 (ver
        // 20260801000003), porque había 228 aliados vivos sin contrato y
        // exigirlo habría bloqueado su mantenimiento. Si viene vacío, el aliado
        // nace marcado como pendiente y se completa después.
        const contratoUrl = (profileData.contrato_url || "").trim();
        if (contratoUrl) {
          basePayload.contrato_url = contratoUrl;
          basePayload.contrato_url_at = new Date().toISOString();
        }
        // Al crear un aliado queda atribuido: el closer de ORIGEN (mérito
        // histórico) y el ACTUAL arrancan siendo el mismo.
        const closerPayload = closerOrigenId
          ? {
              closer_origen_id: closerOrigenId,
              closer_actual_id: closerOrigenId,
              fecha_incorporacion_closer: incorporadoAt,
              closer_asignado_por: user?.id || null,
            }
          : {};

        let { data: dbProfile, error: insertError } = await supabase
          .from("profiles")
          .insert({ ...basePayload, ...closerPayload })
          .select()
          .single();

        // Reintento sin los campos del closer. Cubre el hueco de despliegue: si
        // el código llegara a producción ANTES que la migración 20260801000000,
        // esas columnas no existirían y el alta de CUALQUIER usuario reventaría.
        // Mismo patrón que el "retry without is_active" de updateProfileAdmin.
        // Para un closer el reintento sería contraproducente: su política EXIGE
        // la atribución, así que un insert sin ella lo rechazaría igual y encima
        // dejaría el aliado huérfano si algún día se aflojara el RLS.
        if (insertError && closerOrigenId && !soyCloser) {
          console.warn("Insert con atribución de closer falló; reintentando sin ella:", insertError);
          const retry = await supabase.from("profiles").insert(basePayload).select().single();
          dbProfile = retry.data;
          insertError = retry.error;
        }

        // El historial se escribe SIEMPRE que haya atribución, incluso si el
        // INSERT anterior falló: la tabla no tiene FK sobre `aliado_id`
        // justamente para que este registro sobreviva a la auto-recuperación.
        if (closerOrigenId) {
          const { error: histError } = await supabase.from("closer_aliado_asignaciones").insert({
            aliado_id: authUserId,
            closer_anterior_id: null,
            closer_nuevo_id: closerOrigenId,
            closer_origen_id: closerOrigenId,
            tipo_movimiento: "asignacion_inicial",
            motivo: null,
            asignado_por: user?.id || null,
            fecha_asignacion: incorporadoAt,
          });
          if (histError) {
            console.warn("No se pudo registrar la asignación inicial de closer:", histError);
          }
        }

        // Auditoría del alta (§14). Solo de los ALIADOS: es la entidad de la que
        // habla la especificación. Nunca puede tumbar un alta que ya ocurrió, así
        // que el error solo se avisa por consola.
        if (profileData.role === "aliado") {
          const { error: audError } = await supabase.rpc("registrar_auditoria_aliado", {
            p_aliado_id: authUserId,
            p_accion: "alta",
            p_antes: null,
            p_despues: {
              full_name: profileData.full_name,
              email: profileData.email.toLowerCase(),
              closer_origen_id: closerOrigenId,
              con_closer: !!closerOrigenId,
              contrato_url: (profileData.contrato_url || "").trim() || null,
            },
            p_motivo: null,
          });
          if (audError) console.warn("No se pudo registrar el alta en la auditoría:", audError);
        }

        let newProfile: UserProfile;

        if (insertError) {
          console.warn("Profiles insertion failed or was blocked by RLS, but the Auth user was created successfully. Self-healing will create their profile upon first login. Error details:", insertError);
          
          newProfile = {
            id: authUserId,
            full_name: profileData.full_name,
            email: profileData.email.toLowerCase(),
            phone: profileData.phone,
            role: profileData.role,
            invitation_code_used: profileData.invitation_code_used || undefined,
            password_provisional: profileData.password_provisional || undefined,
            created_at: new Date().toISOString(),
            closer_origen_id: closerOrigenId,
            closer_actual_id: closerOrigenId,
            fecha_incorporacion_closer: incorporadoAt,
            created_by: user?.id || null,
            created_by_role: user?.role || null,
          };

          setProfiles((prev) => [...prev, newProfile]);

          triggerPushNotification(
            `👤 Registro Completo (Auto-Recuperación Activa): Se registró el usuario ${newProfile.full_name} (${newProfile.role === "director" ? "Director" : "Aliado"}). Su perfil se completará automáticamente en su primer inicio de sesión.`,
            "email",
            "Eduardo Director"
          );
        } else {
          // Map back to UI format
          newProfile = {
            id: dbProfile.id,
            full_name: dbProfile.full_name,
            email: dbProfile.email,
            phone: dbProfile.phone,
            role: (dbProfile.role === "admin" || dbProfile.role === "director") ? "director" : (dbProfile.role as any),
            invitation_code_used: dbProfile.invitation_code_used,
            password_provisional: dbProfile.password_provisional,
            created_at: dbProfile.created_at,
            closer_origen_id: dbProfile.closer_origen_id || null,
            closer_actual_id: dbProfile.closer_actual_id || null,
            fecha_incorporacion_closer: dbProfile.fecha_incorporacion_closer || null,
            created_by: dbProfile.created_by || null,
            created_by_role: dbProfile.created_by_role || null,
          };

          setProfiles((prev) => [...prev, newProfile]);
        }

        // Notify Directors in DB
        const directors = profiles.filter(p => p.role === "director");
        for (const dir of directors) {
          await supabase.from("notifications").insert({
            user_id: dir.id,
            title: "Nuevo Usuario Registrado 👤",
            message: `Se ha registrado exitosamente a ${newProfile.full_name} con el rol de ${newProfile.role === "director" ? "Director" : "Aliado"}.`,
            type: "success",
            read: false,
          });
        }

        // El alta no asigna Account Manager: lo reparte Dirección en
        // /admin/asignacion-am. El aviso al AM cuando llegue su primer proyecto
        // lo emite el trigger `notify_on_prospect_insert` de la BD.

        triggerPushNotification(
          `👤 Registro Completo: Se registró el usuario ${newProfile.full_name} (${newProfile.role === "director" ? "Director" : "Aliado"}). Puede iniciar sesión con su correo: ${newProfile.email}`,
          "email",
          "Eduardo Director"
        );

        return newProfile;
      } catch (error) {
        console.error("Error creating profile in Supabase:", error);
        throw error;
      }
    }
  };

  // ── Auditoría y credenciales de un aliado (§8, §9 y §14) ──────────────────
  const registrarAuditoriaAliado = async (input: {
    aliadoId: string;
    accion: AliadoAuditoriaAccion;
    antes?: Record<string, unknown> | null;
    despues?: Record<string, unknown> | null;
    motivo?: string | null;
  }): Promise<void> => {
    if (isDemoMode || isProvisionalSession || !supabase) return;
    // Registrar nunca puede tumbar la acción que se acaba de hacer: si esto
    // falla, la operación ya ocurrió y lo único que se pierde es el renglón del
    // historial. Se avisa por consola y se sigue.
    const { error } = await supabase.rpc("registrar_auditoria_aliado", {
      p_aliado_id: input.aliadoId,
      p_accion: input.accion,
      p_antes: input.antes ?? null,
      p_despues: input.despues ?? null,
      p_motivo: input.motivo ?? null,
    });
    if (error) console.warn("No se pudo registrar en la auditoría del aliado:", error);
  };

  // ── Actividad del Account Manager ────────────────────────────────────────────
  // Medición de esfuerzo, no de resultado: cuánto tiempo está el AM dentro de la
  // plataforma y qué hace mientras. Lo lee el panel «Actividad en plataforma» del
  // reporte de Account Manager (migración 20260809000000).
  //
  // Tres reglas que no se negocian:
  //   1. NUNCA rompen lo que las dispara. Son `void` y se tragan el error: si la
  //      bitácora falla, el cambio de etapa ya ocurrió y lo único que se pierde
  //      es el renglón del registro.
  //   2. NUNCA se esperan. Se llaman sin `await` para no meter un viaje de red en
  //      medio de una acción del usuario.
  //   3. El tiempo lo pone el servidor. Aquí solo se dice "estoy" o "hice esto";
  //      la duración, el reloj y su tope viven en Postgres.
  const puedeRegistrarActividad = () =>
    !isDemoMode && !isProvisionalSession && !!supabase && user?.role === "account_manager";

  const llamadaActividad = async (rpc: string, params: Record<string, unknown>, queja: string) => {
    try {
      const { error } = await supabase!.rpc(rpc, params);
      if (error) console.warn(queja, error.message);
    } catch (e) {
      console.warn(queja, e);
    }
  };

  const registrarActividad = (tipo: string, detalle?: string | null, entidadId?: string | null): void => {
    if (!puedeRegistrarActividad()) return;
    void llamadaActividad(
      "actividad_registrar",
      { p_tipo: tipo, p_detalle: detalle ?? null, p_entidad: entidadId ?? null },
      "No se pudo registrar la actividad:"
    );
  };

  const latidoActividad = (activo: boolean): void => {
    if (!puedeRegistrarActividad()) return;
    void llamadaActividad(
      "actividad_latido",
      { p_activo: activo },
      "No se pudo registrar el latido de actividad:"
    );
  };

  const credencialesAliado = async (
    aliadoId: string
  ): Promise<{ email: string; password: string | null }> => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      const local = profiles.find((p) => p.id === aliadoId);
      if (!local) throw new Error("Ese aliado ya no existe.");
      return { email: local.email, password: local.password_provisional || null };
    }
    const { data, error } = await supabase.rpc("credenciales_aliado", { p_aliado_id: aliadoId });
    if (error) {
      console.error("Error consultando las credenciales del aliado:", error);
      throw new Error(error.message || "No se pudieron consultar las credenciales.");
    }
    const fila = Array.isArray(data) ? data[0] : data;
    if (!fila) throw new Error("No se pudieron consultar las credenciales.");
    return { email: fila.email, password: fila.password_provisional || null };
  };

  const auditoriaDeAliado = async (aliadoId: string): Promise<AliadoAuditoriaRow[]> => {
    if (isDemoMode || isProvisionalSession || !supabase) return [];
    const { data, error } = await supabase
      .from("aliado_auditoria")
      .select("*")
      .eq("aliado_id", aliadoId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.warn("No se pudo leer la auditoría del aliado:", error);
      return [];
    }
    return (data || []) as AliadoAuditoriaRow[];
  };

  const deleteProfile = async (
    id: string,
    options?: { reassignToAliadoId?: string | null; reassignToAmId?: string | null; motivo?: string | null }
  ): Promise<void> => {
    const reassignToAliadoId = options?.reassignToAliadoId || null;
    const reassignToAmId = options?.reassignToAmId || null;
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;

    if (isDemoMode || isProvisionalSession || !supabase) {
      // Reasigna localmente los proyectos del aliado y/o del AM (si se indicó).
      if (reassignToAliadoId || reassignToAmId) {
        const destAliado = reassignToAliadoId ? profiles.find((p) => p.id === reassignToAliadoId) : null;
        const reassigned = prospects.map((p) => {
          let next = p;
          if (reassignToAliadoId && p.aliado_id === id) {
            next = {
              ...next,
              aliado_id: reassignToAliadoId,
              aliado_name: destAliado?.full_name || next.aliado_name,
              empresa_multialiado_id: destAliado?.empresa_multialiado_id || null,
            };
          }
          if (reassignToAmId && p.account_manager_id === id) {
            next = { ...next, account_manager_id: reassignToAmId };
          }
          return next;
        });
        setProspects(reassigned);
        saveToStorage("pensionflow_prospects", reassigned);
      }

      // Filter profiles
      const updatedProfiles = profiles.filter((p) => p.id !== id);
      setProfiles(updatedProfiles);
      saveToStorage("pensionflow_profiles", updatedProfiles);

      // Filter invitation codes
      let codesToUpdate = [...invitationCodes];
      if (profile.invitation_code_used) {
        codesToUpdate = codesToUpdate.filter(c => c.code !== profile.invitation_code_used);
      }
      codesToUpdate = codesToUpdate.filter(c => c.used_by !== id);
      setInvitationCodes(codesToUpdate);
      saveToStorage("pensionflow_codes", codesToUpdate);

      // Notify
      const newNotif: NotificationItem = {
        id: `notif-${Math.random().toString(36).substr(2, 9)}`,
        title: "Usuario Eliminado 👤❌",
        message: `El perfil de ${profile.full_name} (${profile.email}) y su código de invitación fueron eliminados del sistema.`,
        type: "warning",
        read: false,
        created_at: new Date().toISOString(),
      };
      setNotifications([newNotif, ...notifications]);
      saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);
    } else {
      // Borrado PERMANENTE real vía endpoint de servidor. El cliente no puede
      // borrar de verdad (RLS sin política DELETE, FK bloqueantes y la cuenta
      // de auth.users sobreviviría); el endpoint usa la service_role para
      // reasignar proyectos, desligar códigos y eliminar la cuenta de auth.
      // Barra final: el proyecto usa `trailingSlash: true`, así el POST pega
      // directo al route handler sin pasar por una redirección 308.
      const res = await fetch("/api/admin/delete-user/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: id,
          reassignToAliadoId: reassignToAliadoId || null,
          reassignToAmId: reassignToAmId || null,
          motivo: options?.motivo || null,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        // Propaga el error (incl. needsReassign) para que la UI lo muestre.
        const err: any = new Error(data?.error || "No se pudo eliminar el usuario.");
        err.needsReassign = data?.needsReassign;
        err.projectCount = data?.projectCount;
        throw err;
      }

      // Sincroniza el estado local: quita el perfil, reasigna sus proyectos
      // (como aliado y/o como AM) y olvida los códigos que usó ese usuario.
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (reassignToAliadoId || reassignToAmId) {
        const destAliado = reassignToAliadoId ? profiles.find((p) => p.id === reassignToAliadoId) : null;
        setProspects((prev) =>
          prev.map((p) => {
            let next = p;
            if (reassignToAliadoId && p.aliado_id === id) {
              next = {
                ...next,
                aliado_id: reassignToAliadoId,
                aliado_name: destAliado?.full_name || next.aliado_name,
                empresa_multialiado_id: destAliado?.empresa_multialiado_id || null,
              };
            }
            if (reassignToAmId && p.account_manager_id === id) {
              next = { ...next, account_manager_id: reassignToAmId };
            }
            return next;
          })
        );
      }
      setInvitationCodes((prev) => prev.filter((c) => c.used_by !== id));

      // Notificación local para el director.
      await supabase.from("notifications").insert({
        user_id: user?.id,
        title: "Usuario Eliminado 👤❌",
        message: `El perfil de ${profile.full_name} (${profile.email}) fue eliminado permanentemente del sistema.`,
        type: "warning",
        read: false,
      });
    }
  };

  // Actualiza la configuración global de links de reunión. Solo la Dirección debe
  // llamar esto (la RLS de `app_settings` rechaza updates de otros roles).
  const updateAppSettings = async (updates: Partial<AppSettings>): Promise<void> => {
    const next: AppSettings = { ...appSettings, ...updates };

    if (isDemoMode || isProvisionalSession || !supabase) {
      setAppSettings(next);
      saveToStorage("pensionflow_app_settings", next);
      return;
    }

    const { error } = await supabase
      .from("app_settings")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;

    setAppSettings(next);
  };

  const updateProfileAdmin = async (
    id: string,
    updates: Partial<Omit<UserProfile, "id" | "created_at">>
  ): Promise<void> => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;

    if (isDemoMode || isProvisionalSession || !supabase) {
      const updatedProfiles = profiles.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            ...updates,
          };
        }
        return p;
      });
      setProfiles(updatedProfiles);
      saveToStorage("pensionflow_profiles", updatedProfiles);

      if (user?.id === id) {
        const updatedUser = { ...user, ...updates };
        setUser(updatedUser);
        saveToStorage("pensionflow_user", updatedUser);
      }

      const newNotif: NotificationItem = {
        id: `notif-${Math.random().toString(36).substr(2, 9)}`,
        title: "Usuario Actualizado 👤✏️",
        message: `El perfil de ${updates.full_name || profile.full_name} fue actualizado con éxito.`,
        type: "success",
        read: false,
        created_at: new Date().toISOString(),
      };
      setNotifications([newNotif, ...notifications]);
      saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);
    } else if (user?.role === "closer") {
      // El closer no tiene política de UPDATE sobre `profiles` —sería ciega a
      // columnas— así que pasa por una función acotada que solo escribe nombre,
      // teléfono y contrato. Ver 20260801000004.
      //
      // Y aquí SÍ se relanza el error, a diferencia de la rama de abajo: el
      // closer está editando desde un formulario que debe poder decirle que no
      // se guardó, en vez de cerrarse como si todo hubiera ido bien.
      const { error } = await supabase.rpc("closer_actualiza_aliado", {
        p_aliado_id: id,
        p_full_name: updates.full_name ?? profile.full_name,
        p_phone: updates.phone ?? profile.phone ?? null,
        p_contrato_url: updates.contrato_url ?? profile.contrato_url ?? null,
      });
      if (error) {
        console.error("Error actualizando al aliado desde el closer:", error);
        throw new Error(error.message || "No se pudo guardar el cambio.");
      }
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    } else {
      try {
        const dbRole = updates.role === "director" ? "admin" : updates.role;

        const dbUpdates: any = {};
        if (updates.full_name !== undefined) dbUpdates.full_name = updates.full_name;
        if (updates.email !== undefined) dbUpdates.email = updates.email.toLowerCase();
        if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
        if (updates.role !== undefined) dbUpdates.role = dbRole;
        if (updates.is_active !== undefined) dbUpdates.is_active = updates.is_active;
        if (updates.auto_assign_enabled !== undefined) dbUpdates.auto_assign_enabled = updates.auto_assign_enabled;
        if (updates.password_provisional !== undefined) dbUpdates.password_provisional = updates.password_provisional;
        // Atribución al closer (ver assignCloser, que es la vía normal; esto
        // cubre la edición directa del perfil desde Gestión de Usuarios).
        if (updates.closer_origen_id !== undefined) dbUpdates.closer_origen_id = updates.closer_origen_id;
        if (updates.closer_actual_id !== undefined) dbUpdates.closer_actual_id = updates.closer_actual_id;
        if (updates.fecha_incorporacion_closer !== undefined) dbUpdates.fecha_incorporacion_closer = updates.fecha_incorporacion_closer;
        if (updates.closer_asignado_por !== undefined) dbUpdates.closer_asignado_por = updates.closer_asignado_por;
        // Contrato firmado del aliado. Se permite editarlo después del alta
        // porque los 227 aliados anteriores a la regla llegaron sin él y hay que
        // poder completarlos antes de la siguiente quincena de comisiones.
        if (updates.contrato_url !== undefined) {
          dbUpdates.contrato_url = updates.contrato_url;
          dbUpdates.contrato_url_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from("profiles")
          .update(dbUpdates)
          .eq("id", id);

        if (error) {
          console.warn("Error updating profile with full payload, retrying without is_active:", error);
          if (dbUpdates.is_active !== undefined) {
            delete dbUpdates.is_active;
            const { error: error2 } = await supabase
              .from("profiles")
              .update(dbUpdates)
              .eq("id", id);
            if (error2) throw error2;
          } else {
            throw error;
          }
        }

        setProfiles((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
        );

        if (user?.id === id) {
          setUser((prev) => (prev ? { ...prev, ...updates } : null));
        }

        // Auditoría (§14). Solo de los aliados y solo de lo que de verdad
        // cambió: un renglón por cada campo tocado, con su antes y su después.
        // Cambiar la contraseña provisional se registra aparte, pero NUNCA con
        // el valor: en el historial queda el hecho, no la credencial.
        if (profile.role === "aliado") {
          const campos = ["full_name", "email", "phone", "contrato_url", "is_active"] as const;
          const antes: Record<string, unknown> = {};
          const despues: Record<string, unknown> = {};
          for (const c of campos) {
            if (updates[c] !== undefined && updates[c] !== (profile as any)[c]) {
              antes[c] = (profile as any)[c] ?? null;
              despues[c] = updates[c] ?? null;
            }
          }
          if (Object.keys(despues).length > 0) {
            await registrarAuditoriaAliado({ aliadoId: id, accion: "edicion", antes, despues });
          }
          if (
            updates.password_provisional !== undefined &&
            updates.password_provisional !== profile.password_provisional
          ) {
            await registrarAuditoriaAliado({ aliadoId: id, accion: "credenciales_cambiadas" });
          }
        }

        await supabase.from("notifications").insert({
          user_id: user?.id,
          title: "Usuario Actualizado 👤✏️",
          message: `El perfil de ${updates.full_name || profile.full_name} fue actualizado con éxito.`,
          type: "success",
          read: false,
        });
      } catch (err) {
        console.error("Error updating profile:", err);
      }
    }
  };

  const changeAllyType = async (
    allyId: string,
    tipo: "aliado" | "lider",
    empresaMultialiadoId?: string | null
  ): Promise<void> => {
    const profile = profiles.find((p) => p.id === allyId);
    if (!profile) return;

    if (isDemoMode || isProvisionalSession || !supabase) {
      // Local updates in demo mode
      const company = empresasMultialiado.find(e => e.id === empresaMultialiadoId);
      const companyName = empresaMultialiadoId ? (company?.nombre || "Sin Empresa") : null;

      const updatedProfiles = profiles.map((p) => {
        if (p.id === allyId) {
          const companyChanged = p.empresa_multialiado_id !== (empresaMultialiadoId || null);
          const roleChangedToLider = p.aliado_tipo !== "lider" && tipo === "lider";
          const updated = {
            ...p,
            aliado_tipo: tipo,
            empresa_multialiado_id: empresaMultialiadoId || null,
            lider_grupo: companyName,
          };
          if (companyChanged || roleChangedToLider) {
            updated.lider_id = null;
            updated.lider_ids = [];
            updated.lider_aliado_rel_id = null;
            updated.lider_aliado_rels = [];
          }
          return updated;
        }
        return p;
      });
      setProfiles(updatedProfiles);
      saveToStorage("pensionflow_profiles", updatedProfiles);

      // If updating self (for preview)
      if (user?.id === allyId) {
        const companyChanged = user.empresa_multialiado_id !== (empresaMultialiadoId || null);
        const roleChangedToLider = user.aliado_tipo !== "lider" && tipo === "lider";
        const updatedUser = {
          ...user,
          aliado_tipo: tipo,
          empresa_multialiado_id: empresaMultialiadoId || null,
          lider_grupo: companyName,
        };
        if (companyChanged || roleChangedToLider) {
          updatedUser.lider_id = null;
          updatedUser.lider_ids = [];
          updatedUser.lider_aliado_rel_id = null;
          updatedUser.lider_aliado_rels = [];
        }
        setUser(updatedUser);
        saveToStorage("pensionflow_user", updatedUser);
      }

      // Re-calculate leader counts locally
      const countMap: Record<string, number> = {};
      updatedProfiles.forEach((p: any) => {
        if (p.aliado_tipo === "lider" && p.empresa_multialiado_id) {
          countMap[p.empresa_multialiado_id] = (countMap[p.empresa_multialiado_id] || 0) + 1;
        }
      });
      setEmpresasMultialiado(prev => prev.map(e => ({
        ...e,
        lideres_count: countMap[e.id] || 0
      })));

      const msg = `Tipo de aliado actualizado a ${tipo === "lider" ? `Líder de ${companyName}` : "Aliado"}`;
      setToast({ id: Date.now().toString(), type: "email", recipient: profile.email, message: msg });
    } else {
      try {
        const res = await fetch(`/api/aliados/${allyId}/tipo`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aliado_tipo: tipo,
            empresa_multialiado_id: empresaMultialiadoId || null,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Error al actualizar tipo de aliado");
        }

        const companyName = data.empresa_nombre || null;

        // Update local profiles list
        const updatedProfiles = profiles.map((p) => {
          if (p.id === allyId) {
            const companyChanged = p.empresa_multialiado_id !== (empresaMultialiadoId || null);
            const roleChangedToLider = p.aliado_tipo !== "lider" && tipo === "lider";
            const updated = {
              ...p,
              aliado_tipo: tipo,
              empresa_multialiado_id: empresaMultialiadoId || null,
              lider_grupo: companyName,
            };
            if (companyChanged || roleChangedToLider) {
              updated.lider_id = null;
              updated.lider_ids = [];
              updated.lider_aliado_rel_id = null;
              updated.lider_aliado_rels = [];
            }
            return updated;
          }
          return p;
        });
        setProfiles(updatedProfiles);

        if (user?.id === allyId) {
          setUser((prev) => {
            if (!prev) return null;
            const companyChanged = prev.empresa_multialiado_id !== (empresaMultialiadoId || null);
            const roleChangedToLider = prev.aliado_tipo !== "lider" && tipo === "lider";
            const updatedUser = {
              ...prev,
              aliado_tipo: tipo,
              empresa_multialiado_id: empresaMultialiadoId || null,
              lider_grupo: companyName,
            };
            if (companyChanged || roleChangedToLider) {
              updatedUser.lider_id = null;
              updatedUser.lider_ids = [];
              updatedUser.lider_aliado_rel_id = null;
              updatedUser.lider_aliado_rels = [];
            }
            return updatedUser;
          });
        }

        // Re-calculate leader counts
        const countMap: Record<string, number> = {};
        updatedProfiles.forEach((p: any) => {
          if (p.aliado_tipo === "lider" && p.empresa_multialiado_id) {
            countMap[p.empresa_multialiado_id] = (countMap[p.empresa_multialiado_id] || 0) + 1;
          }
        });
        setEmpresasMultialiado(prev => prev.map(e => ({
          ...e,
          lideres_count: countMap[e.id] || 0
        })));

        // Notify
        await supabase.from("notifications").insert({
          user_id: user?.id,
          title: "Tipo de Aliado Actualizado 👤⚙️",
          message: `El aliado ${profile.full_name} ahora es ${tipo === "lider" ? `Líder de la empresa '${companyName}'` : "Aliado estándar"}.`,
          type: "success",
          read: false,
        });
      } catch (err: any) {
        console.error("Error updating ally type:", err);
        alert(err.message || "Error al cambiar tipo de aliado");
        throw err;
      }
    }
  };

  const assignAllyToLider = async (
    allyId: string,
    liderIds: string[]
  ): Promise<void> => {
    const ally = profiles.find((p) => p.id === allyId);
    if (!ally) return;

    if (isDemoMode || isProvisionalSession || !supabase) {
      // Local updates in demo mode
      let localLiderAliados: any[] = [];
      const storedLiderAliados = localStorage.getItem("pensionflow_lider_aliados");
      if (storedLiderAliados) {
        try {
          localLiderAliados = JSON.parse(storedLiderAliados);
        } catch (e) {
          localLiderAliados = [];
        }
      }

      // Remove existing relations for this ally
      localLiderAliados = localLiderAliados.filter((r) => r.aliado_asignado_id !== allyId);

      const newRels: any[] = [];

      liderIds.forEach((lId) => {
        const lider = profiles.find((p) => p.id === lId);
        const groupName = lider?.lider_grupo || "Grupo Demo";
        const relationId = `rel-${Math.random().toString(36).substr(2, 9)}`;

        const newRel = {
          id: relationId,
          lider_id: lId,
          aliado_asignado_id: allyId,
          grupo_nombre: groupName,
        };
        localLiderAliados.push(newRel);
        newRels.push(newRel);
      });

      localStorage.setItem("pensionflow_lider_aliados", JSON.stringify(localLiderAliados));

      // Update profiles local state
      const updatedProfiles = profiles.map((p) => {
        if (p.id === allyId) {
          return {
            ...p,
            lider_ids: liderIds,
            lider_aliado_rels: newRels.map(r => ({ id: r.id, lider_id: r.lider_id })),
            // Keep for backwards compatibility with single leader logic if any
            lider_id: liderIds.length > 0 ? liderIds[0] : null,
            lider_aliado_rel_id: newRels.length > 0 ? newRels[0].id : null,
          };
        }
        return p;
      });
      setProfiles(updatedProfiles);
      saveToStorage("pensionflow_profiles", updatedProfiles);

      const msg = liderIds.length > 0 ? `Asignado a ${liderIds.length} Líder(es)` : `Retirado de Líderes`;
      setToast({ id: Date.now().toString(), type: "email", recipient: ally.email, message: msg });
    } else {
      try {
        // We will send the array to the API and let the API sync it
        const res = await fetch("/api/lider-aliados", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lider_ids: liderIds,
            aliado_asignado_id: allyId,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Error al asignar líderes");
        }

        // Update local profile state with the returned new relationships
        const newRels = data.relations || [];
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === allyId
              ? {
                  ...p,
                  lider_ids: liderIds,
                  lider_aliado_rels: newRels.map((r: any) => ({ id: r.id, lider_id: r.lider_id })),
                  lider_id: liderIds.length > 0 ? liderIds[0] : null,
                  lider_aliado_rel_id: newRels.length > 0 ? newRels[0].id : null,
                }
              : p
          )
        );

        // Notify
        await supabase.from("notifications").insert({
          user_id: user?.id,
          title: "Asignación de Líder Actualizada 👥🔄",
          message: liderIds.length > 0
            ? `El aliado ${ally.full_name} ha sido asignado a ${liderIds.length} líder(es).`
            : `El aliado ${ally.full_name} ha sido desasignado de sus líderes.`,
          type: "info",
          read: false,
        });
      } catch (err: any) {
        console.error("Error updating leader assignment:", err);
        alert(err.message || "Error al asignar líder");
        throw err;
      }
    }
  };

  const createEmpresa = async (nombre: string): Promise<EmpresaMultialiado> => {
    if (!nombre || !nombre.trim()) throw new Error("El nombre de la empresa es obligatorio");

    if (isDemoMode || isProvisionalSession || !supabase) {
      const storedEmpresas = localStorage.getItem("pensionflow_empresas_multialiado");
      let list: EmpresaMultialiado[] = [];
      if (storedEmpresas) {
        try { list = JSON.parse(storedEmpresas); } catch (e) {}
      }

      if (list.some(e => e.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
        throw new Error(`La empresa '${nombre.trim()}' ya existe`);
      }

      const newEmpresa: EmpresaMultialiado = {
        id: "empresa-" + Date.now().toString(),
        nombre: nombre.trim(),
        created_by: user?.full_name || "Sistema",
        created_at: new Date().toISOString(),
        lideres_count: 0
      };

      const updatedList = [...list, newEmpresa];
      setEmpresasMultialiado(updatedList);
      saveToStorage("pensionflow_empresas_multialiado", updatedList);

      setToast({
        id: Date.now().toString(),
        type: "email",
        recipient: user?.email || "",
        message: `Empresa '${nombre.trim()}' creada (Modo Demo)`
      });

      return newEmpresa;
    } else {
      const res = await fetch("/api/empresas-multialiado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear la empresa");

      const newEmp: EmpresaMultialiado = {
        id: data.id,
        nombre: data.nombre,
        created_by: data.created_by,
        created_at: data.created_at,
        lideres_count: 0
      };

      setEmpresasMultialiado(prev => [...prev, newEmp]);
      return newEmp;
    }
  };

  const updateEmpresa = async (id: string, nombre: string): Promise<void> => {
    if (!nombre || !nombre.trim()) throw new Error("El nombre de la empresa es obligatorio");

    if (isDemoMode || isProvisionalSession || !supabase) {
      const storedEmpresas = localStorage.getItem("pensionflow_empresas_multialiado");
      let list: EmpresaMultialiado[] = [];
      if (storedEmpresas) {
        try { list = JSON.parse(storedEmpresas); } catch (e) {}
      }

      if (list.some(e => e.nombre.toLowerCase() === nombre.trim().toLowerCase() && e.id !== id)) {
        throw new Error(`La empresa '${nombre.trim()}' ya existe`);
      }

      const updatedList = list.map(e => {
        if (e.id === id) {
          return { ...e, nombre: nombre.trim(), updated_at: new Date().toISOString() };
        }
        return e;
      });

      setEmpresasMultialiado(updatedList);
      saveToStorage("pensionflow_empresas_multialiado", updatedList);

      // Also update company name in profiles and user for backward compatibility (lider_grupo)
      setProfiles(prev => prev.map(p => {
        if (p.empresa_multialiado_id === id) {
          return { ...p, lider_grupo: nombre.trim() };
        }
        return p;
      }));
      if (user && user.empresa_multialiado_id === id) {
        setUser({ ...user, lider_grupo: nombre.trim() });
      }

      setToast({
        id: Date.now().toString(),
        type: "email",
        recipient: user?.email || "",
        message: `Empresa actualizada a '${nombre.trim()}' (Modo Demo)`
      });
    } else {
      const res = await fetch(`/api/empresas-multialiado/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar la empresa");

      // Update locally
      setEmpresasMultialiado(prev => prev.map(e => e.id === id ? { ...e, nombre: data.nombre } : e));
      setProfiles(prev => prev.map(p => {
        if (p.empresa_multialiado_id === id) {
          return { ...p, lider_grupo: data.nombre };
        }
        return p;
      }));
      if (user && user.empresa_multialiado_id === id) {
        setUser(prev => prev ? { ...prev, lider_grupo: data.nombre } : null);
      }
    }
  };

  const deleteEmpresa = async (id: string): Promise<void> => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      // Check if any leaders are assigned in local profiles
      const hasLeaders = profiles.some(p => p.aliado_tipo === "lider" && p.empresa_multialiado_id === id);
      if (hasLeaders) {
        throw new Error("No se puede eliminar la empresa porque tiene líderes asignados");
      }

      const storedEmpresas = localStorage.getItem("pensionflow_empresas_multialiado");
      let list: EmpresaMultialiado[] = [];
      if (storedEmpresas) {
        try { list = JSON.parse(storedEmpresas); } catch (e) {}
      }

      const updatedList = list.filter(e => e.id !== id);
      setEmpresasMultialiado(updatedList);
      saveToStorage("pensionflow_empresas_multialiado", updatedList);

      setToast({
        id: Date.now().toString(),
        type: "email",
        recipient: user?.email || "",
        message: "Empresa eliminada (Modo Demo)"
      });
    } else {
      const res = await fetch(`/api/empresas-multialiado/${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar la empresa");

      setEmpresasMultialiado(prev => prev.filter(e => e.id !== id));
    }
  };

  const getFileContent = async (doc: DocumentItem): Promise<string | null> => {
    if (isDemoMode || !supabase) {
      return getFile(doc.id);
    } else {
      try {
        if (!doc.storage_path) {
          return doc.file_url;
        }

        const { data, error } = await supabase.storage
          .from("documents")
          .download(doc.storage_path);

        if (error || !data) {
          console.error("Error downloading from storage:", error);
          return null;
        }

        return new Promise<string | null>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(null);
          reader.readAsDataURL(data);
        });
      } catch (error) {
        console.error("Error in getFileContent:", error);
        return null;
      }
    }
  };

  const markNotificationRead = (id: string) => {
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    setNotifications(updated);
    saveToStorage("pensionflow_notifications", updated);
    if (!isDemoMode && supabase) {
      supabase.from("notifications").update({ read: true }).eq("id", id).then();
    }
  };

  const markAllNotificationsRead = () => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(updated);
    saveToStorage("pensionflow_notifications", updated);
    if (!isDemoMode && supabase && user) {
      supabase.from("notifications").update({ read: true }).eq("user_id", user.id).then();
    }
  };

  const clearToast = () => {
    setToast(null);
  };

  const triggerPushNotification = (message: string, type: "whatsapp" | "email", recipient: string) => {
    setToast({
      id: `toast-${Date.now()}`,
      message,
      type,
      recipient,
    });
  };

  // Perfiles visibles por rol. Con el AM POR PROYECTO, la relación aliado↔AM se
  // deriva de los prospects (ya no de una cartera fija en el perfil):
  //   · AM     → él mismo + los aliados dueños de SUS proyectos
  //   · aliado → él mismo + los AMs asignados a SUS proyectos
  const exposedProfiles = React.useMemo(() => {
    if (!user) return [];
    // `finanzas` no se recorta aquí y no hace falta: en producción su RLS solo le
    // entrega su propia fila y las de dirección, así que la lista ya llega
    // recortada por la base. Filtrarla otra vez solo rompería la previsualización
    // local, donde no hay RLS y el motor demo del módulo se alimenta de esta
    // misma lista. Los selectores de personas del módulo NO salen de aquí: van
    // por `fin_directorio()` justamente para no depender de esto.
    if (user.role === "director" || user.role === "finanzas") return profiles;
    if (user.role === "account_manager") {
      const myAllyIds = new Set(
        prospects.filter(p => p.account_manager_id === user.id).map(p => p.aliado_id)
      );
      return profiles.filter(p =>
        p.id === user.id ||
        // Los CLOSERS. El AM los da de alta y les atribuye aliados desde
        // 20260803000000, y el RLS ya se lo permite; este filtro de cliente se
        // quedó atrás y los borraba después de traerlos, así que el selector
        // "Closer responsable" salía vacío y el alta se bloqueaba con un
        // "no existe ningún closer" que era mentira.
        p.role === "closer" ||
        // La DIRECCIÓN, por dos motivos: es un destino válido de la atribución
        // —también cierra aliados y cobra por ello, 20260804000001— y es con
        // quien el AM habla en el chat.
        p.role === "director" ||
        (p.role === "aliado" && (
          myAllyIds.has(p.id) ||
          // Los aliados que él mismo dio de alta. Sin esto, un aliado recién
          // creado por el AM desaparecía de su lista en cuanto se guardaba:
          // todavía no tiene ningún proyecto que los relacione.
          (!!p.created_by && p.created_by === user.id)
        ))
      );
    }
    if (user.role === "aliado") {
      const myAmIds = new Set(
        prospects
          .filter(p => p.aliado_id === user.id && p.account_manager_id)
          .map(p => p.account_manager_id as string)
      );
      return profiles.filter(p => p.id === user.id || myAmIds.has(p.id));
    }
    if (user.role === "closer") {
      // El closer ve su propio perfil y el de los aliados que incorporó o que
      // acompaña hoy. Nada más: ni otros closers, ni la cartera de nadie más.
      // Coincide exactamente con la política RLS "Closers ven sus aliados
      // atribuidos" de 20260801000000, así que el filtro cliente y la base dicen
      // lo mismo.
      return profiles.filter(
        p =>
          p.id === user.id ||
          (p.role === "aliado" && (p.closer_origen_id === user.id || p.closer_actual_id === user.id))
      );
    }
    return [];
  }, [user, profiles, prospects]);

  // Contactos del chat general (mensajería directa). Se computa del `profiles` crudo (no del
  // filtrado `exposedProfiles`) para poder incluir a la dirección, con la que todos pueden
  // hablar. Con el AM POR PROYECTO, la relación aliado↔AM sale de los prospects:
  //   · aliado ↔ los AMs de sus proyectos + dirección + su(s) líder(es) de grupo
  //   · líder  ↔ los AMs de sus proyectos + dirección + su equipo asignado
  //   · AM     ↔ los aliados dueños de sus proyectos + dirección
  //   · director ↔ todos
  // La visibilidad de perfiles necesaria la dan las políticas RLS: la aditiva de dirección
  // (20260706000001), líder↔aliados (20260630000000) y "AMs visibles para autenticados"
  // (20260723000000, el aliado puede leer el perfil del AM de sus proyectos).
  const messagingContacts = React.useMemo(() => {
    if (!user) return [] as UserProfile[];
    const others = profiles.filter(p => p.id !== user.id && p.is_active !== false);
    if (user.role === "director") return others;
    if (user.role === "account_manager") {
      const myAllyIds = new Set(
        prospects.filter(p => p.account_manager_id === user.id).map(p => p.aliado_id)
      );
      return others.filter(p => (p.role === "aliado" && myAllyIds.has(p.id)) || p.role === "director");
    }
    if (user.role === "aliado") {
      const myAmIds = new Set(
        prospects
          .filter(p => p.aliado_id === user.id && p.account_manager_id)
          .map(p => p.account_manager_id as string)
      );
      // Unificado y simétrico: sirve tanto para un líder (equipo vía `p.lider_ids`) como para un
      // aliado regular (sus líderes vía `user.lider_ids`). Cada quien ve solo lo que le aplica.
      return others.filter(p =>
        myAmIds.has(p.id) ||
        p.role === "director" ||
        // Mi(s) líder(es): perfiles cuyo id está en mis lider_ids.
        (user.lider_ids?.includes(p.id) ?? false) ||
        // Mi equipo: aliados que me tienen a mí como líder.
        (p.role === "aliado" && (p.lider_ids?.includes(user.id) ?? false))
      );
    }
    if (user.role === "closer") {
      // Habla con dirección y con los aliados que él mismo incorporó o acompaña.
      // El RLS de `direct_messages` no discrimina por rol (solo exige que el
      // emisor sea uno mismo), así que no hace falta migración para esto.
      return others.filter(
        p =>
          p.role === "director" ||
          (p.role === "aliado" && (p.closer_origen_id === user.id || p.closer_actual_id === user.id))
      );
    }
    if (user.role === "finanzas") {
      // Solo con dirección: es de quien recibe las instrucciones de pago y a
      // quien le reporta. No habla con aliados —no los ve— ni con los AM.
      return others.filter(p => p.role === "director");
    }
    return [] as UserProfile[];
  }, [user, profiles, prospects]);

  const exposedProspects = React.useMemo(() => {
    if (!user) return [];
    if (user.role === "director") return prospects;
    if (user.role === "account_manager") {
      // El AM trabaja POR PROYECTO: ve los prospects asignados a él (ya no la
      // cartera de aliados).
      return prospects.filter(p => p.account_manager_id === user.id);
    }
    if (user.role === "aliado") {
      if (user.aliado_tipo === "lider") {
        const assignedAllyIds = profiles
          .filter(p => p.role === "aliado" && p.lider_ids?.includes(user.id))
          .map(p => p.id);
        return prospects.filter(p => 
          p.aliado_id === user.id || 
          assignedAllyIds.includes(p.aliado_id) ||
          (user.empresa_multialiado_id && p.empresa_multialiado_id === user.empresa_multialiado_id)
        );
      }
      return prospects.filter(p => p.aliado_id === user.id);
    }
    // El rol `closer` NO recibe expedientes: cero proyectos, a propósito. Sus
    // números llegan por las RPC agregadas (closers_overview / closer_aliados),
    // que devuelven conteos y nunca CURP, NSS ni teléfono de un cliente. La base
    // impone lo mismo: no existe ninguna política que le dé lectura a
    // `prospects`. Ver la nota de RLS en 20260801000000_closers.sql.
    return [];
  }, [user, prospects, profiles]);

  return (
    <AppContext.Provider
      value={{
        user,
        activeRole,
        prospects: exposedProspects,
        invitationCodes,
        notifications,
        profiles: exposedProfiles,
        messagingContacts,
        // Lista completa para el selector de asignación: usamos el `profiles` CRUDO
        // (no `exposedProfiles`). Para el director es todo; para un AM, con el RLS
        // ampliado (mig 20260722000002), incluye TODOS los aliados del sistema.
        assignmentProfiles: profiles,
        toast,
        appSettings,
        updateAppSettings,
        isDemoMode,
        isProvisionalSession,
        isLoading,
        dbError,
        login,
        sendPasswordReset,
        updateUserPassword,
        updateUserProfile,
        uploadAvatar,
        uploadDocument,
        deleteDocument,
        logout,
        switchRole,
        addProspect,
        deleteProspect,
        checkCurpExists,
        checkTeamDuplicate,
        restoreProspect,
        permanentlyDeleteProspect,
        editProspectPersonalData,
        reassignProspect,
        reassignAccountManager,
        assignAccountManager,
        isProspectDeleted,
        isProspectPurged,
        getProspectDeletedAt,
        updateProspectStatus,
        updateProspectModalidad,
        saveSimulation,
        saveSimulationDraft,
        scheduleAssessment,
        generateInvitationCode,
        registerAliado,
        initializeDirector,
        createProfile,
        assignCloser,
        deleteProfile,
        credencialesAliado,
        registrarAuditoriaAliado,
        auditoriaDeAliado,
        registrarActividad,
        latidoActividad,
        updateProfileAdmin,
        changeAllyType,
        assignAllyToLider,
        empresasMultialiado,
        createEmpresa,
        updateEmpresa,
        deleteEmpresa,
        markNotificationRead,
        markAllNotificationsRead,
        clearToast,
        triggerPushNotification,
        getFileContent,
        notasResumen,
        cotejosGhl,
        fetchProspectNotas,
        addProspectNota,
        updateProspectNota,
        deleteProspectNota,
        recargarResumenNotas: cargarResumenNotas,
        recargarCotejosGhl: cargarCotejosGhl,
      }}
    >
      {children}
      <IdleLogout />
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppContextProvider");
  }
  return context;
}

// Vigilante de inactividad. Se monta dentro del provider y solo actúa en sesiones
// reales (no demo) con un usuario activo. Registra la última actividad en un
// timestamp compartido por localStorage (cross-tab: moverse en cualquier pestaña
// mantiene viva la sesión en todas). Cuando faltan IDLE_WARNING_MS para el cierre
// muestra un aviso con cuenta regresiva; si el usuario no reacciona, cierra sesión
// y los layouts de admin/dashboard redirigen a /login al quedar user=null.
function IdleLogout() {
  const { user, isDemoMode, logout } = useApp();
  const [remaining, setRemaining] = useState<number | null>(null);
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const stayConnected = () => {
    try {
      localStorage.setItem(IDLE_ACTIVITY_KEY, String(Date.now()));
    } catch {}
    setRemaining(null);
  };

  useEffect(() => {
    if (typeof window === "undefined" || isDemoMode || !user) {
      setRemaining(null);
      return;
    }

    let lastWrite = 0;
    const markActivity = () => {
      const now = Date.now();
      if (now - lastWrite < 5_000) return; // registra a lo sumo cada 5s
      lastWrite = now;
      try {
        localStorage.setItem(IDLE_ACTIVITY_KEY, String(now));
      } catch {}
    };

    // Marca actividad al montar para no cerrar la sesión de inmediato.
    lastWrite = Date.now();
    try {
      localStorage.setItem(IDLE_ACTIVITY_KEY, String(lastWrite));
    } catch {}

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, markActivity, { passive: true }));

    const tick = () => {
      let last = 0;
      try {
        last = Number(localStorage.getItem(IDLE_ACTIVITY_KEY) || "0");
      } catch {}
      if (!last) return;
      const idleFor = Date.now() - last;
      if (idleFor >= IDLE_TIMEOUT_MS) {
        setRemaining(null);
        logoutRef.current();
      } else if (idleFor >= IDLE_TIMEOUT_MS - IDLE_WARNING_MS) {
        setRemaining(Math.max(1, Math.ceil((IDLE_TIMEOUT_MS - idleFor) / 1000)));
      } else {
        setRemaining(null);
      }
    };
    const interval = window.setInterval(tick, 1_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, markActivity));
      window.clearInterval(interval);
    };
  }, [isDemoMode, user]);

  if (remaining === null) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl dark:bg-amber-900/40">
          ⏳
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">¿Sigues ahí?</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Tu sesión se cerrará por inactividad en{" "}
          <span className="font-bold tabular-nums text-slate-900 dark:text-white">{remaining}s</span>.
        </p>
        <button
          onClick={stayConnected}
          className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Seguir conectado
        </button>
      </div>
    </div>
  );
}

// Vigencia del cálculo: los cálculos valen hasta el corte del 15 o el de fin de mes.
// Emitido día 1–15 → vigente hasta el 15; emitido 16–fin → vigente hasta el último día del mes.
export function getCalcValidUntil(emittedAt: string | Date | null | undefined): Date | null {
  if (!emittedAt) return null;
  const d = new Date(emittedAt);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth();
  if (d.getDate() <= 15) return new Date(y, m, 15);
  return new Date(y, m + 1, 0); // último día del mes
}

export const STAGES_LIST = [
  { id: "evaluacion_pendiente", label: "Evaluación pendiente" },
  { id: "rechazado", label: "Rechazado" },
  { id: "condicionado", label: "Condicionado" },
  { id: "aprobado", label: "Aprobado" },
  { id: "otorgado", label: "Fin. Otorgado" },
  { id: "cerrado_perdido", label: "Cerrado Perdido" }
];

// Todos los estados que representan un "Cerrado Perdido" (etapa cerrado_perdido):
// el legacy + las 2 subetapas con estado propio. Úsalo para excluir/contar cerrados
// perdidos en el embudo y las métricas (no basta comparar contra "cerrado_perdido").
export const LOST_STATUSES = ["cerrado_perdido", "cerrado_riesgo", "cerrado_desiste"] as const;
export function isLostStatus(status: string): boolean {
  return (LOST_STATUSES as readonly string[]).includes(status);
}

export const SUB_STAGES_BY_STAGE: Record<string, string[]> = {
  // "Evaluación pendiente" ya no tiene subetapas: no se muestra selector de subetapa
  // para esta etapa. Los estados legacy (falta_reporte/falta_afore/pendiente_documentos)
  // siguen mapeando en getStageAndSubStage para datos ya existentes.
  evaluacion_pendiente: [],
  rechazado: ["No aplica"],
  condicionado: ["Aportación", "Falta detallado de semanas", "Falta estado cuenta afore", "Posible simulación laboral", "Agenda futura"],
  // "Listo para Presentar" es lo que deja Dirección/AM al aprobar. "Agenda de Asesoría"
  // NO se elige a mano: se alcanza solo cuando alguien graba la fecha de la reunión
  // (ver EDITABLE_SUB_STAGES_BY_STAGE y scheduleAssessment).
  aprobado: ["Listo para Presentar", "Agenda de Asesoría", "Firma Carta Compromiso", "Analisis de Riesgo", "Firma de Contrato"],
  // "Fin. Otorgado": el financiamiento ya se otorga/ejecuta. "Cerrada Ganada" =
  // firma_programada (se ejecutan las líneas de captura); "Pagada Cerrada" = pagado_comision.
  // Etiquetas legacy: "Esperando líneas de captura" y "Pagado cerrado".
  otorgado: ["Cerrada Ganada", "Pagada Cerrada"],
  cerrado_perdido: ["Análisis de riesgo rechazado", "Desiste"]
};

// Subetapa que NO se elige a mano: el proyecto llega a "Agenda de Asesoría" únicamente
// cuando quien atiende al cliente graba la fecha de la reunión, así que la etapa nunca
// miente (si dice "agendada", hay fecha). Sigue existiendo en SUB_STAGES_BY_STAGE para
// poder filtrarla y mostrarla.
export const AGENDA_SUB_STAGE = "Agenda de Asesoría";

/**
 * Subetapas seleccionables en los desplegables de edición (expediente y tabla de
 * Gestión de Clientes). Es SUB_STAGES_BY_STAGE menos las que fija el sistema.
 * Para filtros y para mostrar la subetapa actual, usar SUB_STAGES_BY_STAGE.
 */
export const EDITABLE_SUB_STAGES_BY_STAGE: Record<string, string[]> = {
  ...SUB_STAGES_BY_STAGE,
  aprobado: SUB_STAGES_BY_STAGE.aprobado.filter((s) => s !== AGENDA_SUB_STAGE),
};

export function getStageAndSubStage(status: string): { stage: string; subStage: string } {
  switch (status) {
    case "falta_reporte":
      return { stage: "evaluacion_pendiente", subStage: "Falta Reporte" };
    case "falta_afore":
      return { stage: "evaluacion_pendiente", subStage: "Falta Afore" };
    case "pendiente_documentos":
      return { stage: "evaluacion_pendiente", subStage: "Pendiente Documentos" };
    case "evaluacion_pendiente":
      return { stage: "evaluacion_pendiente", subStage: "" };
    case "rechazado":
      return { stage: "rechazado", subStage: "No aplica" };
    case "aportacion":
      return { stage: "condicionado", subStage: "Aportación" };
    case "falta_semanas":
      return { stage: "condicionado", subStage: "Falta detallado de semanas" };
    case "falta_afore_cuenta":
      return { stage: "condicionado", subStage: "Falta estado cuenta afore" };
    case "posible_simulacion":
      return { stage: "condicionado", subStage: "Posible simulación laboral" };
    case "agenda_futura":
      return { stage: "condicionado", subStage: "Agenda futura" };
    case "asesoria_agendada":
      return { stage: "aprobado", subStage: "Agenda de Asesoría" };
    case "doc_proceso":
      return { stage: "aprobado", subStage: "Firma Carta Compromiso" };
    case "analisis_riesgo":
      return { stage: "aprobado", subStage: "Analisis de Riesgo" };
    case "firma_contrato":
      return { stage: "aprobado", subStage: "Firma de Contrato" };
    case "firma_programada":
      return { stage: "otorgado", subStage: "Cerrada Ganada" };
    case "pagado_comision":
      return { stage: "otorgado", subStage: "Pagada Cerrada" };
    case "aprobado_listo":
      return { stage: "aprobado", subStage: "Listo para Presentar" };
    case "cerrado_riesgo":
      return { stage: "cerrado_perdido", subStage: "Análisis de riesgo rechazado" };
    case "cerrado_desiste":
      return { stage: "cerrado_perdido", subStage: "Desiste" };
    case "cerrado_perdido":
      // Legacy: los cerrados perdidos previos (motivo en notas) se muestran como "Desiste".
      return { stage: "cerrado_perdido", subStage: "Desiste" };
    default:
      return { stage: "evaluacion_pendiente", subStage: "" };
  }
}

export function getStatusFromStageAndSubStage(stage: string, subStage: string): string {
  if (stage === "evaluacion_pendiente") {
    if (subStage === "Falta Reporte") return "falta_reporte";
    if (subStage === "Falta Afore") return "falta_afore";
    if (subStage === "Pendiente Documentos") return "pendiente_documentos";
    return "evaluacion_pendiente";
  }
  if (stage === "rechazado") {
    return "rechazado";
  }
  if (stage === "condicionado") {
    if (subStage === "Aportación") return "aportacion";
    if (subStage === "Falta detallado de semanas") return "falta_semanas";
    if (subStage === "Falta estado cuenta afore") return "falta_afore_cuenta";
    if (subStage === "Posible simulación laboral") return "posible_simulacion";
    if (subStage === "Agenda futura") return "agenda_futura";
    return "aportacion";
  }
  if (stage === "aprobado") {
    // "Agenda Asesoria" es la etiqueta legacy de la misma subetapa.
    if (subStage === "Agenda de Asesoría" || subStage === "Agenda Asesoria") return "asesoria_agendada";
    if (subStage === "Listo para Presentar") return "aprobado_listo";
    if (subStage === "Firma Carta Compromiso") return "doc_proceso";
    if (subStage === "Analisis de Riesgo") return "analisis_riesgo";
    if (subStage === "Firma de Contrato") return "firma_contrato";
    return "aprobado_listo";
  }
  if (stage === "otorgado") {
    if (subStage === "Cerrada Ganada" || subStage === "Esperando líneas de captura") return "firma_programada";
    if (subStage === "Pagada Cerrada" || subStage === "Pagado cerrado") return "pagado_comision";
    return "firma_programada";
  }
  if (stage === "cerrado_perdido") {
    if (subStage === "Análisis de riesgo rechazado") return "cerrado_riesgo";
    if (subStage === "Desiste") return "cerrado_desiste";
    return "cerrado_desiste";
  }
  return "evaluacion_pendiente";
}
