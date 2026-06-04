"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { saveFile, getFile } from "@/utils/db";
import { createClient } from "@/utils/supabase/client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export type UserRole = "aliado" | "director";

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  invitation_code_used?: string;
  created_at: string;
  is_active?: boolean;
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
    | "cerrado_perdido";
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
  isLoading: boolean;
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
  updateProspectStatus: (id: string, newStatus: Prospect["status"], comments?: string) => Promise<void>;
  saveSimulation: (
    id: string,
    simulationData: Omit<Simulation, "totalCredito" | "roiMonths">
  ) => Promise<void>;
  scheduleAssessment: (id: string, date: string, time: string) => Promise<void>;
  generateInvitationCode: () => Promise<InvitationCode>;
  createProfile: (profileData: Omit<UserProfile, "id" | "created_at">) => Promise<UserProfile>;
  deleteProfile: (id: string) => Promise<void>;
  updateProfileAdmin: (id: string, updates: Partial<Omit<UserProfile, "id" | "created_at">>) => Promise<void>;
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

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>("aliado");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [invitationCodes, setInvitationCodes] = useState<InvitationCode[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [supabase, setSupabase] = useState<any>(null);

  // Helper to map profiles between Supabase role ('director') and Frontend role ('director')
  const mapProfileFromDB = (dbProfile: any): UserProfile => {
    if (!dbProfile) return dbProfile;
    return {
      ...dbProfile,
      role: (dbProfile.role === "admin" || dbProfile.role === "director") ? "director" : dbProfile.role,
      is_active: dbProfile.is_active !== false,
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
        
      if (prof) {
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
    const hasSimulation = dbProspect.semanas_imss !== null || dbProspect.pension_actual !== null;
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
        semanas: dbProspect.semanas_imss || 0,
        pensionActual: Number(dbProspect.pension_actual) || 0,
        pensionMejorada: Number(dbProspect.pension_mejorada) || 0,
        financiamiento: Number(dbProspect.monto_financiamiento) || 0,
        costoGestion: Number(dbProspect.costo_gestion) || 0,
        totalCredito: Number(dbProspect.total_credito) || 0,
        roiMonths: dbProspect.roi_months || 0,
        comments: dbProspect.simulation_comments || "",
        aforePensionarse: Number(dbProspect.afore_pensionarse) || 0,
        aportacion: Number(dbProspect.aportacion) || 0,
        creditoNomina: Number(dbProspect.credito_nomina) || 0,
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

      if (storedProfiles) {
        try {
          const parsed = JSON.parse(storedProfiles).map((p: any) => ({
            ...p,
            is_active: p.is_active !== false,
          }));
          setProfiles(parsed);
        } catch (e) {
          setProfiles(INITIAL_PROFILES);
        }
      } else {
        setProfiles(INITIAL_PROFILES);
        localStorage.setItem("pensionflow_profiles", JSON.stringify(INITIAL_PROFILES));
      }

      if (storedUser) {
        setUser(JSON.parse(storedUser));
      } else {
        setUser(INITIAL_PROFILES[0]);
        localStorage.setItem("pensionflow_user", JSON.stringify(INITIAL_PROFILES[0]));
      }

      if (storedRole) {
        setActiveRole(storedRole as UserRole);
      } else {
        setActiveRole("aliado");
        localStorage.setItem("pensionflow_active_role", "aliado");
      }

      if (storedProspects) {
        setProspects(JSON.parse(storedProspects));
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
              // Enforce email confirmed check
              if (!session.user.email_confirmed_at) {
                console.warn("User has active session but email is not confirmed, signing out");
                await client.auth.signOut();
              } else {
                const profile = await ensureProfileExists(client, session.user);
                if (profile) {
                  currentUser = profile;
                  setUser(profile);
                  setActiveRole(profile.role);
                }
              }
            } catch (err) {
              console.error("Error loading session profile:", err);
            }
          }

          // Fetch fallback logged in user from localStorage if not signed in via auth (demo mode only)
          if (isDemoMode && !currentUser) {
            const storedUser = localStorage.getItem("pensionflow_user");
            if (storedUser) {
              try {
                const parsed = JSON.parse(storedUser);
                const { data: profile } = await client
                  .from("profiles")
                  .select("*")
                  .eq("email", parsed.email)
                  .maybeSingle();
                if (profile) {
                  const mapped = mapProfileFromDB(profile);
                  currentUser = mapped;
                  setUser(mapped);
                  setActiveRole(mapped.role);
                }
              } catch (err) {
                console.error("Error loading localStorage profile:", err);
              }
            }
          }

          // Default fallback if absolutely no user logged in (demo mode only)
          if (isDemoMode && !currentUser) {
            try {
              const { data: profile } = await client
                .from("profiles")
                .select("*")
                .eq("role", "aliado")
                .limit(1)
                .maybeSingle();
              if (profile) {
                const mapped = mapProfileFromDB(profile);
                currentUser = mapped;
                setUser(mapped);
                setActiveRole(mapped.role);
              }
            } catch (err) {
              console.error("Error fetching fallback profile:", err);
            }
          }

          // Fetch all profiles
          const { data: dbProfiles } = await client.from("profiles").select("*");
          const mappedProfiles = dbProfiles ? dbProfiles.map(mapProfileFromDB) : [];
          setProfiles(mappedProfiles);

          // Fetch prospects (filtered by role if user is aliado)
          let prospectsQuery = client.from("prospects").select("*, documents(*)");
          if (currentUser && currentUser.role === "aliado") {
            prospectsQuery = prospectsQuery.eq("aliado_id", currentUser.id);
          }
          const { data: dbProspects } = await prospectsQuery.order("created_at", { ascending: false });
          if (dbProspects) {
            setProspects(dbProspects.map(transformProspectFromDB));
          }

          // Fetch invitation codes
          const { data: dbCodes } = await client.from("invitation_codes").select("*");
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
          if (currentUser) {
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
        } catch (error) {
          console.error("Error loading Supabase data:", error);
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
    if (isDemoMode || !supabase) {
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
    if (isDemoMode || !supabase) {
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
    
    if (!isDemoMode && supabase) {
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
            if (!isDemoMode && supabase) {
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

    if (!isDemoMode && supabase) {
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
        console.error("Metadata insert error in Supabase:", dbErr);
        throw dbErr;
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

    if (isDemoMode || !supabase) {
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
        if (password) {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          
          if (data.user && !data.user.email_confirmed_at) {
            await supabase.auth.signOut();
            throw new Error("PENDING_CONFIRMATION: Debes confirmar tu correo electrónico antes de poder acceder.");
          }
          
          profile = await ensureProfileExists(supabase, data.user);
        } else {
          const { data: prof, error } = await supabase.from("profiles").select("*").eq("email", email).maybeSingle();
          if (error) throw error;
          if (!prof) throw new Error("No se encontró el perfil de usuario en Supabase.");
          profile = mapProfileFromDB(prof);
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
          
          // Reload prospects and notifications for this specific user
          let prospectsQuery = supabase.from("prospects").select("*, documents(*)");
          if (profile.role === "aliado") {
            prospectsQuery = prospectsQuery.eq("aliado_id", profile.id);
          }
          const { data: dbProspects } = await prospectsQuery.order("created_at", { ascending: false });
          if (dbProspects) {
            setProspects(dbProspects.map(transformProspectFromDB));
          }

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

    if (isDemoMode || !supabase) {
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
        const { data: dbProspect, error: prospectError } = await supabase
          .from("prospects")
          .insert({
            aliado_id: user?.id || "aliado-123",
            aliado_name: user?.full_name || "Roberto Asesor",
            full_name: prospectData.full_name,
            nss: prospectData.nss,
            curp: prospectData.curp,
            phone: prospectData.phone,
            email: prospectData.email,
            notes_aliado: prospectData.notes_aliado,
            status: "evaluacion_pendiente",
            drive_folder_id: driveFolderId,
            drive_folder_url: driveFolderUrl,
            semanas_imss: prospectData.simulation?.semanas,
            pension_actual: prospectData.simulation?.pensionActual,
            pension_mejorada: prospectData.simulation?.pensionMejorada,
            monto_financiamiento: prospectData.simulation?.financiamiento,
            costo_gestion: prospectData.simulation?.costoGestion,
            roi_months: prospectData.simulation?.roiMonths,
            simulation_comments: prospectData.simulation?.comments,
            afore_pensionarse: prospectData.simulation?.aforePensionarse,
            aportacion: prospectData.simulation?.aportacion,
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
              uploaded_by: user?.id,
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
              uploaded_by: user?.id,
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
        console.error("Error deleting Google Drive folder during prospect deletion:", err);
      }
    }

    if (isDemoMode || !supabase) {
      const updated = prospects.filter((p) => p.id !== id);
      setProspects(updated);
      saveToStorage("pensionflow_prospects", updated);

      if (target) {
        const newNotif: NotificationItem = {
          id: `notif-${Math.random().toString(36).substr(2, 9)}`,
          title: "Prospecto Eliminado",
          message: `El expediente de ${target.full_name} (NSS: ${target.nss}) fue eliminado permanentemente del pipeline.`,
          type: "warning",
          read: false,
          created_at: new Date().toISOString(),
        };
        setNotifications([newNotif, ...notifications]);
        saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);
      }
    } else {
      try {
        // Delete from prospects (cascade will handle document table entries)
        await supabase.from("prospects").delete().eq("id", id);
        
        setProspects((prev) => prev.filter((p) => p.id !== id));

        // Notify user about deletion
        if (target) {
          await supabase.from("notifications").insert({
            user_id: user?.id,
            title: "Prospecto Eliminado",
            message: `El expediente de ${target.full_name} (NSS: ${target.nss}) fue eliminado permanentemente.`,
            type: "warning",
            read: false,
          });
        }
      } catch (error) {
        console.error("Error deleting prospect from Supabase:", error);
        throw error;
      }
    }
  };

  const updateProspectStatus = async (
    id: string,
    newStatus: Prospect["status"],
    comments?: string
  ) => {
    if (isDemoMode || !supabase) {
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
          notifTitle = "Expediente Rechazado ❌";
          notifMsg = `El director rechazó el caso de ${target.full_name}. Comentarios: ${comments || "Sin comentarios técnicos."}`;
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
            notifTitle = "Expediente Rechazado ❌";
            notifMsg = `El director rechazó el caso de ${target.full_name}. Comentarios: ${comments || "Sin comentarios técnicos."}`;
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

    if (isDemoMode || !supabase) {
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
          : `El Director Eduardo emitió el dictamen financiero para ${target.full_name}. Pensión Mejorada: $${simulationData.pensionMejorada.toLocaleString()}/mes.`;

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
          : `📈 ¡Gran oportunidad, Roberto! El director Eduardo aprobó la simulación para ${target.full_name}. Pensión actual: $${simulationData.pensionActual.toLocaleString()} ➡️ Pensión Mejorada: $${simulationData.pensionMejorada.toLocaleString()}. Financiamiento: $${simulationData.financiamiento.toLocaleString()}. ¡Ingresa ya para presentar y agendar la asesoría!`;

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
            semanas_imss: simulationData.semanas,
            pension_actual: simulationData.pensionActual,
            pension_mejorada: simulationData.pensionMejorada,
            monto_financiamiento: simulationData.financiamiento,
            costo_gestion: simulationData.costoGestion,
            roi_months: roiMonths,
            simulation_comments: simulationData.comments,
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
            : `El Director Eduardo emitió el dictamen financiero para ${target.full_name}. Pensión Mejorada: $${simulationData.pensionMejorada.toLocaleString()}/mes.`;

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
            : `📈 ¡Gran oportunidad, Roberto! El director Eduardo aprobó la simulación para ${target.full_name}. Pensión actual: $${simulationData.pensionActual.toLocaleString()} ➡️ Pensión Mejorada: $${simulationData.pensionMejorada.toLocaleString()}. Financiamiento: $${simulationData.financiamiento.toLocaleString()}. ¡Ingresa ya para presentar y agendar la asesoría!`;

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
    if (isDemoMode || !supabase) {
      const updated = prospects.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            status: "asesoria_agendada" as const,
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
          message: `El aliado Roberto agendó la asesoría de presentación para ${target.full_name} el día ${date} a las ${time} hrs.`,
          type: "info",
          read: false,
          created_at: new Date().toISOString(),
        };
        setNotifications([newNotif, ...notifications]);
        saveToStorage("pensionflow_notifications", [newNotif, ...notifications]);

        triggerPushNotification(
          `✉️ Confirmación de Asesoría: Se ha enviado un correo electrónico a ${target.email} con la invitación de zoom de Calendly para el ${date} a las ${time} y se notificó al Director Eduardo de Operaciones.`,
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
            notes_aliado: `Asesoría agendada para el día ${date} a las ${time} hrs.`,
          })
          .eq("id", id);

        setProspects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: "asesoria_agendada" as const } : p))
        );

        const target = prospects.find((p) => p.id === id);
        if (target) {
          // Notify Director
          const directors = profiles.filter(p => p.role === "director");
          for (const dir of directors) {
            await supabase.from("notifications").insert({
              user_id: dir.id,
              title: "Asesoría Agendada 📅",
              message: `El aliado Roberto agendó la asesoría de presentación para ${target.full_name} el día ${date} a las ${time} hrs.`,
              type: "info",
              read: false,
            });
          }

          triggerPushNotification(
            `✉️ Confirmación de Asesoría: Se ha enviado un correo electrónico a ${target.email} con la invitación de zoom de Calendly para el ${date} a las ${time} y se notificó al Director Eduardo de Operaciones.`,
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
    if (isDemoMode || !supabase) {
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
        
        const newProfile: UserProfile = {
          id: `aliado-${Math.random().toString(36).substr(2, 9)}`,
          full_name: fullName,
          email,
          phone,
          role: "aliado",
          created_at: new Date().toISOString()
        };
        
        const storedProfiles = localStorage.getItem("pensionflow_profiles");
        const parsedProfiles = storedProfiles ? JSON.parse(storedProfiles) : INITIAL_PROFILES;
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
              invitation_code_used: code.trim().toUpperCase()
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
    if (isDemoMode || !supabase) {
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

        // Sign up the user in Supabase Auth with standard password
        const tempPassword = "PensionPerfecta2026!";
        const { data: authData, error: authError } = await tempClient.auth.signUp({
          email: profileData.email,
          password: tempPassword,
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

        // Map role for Database check constraint (director -> director)
        const dbRole = profileData.role === "director" ? "director" : profileData.role;

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

    if (isDemoMode || !supabase) {
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

    if (isDemoMode || !supabase) {
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

  return (
    <AppContext.Provider
      value={{
        user,
        activeRole,
        prospects,
        invitationCodes,
        notifications,
        profiles,
        toast,
        isDemoMode,
        isLoading,
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
        updateProspectStatus,
        saveSimulation,
        scheduleAssessment,
        generateInvitationCode,
        registerAliado,
        initializeDirector,
        createProfile,
        deleteProfile,
        updateProfileAdmin,
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
