"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Eye, EyeOff, Check, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Starfield from "../signin/Starfield";

export default function SignUpPage() {
  const router = useRouter();
  const { signup } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Password strength calculation (Weak, Medium, Strong)
  const passwordStrength = useMemo(() => {
    if (!password) return { level: 0, label: "" };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { level: 1, label: "Weak" };
    if (score <= 3) return { level: 2, label: "Medium" };
    return { level: 3, label: "Strong" };
  }, [password]);

  // Client-side validations
  const errors = useMemo(() => {
    const errs: { [key: string]: string } = {};

    if (touched.fullName && !fullName.trim()) {
      errs.fullName = "Full name is required";
    } else if (touched.fullName && fullName.trim().length < 2) {
      errs.fullName = "Name must be at least 2 characters";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (touched.email && !email.trim()) {
      errs.email = "Email address is required";
    } else if (touched.email && !emailRegex.test(email.trim())) {
      errs.email = "Enter a valid email address";
    }

    if (touched.password && !password) {
      errs.password = "Password is required";
    } else if (touched.password && password.length < 6) {
      errs.password = "Password must be at least 6 characters";
    }

    return errs;
  }, [fullName, email, password, touched]);

  // Overall form validity check
  const isFormValid =
    fullName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    password.length >= 6 &&
    agreedToTerms;

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      fullName: true,
      email: true,
      password: true,
    });
    setServerError(null);

    if (!isFormValid) return;

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Registration failed. Please try again.");
      }

      signup(data.token, data.user);
      setIsSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed. Please try again.";
      setServerError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen w-full bg-[#000000] text-white flex items-center justify-center p-4 sm:p-6 selection:bg-white/20 selection:text-white">
      {/* Interactive Cinematic Starfield Background */}
      <Starfield />

      {/* Centered Glassmorphic Signup Card */}
      <div className="relative z-10 w-full max-w-[360px] rounded-[22px] px-6 py-7 sm:px-7 sm:py-8 transition-all duration-300 backdrop-blur-xl bg-black/45 bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.14] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.2),inset_0_0_20px_rgba(255,255,255,0.02)]">
        {/* Header */}
        <header className="text-center mb-6">
          <h1 className="text-[22px] sm:text-[24px] font-semibold tracking-tight text-white">
            Create your account
          </h1>
          <p className="text-xs text-[#9c9c9c] mt-1 font-normal tracking-normal">
            Get started with your account
          </p>
        </header>

        {/* Success State */}
        {isSuccess ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white">
              <Check size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-lg font-medium text-white">Account Created!</h2>
              <p className="text-xs text-[#9c9c9c] mt-1">
                Welcome to EideticAI. You can now sign in to access your intelligent workspace.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/signin"
                className="inline-block w-full py-2.5 px-4 rounded-full text-sm font-medium text-white transition-all duration-200 cursor-pointer text-center bg-gradient-to-b from-white/[0.16] to-white/[0.05] hover:from-white/[0.22] hover:to-white/[0.08] border border-white/[0.16] hover:border-white/25 shadow-[0_4px_14px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.2)]"
              >
                Continue to Sign In
              </Link>
            </div>
          </div>
        ) : (
          /* Signup Form */
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {serverError && (
              <div className="p-2.5 rounded-[10px] bg-red-500/10 border border-red-500/20 text-xs text-red-300 text-center">
                {serverError}
              </div>
            )}

            {/* 1. Full Name Field */}
            <div>
              <label
                htmlFor="fullName"
                className="block text-xs font-medium text-[#b3b3b3] mb-1.5"
              >
                Full Name
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-[#6c6c6c] pointer-events-none flex items-center">
                  <User size={16} strokeWidth={1.75} />
                </span>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => handleBlur("fullName")}
                  placeholder="Enter your full name"
                  className={`w-full pl-10 pr-3.5 py-2.5 bg-white/[0.04] text-white placeholder:text-[#525252] text-xs sm:text-sm rounded-[12px] border transition-all duration-150 focus:outline-none ${
                    errors.fullName
                      ? "border-red-400/40 focus:border-red-400/60 focus:ring-1 focus:ring-red-400/20"
                      : "border-white/[0.08] focus:border-white/25 focus:ring-1 focus:ring-white/20"
                  }`}
                />
              </div>
              {errors.fullName && (
                <p className="text-[11px] text-red-400/90 mt-1 pl-1">
                  {errors.fullName}
                </p>
              )}
            </div>

            {/* 2. Email Address Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-[#b3b3b3] mb-1.5"
              >
                Email Address
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
                  onBlur={() => handleBlur("email")}
                  placeholder="Enter your email"
                  className={`w-full pl-10 pr-3.5 py-2.5 bg-white/[0.04] text-white placeholder:text-[#525252] text-xs sm:text-sm rounded-[12px] border transition-all duration-150 focus:outline-none ${
                    errors.email
                      ? "border-red-400/40 focus:border-red-400/60 focus:ring-1 focus:ring-red-400/20"
                      : "border-white/[0.08] focus:border-white/25 focus:ring-1 focus:ring-white/20"
                  }`}
                />
              </div>
              {errors.email && (
                <p className="text-[11px] text-red-400/90 mt-1 pl-1">
                  {errors.email}
                </p>
              )}
            </div>

            {/* 3. Password Field */}
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
                  onBlur={() => handleBlur("password")}
                  placeholder="Create a password"
                  className={`w-full pl-10 pr-10 py-2.5 bg-white/[0.04] text-white placeholder:text-[#525252] text-xs sm:text-sm rounded-[12px] border transition-all duration-150 focus:outline-none ${
                    errors.password
                      ? "border-red-400/40 focus:border-red-400/60 focus:ring-1 focus:ring-red-400/20"
                      : "border-white/[0.08] focus:border-white/25 focus:ring-1 focus:ring-white/20"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 text-[#6c6c6c] hover:text-white transition-colors duration-150 p-0.5 focus:outline-none cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff size={16} strokeWidth={1.75} />
                  ) : (
                    <Eye size={16} strokeWidth={1.75} />
                  )}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {password && (
                <div className="mt-2 space-y-1">
                  <div className="grid grid-cols-3 gap-1.5 h-1">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength.level >= 1 ? "bg-white/50" : "bg-white/10"
                      }`}
                    />
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength.level >= 2 ? "bg-white/75" : "bg-white/10"
                      }`}
                    />
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength.level >= 3 ? "bg-white" : "bg-white/10"
                      }`}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-[#8e8e8e]">
                    <span>Password strength</span>
                    <span className="font-medium text-white/80">
                      {passwordStrength.label}
                    </span>
                  </div>
                </div>
              )}

              {errors.password && (
                <p className="text-[11px] text-red-400/90 mt-1 pl-1">
                  {errors.password}
                </p>
              )}
            </div>

            {/* Terms and Conditions Checkbox */}
            <div className="flex items-start gap-2.5 pt-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={agreedToTerms}
                onClick={() => setAgreedToTerms(!agreedToTerms)}
                className={`mt-0.5 shrink-0 w-4 h-4 rounded-[4px] border transition-all duration-150 flex items-center justify-center cursor-pointer ${
                  agreedToTerms
                    ? "bg-white/20 border-white/50 text-white"
                    : "bg-white/[0.04] border-white/20 hover:border-white/40"
                }`}
              >
                {agreedToTerms && <Check size={12} strokeWidth={2.5} />}
              </button>
              <span
                onClick={() => setAgreedToTerms(!agreedToTerms)}
                className="text-[11px] text-[#8e8e8e] leading-snug cursor-pointer select-none"
              >
                I agree to the{" "}
                <a
                  href="#"
                  onClick={(e) => e.stopPropagation()}
                  className="text-neutral-300 hover:text-white underline underline-offset-2 transition-colors"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="#"
                  onClick={(e) => e.stopPropagation()}
                  className="text-neutral-300 hover:text-white underline underline-offset-2 transition-colors"
                >
                  Privacy Policy
                </a>
              </span>
            </div>

            {/* Primary Signup Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading || !isFormValid}
                className="w-full py-2.5 px-4 rounded-full text-sm font-medium text-white transition-all duration-200 cursor-pointer active:scale-[0.985] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-gradient-to-b from-white/[0.16] to-white/[0.05] hover:not-disabled:from-white/[0.22] hover:not-disabled:to-white/[0.08] border border-white/[0.16] hover:not-disabled:border-white/25 shadow-[0_4px_14px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.2)]"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-white/80" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  "Create Account"
                )}
              </button>
            </div>
          </form>
        )}

        {/* Social Authentication */}
        {!isSuccess && (
          <>
            {/* Divider */}
            <div className="flex items-center gap-2.5 my-4">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-white/[0.08]" />
              <span className="text-[11px] text-[#717171] font-normal tracking-wide whitespace-nowrap">
                or sign up with
              </span>
              <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-white/[0.08] to-white/[0.08]" />
            </div>

            {/* Social Buttons */}
            <div className="grid grid-cols-1 gap-2.5">
              {/* Google Button */}
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
          </>
        )}

        {/* Bottom Navigation */}
        <div className="mt-5 text-center">
          <p className="text-xs text-[#828282]">
            Already have an account?{" "}
            <Link
              href="/signin"
              className="text-white hover:underline transition-colors font-medium ml-1"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
