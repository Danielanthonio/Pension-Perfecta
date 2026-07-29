"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { saveFile, getFile } from "@/utils/db";
import { getExpedienteDocSlots, getTipoFinanciamientoLabel } from "@/components/ui/tipoFinanciamiento";
import { createClient } from "@/utils/supabase/client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export type UserRole = "aliado" | "director" | "account_manager";

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
  // Solo para Account Managers: si está en `true`, el AM participa en la "ruleta"
  // de asignación automática (recibe PROYECTOS nuevos al azar cuando un aliado
  // captura lo suyo). Lo enciende/apaga el director en el módulo de Account Managers.
  auto_assign_enabled?: boolean;
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
  // Account Manager asignado al PROYECTO (no al aliado): lo sortea la ruleta al
  // capturar el aliado su propio proyecto; si lo captura un AM, queda de ese AM;
  // si lo captura Dirección, queda null (gestión directa / mesa de dirección).
  account_manager_id?: string | null;
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
  deleteProfile: (
    id: string,
    options?: { reassignToAliadoId?: string | null; reassignToAmId?: string | null }
  ) => Promise<void>;
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
}

// Cierre de sesión automático por inactividad. En el plan limitado de Hostinger,
// cada sesión abierta mantiene un canal realtime de Supabase y datos cargados, así
// que botar las sesiones inactivas reduce la carga. Cambia estos valores para
// ajustar el tiempo de inactividad permitido y el aviso previo.
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos hasta cerrar sesión
const IDLE_WARNING_MS = 30 * 1000; // muestra el aviso 30s antes de cerrar
const IDLE_ACTIVITY_KEY = "pensionflow_last_activity"; // timestamp compartido entre pestañas

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
      auto_assign_enabled: dbProfile.auto_assign_enabled === true,
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
      
      const { data: newProfile, error: createError } = await client
        .from("profiles")
        .insert({
          id: authUser.id,
          full_name: fullName,
          email: email.toLowerCase(),
          phone: phone,
          role: dbRole === "director" ? "admin" : dbRole,
          invitation_code_used: invitationCode
        })
        .select()
        .single();
        
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
      account_manager_id: dbProspect.account_manager_id ?? null,
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
      } catch (err) {
        console.error("Error deleting document from DB:", err);
      }
    }
  };

  const login = async (email: string, role: UserRole, password?: string): Promise<UserRole | null> => {
    setIsLoading(true);
    if (isDemoMode || !supabase) {
      const storedProfiles = localStorage.getItem("pensionflow_profiles");
      const parsedProfiles: UserProfile[] = storedProfiles ? JSON.parse(storedProfiles) : INITIAL_PROFILES;
      
      const profile = parsedProfiles.find((p) => p.email === email && p.role === role) || {
        id: `user-${Math.random().toString(36).substr(2, 9)}`,
        full_name: role === "aliado" ? "Aliado Comercial" : "Director Operaciones",
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

      // Account Manager del PROYECTO (espejo del trigger `assign_am_to_prospect`):
      // aliado capturando lo suyo → ruleta; un AM captura → el proyecto es suyo;
      // Dirección captura → sin AM (gestión directa).
      let projectAmId: string | null = null;
      if (user?.role === "aliado" && ownerId === creatorId) {
        projectAmId = pickRandomAutoAssignAM(profiles);
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
      // Aviso al aliado que capturó SU PROPIO proyecto: qué Account Manager le
      // sorteó la ruleta (caso complementario al de "Proyecto Asignado 📁").
      // En producción esta notificación la emite el trigger `notify_on_prospect_insert`.
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

    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            status: "asesoria_agendada" as const,
            notes_aliado: notesText,
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
          })
          .eq("id", id);
          
        if (error) throw error;

        setProspects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: "asesoria_agendada" as const, notes_aliado: notesText } : p))
        );

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
        console.error("Error scheduling assessment in Supabase:", error);
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

  const createProfile = async (
    profileData: Omit<UserProfile, "id" | "created_at">
  ): Promise<UserProfile> => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      // El aliado nuevo ya NO lleva Account Manager: la ruleta reparte PROYECTOS
      // (ver addProspect / trigger assign_am_to_prospect), no aliados.
      const newProfile: UserProfile = {
        ...profileData,
        id: `user-${Math.random().toString(36).substr(2, 9)}`,
        created_at: new Date().toISOString(),
      };

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
        const { data: dbProfile, error: insertError } = await supabase
          .from("profiles")
          .insert({
            id: authUserId,
            full_name: profileData.full_name,
            email: profileData.email.toLowerCase(),
            phone: profileData.phone,
            role: dbRole,
            invitation_code_used: profileData.invitation_code_used || null,
            password_provisional: profileData.password_provisional || null,
          })
          .select()
          .single();

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

        // La ruleta ya no reparte ALIADOS: el AM se sortea por PROYECTO al
        // capturar (el aviso "Nuevo proyecto asignado 🎲" al AM lo emite el
        // trigger `notify_on_prospect_insert` de la BD).

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

  const deleteProfile = async (
    id: string,
    options?: { reassignToAliadoId?: string | null; reassignToAmId?: string | null }
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
    if (user.role === "director") return profiles;
    if (user.role === "account_manager") {
      const myAllyIds = new Set(
        prospects.filter(p => p.account_manager_id === user.id).map(p => p.aliado_id)
      );
      return profiles.filter(p => p.id === user.id || (p.role === "aliado" && myAllyIds.has(p.id)));
    }
    if (user.role === "aliado") {
      const myAmIds = new Set(
        prospects
          .filter(p => p.aliado_id === user.id && p.account_manager_id)
          .map(p => p.account_manager_id as string)
      );
      return profiles.filter(p => p.id === user.id || myAmIds.has(p.id));
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
        deleteProfile,
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
