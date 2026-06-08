import * as pdfjsLib from 'pdfjs-dist';

// Use CDN worker for Next.js 14 compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Extracts all text from an uploaded PDF file or ArrayBuffer in the browser using pdfjs-dist.
 */
export async function extractTextFromPdf(file: File | ArrayBuffer): Promise<string> {
  try {
    const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
    const uint8Array = new Uint8Array(arrayBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Join items with newline to preserve individual text items as separate lines.
      // This is the format our parser expects.
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join('\n');
        
      fullText += pageText + '\n';
    }
    
    return fullText;
  } catch (err: any) {
    console.error('Error extracting PDF text:', err);
    throw new Error(
      `No se pudo leer el contenido del PDF. Asegúrate de que el archivo no esté protegido con contraseña. (${err.message || 'Error desconocido'})`
    );
  }
}
