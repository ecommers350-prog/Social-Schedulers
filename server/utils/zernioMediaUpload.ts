import { readFileSync } from "fs";
import { basename, join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import zernio from "../config/zernio.js";

const UPLOADS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../uploads");

const MIME_BY_EXT: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
};

const debugLog = (location: string, message: string, data: object, hypothesisId: string) => {
    // #region agent log
    fetch("http://127.0.0.1:7528/ingest/672da1b7-1ec2-4b96-b90f-08a26a88d868", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b6a79a" },
        body: JSON.stringify({ sessionId: "b6a79a", location, message, data, timestamp: Date.now(), hypothesisId, runId: "zernio-media" }),
    }).catch(() => {});
    // #endregion
};

const isPrivateMediaUrl = (url: string) => {
    try {
        const { hostname } = new URL(url);
        return (
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname.startsWith("192.168.") ||
            hostname.startsWith("10.") ||
            hostname.endsWith(".local")
        );
    } catch {
        return true;
    }
};

const guessContentType = (filename: string, fallback = "application/octet-stream") => {
    const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
    return MIME_BY_EXT[ext] || fallback;
};

export const uploadBufferToZernio = async (
    buffer: Buffer,
    filename: string,
    contentType: string
): Promise<string> => {
    // #region agent log
    debugLog("zernioMediaUpload.ts:presign:start", "requesting Zernio presigned URL", { filename, contentType, size: buffer.length }, "H");
    // #endregion

    const presignResponse = await zernio.media.getMediaPresignedUrl({
        body: { filename, contentType, size: buffer.length },
    });

    const presignData = presignResponse?.data;
    if (!presignData?.uploadUrl || !presignData?.publicUrl) {
        throw new Error("Zernio presign response missing uploadUrl or publicUrl");
    }

    const putResponse = await fetch(presignData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: buffer,
    });

    if (!putResponse.ok) {
        throw new Error(`Zernio media PUT failed with status ${putResponse.status}`);
    }

    // #region agent log
    debugLog("zernioMediaUpload.ts:presign:success", "uploaded media to Zernio", { hasPublicUrl: !!presignData.publicUrl, type: presignData.type }, "H");
    // #endregion

    return presignData.publicUrl as string;
};

export const resolvePublicMediaUrl = async (
    mediaUrl: string,
    mediaType: "image" | "video" = "image"
): Promise<string> => {
    if (!isPrivateMediaUrl(mediaUrl)) {
        return mediaUrl;
    }

    const filename = basename(new URL(mediaUrl).pathname);
    const filePath = join(UPLOADS_DIR, filename);
    const buffer = readFileSync(filePath);
    const contentType = guessContentType(filename, mediaType === "video" ? "video/mp4" : "image/jpeg");

    // #region agent log
    debugLog("zernioMediaUpload.ts:resolve:start", "re-uploading local media to Zernio", { filename, fileSize: buffer.length, mediaType }, "G,H");
    // #endregion

    return uploadBufferToZernio(buffer, filename, contentType);
};
