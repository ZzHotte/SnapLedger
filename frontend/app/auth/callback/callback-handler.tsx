"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function CallbackHandler({ token }: { token: string | null }) {
  const { setToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    setToken(token).catch(() => {
      router.replace("/login");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return <p className="p-6 text-center text-sm text-gray-500">Signing you in…</p>;
}
