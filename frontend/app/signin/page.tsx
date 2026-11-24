"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Starfield from "./Starfield";

export default function SignInPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to sign in.");
      }

      login(data.token, data.user);
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid email or password.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen w-full bg-[#000000] text-white flex items-center justify-center p-4 selection:bg-white/20 selection:text-white">
      {/* Interactive Cinematic Starfield Background */}
      <Starfield />

      {/* Centered Glassmorphic Login Card */}
      <div className="relative z-10 w-full max-w-[360px] rounded-[22px] px-6 py-7 sm:px-7 sm:py-8 transition-all duration-300 backdrop-blur-xl bg-black/45 bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.14] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.2),inset_0_0_20px_rgba(255,255,255,0.02)]">
        {/* Header */}
        <header className="text-center mb-6">
          <h1 className="text-[22px] sm:text-[24px] font-semibold tracking-tight text-white">
            Welcome back
          </h1>
          <p className="text-xs text-[#9c9c9c] mt-1 font-normal tracking-normal">
            Sign in to continue
          </p>
        </header>

        {/* Error Feedback Banner */}
        {errorMessage && (
          <div className="mb-4 flex items-start gap-2 p-2.5 rounded-[12px] bg-red-500/10 border border-red-500/25 text-red-400 text-xs leading-snug">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-400" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Field */}
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-[#b3b3b3] mb-1.5"
            >
              Email
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-[#6c6c6c] pointer-events-none flex items-center">
                <Mail size={16} strokeWidth={1.75} />
              </span>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 bg-white/[0.04] text-white placeholder:text-[#525252] text-xs sm:text-sm rounded-[12px] border border-white/[0.08] focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/20 transition-all duration-150"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-[#b3b3b3] mb-1.5"
            >
              Password
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-[#6c6c6c] pointer-events-none flex items-center">
                <Lock size={16} strokeWidth={1.75} />
              </span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full pl-10 pr-10 py-2.5 bg-white/[0.04] text-white placeholder:text-[#525252] text-xs sm:text-sm rounded-[12px] border border-white/[0.08] focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/20 transition-all duration-150"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 text-[#6c6c6c] hover:text-white transition-colors duration-150 p-0.5 focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff size={16} strokeWidth={1.75} />
                ) : (
                  <Eye size={16} strokeWidth={1.75} />
                )}
              </button>
            </div>
          </div>

          {/* Primary Sign In Button */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-full text-sm font-medium text-white transition-all duration-200 cursor-pointer active:scale-[0.985] disabled:opacity-70 flex items-center justify-center bg-gradient-to-b from-white/[0.16] to-white/[0.05] hover:from-white/[0.22] hover:to-white/[0.08] border border-white/[0.16] hover:border-white/25 shadow-[0_4px_14px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.2)]"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-2.5 my-5">
          <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-white/[0.08]" />
          <span className="text-[11px] text-[#717171] font-normal tracking-wide whitespace-nowrap">
            or continue with
          </span>
          <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-white/[0.08] to-white/[0.08]" />
        </div>

        {/* Social Login Buttons */}
        <div className="grid grid-cols-1 gap-2.5">
          {/* Google OAuth Button */}
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-2.5 py-2.5 px-3 rounded-full text-xs font-medium text-white bg-white/[0.05] hover:bg-white/[0.09] active:bg-white/[0.03] border border-white/[0.12] hover:border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-150 cursor-pointer active:scale-[0.98]"
          >
            <svg
              width="15"
              height="15"
              className="w-3.5 h-3.5 shrink-0"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Continue with Google</span>
          </a>
        </div>

        {/* Bottom Navigation */}
        <div className="mt-5 text-center">
          <p className="text-xs text-[#828282]">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-white hover:underline transition-colors font-medium ml-1"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
