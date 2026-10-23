import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { isStudioRequest } from "@/lib/auth/session";
import { authorizeUpload } from "@/lib/images/upload-policy";

export const runtime = "nodejs";

/**
 * Issues Blob client-upload tokens so Studio photos go from the browser straight to Blob (a
 * Function body is capped at 4.5 MB). The middleware already guards /api/studio/*; the token
 * step checks the session again. No onUploadCompleted: Blob can't call back to localhost, and
 * the server action processes the upload itself.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: (pathname) => authorizeUpload(isStudioRequest, pathname),
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("Studio upload token refused:", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ error: "Upload refused" }, { status: 400 });
  }
}
