"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "@/lib/vendor/qrcode-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Phase = "loading" | "ready" | "signing-in" | "expired" | "error";

interface Props {
  /** Where to go once the session exists (same seam as the password form). */
  destination: string;
  onError?: (message: string) => void;
}

/**
 * Sign in by scanning with the phone app. The QR carries `c360qr:<id>:<secret>`;
 * the secret is the credential, and it is only ever worth something once a
 * signed-in phone approves it. The token the poll finally returns is a
 * one-time Supabase magic-link hash, exchanged for this browser's OWN session.
 */
export function QrLoginPanel({ destination, onError }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [code, setCode] = useState<string | null>(null);
  // Bumped to request a fresh QR; effects key off it.
  const [attempt, setAttempt] = useState(0);
  const cancelled = useRef(false);

  const fail = useCallback(
    (message: string) => {
      setPhase("error");
      onError?.(message);
    },
    [onError],
  );

  useEffect(() => {
    cancelled.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function run() {
      setPhase("loading");
      setCode(null);
      let id: string;
      let secret: string;
      let expiresIn: number;
      try {
        const res = await fetch("/api/public/qr-login/start", {
          method: "POST",
        });
        if (!res.ok) throw new Error(String(res.status));
        ({ id, secret, expiresIn } = await res.json());
      } catch {
        if (!cancelled.current) fail("Could not create a QR code. Try again.");
        return;
      }
      if (cancelled.current) return;
      setCode(`c360qr:${id}:${secret}`);
      setPhase("ready");

      const deadline = Date.now() + expiresIn * 1000;
      const poll = async () => {
        if (cancelled.current) return;
        if (Date.now() > deadline) {
          setPhase("expired");
          return;
        }
        try {
          const res = await fetch(
            `/api/public/qr-login/status?id=${id}&secret=${secret}`,
            { cache: "no-store" },
          );
          if (res.ok) {
            const body = await res.json();
            if (body.status === "approved") {
              setPhase("signing-in");
              const { error } = await createClient().auth.verifyOtp({
                token_hash: body.tokenHash,
                type: "magiclink",
              });
              if (error) return fail(error.message);
              // Full load: the proxy and every account-keyed cache must see
              // the new session from scratch.
              window.location.assign(destination);
              return;
            }
            if (body.status === "expired") {
              setPhase("expired");
              return;
            }
          }
        } catch {
          // Transient: keep polling until the deadline.
        }
        timer = setTimeout(poll, 2000);
      };
      timer = setTimeout(poll, 2000);
    }

    void run();
    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [attempt, destination, fail]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex h-56 w-56 items-center justify-center rounded-xl border bg-white p-3">
        {code && phase === "ready" ? (
          <QRCodeSVG value={code} size={200} level="M" />
        ) : (
          <p className="px-4 text-center text-sm text-neutral-600">
            {phase === "loading" && "Creating QR code…"}
            {phase === "signing-in" && "Approved. Signing you in…"}
            {phase === "expired" && "This QR code expired."}
            {phase === "error" && "Something went wrong."}
          </p>
        )}
      </div>
      {phase === "expired" || phase === "error" ? (
        <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
          Show a new QR code
        </Button>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Open Converse360 on your phone</li>
          <li>Go to More → Scan QR to sign in on web</li>
          <li>Point the camera at this code</li>
        </ol>
      )}
    </div>
  );
}
