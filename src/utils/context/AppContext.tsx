"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { saveFile, getFile } from "@/utils/db";
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
  account_manager_id?: string | null;
  password_provisional?: string | null;
  aliado_tipo?: "aliado" | "lider";
  lider_grupo?: string | null;
  lider_id?: string | null;
  lider_aliado_rel_id?: string | null;
}

export interface DocumentItem {
  id: string;
  prospect_id: string;
  file_name: string;
  file_url: string;
  file_type: "AFORE" | "IMSS" | "OTROS";
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
    | "firma_programada"
    | "pagado_comision"
    | "aportacion"
    | "falta_reporte"
    | "falta_afore"
    | "pendiente_documentos"
    | "cerrado_perdido"
    | "falta_semanas"
    | "falta_afore_cuenta"
    | "posible_simulacion";
  notes_aliado?: string;
  notes_director?: string;
  simulation?: Simulation;
  documents: DocumentItem[];
  google_drive_folder?: string;
  google_drive_url?: string;
  drive_folder_id?: string;
  drive_folder_url?: string;
  created_at: string;
  updated_at: string;
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

interface AppContextType {
  user: UserProfile | null;
  activeRole: UserRole;
  prospects: Prospect[];
  invitationCodes: InvitationCode[];
  notifications: NotificationItem[];
  profiles: UserProfile[];
  toast: ToastMessage | null;
  isDemoMode: boolean;
  isProvisionalSession: boolean;
  isLoading: boolean;
  dbError?: string | null;
  login: (email: string, role: UserRole, password?: string) => Promise<UserRole | null>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateUserPassword: (newPassword: string) => Promise<void>;
  updateUserProfile: (fullName: string, phone: string) => Promise<void>;
  uploadDocument: (prospectId: string, fileType: "AFORE" | "IMSS" | "OTROS", fileName: string, fileDataUrl: string) => Promise<DocumentItem>;
  deleteDocument: (prospectId: string, docId: string) => Promise<void>;
  registerAliado: (fullName: string, email: string, phone: string, password: string, code: string) => Promise<boolean>;
  initializeDirector: (fullName: string, email: string, phone: string, password: string) => Promise<boolean>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
  addProspect: (
    prospectData: Omit<
      Prospect,
      "id" | "aliado_id" | "status" | "created_at" | "updated_at" | "documents" | "simulation"
    > & { simulation?: Simulation; google_drive_folder?: string; google_drive_url?: string },
    aforeFile?: string | { name: string; dataUrl: string },
    imssFile?: string | { name: string; dataUrl: string }
  ) => Promise<Prospect>;
  deleteProspect: (id: string) => Promise<void>;
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
  isProspectDeleted: (p: Prospect) => boolean;
  isProspectPurged: (p: Prospect) => boolean;
  getProspectDeletedAt: (p: Prospect) => Date | null;
  updateProspectStatus: (id: string, newStatus: Prospect["status"], comments?: string) => Promise<void>;
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
  deleteProfile: (id: string) => Promise<void>;
  updateProfileAdmin: (id: string, updates: Partial<Omit<UserProfile, "id" | "created_at">>) => Promise<void>;
  changeAllyType: (allyId: string, tipo: "aliado" | "lider", grupoNombre?: string) => Promise<void>;
  assignAllyToLider: (allyId: string, liderId: string | null) => Promise<void>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearToast: () => void;
  triggerPushNotification: (message: string, type: "whatsapp" | "email", recipient: string) => void;
  getFileContent: (doc: DocumentItem) => Promise<string | null>;
}

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
    account_manager_id: "am-789", // Assigned to Sofia!
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
  },
  {
    id: "aliado-unassigned",
    full_name: "Pedro Asesor Nuevo",
    email: "pedro@asesores.com",
    phone: "5587654321",
    role: "aliado",
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: true,
    account_manager_id: null,
  }
];

