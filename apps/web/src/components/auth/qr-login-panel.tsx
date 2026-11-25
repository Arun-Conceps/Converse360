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
const QR_STEPS = [
  "Open Converse360 on your phone",
  "Go to More → Scan QR to sign in on web",
  "Point the camera at this code",
];

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
      let pollSecret: string;
      let expiresIn: number;
      try {
        const res = await fetch("/api/public/qr-login/start", {
          method: "POST",
        });
        if (!res.ok) throw new Error(String(res.status));
        ({ id, secret, pollSecret, expiresIn } = await res.json());
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
          // POST with a JSON body: the secret must not travel in a URL
          // (access logs, proxies, Referer). The rewrite is method-agnostic.
          const res = await fetch("/api/public/qr-login/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, secret: pollSecret }),
            cache: "no-store",
          });
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
        <div className="flex w-full flex-col gap-3">
          <h2 className="text-base font-semibold">Scan to log in</h2>
          <ol className="space-y-3">
            {QR_STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm">
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <details className="text-sm text-muted-foreground">
            <summary className="w-fit cursor-pointer font-medium text-foreground underline underline-offset-4">
              Need help?
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Update the Converse360 app to the latest version.</li>
              <li>Make sure you are signed in on your phone.</li>
              <li>The code refreshes after a short time. Press “Show a new QR code” if it expires.</li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
