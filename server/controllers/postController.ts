import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import { appendFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { cloudinary } from "../config/cloudinary.js";
import { Generation } from "../models/Generation.js";
import { Post } from "../models/Post.js";
import { uploadMediaFile } from "../utils/mediaUpload.js";

const DEBUG_LOG_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../debug-b6a79a.log");
const debugLog = (location: string, message: string, data: object, hypothesisId: string, runId = "initial") => {
    try { appendFileSync(DEBUG_LOG_PATH, JSON.stringify({ sessionId: "b6a79a", location, message, data, timestamp: Date.now(), hypothesisId, runId }) + "\n"); } catch {}
};


// Helper to poll Leonardo.ai
const pollLeonardoJob = async (generationId: string, apiKey: string): Promise<string> => {
    const maxRetries = 20;
    const delay = 5000;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await axios.get(`https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`, {
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${apiKey}`,
                }
            })

            const generation = response.data.generations_by_pk;
            if (generation.status === "COMPLETE") {
                if (generation.generated_images && generation.generated_images.length > 0) {
                    return generation.generated_images[0].url;
                }
                throw new Error("Generation complete but no images found.")
            }
            if (generation.status === "FAILED") {
                throw new Error("Leonardo.ai generation failed")
            }
        } catch (err: any) {
            console.error("Polling error:", err?.response?.data || err?.message)
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw new Error("Leonardo.ai generation timeed out.")
}

// Generate post
// POST /api/posts/generate
export const generatePost = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { prompt, tone, generateImage } = req.body;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            res.status(400).json({ message: "Gemini API Key is missing. Please add it to your server/.env file." })
            return;
        }

        const ai = new GoogleGenAI({ apiKey });

        // Generate Text
        const textResponse = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: `Generate a socia media post based on this prompt: "${prompt}".
                Tone: ${tone}.
                Include relavant hashtags.
                Format the response as JSON with "content" and "imagePrompt" should be a highly descriptive prompt for an image generator that complements the post `,
        });

        let content = "";
        let imagePrompt = prompt;

        try {
            const rawText = textResponse.text || "";
            const jsonMatch = rawText.match(/\{[\s\S]*\}/)
            const data = jsonMatch ? JSON.parse(jsonMatch[0]) : { content: rawText, imagePrompt: prompt };
            content = data.content;
            imagePrompt = data.imagePrompt;
        } catch (error) {
            content = textResponse.text || ""
        }

        let mediaUrl = "";
        if (generateImage) {
            try {
                const leonardoKey = process.env.LEONARDO_API_KEY;
                if (leonardoKey) {
                    // Use Leonardo.ai for image generation
                    const leoResponse = await axios.post(
                        "https://cloud.leonardo.ai/api/rest/v2/generations",
                        {
                            "public": false,
                            "model": "gpt-image-2",
                            "parameters": {
                                "quality": "LOW",
                                "prompt": imagePrompt,
                                "quantity": 1,
                                "width": 1024,
                                "height": 1024,
                                "prompt_enhance": "OFF"
                            }
                        }, {
                        headers: {
                            Accept: "application/json",
                            Authorization: `Bearer ${leonardoKey}`,
                            "Content-Type": "application/json"
                        }
                    }
                    )

                    const generationId = leoResponse.data.generate.generationId;
                    const tempUrl = await pollLeonardoJob(generationId, leonardoKey);

                    // Upload to Cloudinary for persistence
                    const uploadResult = await cloudinary.uploader.upload(tempUrl, {
                        folder: "ai-generations",
                    });
                    mediaUrl = uploadResult.secure_url;
                }
            } catch (err: any) {
                console.log("Image generation failed:", err)
            }
        }

        // Save generation to DB
        const generation = await Generation.create({
            user: req.user._id,
            prompt,
            content,
            mediaUrl,
            mediaType: mediaUrl ? "image" : undefined,
            tone
        })

        res.json(generation)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Get generations
// GET /api/posts/generations
export const getGenerations = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const generations = await Generation.find({user: req.user._id}).sort({createdAt: -1});
        res.json(generations)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}


// Get posts
// GET /api/posts
export const getPosts = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const posts = await Post.find({user: req.user._id});
        res.json(posts)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" }); 
    }
}


// Schedule post
// POST /api/posts
export const schedulePost = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
       const { content, platforms, scheduledFor, status } = req.body;

       // #region agent log
       const hasCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
       debugLog('postController.ts:schedulePost:entry', 'schedulePost received', { bodyKeys: Object.keys(req.body || {}), contentPresent: !!content, platformsType: typeof platforms, platformsValue: platforms, scheduledFor, status, hasFile: !!req.file, fileField: req.file?.fieldname, fileSize: req.file?.size, fileMime: req.file?.mimetype, hasCloudinary, contentType: req.headers['content-type'] }, 'A,D');
       fetch('http://127.0.0.1:7528/ingest/672da1b7-1ec2-4b96-b90f-08a26a88d868',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b6a79a'},body:JSON.stringify({sessionId:'b6a79a',location:'postController.ts:schedulePost:entry',message:'schedulePost received',data:{bodyKeys:Object.keys(req.body||{}),contentPresent:!!content,hasFile:!!req.file,fileSize:req.file?.size,hasCloudinary},timestamp:Date.now(),hypothesisId:'A,D'})}).catch(()=>{});
       // #endregion
       
       // Parse platforms if it comes as a stringified array from FormData
       let parsedPlatforms = platforms;
       if (typeof platforms === "string") {
        try {
            parsedPlatforms = JSON.parse(platforms)
        } catch (error) {
            parsedPlatforms = platforms.split(",");
        }
       }

       let mediaUrl: string | undefined = req.body.mediaUrl;
       let mediaType: "image" | "video" | undefined = req.body.mediaType;

       if (req.file) {
        const uploaded = await uploadMediaFile(req.file);
        mediaUrl = uploaded.mediaUrl;
        mediaType = uploaded.mediaType;
        // #region agent log
        debugLog('postController.ts:schedulePost:mediaUploaded', 'media upload complete', { storage: uploaded.storage, mediaType, hasMediaUrl: !!mediaUrl }, 'A,E');
        fetch('http://127.0.0.1:7528/ingest/672da1b7-1ec2-4b96-b90f-08a26a88d868',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b6a79a'},body:JSON.stringify({sessionId:'b6a79a',location:'postController.ts:schedulePost:mediaUploaded',message:'media upload complete',data:{storage:uploaded.storage,mediaType,hasMediaUrl:!!mediaUrl},timestamp:Date.now(),hypothesisId:'A,E',runId:'post-fix'})}).catch(()=>{});
        // #endregion
       }

       // #region agent log
       debugLog('postController.ts:schedulePost:preCreate', 'about to create post', { parsedPlatforms, mediaUrl: !!mediaUrl, mediaType, scheduledFor, status }, 'B,C');
       fetch('http://127.0.0.1:7528/ingest/672da1b7-1ec2-4b96-b90f-08a26a88d868',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b6a79a'},body:JSON.stringify({sessionId:'b6a79a',location:'postController.ts:schedulePost:preCreate',message:'about to create post',data:{parsedPlatforms,mediaUrl:!!mediaUrl,mediaType,scheduledFor,status},timestamp:Date.now(),hypothesisId:'B,C'})}).catch(()=>{});
       // #endregion

       const post = await Post.create({
        user: req.user._id,
        content,
        platforms: parsedPlatforms,
        mediaUrl,
        mediaType,
        scheduledFor,
        status
       })
       // #region agent log
       debugLog('postController.ts:schedulePost:success', 'post created', { postId: String(post._id), status: post.status, scheduledFor: post.scheduledFor, mediaUrl: !!post.mediaUrl, mediaType: post.mediaType }, 'B,C,D');
       fetch('http://127.0.0.1:7528/ingest/672da1b7-1ec2-4b96-b90f-08a26a88d868',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b6a79a'},body:JSON.stringify({sessionId:'b6a79a',location:'postController.ts:schedulePost:success',message:'post created',data:{postId:String(post._id),status:post.status,mediaUrl:!!post.mediaUrl,mediaType:post.mediaType},timestamp:Date.now(),hypothesisId:'B,C,D',runId:'post-fix'})}).catch(()=>{});
       // #endregion
       res.status(201).json(post)
    } catch (error: any) {
        // #region agent log
        debugLog('postController.ts:schedulePost:error', 'schedulePost failed', { errorMessage: error?.message, errorName: error?.name }, 'A,C,D');
        fetch('http://127.0.0.1:7528/ingest/672da1b7-1ec2-4b96-b90f-08a26a88d868',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b6a79a'},body:JSON.stringify({sessionId:'b6a79a',location:'postController.ts:schedulePost:error',message:'schedulePost failed',data:{errorMessage:error?.message,errorName:error?.name},timestamp:Date.now(),hypothesisId:'A,C,D'})}).catch(()=>{});
        // #endregion
        res.status(500).json({ message: error?.message || "Server error" }); 
    }
}