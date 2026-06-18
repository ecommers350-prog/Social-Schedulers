import { Request, Response } from "express";
import { User } from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import { appendFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const DEBUG_LOG_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../debug-177ed6.log");
const debugLog = (location: string, message: string, data: object, hypothesisId: string) => {
    try { appendFileSync(DEBUG_LOG_PATH, JSON.stringify({ sessionId: "177ed6", location, message, data, timestamp: Date.now(), hypothesisId }) + "\n"); } catch {}
};

const generateToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || "fallback_secret", { expiresIn: "30d" });
};

// Register user
// POST /api/auth/register
export const registerUser = async ( req: Request, res: Response ): Promise<void> => {
    try {
        const { name, email, password } = req.body;
        debugLog("authController:register:start", "Register request received", { hasEmail: !!email, hasName: !!name }, "B");
        const userExists = await User.findOne({ email });
        if (userExists) {
            debugLog("authController:register:exists", "User already exists", { email }, "B");
            res.status(400).json({ message: "User already exists" });
            return;
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({ name, email, password: hashedPassword});

        if (user) {
            debugLog("authController:register:success", "User registered", { userId: user._id.toString() }, "B");
            res.status(201).json({ _id: user._id, name: user.name, email: user.email, token: generateToken(user._id.toString()) });
        } else {
            res.status(400).json({ message: "Invalid user data" });
        }
    } catch (error: any) {
        debugLog("authController:register:error", "Register failed", { message: error?.message }, "B");
        res.status(500).json({ message: error?.message || "Server Error" });
    }
};

// Login user
// POST /api/auth/login
export const loginUser = async ( req: Request, res: Response ): Promise<void> => {
    try {
        const {  email, password } = req.body;
        debugLog("authController:login:start", "Login request received", { hasEmail: !!email }, "B");

        const user = await User.findOne({ email });

        if (user && (await bcrypt.compare(password, user.password))) {
            debugLog("authController:login:success", "Login successful", { userId: user._id.toString() }, "B");
            res.json({ _id: user._id, name: user.name, email: user.email, token: generateToken(user._id.toString()) })
        }else {
            debugLog("authController:login:invalid", "Invalid credentials", { userFound: !!user }, "B");
            res.status(401).json({ message: "Invalid email or password" })
        }
        
    } catch (error: any) {
        debugLog("authController:login:error", "Login failed", { message: error?.message }, "B");
        res.status(500).json({ message: error?.message || "Server Error" });
    }
};