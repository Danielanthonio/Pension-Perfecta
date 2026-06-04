import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";

// Check if credentials are set
const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_PRIVATE_KEY;
const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

const isConfigured = serviceAccountEmail && privateKey && parentFolderId;

// Initialize Google Drive client if configured
let drive: any = null;
if (isConfigured) {
  try {
    let formattedPrivateKey = privateKey!.trim();
    while (
      (formattedPrivateKey.startsWith('"') && formattedPrivateKey.endsWith('"')) ||
      (formattedPrivateKey.startsWith("'") && formattedPrivateKey.endsWith("'")) ||
      (formattedPrivateKey.startsWith('\\"') && formattedPrivateKey.endsWith('\\"')) ||
      (formattedPrivateKey.startsWith("\\'") && formattedPrivateKey.endsWith("\\'"))
    ) {
      if (formattedPrivateKey.startsWith('"') && formattedPrivateKey.endsWith('"')) {
        formattedPrivateKey = formattedPrivateKey.slice(1, -1);
      } else if (formattedPrivateKey.startsWith("'") && formattedPrivateKey.endsWith("'")) {
        formattedPrivateKey = formattedPrivateKey.slice(1, -1);
      } else if (formattedPrivateKey.startsWith('\\"') && formattedPrivateKey.endsWith('\\"')) {
        formattedPrivateKey = formattedPrivateKey.slice(2, -2);
      } else if (formattedPrivateKey.startsWith("\\'") && formattedPrivateKey.endsWith("\\'")) {
        formattedPrivateKey = formattedPrivateKey.slice(2, -2);
      }
      formattedPrivateKey = formattedPrivateKey.trim();
    }
    formattedPrivateKey = formattedPrivateKey.replace(/\\+r/g, "");
    formattedPrivateKey = formattedPrivateKey.replace(/\\+n/g, "\n");
    formattedPrivateKey = formattedPrivateKey.replace(/\\"/g, '"');
    while (
      (formattedPrivateKey.startsWith('"') && formattedPrivateKey.endsWith('"')) ||
      (formattedPrivateKey.startsWith("'") && formattedPrivateKey.endsWith("'"))
    ) {
      formattedPrivateKey = formattedPrivateKey.slice(1, -1).trim();
    }
    
    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: formattedPrivateKey,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    drive = google.drive({ version: "v3", auth });
    console.log("Google Drive API initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Google Drive API client:", err);
  }
} else {
  console.warn("Google Drive credentials not found in env. Running in SIMULATION mode.");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // Check configuration and fallback to simulation if not configured or drive client fails
    const runInSimulation = !isConfigured || !drive;

    if (action === "createFolder") {
      const { clientName, nss } = body;
      const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const sanitizedClientName = clientName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
      const folderName = `${sanitizedClientName}_${nss || "S_N"}_${dateStr}`;

      if (runInSimulation) {
        console.log(`[SIMULATION] Creating Google Drive folder: ${folderName}`);
        const fakeFolderId = `sim-folder-${Math.random().toString(36).substring(2, 11)}`;
        const fakeFolderUrl = `https://drive.google.com/drive/folders/${fakeFolderId}?usp=sharing`;
        return NextResponse.json({
          success: true,
          simulated: true,
          folderId: fakeFolderId,
          folderUrl: fakeFolderUrl,
          folderName,
        });
      }

      // Real Google Drive creation
      const response = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: folderName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentFolderId!],
        },
        fields: "id, webViewLink",
      });

      const folderId = response.data.id;
      const folderUrl = response.data.webViewLink;

      // Enable public link sharing as reader so anyone in the app can open it
      await drive.permissions.create({
        fileId: folderId!,
        supportsAllDrives: true,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
      });

      return NextResponse.json({
        success: true,
        simulated: false,
        folderId,
        folderUrl,
        folderName,
      });
    }

    if (action === "uploadFile") {
      const { folderId, fileName, fileDataUrl, fileType } = body;

      if (!folderId || !fileName || !fileDataUrl) {
        return NextResponse.json({ success: false, error: "Missing required fields for upload" }, { status: 400 });
      }

      if (runInSimulation) {
        console.log(`[SIMULATION] Uploading file "${fileName}" to folder: ${folderId}`);
        const fakeFileId = `sim-file-${Math.random().toString(36).substring(2, 11)}`;
        const fakeFileUrl = `https://drive.google.com/open?id=${fakeFileId}`;
        return NextResponse.json({
          success: true,
          simulated: true,
          fileId: fakeFileId,
          fileUrl: fakeFileUrl,
        });
      }

      // Real Google Drive Upload
      // Parse base64 URL
      const matches = fileDataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        return NextResponse.json({ success: false, error: "Invalid data URL format" }, { status: 400 });
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");

      // Check file size (10MB limit)
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB
      if (buffer.length > MAX_SIZE) {
        return NextResponse.json({ success: false, error: "File exceeds 10MB limit" }, { status: 400 });
      }

      // Convert buffer to stream
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);

      const response = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: fileName,
          parents: [folderId],
        },
        media: {
          mimeType,
          body: stream,
        },
        fields: "id, webViewLink",
      });

      const fileId = response.data.id;
      const fileUrl = response.data.webViewLink;

      // Make the file publicly viewable so it can be opened directly
      await drive.permissions.create({
        fileId: fileId!,
        supportsAllDrives: true,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
      });

      return NextResponse.json({
        success: true,
        simulated: false,
        fileId,
        fileUrl,
      });
    }

    if (action === "deleteFile") {
      const { fileId } = body;

      if (!fileId) {
        return NextResponse.json({ success: false, error: "Missing fileId" }, { status: 400 });
      }

      if (runInSimulation) {
        console.log(`[SIMULATION] Deleting Google Drive file: ${fileId}`);
        return NextResponse.json({ success: true, simulated: true });
      }

      // Real delete
      await drive.files.delete({
        fileId: fileId,
        supportsAllDrives: true,
      });

      return NextResponse.json({ success: true, simulated: false });
    }

    if (action === "scanOcr") {
      const { fileDataUrl, fileName } = body;

      if (!fileDataUrl) {
        return NextResponse.json({ success: false, error: "Missing fileDataUrl for OCR" }, { status: 400 });
      }

      if (runInSimulation) {
        return NextResponse.json({
          success: true,
          simulated: true,
          error: "Drive client not configured for OCR"
        });
      }

      // Parse base64 URL
      const matches = fileDataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        return NextResponse.json({ success: false, error: "Invalid data URL format" }, { status: 400 });
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");

      // Convert buffer to stream
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);

      // Upload file to Google Drive and convert to Google Doc for OCR
      const createResponse = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: `Temp_OCR_${Date.now()}`,
          mimeType: "application/vnd.google-apps.document", // Triggers OCR conversion
          parents: [parentFolderId!],
        },
        media: {
          mimeType,
          body: stream,
        },
        fields: "id",
      });

      const tempDocId = createResponse.data.id;

      if (!tempDocId) {
        throw new Error("Failed to create temporary OCR document in Google Drive");
      }

      // Export Google Doc as plain text
      const exportResponse = await drive.files.export({
        fileId: tempDocId,
        mimeType: "text/plain",
      });

      const extractedText = exportResponse.data || "";

      // Delete the temporary file (wrapped in try-catch to avoid crashing on cleanup errors)
      try {
        await drive.files.delete({
          fileId: tempDocId,
          supportsAllDrives: true,
        });
      } catch (deleteError) {
        console.warn(`Temporary OCR file deletion warning (id: ${tempDocId}):`, deleteError);
      }

      // Parse text to extract candidate data (Name, NSS, CURP)
      const data = extractProspectData(extractedText);

      return NextResponse.json({
        success: true,
        simulated: false,
        data,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("Google Drive API Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

function extractProspectData(text: string): { fullName: string; nss: string; curp: string; semanas: string } {
  const cleanText = text.replace(/\r/g, "");
  
  // 1. Extract CURP
  const curpPattern = /\b([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]{2})\b/i;
  const curpMatch = cleanText.match(curpPattern);
  const curp = curpMatch ? curpMatch[1].toUpperCase() : "";

  // 2. Extract NSS
  const nssPattern = /\b(\d{2}[-\s]?\d{2}[-\s]?\d{2}[-\s]?\d{4}[-\s]?\d)\b/;
  const nssMatch = cleanText.match(nssPattern);
  const nss = nssMatch ? nssMatch[1].replace(/[-\s]/g, "") : "";

  // 3. Extract Name
  let fullName = "";
  const namePatterns = [
    /(?:estimado\(a\),?\s*\n?\s*)([A-ZÁÉÍÓÚÑa-záéíóúñ\s.,]{5,60})/i,
    /(?:nombre(?: del)? (?:trabajador|asegurado)?|trabajador|asegurado|cliente|titular)\s*:\s*([A-ZÁÉÍÓÚÑa-záéíóúñ\s.,]{3,60})/i,
    /(?:nombre(?: del)? (?:trabajador|asegurado)?|trabajador|asegurado|cliente|titular)\s*\n\s*([A-ZÁÉÍÓÚÑ\s.,]{5,60})/i,
  ];

  for (const pattern of namePatterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (candidate.length > 5 && !/curp|nss|rfc|afore|imss|direcc/i.test(candidate)) {
        fullName = candidate.replace(/\s+/g, " ");
        break;
      }
    }
  }

  // Fallback: look for uppercase lines that resemble a full name
  if (!fullName) {
    const lines = cleanText.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[A-ZÁÉÍÓÚÑ\s]{8,50}$/.test(trimmed) && trimmed.split(/\s+/).length >= 3 && trimmed.split(/\s+/).length <= 5) {
        if (!/ESTADO|CUENTA|DOCUMENTO|IMSS|AFORE|REPORTE|SEMANAS|COTIZADAS|SOCIAL|NSS|CURP/i.test(trimmed)) {
          fullName = trimmed;
          break;
        }
      }
    }
  }

  // 4. Extract Semanas Cotizadas (preferring total/IMSS weeks)
  const semanasPatterns = [
    /(?:total\s+de\s+semanas\s+cotizadas|total\s+de\s+semanas)\s*:\s*([\d,]+)/i,
    /(?:total\s+de\s+semanas\s+cotizadas|total\s+de\s+semanas)\s*\n\s*([\d,]+)/i,
    /(?:semanas\s+cotizadas\s+imss|semanas\s+cotizadas|semanas\s+reconocidas|número\s+de\s+semanas\s+reconocidas)\s*:\s*([\d,]+)/i,
    /(?:semanas\s+cotizadas\s+imss|semanas\s+cotizadas|semanas\s+reconocidas|número\s+de\s+semanas\s+reconocidas)\s*\n\s*([\d,]+)/i,
    /([\d,]+)\s*(?:semanas\s+cotizadas|semanas\s+reconocidas)/i
  ];
  let semanas = "";
  for (const pattern of semanasPatterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      semanas = match[1].replace(/,/g, "").trim();
      break;
    }
  }

  return {
    fullName: fullName.toUpperCase(),
    nss,
    curp,
    semanas,
  };
}