const INITIAL_PROSPECTS: Prospect[] = [
  {
    id: "prospect-1",
    aliado_id: "aliado-123",
    aliado_name: "Roberto Asesor",
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
  const [toast, setToast] = useState<ToastMessage | null>(null);
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
        // Sync metadata to auth.users if missing or mismatch
        const meta = authUser.user_metadata || {};
        if (meta.role !== prof.role || meta.account_manager_id !== prof.account_manager_id) {
          console.log("Syncing missing/outdated role or account_manager_id to auth metadata...");
          try {
            await client.auth.updateUser({
              data: {
                role: prof.role,
                account_manager_id: prof.account_manager_id
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

      let parsedProfilesList: UserProfile[] = [];
      if (storedProfiles) {
        try {
          parsedProfilesList = JSON.parse(storedProfiles).map((p: any) => {
            const mapped = {
              ...p,
              is_active: p.is_active !== false,
              aliado_tipo: p.aliado_tipo || "aliado",
              lider_grupo: p.lider_grupo || null,
            };
            const rel = localLiderAliados.find((r: any) => r.aliado_asignado_id === mapped.id);
            if (rel) {
              mapped.lider_id = rel.lider_id;
              mapped.lider_aliado_rel_id = rel.id;
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
            lider_id: null,
            lider_aliado_rel_id: null,
          }));
          setProfiles(parsedProfilesList);
        }
      } else {
        parsedProfilesList = INITIAL_PROFILES.map((p: any) => ({
          ...p,
          aliado_tipo: p.aliado_tipo || "aliado",
          lider_grupo: p.lider_grupo || null,
          lider_id: null,
          lider_aliado_rel_id: null,
        }));
        setProfiles(parsedProfilesList);
        localStorage.setItem("pensionflow_profiles", JSON.stringify(parsedProfilesList));
      }

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
      setIsLoading(false);
    } else {
      // Production mode with Supabase
      const client = createClient();
      setSupabase(client);

      const loadSupabaseData = async () => {
        try {
          // Check if there is an active session
          const { data: { session } } = await client.auth.getSession();
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
              
              // Only sign out if email is not confirmed AND user does not have a provisional password bypass active
              if (!session.user.email_confirmed_at && (!profile || !profile.password_provisional)) {
                console.warn("User has active session but email is not confirmed, signing out");
                await client.auth.signOut();
              } else {
                if (profile) {
                  currentUser = profile;
                  setUser(profile);
                  setActiveRole(profile.role);
                }
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
                    // Provisional session bypass: RLS blocks profiles query when anonymous.
                    // Keep the local storage session intact.
                    console.warn("Restoring user with provisional session from localStorage fallback:", storedUser.email);
                    currentUser = storedUser;
                    setUser(storedUser);
                    setActiveRole(storedUser.role);
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
          const isProvisional = !session?.user && !!currentUser?.password_provisional;
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
              const rel = dbLiderAliados?.find((r: any) => r.aliado_asignado_id === mapped.id);
              if (rel) {
                mapped.lider_id = rel.lider_id;
                mapped.lider_aliado_rel_id = rel.id;
              } else {
                mapped.lider_id = null;
                mapped.lider_aliado_rel_id = null;
              }
              return mapped;
            }) : [];
            setProfiles(mappedProfiles);

            // Fetch prospects (filtered by role if user is aliado or account_manager)
            let prospectsQuery = client.from("prospects").select("*, documents(*)");
            if (currentUser && currentUser.role === "aliado") {
              prospectsQuery = prospectsQuery.eq("aliado_id", currentUser.id);
            } else if (currentUser && currentUser.role === "account_manager") {
              const assignedAllyIds = mappedProfiles
                .filter(p => p.role === "aliado" && p.account_manager_id === currentUser.id)
                .map(p => p.id);
              if (assignedAllyIds.length > 0) {
                prospectsQuery = prospectsQuery.in("aliado_id", assignedAllyIds);
              } else {
                prospectsQuery = prospectsQuery.eq("aliado_id", "00000000-0000-0000-0000-000000000000");
              }
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
              if (currentUser && currentUser.role === "director") {
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

  const updateUserProfile = async (fullName: string, phone: string): Promise<void> => {
    if (!user) return;
    
    const updatedUser = { ...user, full_name: fullName, phone };
    setUser(updatedUser);
    saveToStorage("pensionflow_user", updatedUser);
    
    // Update in profiles list as well
    const updatedProfiles = profiles.map((p) => p.id === user.id ? { ...p, full_name: fullName, phone } : p);
    setProfiles(updatedProfiles);
    saveToStorage("pensionflow_profiles", updatedProfiles);
    
    if (!isDemoMode && !isProvisionalSession && supabase) {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, phone })
        .eq("id", user.id);
      if (error) {
        console.error("Error updating profile in database:", error);
        throw error;
      }
    }
  };

  const uploadDocument = async (
    prospectId: string,
    fileType: "AFORE" | "IMSS" | "OTROS",
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
      const { error: dbErr } = await supabase.from("documents").insert({
        id: docId,
        prospect_id: prospectId,
        file_name: fileName,
        file_url: driveFileUrl,
        file_type: fileType,
        drive_file_id: driveFileId,
        drive_file_url: driveFileUrl,
        drive_folder_id: folderId,
        uploaded_by: user?.id,
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
            // Ignorar la comprobación de confirmación de email si coincide la contraseña provisional
            if (!authUser.email_confirmed_at && !isProvisionalMatch) {
              await supabase.auth.signOut();
              throw new Error("PENDING_CONFIRMATION: Debes confirmar tu correo electrónico antes de poder acceder.");
            }
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
          // Strict role matching check
          if (profile.role !== role) {
            await supabase.auth.signOut();
            throw new Error("Acceso Inválido: Tu cuenta no tiene permisos para acceder con este rol.");
          }

          setUser(profile);
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
            const mappedProfiles = dbProfiles ? dbProfiles.map(mapProfileFromDB) : [];
            setProfiles(mappedProfiles);

            // Fetch prospects (filtered by role if user is aliado or account_manager)
            let prospectsQuery = supabase.from("prospects").select("*, documents(*)");
            if (profile.role === "aliado") {
              prospectsQuery = prospectsQuery.eq("aliado_id", profile.id);
            } else if (profile.role === "account_manager") {
              const assignedAllyIds = mappedProfiles
                .filter((p: any) => p.role === "aliado" && p.account_manager_id === profile.id)
                .map((p: any) => p.id);
              if (assignedAllyIds.length > 0) {
                prospectsQuery = prospectsQuery.in("aliado_id", assignedAllyIds);
              } else {
                prospectsQuery = prospectsQuery.eq("aliado_id", "00000000-0000-0000-0000-000000000000");
              }
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
              .eq("user_id", profile.id)
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
          setIsLoading(false);
          return profile.role;
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
    > & { simulation?: Simulation; google_drive_folder?: string; google_drive_url?: string },
    aforeFile?: string | { name: string; dataUrl: string },
    imssFile?: string | { name: string; dataUrl: string }
  ): Promise<Prospect> => {
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
          file_type: "AFORE",
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
          file_type: "IMSS",
          uploaded_at: new Date().toISOString(),
          drive_file_id: driveFile.id,
          drive_file_url: driveFile.url,
          drive_folder_id: driveFolderId,
          uploaded_by: user?.id || "aliado-123",
        });
        await saveFile(docId, imssDataUrl);
      }

      const newProspect: Prospect = {
        ...prospectData,
        id: newId,
        aliado_id: user?.id || "aliado-123",
        aliado_name: user?.full_name || "Roberto Asesor",
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
        message: `El aliado ${newProspect.aliado_name} registró a ${newProspect.full_name} para evaluación Ley 73.`,
        type: "info",
        read: false,
        created_at: new Date().toISOString(),
      };
      setNotifications([newNotif, ...notifications]);
      saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);

      triggerPushNotification(
        `🔔 Nuevo prospecto: ${newProspect.full_name} ha sido subido por Roberto Asesor. CURP: ${newProspect.curp}. Revisa en tu panel técnico.`,
        "whatsapp",
        "Eduardo Director"
      );

      return newProspect;
    } else {
      try {
        let finalAliadoId = user?.id;
        let finalAliadoName = user?.full_name;

        if (!finalAliadoId && supabase) {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            finalAliadoId = authUser.id;
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", authUser.id)
              .maybeSingle();
            if (profile) {
              finalAliadoName = profile.full_name;
            }
          }
        }

        if (!finalAliadoId) {
          throw new Error("No hay una sesión activa de Supabase. Por favor, inicia sesión de nuevo.");
        }

        const { data: dbProspect, error: prospectError } = await supabase
          .from("prospects")
          .insert({
            aliado_id: finalAliadoId,
            aliado_name: finalAliadoName || "Roberto Asesor",
            full_name: prospectData.full_name,
            nss: prospectData.nss,
            curp: prospectData.curp,
            phone: prospectData.phone,
            email: prospectData.email,
            notes_aliado: prospectData.notes_aliado,
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
              file_type: "AFORE",
              drive_file_id: driveFile.id,
              drive_file_url: driveFile.url,
              drive_folder_id: driveFolderId,
              uploaded_by: finalAliadoId,
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
              file_type: "IMSS",
              drive_file_id: driveFile.id,
              drive_file_url: driveFile.url,
              drive_folder_id: driveFolderId,
              uploaded_by: finalAliadoId,
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
            message: `El aliado ${newProspect.aliado_name} registró a ${newProspect.full_name} para evaluación Ley 73.`,
            type: "info",
            read: false,
          });
        }

        triggerPushNotification(
          `🔔 Nuevo prospecto: ${newProspect.full_name} ha sido subido por Roberto Asesor. CURP: ${newProspect.curp}. Revisa en tu panel técnico.`,
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

  const updateProspectStatus = async (
    id: string,
    newStatus: Prospect["status"],
    comments?: string
  ) => {
    if (isDemoMode || isProvisionalSession || !supabase) {
      const updated = prospects.map((p) => {
        if (p.id === id) {
          const notesDir = comments ? comments : p.notes_director;
          return {
            ...p,
            status: newStatus,
            notes_director: notesDir,
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
        } else if (newStatus === "pagado_comision") {
          notifTitle = "¡Comisión Liberada! 💰✨";
          notifMsg = `Se liberó la comisión para ti por el proyecto de ${target.full_name}.`;
          toastMsg = `🎉 ¡Felicidades! Se ha liberado y transferido la comisión correspondiente al caso de ${target.full_name}. Ya puedes revisarla en tus estados financieros.`;
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
            type: newStatus === "rechazado" ? "alert" : newStatus === "pagado_comision" ? "success" : "info",
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

        await supabase.from("prospects").update(updateData).eq("id", id);

        setProspects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: newStatus, notes_director: comments || p.notes_director } : p))
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
          } else if (newStatus === "pagado_comision") {
            notifTitle = "¡Comisión Liberada! 💰✨";
            notifMsg = `Se liberó la comisión para ti por el proyecto de ${target.full_name}.`;
            toastMsg = `🎉 ¡Felicidades! Se ha liberado y transferido la comisión correspondiente al caso de ${target.full_name}. Ya puedes revisarla en tus estados financieros.`;
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
            type: newStatus === "rechazado" ? "error" : newStatus === "pagado_comision" ? "success" : "info",
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
        await supabase
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
        await supabase
          .from("prospects")
          .update({
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
          })
          .eq("id", id);

        setProspects((prev) =>
          prev.map((p) => {
            if (p.id === id) {
              return {
                ...p,
                status: newStatus,
                simulation: fullSimulation,
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
            ? `El aliado Roberto agendó la asesoría de presentación para ${target.full_name} vía LeadConnector.`
            : `El aliado Roberto agendó la asesoría de presentación para ${target.full_name} el día ${date} a las ${time} hrs.`,
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
        await supabase
          .from("prospects")
          .update({
            status: "asesoria_agendada",
            notes_aliado: notesText,
          })
          .eq("id", id);

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
                ? `El aliado Roberto agendó la asesoría de presentación para ${target.full_name} vía LeadConnector.`
                : `El aliado Roberto agendó la asesoría de presentación para ${target.full_name} el día ${date} a las ${time} hrs.`,
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
        const creator = parsedProfiles.find((p: any) => p.id === validCode.created_by);
        const accountManagerId = creator?.role === "account_manager" ? creator.id : null;

        const newProfile: UserProfile = {
          id: `aliado-${Math.random().toString(36).substr(2, 9)}`,
          full_name: fullName,
          email,
          phone,
          role: "aliado",
          account_manager_id: accountManagerId,
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

        // Check if the invitation code was created by an Account Manager
        let accountManagerId = null;
        if (dbCode.created_by) {
          const { data: creatorProfile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", dbCode.created_by)
            .maybeSingle();
          if (creatorProfile && creatorProfile.role === "account_manager") {
            accountManagerId = dbCode.created_by;
          }
        }

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
              account_manager_id: accountManagerId
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
            account_manager_id: profileData.account_manager_id || null,
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
            account_manager_id: profileData.account_manager_id || undefined,
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
            account_manager_id: dbProfile.account_manager_id,
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

  const deleteProfile = async (id: string): Promise<void> => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;

    if (isDemoMode || isProvisionalSession || !supabase) {
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
      // In Supabase mode:
      try {
        // Delete invitation code used by this user (if any)
        if (profile.invitation_code_used) {
          await supabase.from("invitation_codes").delete().eq("code", profile.invitation_code_used);
        }
        await supabase.from("invitation_codes").delete().eq("used_by", id);

        // Delete profile from DB (deleting from profiles table is enough to revoke access)
        await supabase.from("profiles").delete().eq("id", id);

        setProfiles((prev) => prev.filter((p) => p.id !== id));
        
        if (profile.invitation_code_used) {
          setInvitationCodes((prev) => prev.filter((c) => c.code !== profile.invitation_code_used && c.used_by !== id));
        } else {
          setInvitationCodes((prev) => prev.filter((c) => c.used_by !== id));
        }

        // Insert notification
        await supabase.from("notifications").insert({
          user_id: user?.id,
          title: "Usuario Eliminado 👤❌",
          message: `El perfil de ${profile.full_name} (${profile.email}) fue eliminado del sistema.`,
          type: "warning",
          read: false,
        });
      } catch (err) {
        console.error("Error deleting profile:", err);
      }
    }
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
        if (updates.account_manager_id !== undefined) dbUpdates.account_manager_id = updates.account_manager_id;
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
    grupoNombre?: string
  ): Promise<void> => {
    const profile = profiles.find((p) => p.id === allyId);
    if (!profile) return;

    if (isDemoMode || isProvisionalSession || !supabase) {
      // Local updates in demo mode
      const updatedProfiles = profiles.map((p) => {
        if (p.id === allyId) {
          return {
            ...p,
            aliado_tipo: tipo,
            lider_grupo: tipo === "lider" ? (grupoNombre || "Grupo Demo") : null,
          };
        }
        return p;
      });
      setProfiles(updatedProfiles);
      saveToStorage("pensionflow_profiles", updatedProfiles);

      // If updating self (for preview)
      if (user?.id === allyId) {
        const updatedUser = {
          ...user,
          aliado_tipo: tipo,
          lider_grupo: tipo === "lider" ? (grupoNombre || "Grupo Demo") : null,
        };
        setUser(updatedUser);
        saveToStorage("pensionflow_user", updatedUser);
      }

      const msg = `Tipo de aliado actualizado a ${tipo === "lider" ? "Líder" : "Aliado"}`;
      setToast({ id: Date.now().toString(), type: "email", recipient: profile.email, message: msg });
    } else {
      try {
        const res = await fetch(`/api/aliados/${allyId}/tipo`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aliado_tipo: tipo,
            lider_grupo: tipo === "lider" ? (grupoNombre || "Grupo Demo") : null,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Error al actualizar tipo de aliado");
        }

        // Update local profiles list
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === allyId
              ? {
                  ...p,
                  aliado_tipo: tipo,
                  lider_grupo: tipo === "lider" ? (grupoNombre || "Grupo Demo") : null,
                }
              : p
          )
        );

        if (user?.id === allyId) {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  aliado_tipo: tipo,
                  lider_grupo: tipo === "lider" ? (grupoNombre || "Grupo Demo") : null,
                }
              : null
          );
        }

        // Notify
        await supabase.from("notifications").insert({
          user_id: user?.id,
          title: "Tipo de Aliado Actualizado 👤⚙️",
          message: `El aliado ${profile.full_name} ahora es ${tipo === "lider" ? `Líder del grupo '${grupoNombre}'` : "Aliado estándar"}.`,
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
    liderId: string | null
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

      // Remove existing relation for this ally
      localLiderAliados = localLiderAliados.filter((r) => r.aliado_asignado_id !== allyId);

      let groupName = null;
      let relationId = null;

      if (liderId) {
        const lider = profiles.find((p) => p.id === liderId);
        groupName = lider?.lider_grupo || "Grupo Demo";
        relationId = `rel-${Math.random().toString(36).substr(2, 9)}`;

        localLiderAliados.push({
          id: relationId,
          lider_id: liderId,
          aliado_asignado_id: allyId,
          grupo_nombre: groupName,
        });
      }

      localStorage.setItem("pensionflow_lider_aliados", JSON.stringify(localLiderAliados));

      // Update profiles local state
      const updatedProfiles = profiles.map((p) => {
        if (p.id === allyId) {
          return {
            ...p,
            lider_id: liderId,
            lider_aliado_rel_id: relationId,
          };
        }
        return p;
      });
      setProfiles(updatedProfiles);
      saveToStorage("pensionflow_profiles", updatedProfiles);

      const msg = liderId ? `Asignado a Líder` : `Retirado de Líder`;
      setToast({ id: Date.now().toString(), type: "email", recipient: ally.email, message: msg });
    } else {
      try {
        if (liderId) {
          // POST to create assignment
          const res = await fetch("/api/lider-aliados", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lider_id: liderId,
              aliado_asignado_id: allyId,
            }),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Error al asignar líder");
          }

          // Update local profile state
          setProfiles((prev) =>
            prev.map((p) =>
              p.id === allyId
                ? {
                    ...p,
                    lider_id: liderId,
                    lider_aliado_rel_id: data.id,
                  }
                : p
            )
          );
        } else {
          // DELETE existing relationship
          if (ally.lider_aliado_rel_id) {
            const res = await fetch(`/api/lider-aliados/${ally.lider_aliado_rel_id}`, {
              method: "DELETE",
            });

            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || "Error al desasignar líder");
            }
          }

          // Update local profile state
          setProfiles((prev) =>
            prev.map((p) =>
              p.id === allyId
                ? {
                    ...p,
                    lider_id: null,
                    lider_aliado_rel_id: null,
                  }
                : p
            )
          );
        }

        // Notify
        const lider = profiles.find((p) => p.id === liderId);
        await supabase.from("notifications").insert({
          user_id: user?.id,
          title: "Asignación de Líder Actualizada 👥🔄",
          message: liderId
            ? `El aliado ${ally.full_name} ha sido asignado al líder ${lider?.full_name || "Desconocido"}.`
            : `El aliado ${ally.full_name} ha sido desasignado de su líder.`,
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

  const exposedProfiles = React.useMemo(() => {
    if (!user) return [];
    if (user.role === "director") return profiles;
    if (user.role === "account_manager") {
      return profiles.filter(p => p.id === user.id || (p.role === "aliado" && p.account_manager_id === user.id));
    }
    if (user.role === "aliado") {
      return profiles.filter(p => p.id === user.id || p.id === user.account_manager_id);
    }
    return [];
  }, [user, profiles]);

  const exposedProspects = React.useMemo(() => {
    if (!user) return [];
    if (user.role === "director") return prospects;
    if (user.role === "account_manager") {
      const assignedAllyIds = profiles
        .filter(p => p.role === "aliado" && p.account_manager_id === user.id)
        .map(p => p.id);
      return prospects.filter(p => assignedAllyIds.includes(p.aliado_id));
    }
    if (user.role === "aliado") {
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
        toast,
        isDemoMode,
        isProvisionalSession,
        isLoading,
        dbError,
        login,
        sendPasswordReset,
        updateUserPassword,
        updateUserProfile,
        uploadDocument,
        deleteDocument,
        logout,
        switchRole,
        addProspect,
        deleteProspect,
        restoreProspect,
        permanentlyDeleteProspect,
        editProspectPersonalData,
        isProspectDeleted,
        isProspectPurged,
        getProspectDeletedAt,
        updateProspectStatus,
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
        markNotificationRead,
        markAllNotificationsRead,
        clearToast,
        triggerPushNotification,
        getFileContent,
      }}
    >
      {children}
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

export const STAGES_LIST = [
  { id: "evaluacion_pendiente", label: "Evaluación pendiente" },
  { id: "rechazado", label: "Rechazado" },
  { id: "condicionado", label: "Condicionado" },
  { id: "aprobado", label: "Aprobado" },
  { id: "cerrado_perdido", label: "Cerrado Perdido" }
];

export const SUB_STAGES_BY_STAGE: Record<string, string[]> = {
  evaluacion_pendiente: ["Falta Reporte", "Falta Afore", "Pendiente Documentos"],
  rechazado: ["No aplica"],
  condicionado: ["Aportación", "Falta detallado de semanas", "Falta estado cuenta afore", "Posible simulación laboral"],
  aprobado: ["Agenda Asesoria", "Firma Carta Compromiso", "Analisis de Riesgo", "Cerrada Ganada", "Pagado / Cerrado"],
  cerrado_perdido: ["No acepta propuesta"]
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
    case "asesoria_agendada":
      return { stage: "aprobado", subStage: "Agenda Asesoria" };
    case "doc_proceso":
      return { stage: "aprobado", subStage: "Firma Carta Compromiso" };
    case "analisis_riesgo":
      return { stage: "aprobado", subStage: "Analisis de Riesgo" };
    case "firma_programada":
      return { stage: "aprobado", subStage: "Cerrada Ganada" };
    case "pagado_comision":
      return { stage: "aprobado", subStage: "Pagado / Cerrado" };
    case "aprobado_listo":
      return { stage: "aprobado", subStage: "" };
    case "cerrado_perdido":
      return { stage: "cerrado_perdido", subStage: "No acepta propuesta" };
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
    return "aportacion";
  }
  if (stage === "aprobado") {
    if (subStage === "Agenda Asesoria") return "asesoria_agendada";
    if (subStage === "Firma Carta Compromiso") return "doc_proceso";
    if (subStage === "Analisis de Riesgo") return "analisis_riesgo";
    if (subStage === "Cerrada Ganada") return "firma_programada";
    if (subStage === "Pagado / Cerrado") return "pagado_comision";
    return "aprobado_listo";
  }
  if (stage === "cerrado_perdido") {
    return "cerrado_perdido";
  }
  return "evaluacion_pendiente";
}
