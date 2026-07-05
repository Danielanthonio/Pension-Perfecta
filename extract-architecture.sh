#!/bin/bash
echo "# Pensión Perfecta - Arquitectura Extraída"
echo ""
echo "Generado: $(date)"
echo ""
echo "## 1. Dependencias Críticas"
echo '```json'
cat package.json | jq '.dependencies, .devDependencies' 2>/dev/null || cat package.json
echo '```'
echo ""
echo "## 2. Árbol de Directorios (Resumido)"
echo '```'
find src -type d -not -path '*/node_modules/*' 2>/dev/null | sed 's|^src/||' | sort
echo '```'
echo ""
echo "## 3. Endpoints de API Disponibles"
find src/app/api -name "route.ts" 2>/dev/null | while read file; do
  echo "### $(echo $file | sed 's|src/app/||')"
  grep -E "export (async )?(function )?(GET|POST|PUT|DELETE|PATCH)" "$file" | head -5
  echo ""
done
echo ""
echo "## 4. Tipos y Contexto Global"
grep -A 100 "type AppContextType\|interface AppContext" src/utils/context/AppContext.tsx 2>/dev/null | head -60
echo ""
echo "## 5. Tipos de Datos Principales"
find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | xargs grep -h "^export type\|^export interface" 2>/dev/null | head -20
echo ""
echo "## 6. Rutas de la Aplicación"
ls -la src/app/ 2>/dev/null | grep "^d" | awk '{print $NF}' | grep -v "^\." | sed 's|^|- /|'
echo ""
echo "## 7. Variables de Entorno Requeridas (nombres, sin valores)"
if [ -f .env.example ]; then
  cat .env.example | grep -v "^#" | grep -v "^$" | sed 's/=.*/=[VALOR OCULTO]/'
else
  echo "No se encontró .env.example"
fi
echo ""
echo "## 8. Estadísticas del Proyecto"
echo "Líneas de código en src/:"
find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | xargs wc -l 2>/dev/null | tail -1
echo "Número de componentes React:"
find src/components -name "*.tsx" 2>/dev/null | wc -l
echo "Número de endpoints API:"
find src/app/api -name "route.ts" 2>/dev/null | wc -l
echo ""
echo "## 9. Esquema de Base de Datos"
if [ -f supabase/schema.sql ]; then
  echo '```sql'
  grep -E "CREATE TABLE|COLUMN|CONSTRAINT|REFERENCES" supabase/schema.sql | head -80
  echo '```'
else
  echo "No se encontró supabase/schema.sql"
fi
echo ""
echo "## 10. Carpeta mcp-server (detectada, revisar manualmente)"
ls -la mcp-server/ 2>/dev/null
echo ""
echo "## 11. Archivos en supabase/"
ls -la supabase/ 2>/dev/null
