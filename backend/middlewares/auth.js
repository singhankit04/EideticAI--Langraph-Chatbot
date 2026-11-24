import "dotenv/config";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

function getJwtSecret() {
  return process.env.JWT_SECRET || "fallback-insecure-secret-key-change-me";
}

export async function requireAuth(req, res, next) {
  try {
    let token = null;

    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query?.token) {
      token = String(req.query.token).trim();
    }

    if (!token) {
      return res.status(401).json({
        error: "Unauthorized: Authentication token is required.",
      });
    }

    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);

    if (!decoded?.userId) {
      return res.status(401).json({
        error: "Unauthorized: Invalid token payload.",
      });
    }

    const user = await User.findById(decoded.userId).select("-password").lean();
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized: User account no longer exists.",
      });
    }

    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Auth Middleware] requireAuth token error:", err.message);
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Unauthorized: Token expired. Please sign in again.",
      });
    }
    return res.status(401).json({
      error: "Unauthorized: Invalid token.",
    });
  }
}

export async function optionalAuth(req, res, next) {
  let token = null;

  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query?.token) {
    token = String(req.query.token).trim();
  }

  // 1. True guest: no token was sent at all -> proceed without authentication
  if (!token) {
    return next();
  }

  // 2. Token was explicitly provided -> must be strictly validated
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);

    if (!decoded?.userId) {
      return res.status(401).json({
        error: "Unauthorized: Invalid token payload.",
      });
    }

    const user = await User.findById(decoded.userId).select("-password").lean();
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized: User account no longer exists.",
      });
    }

    req.user = user;
    req.userId = user._id.toString();
    return next();
  } catch (err) {
    // 3. Token was provided but is expired or corrupted -> reject with 401
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Auth Middleware] optionalAuth token error:", err.message);
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Unauthorized: Token expired. Please sign in again.",
      });
    }
    return res.status(401).json({
      error: "Unauthorized: Invalid token.",
    });
  }
}

export default requireAuth;
