# Pensión Perfecta MCP Server

Este es un servidor compatible con **Model Context Protocol (MCP)** que expone herramientas para interactuar directamente con la base de datos de Pensión Perfecta (Supabase). 

Permite que asistentes de IA (como Claude Desktop, Cursor o agentes personalizados) consulten, creen y actualicen prospectos de forma segura usando lenguaje natural, sirviendo como puente para la sincronización con CRMs (HubSpot, Zoho, Salesforce, etc.).

---

## Requisitos Previos

- **Node.js**: Versión 18 o superior.
- **Supabase**: Credenciales configuradas en el archivo `.env.local` de la raíz del proyecto, o bien en un archivo `.env` dentro de esta carpeta.

### Variables de entorno necesarias:
```env
SUPABASE_URL=https://gxovfywzftiirdpcskbc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```
*Nota: Se recomienda usar la `service_role` key en lugar de la `anon` key para que el MCP server pueda leer y escribir registros independientemente de las políticas de RLS restrictivas para usuarios finales.*

---

## Instalación y Construcción

1. Ingresa a la carpeta del servidor MCP:
   ```bash
   cd mcp-server
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Compila el código TypeScript a JavaScript:
   ```bash
   npm run build
   ```

---

## Configuración en Herramientas de IA

### 1. Claude Desktop

Para integrar este servidor con **Claude Desktop**, edita el archivo de configuración correspondiente a tu sistema operativo:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Agrega el servidor a tu lista de `mcpServers` (asegúrate de reemplazar las rutas absolutas y las claves reales):

```json
{
  "mcpServers": {
    "pension-perfecta-mcp": {
      "command": "node",
      "args": [
        "/Users/Macbook/Pesion Perfecta 1/mcp-server/build/index.js"
      ],
      "env": {
        "SUPABASE_URL": "https://gxovfywzftiirdpcskbc.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "TU_SUPABASE_SERVICE_ROLE_KEY_AQUI"
      }
    }
  }
}
```

### 2. Cursor

1. Ve a **Cursor Settings** > **Features** > **MCP**.
2. Haz clic en **+ Add New MCP Server**.
3. Configura:
   - **Name**: `Pensión Perfecta`
   - **Type**: `stdio`
   - **Command**: `node "/Users/Macbook/Pesion Perfecta 1/mcp-server/build/index.js"`
4. Añade las variables de entorno necesarias (`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`) en la misma interfaz o en tu sistema operativo.

---

## Herramientas Expuestas (Tools)

El servidor expone las siguientes herramientas:

1. **`list_prospects`**: Obtiene la lista de prospectos. Admite filtrar por estatus (ej. `aprobado_listo`, `evaluacion_pendiente`).
2. **`get_prospect_detail`**: Obtiene toda la información de un prospecto específico usando su UUID (incluyendo CURP, NSS, detalles financieros, links de Google Drive, etc.). Es ideal para alimentar al CRM.
3. **`update_prospect_status`**: Cambia el estado de un prospecto y añade notas del director o aliado.
4. **`create_prospect`**: Registra un nuevo prospecto en la base de datos (ideal para importar leads que llegan desde el CRM).
