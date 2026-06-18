import cron from "node-cron"
import { Post } from "../models/Post.js";
import { Account } from "../models/Account.js";
import zernio from "../config/zernio.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { resolvePublicMediaUrl } from "../utils/zernioMediaUpload.js";

const schedulerDebugLog = (location: string, message: string, data: object, hypothesisId: string) => {
    // #region agent log
    fetch("http://127.0.0.1:7528/ingest/672da1b7-1ec2-4b96-b90f-08a26a88d868", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b6a79a" },
        body: JSON.stringify({ sessionId: "b6a79a", location, message, data, timestamp: Date.now(), hypothesisId, runId: "publish-fix" }),
    }).catch(() => {});
    // #endregion
};

export const initScheduler = () => {
    cron.schedule("* * * * *", async () => {
        try {
            const now = new Date();
            const postsToPublish = await Post.find({status: "scheduled", scheduledFor: {$lte: now}});

            for (const post of postsToPublish) {
                try {
                    const accounts = await Account.find({
                        user: post.user,
                        platform: {$in: post.platforms},
                        status: "connected",
                        zernioAccountId: {$exists: true}
                    })

                    if (accounts.length === 0) {
                        console.log(`No connected Zernio accounts found for post ${post._id}`);
                        continue;
                    }
                    const zernioPlatforms = accounts.map((acc) => ({
                        platform: acc.platform as any,
                        accountId: acc.zernioAccountId!
                    }))

                    let mediaUrl = post.mediaUrl;
                    if (mediaUrl) {
                        mediaUrl = await resolvePublicMediaUrl(mediaUrl, post.mediaType || "image");
                        if (mediaUrl !== post.mediaUrl) {
                            post.mediaUrl = mediaUrl;
                            await post.save();
                        }
                    }

                    const payload = {
                        content: post.content,
                        publishNow: true,
                        ...(mediaUrl ? {mediaItems: [{type: post.mediaType || "image", url: mediaUrl}]} : {}),
                        platforms: zernioPlatforms,
                    }

                    // #region agent log
                    schedulerDebugLog("schedulerService.ts:publish", "publishing post to Zernio", { postId: String(post._id), mediaUrl, mediaType: post.mediaType || "image" }, "G,H");
                    // #endregion

                    console.log(`Publishing post ${post._id} to Zernio with media: ${mediaUrl || "none"}`)

                    const response = await zernio.posts.createPost({
                        body: payload
                    })

                    const publishedPost = (response.data as any)?.post || response.data;

                    if (!publishedPost) {
                        throw new Error("Failed to get post object from Zernio response")
                    }

                    console.log(`Zernio post created: ${publishedPost._id || publishedPost.id}`);

                    post.status = "published";
                    await post.save();

                    await ActivityLog.create({
                        user: post.user,
                        actionType: "POST_PUBLISHED",
                        description: `Published post to ${accounts.map((a) => a.platform).join(",")}`,
                        relatedPost: post._id,
                    })
                    
                } catch (err: any) {
                    // #region agent log
                    schedulerDebugLog("schedulerService.ts:publish:error", "publish failed", { postId: String(post._id), errorMessage: err?.response?.data?.message || err?.message }, "G,H");
                    // #endregion
                    console.error(`Failed to publish post ${post._id} :`, err?.response?.data || err?.message);
                    post.status = "failed";
                    await post.save()
                }
            }
            if (postsToPublish.length > 0) {
                console.log(`Evaluated ${postsToPublish.length} posts at ${now.toISOString()}`)
            }
        } catch (error) {
            console.error("Error in scheduler:", error)
        }
    })
    console.log("Scheduler service initialized.")
}