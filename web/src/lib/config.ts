/** Shared Consumer demo env + constants. */

export const DEFAULT_RESOURCE =
  import.meta.env.VITE_STK402_RESOURCE_URL?.trim() ||
  "http://127.0.0.1:8787/tools/sha256?text=stk402";

export function skillUrl(): string {
  const fromEnv = import.meta.env.VITE_STK402_SKILL_URL?.trim();
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/SKILL.md`;
  }
  return "/SKILL.md";
}

export const STEP_COPY: Record<string, string> = {
  request: "Reading invoice",
  envelope: "Opening encrypted terms",
  transfer: "Proving shielded transfer",
  receipt: "Signing receipt",
  settle: "Settling Paid Resource",
};

export type EnvelopeKeys = {
  serverPublicKey: string;
  clientPrivateKey: string;
  clientPublicKey: string;
};

export function loadEnvelopeKeys(): EnvelopeKeys | undefined {
  const serverPublicKey =
    import.meta.env.VITE_STK402_ENVELOPE_PUBLIC_KEY?.trim() || "";
  const clientPrivateKey =
    import.meta.env.VITE_STK402_CLIENT_ENVELOPE_PRIVATE_KEY?.trim() || "";
  const clientPublicKey =
    import.meta.env.VITE_STK402_CLIENT_ENVELOPE_PUBLIC_KEY?.trim() || "";
  if (!serverPublicKey && !clientPrivateKey && !clientPublicKey) {
    return undefined;
  }
  if (!serverPublicKey || !clientPrivateKey || !clientPublicKey) {
    throw new Error(
      "set all three VITE_STK402_* envelope keys, or leave all empty for plaintext exact-private",
    );
  }
  return { serverPublicKey, clientPrivateKey, clientPublicKey };
}
