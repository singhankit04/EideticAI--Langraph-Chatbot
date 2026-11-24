"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    const oauthError = searchParams.get("error");

    if (oauthError) {
      setError(`Authentication failed: ${oauthError.replace(/_/g, " ")}`);
      return;
    }

    if (!token) {
      setError("No authentication token received from OAuth provider.");
      return;
    }

    // Fetch user profile using the issued token and initialize session
    async function completeOAuth() {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to verify user profile with server.");
        }

        const data = await res.json();
        login(token as string, data.user);
        router.replace("/");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Authentication verification failed.";
        setError(msg);
      }
    }

    completeOAuth();
  }, [searchParams, login, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-6 max-w-sm rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
          <AlertCircle size={24} />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">OAuth Error</h2>
        <p className="text-xs text-neutral-400 mb-6 leading-relaxed">{error}</p>
        <Link
          href="/signin"
          className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-neutral-200 transition-colors"
        >
          Return to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center p-8 max-w-sm rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
      <Loader2 size={32} className="animate-spin text-white mb-4 opacity-80" />
      <h2 className="text-base font-medium text-white mb-1">Authenticating...</h2>
      <p className="text-xs text-neutral-400">Verifying session credentials and logging you in.</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <main className="min-h-screen w-full bg-[#000000] text-white flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center">
            <Loader2 size={32} className="animate-spin text-white opacity-80" />
          </div>
        }
      >
        <CallbackHandler />
      </Suspense>
    </main>
  );
}
