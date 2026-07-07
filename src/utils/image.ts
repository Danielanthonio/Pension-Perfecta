// Compresión de imágenes del lado del cliente para fotos de perfil.
// La foto se muestra en un círculo pequeño, así que la reescalamos a un lado
// máximo (por defecto 256px) y la exportamos en JPEG. Resultado típico: 10–30 KB,
// en vez de los varios MB de una foto de celular. Esto ahorra almacenamiento y
// ancho de banda (importante en el plan limitado de Hostinger/Supabase).

export const MAX_AVATAR_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB límite del archivo original

export interface CompressedImage {
  blob: Blob;
  dataUrl: string; // útil para preview inmediato y para el fallback en modo demo
}

/**
 * Reescala y comprime una imagen a JPEG.
 * @param file archivo original (image/*)
 * @param maxSize lado mayor máximo en px (default 256)
 * @param quality calidad JPEG 0..1 (default 0.82)
 */
export async function compressImage(
  file: File,
  maxSize = 256,
  quality = 0.82
): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo seleccionado no es una imagen.");
  }
  if (file.size > MAX_AVATAR_INPUT_BYTES) {
    throw new Error("La imagen es demasiado grande (máx. 10 MB). Elige una más ligera.");
  }

  const img = await loadImage(file);

  // Escala manteniendo proporción para que el lado mayor sea <= maxSize.
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen en este navegador.");
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("No se pudo comprimir la imagen.");

  return { blob, dataUrl };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}
