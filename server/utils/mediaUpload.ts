import { randomBytes } from "crypto";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, extname, join } from "path";
import { fileURLToPath } from "url";
import { cloudinary } from "../config/cloudinary.js";
import { uploadBufferToZernio } from "./zernioMediaUpload.js";

const UPLOADS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../uploads");

const hasCloudinaryConfig = () =>
    !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const debugLog = (location: string, message: string, data: object, hypothesisId: string) => {
    // #region agent log
    fetch("http://127.0.0.1:7528/ingest/672da1b7-1ec2-4b96-b90f-08a26a88d868", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b6a79a" },
        body: JSON.stringify({ sessionId: "b6a79a", location, message, data, timestamp: Date.now(), hypothesisId, runId: "zernio-media" }),
    }).catch(() => {});
    // #endregion
};

export const uploadMediaFile = async (
    file: Express.Multer.File
): Promise<{ mediaUrl: string; mediaType: "image" | "video"; storage: "zernio" | "cloudinary" | "local" }> => {
    const mediaType: "image" | "video" = file.mimetype.startsWith("video/") ? "video" : "image";
    const filename = file.originalname || `upload${extname(file.originalname) || (mediaType === "video" ? ".mp4" : ".jpg")}`;

    if (process.env.ZERNIO_API_KEY) {
        try {
            const publicUrl = await uploadBufferToZernio(file.buffer, filename, file.mimetype);
            return { mediaUrl: publicUrl, mediaType, storage: "zernio" };
        } catch (error: any) {
            debugLog("mediaUpload.ts:zernioFallback", "Zernio media upload failed, trying Cloudinary", { errorMessage: error?.message }, "H");
        }
    }

    if (hasCloudinaryConfig()) {
        try {
            const result = await new Promise<any>((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { resource_type: "auto", folder: "social-scheduler" },
                    (error, uploadResult) => {
                        if (error) reject(error);
                        else resolve(uploadResult);
                    }
                );
                stream.end(file.buffer);
            });

            return {
                mediaUrl: result.secure_url,
                mediaType: result.resource_type === "video" ? "video" : "image",
                storage: "cloudinary",
            };
        } catch (error: any) {
            debugLog("mediaUpload.ts:cloudinaryFallback", "Cloudinary upload failed, using local storage", { errorMessage: error?.message, httpCode: error?.http_code }, "A");
        }
    }

    if (!existsSync(UPLOADS_DIR)) {
        mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const ext = extname(file.originalname) || (file.mimetype.startsWith("video/") ? ".mp4" : ".jpg");
    const localFilename = `${randomBytes(16).toString("hex")}${ext}`;
    writeFileSync(join(UPLOADS_DIR, localFilename), file.buffer);

    const port = process.env.PORT || 3000;
    const baseUrl = process.env.SERVER_URL || `http://localhost:${port}`;

    return {
        mediaUrl: `${baseUrl}/uploads/${localFilename}`,
        mediaType,
        storage: "local",
    };
};
