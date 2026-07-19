import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refresca la sesión de Supabase en cada request a la API para que las Route
// Handlers (que llaman a supabase.auth.getUser()) reconozcan al usuario logueado.
//
// Sin este middleware, cuando el token de acceso vence (~1h) y el navegador aún
// no lo ha renovado, el servidor no ve la sesión y responde 401 "No autorizado"
// en acciones como asignar líder/empresa o dar de alta aliados.
//
// IMPORTANTE: este middleware SOLO renueva la sesión. No hace redirecciones de
// ruta, a propósito, para no romper a los usuarios con "sesión provisional"
// (que no tienen sesión real de Supabase Auth).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Dispara la renovación del token si hace falta y persiste las cookies nuevas
  // (tanto en la request, para que la Route Handler ya vea la sesión fresca,
  // como en la response, para el navegador). No redirige ni bloquea nada.
  await supabase.auth.getUser()

  return response
}

export const config = {
  // Solo las rutas de API necesitan sesión del lado servidor. Limitarlo aquí
  // evita sobrecargar cada navegación con una verificación de auth.
  matcher: ['/api/:path*'],
}
