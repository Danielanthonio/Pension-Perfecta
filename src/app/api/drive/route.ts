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

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("Google Drive API Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
