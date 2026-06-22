import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

// Configuración de rutas para variables de entorno
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Intentar cargar desde la carpeta local del mcp-server y desde la raíz del proyecto
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Faltan variables de entorno SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

// Inicializar cliente de Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Definición de estados del prospecto (según schema.sql)
const PROSPECT_STATUSES = [
  "evaluacion_pendiente",
  "rechazado",
  "aprobado_listo",
  "asesoria_agendada",
  "doc_proceso",
  "analisis_riesgo",
  "firma_programada",
  "pagado_comision",
  "aportacion",
  "falta_reporte",
  "falta_afore",
  "pendiente_documentos",
  "cerrado_perdido"
] as const;

const ProspectStatusEnum = z.enum(PROSPECT_STATUSES);

// Inicializar el servidor MCP
const server = new McpServer({
  name: "pension-perfecta-mcp",
  version: "1.0.0",
});

/**
 * Tool: list_prospects
 * Descripción: Obtiene una lista de prospectos con filtros opcionales.
 */
server.tool(
  "list_prospects",
  "Obtiene una lista de prospectos del sistema. Permite filtrar opcionalmente por estatus.",
  {
    status: ProspectStatusEnum.optional().describe("Filtrar prospectos por su estado actual"),
    limit: z.number().optional().default(20).describe("Límite de prospectos a retornar (máx 100)"),
  },
  async ({ status, limit }) => {
    try {
      const maxLimit = Math.min(limit, 100);
      let query = supabase
        .from("prospects")
        .select("id, full_name, status, aliado_name, phone, email, created_at")
        .order("created_at", { ascending: false })
        .limit(maxLimit);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) throw error;

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (err: any) {
      console.error("Error en list_prospects:", err);
      return {
        content: [{ type: "text", text: `Error al obtener prospectos: ${err.message}` }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: get_prospect_detail
 * Descripción: Devuelve toda la información del prospecto, útil para mapeos exactos a CRM.
 */
server.tool(
  "get_prospect_detail",
  "Obtiene todos los detalles de un prospecto específico por su ID, incluyendo NSS, CURP y datos financieros de simulación Ley 73.",
  {
    prospect_id: z.string().uuid().describe("El UUID único del prospecto"),
  },
  async ({ prospect_id }) => {
    try {
      const { data, error } = await supabase
        .from("prospects")
        .select("*")
        .eq("id", prospect_id)
        .single();

      if (error) throw error;
      if (!data) {
        return {
          content: [{ type: "text", text: `No se encontró ningún prospecto con el ID: ${prospect_id}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (err: any) {
      console.error("Error en get_prospect_detail:", err);
      return {
        content: [{ type: "text", text: `Error al obtener los detalles del prospecto: ${err.message}` }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: update_prospect_status
 * Descripción: Actualiza el estado de un prospecto y permite añadir notas de seguimiento.
 */
server.tool(
  "update_prospect_status",
  "Actualiza el estatus de un prospecto en la base de datos y permite opcionalmente añadir notas del director o del aliado.",
  {
    prospect_id: z.string().uuid().describe("El UUID único del prospecto"),
    status: ProspectStatusEnum.describe("El nuevo estado a asignar"),
    notes_director: z.string().optional().describe("Notas internas opcionales añadidas por el director"),
    notes_aliado: z.string().optional().describe("Notas opcionales añadidas por el aliado"),
  },
  async ({ prospect_id, status, notes_director, notes_aliado }) => {
    try {
      const updatePayload: any = { status };
      if (notes_director !== undefined) {
        updatePayload.notes_director = notes_director;
      }
      if (notes_aliado !== undefined) {
        updatePayload.notes_aliado = notes_aliado;
      }

      const { data, error } = await supabase
        .from("prospects")
        .update(updatePayload)
        .eq("id", prospect_id)
        .select("id, full_name, status, updated_at")
        .single();

      if (error) throw error;

      return {
        content: [{ type: "text", text: `El estado del prospecto "${data.full_name}" ha sido actualizado con éxito a "${status}".` }],
      };
    } catch (err: any) {
      console.error("Error en update_prospect_status:", err);
      return {
        content: [{ type: "text", text: `Error al actualizar el estado del prospecto: ${err.message}` }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: create_prospect
 * Descripción: Registra un nuevo prospecto en la base de datos (por ejemplo, desde un webhook del CRM).
 */
server.tool(
  "create_prospect",
  "Crea un nuevo prospecto en el sistema. Útil para sincronizaciones desde CRMs hacia Pensión Perfecta.",
  {
    full_name: z.string().describe("Nombre completo del prospecto"),
    phone: z.string().optional().describe("Teléfono de contacto"),
    email: z.string().email().optional().describe("Correo electrónico del prospecto"),
    nss: z.string().optional().describe("Número de Seguridad Social (NSS) de 11 dígitos"),
    curp: z.string().optional().describe("CURP del prospecto"),
    aliado_name: z.string().optional().describe("Nombre del aliado que refiere al prospecto"),
    status: ProspectStatusEnum.optional().default("evaluacion_pendiente").describe("Estado inicial"),
    notes_aliado: z.string().optional().describe("Notas iniciales del aliado"),
  },
  async ({ full_name, phone, email, nss, curp, aliado_name, status, notes_aliado }) => {
    try {
      const insertPayload = {
        full_name,
        phone,
        email,
        nss,
        curp,
        aliado_name,
        status,
        notes_aliado,
      };

      const { data, error } = await supabase
        .from("prospects")
        .insert(insertPayload)
        .select("id, full_name, status, created_at")
        .single();

      if (error) throw error;

      return {
        content: [{ type: "text", text: `Prospecto "${data.full_name}" creado con éxito con el ID: ${data.id}. Estado: ${data.status}` }],
      };
    } catch (err: any) {
      console.error("Error en create_prospect:", err);
      return {
        content: [{ type: "text", text: `Error al crear el prospecto: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// Iniciar el servidor mediante el transporte STDIO
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pensión Perfecta MCP Server listo y escuchando en STDIO.");
}

run().catch((error) => {
  console.error("Error fatal en el servidor MCP:", error);
  process.exit(1);
});
