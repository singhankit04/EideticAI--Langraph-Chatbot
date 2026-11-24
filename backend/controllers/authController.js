import "dotenv/config";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

function getJwtSecret() {
  return process.env.JWT_SECRET || "fallback-insecure-secret-key-change-me";
}

// Generate signed JWT token
export function generateToken(userId, email) {
  const secret = getJwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign({ userId, email }, secret, {
    expiresIn,
  });
}

// User Registration (Local Email + Password)
export async function signupHandler(req, res) {
  try {
    const { fullName, email, password } = req.body || {};

    if (!fullName || !String(fullName).trim()) {
      return res.status(400).json({ error: "Full name is required." });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: "Email address is required." });
    }
    if (!password || String(password).length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters long." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "An account with this email already exists." });
    }

    // Hash password with salt rounds = 12
    const hashedPassword = await bcrypt.hash(String(password), 12);

    const newUser = await User.create({
      fullName: String(fullName).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      authProvider: "local",
    });

    const token = generateToken(newUser._id.toString(), newUser.email);

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user: {
        id: newUser._id.toString(),
        fullName: newUser.fullName,
        email: newUser.email,
        avatar: newUser.avatar,
        authProvider: newUser.authProvider,
        createdAt: newUser.createdAt,
      },
    });
  } catch (err) {
    console.error("[Auth Signup Error]:", err);
    return res.status(500).json({
      error: "Internal server error during registration.",
    });
  }
}

// User Sign In / Login (Local Email + Password)
export async function signinHandler(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Include password field explicitly since select: false on schema
    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (!user.password && user.authProvider === "google") {
      return res.status(400).json({
        error: "This account was created with Google OAuth. Please sign in with Google.",
      });
    }

    const isMatch = await bcrypt.compare(String(password), user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = generateToken(user._id.toString(), user.email);

    return res.json({
      message: "Signed in successfully.",
      token,
      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar,
        authProvider: user.authProvider,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("[Auth Signin Error]:", err);
    return res.status(500).json({
      error: "Internal server error during sign in.",
    });
  }
}

// Get Current User Profile (Protected via requireAuth)
export async function getMeHandler(req, res) {
  try {
    return res.json({
      user: {
        id: req.user._id?.toString() || req.userId,
        fullName: req.user.fullName,
        email: req.user.email,
        avatar: req.user.avatar,
        authProvider: req.user.authProvider,
        createdAt: req.user.createdAt,
      },
    });
  } catch (err) {
    console.error("[Auth GetMe Error]:", err);
    return res.status(500).json({
      error: "Internal server error fetching profile.",
    });
  }
}

// -------------------------------------------------------------
// Google OAuth 2.0 Handlers
// -------------------------------------------------------------

// Redirect user to Google's OAuth consent screen
export function googleAuthRedirectHandler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri =
    process.env.GOOGLE_CALLBACK_URL ||
    `${req.protocol}://${req.get("host")}/api/auth/google/callback`;

  if (!clientId) {
    return res.status(500).json({
      error: "Google OAuth is not configured on this server (missing GOOGLE_CLIENT_ID).",
    });
  }

  const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });

  return res.redirect(`${rootUrl}?${params.toString()}`);
}

// Handle callback from Google with authorization code
export async function googleAuthCallbackHandler(req, res) {
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
  const { code, error } = req.query;

  if (error || !code) {
    console.warn("[Google OAuth Callback] Cancelled or error:", error);
    return res.redirect(`${frontendUrl}/signin?error=${encodeURIComponent(error || "oauth_cancelled")}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_CALLBACK_URL ||
    `${req.protocol}://${req.get("host")}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    console.error("[Google OAuth Callback] Missing client credentials.");
    return res.redirect(`${frontendUrl}/signin?error=oauth_config_missing`);
  }

  try {
    // 1. Exchange authorization code for Google access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("[Google OAuth Callback] Token exchange failed:", tokenData);
      return res.redirect(`${frontendUrl}/signin?error=token_exchange_failed`);
    }

    // 2. Fetch user profile from Google using access token
    const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const googleProfile = await userinfoResponse.json();
    if (!userinfoResponse.ok || !googleProfile.email) {
      console.error("[Google OAuth Callback] Failed to fetch Google user info:", googleProfile);
      return res.redirect(`${frontendUrl}/signin?error=profile_fetch_failed`);
    }

    const normalizedEmail = googleProfile.email.toLowerCase().trim();

    // 3. Find or create user in MongoDB
    let user = await User.findOne({
      $or: [{ googleId: googleProfile.sub }, { email: normalizedEmail }],
    });

    if (user) {
      // Link googleId or update avatar if missing
      if (!user.googleId) user.googleId = googleProfile.sub;
      if (!user.avatar && googleProfile.picture) user.avatar = googleProfile.picture;
      await user.save();
    } else {
      user = await User.create({
        fullName: googleProfile.name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        avatar: googleProfile.picture || "",
        googleId: googleProfile.sub,
        authProvider: "google",
      });
    }

    // 4. Issue application JWT session token
    const sessionToken = generateToken(user._id.toString(), user.email);

    // 5. Redirect back to frontend auth callback route with token
    return res.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(sessionToken)}`);
  } catch (err) {
    console.error("[Google OAuth Callback Error]:", err);
    return res.redirect(`${frontendUrl}/signin?error=oauth_internal_error`);
  }
}

export default {
  signupHandler,
  signinHandler,
  getMeHandler,
  googleAuthRedirectHandler,
  googleAuthCallbackHandler,
};
