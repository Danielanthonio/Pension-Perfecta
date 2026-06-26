# Guía de Configuración Supabase: Desactivar "Confirm Email"

Esta guía detalla los pasos para resolver la inestabilidad de sesiones y permitir el inicio de sesión inmediato de los nuevos asesores/aliados registrados por el director.

## Problema Actual

Supabase tiene activada por defecto la opción de **"Confirm Email"** (Confirmar Correo Electrónico). Cuando el director agrega un nuevo Aliado, el sistema crea el registro en la tabla de autenticación de Supabase, pero dado que el correo del Aliado aún no ha sido confirmado por él mismo, Supabase **bloquea el inicio de sesión con contraseña**. 

Esto fuerza al sistema a usar un bypass provisional en el navegador, el cual no tiene un token de Supabase válido y es bloqueado por las políticas RLS (Row Level Security), provocando que los clientes ingresados "desaparezcan" al recargar y que la sesión se caiga constantemente.

---

## Solución: Desactivar "Confirm Email" en Supabase (3 Pasos)

Sigue estos sencillos pasos para desactivar esta regla y activar la sincronización automática en la nube de forma inmediata:

### Paso 1: Ingresar al Dashboard de tu Proyecto
1. Ve a [Supabase Dashboard](https://supabase.com/dashboard).
2. Selecciona tu proyecto actual (por ejemplo: **`gxovfywzftiirdpcskbc`**).

### Paso 2: Ir a la sección de Autenticación
1. En el menú lateral izquierdo, haz clic en **Authentication** (icono de candado/usuario).
2. Entra en la pestaña **Providers** (Proveedores).
3. Haz clic para expandir la sección de **Email**.

### Paso 3: Desactivar y Guardar
1. Busca la opción **Confirm email** (Confirmar correo electrónico).
2. Mueve el switch o desmarca la casilla para **desactivarla (OFF)**.
3. Desplázate hacia abajo y haz clic en el botón verde **Save** (Guardar).

---

## Resultados Esperados

Una vez desactivada la confirmación:
* Cualquier Aliado agregado podrá iniciar sesión de forma normal, obteniendo un token de autenticación válido de Supabase.
* El sistema ya no utilizará el modo provisional local y sincronizará todos los prospectos directamente en la base de datos de la nube.
* Se eliminarán los bucles de caída de sesión.
* Los banners de advertencia de "Modo Emergencia Local" desaparecerán de forma automática del panel.
