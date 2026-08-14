/**
 * Browser-safe X25519 envelope matching `private-envelope.ts`.
 * SPKI/PKCS8 base64url headers stay wire-compatible with Node crypto.
 */
import { x25519 } from "@noble/curves/ed25519.js";
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { Network, PaymentRequirements } from "@x402/core/types";

export const PRIVATE_ENVELOPE_SCHEME = "exact-private-envelope-v1";
export const CLIENT_KEY_HEADER = "stk402-client-key";

const TERMS_INFO = "stk402/payment-terms/v1";
const RECEIPT_INFO = "stk402/payment-receipt/v1";
const MAX_KEY_HEADER_LENGTH = 256;

const SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
]);
const PKCS8_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e,
  0x04, 0x22, 0x04, 0x20,
]);

export interface SealedValue {
  version: 1;
  keyId: string;
  salt: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}

export interface SealedReceipt extends SealedValue {
  clientPublicKey: string;
}

export interface EnvelopeContext {
  invoiceId: string;
  resourceUrl: string;
  network: Network;
  asset: string;
  maxTimeoutSeconds: number;
  expiresAt: string;
  clientPublicKey: string;
}

export interface PortableClientEnvelopeKey {
  publicKeyHeader: string;
  privateKeyValue: string;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function encode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decode(value: unknown, expectedBytes?: number): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error("invalid payment envelope");
  }
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const decoded = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (encode(decoded) !== value || (expectedBytes && decoded.length !== expectedBytes)) {
    throw new Error("invalid payment envelope");
  }
  return decoded;
}

function randomBytes(size: number): Uint8Array {
  const out = new Uint8Array(size);
  crypto.getRandomValues(out);
  return out;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

function rawPublicFromSpki(spki: Uint8Array): Uint8Array {
  if (spki.length !== 44 || !equalBytes(spki.subarray(0, 12), SPKI_PREFIX)) {
    throw new Error("invalid envelope public key");
  }
  return spki.subarray(12);
}

function rawPrivateFromPkcs8(pkcs8: Uint8Array): Uint8Array {
  if (pkcs8.length !== 48 || !equalBytes(pkcs8.subarray(0, 16), PKCS8_PREFIX)) {
    throw new Error("invalid envelope private key");
  }
  return pkcs8.subarray(16);
}

function wrapPublic(raw: Uint8Array): Uint8Array {
  return concat([SPKI_PREFIX, raw]);
}

function wrapPrivate(raw: Uint8Array): Uint8Array {
  return concat([PKCS8_PREFIX, raw]);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function aad(context: EnvelopeContext): Uint8Array {
  return utf8(
    JSON.stringify({
      invoiceId: context.invoiceId,
      resourceUrl: context.resourceUrl,
      network: context.network,
      asset: context.asset,
      maxTimeoutSeconds: context.maxTimeoutSeconds,
      expiresAt: context.expiresAt,
      clientPublicKey: context.clientPublicKey,
    }),
  );
}

function deriveKey(
  privateRaw: Uint8Array,
  publicRaw: Uint8Array,
  salt: Uint8Array,
  info: string,
): Uint8Array {
  const shared = x25519.getSharedSecret(privateRaw, publicRaw);
  return hkdf(sha256, shared, salt, utf8(info), 32);
}

function seal(
  value: unknown,
  context: EnvelopeContext,
  privateRaw: Uint8Array,
  publicRaw: Uint8Array,
  serverSpki: Uint8Array,
  info: string,
): SealedValue {
  const salt = randomBytes(32);
  const nonce = randomBytes(12);
  const key = deriveKey(privateRaw, publicRaw, salt, info);
  const plaintext = utf8(JSON.stringify(value));
  const sealed = gcm(key, nonce, aad(context)).encrypt(plaintext);
  return {
    version: 1,
    keyId: envelopeKeyIdFromSpki(serverSpki),
    salt: encode(salt),
    nonce: encode(nonce),
    ciphertext: encode(sealed.subarray(0, sealed.length - 16)),
    tag: encode(sealed.subarray(sealed.length - 16)),
  };
}

function open(
  sealed: SealedValue,
  context: EnvelopeContext,
  privateRaw: Uint8Array,
  publicRaw: Uint8Array,
  serverSpki: Uint8Array,
  info: string,
): unknown {
  if (!sealed || typeof sealed !== "object" || sealed.version !== 1) {
    throw new Error("invalid payment envelope");
  }
  if (sealed.keyId !== envelopeKeyIdFromSpki(serverSpki)) {
    throw new Error("unsupported envelope key");
  }
  try {
    const salt = decode(sealed.salt, 32);
    const nonce = decode(sealed.nonce, 12);
    const ciphertext = decode(sealed.ciphertext);
    const tag = decode(sealed.tag, 16);
    const key = deriveKey(privateRaw, publicRaw, salt, info);
    const plaintext = gcm(key, nonce, aad(context)).decrypt(
      concat([ciphertext, tag]),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  } catch (error) {
    throw new Error("payment envelope authentication failed", { cause: error });
  }
}

export function envelopeKeyIdFromSpki(spki: Uint8Array): string {
  return encode(sha256(spki));
}

export function envelopeKeyIdFromHeader(publicKeyHeader: string): string {
  return envelopeKeyIdFromSpki(decode(publicKeyHeader));
}

export function generateClientEnvelopeKey(): PortableClientEnvelopeKey {
  const privateRaw = x25519.utils.randomSecretKey();
  const publicRaw = x25519.getPublicKey(privateRaw);
  return {
    publicKeyHeader: encode(wrapPublic(publicRaw)),
    privateKeyValue: encode(wrapPrivate(privateRaw)),
  };
}

export function assertEnvelopePublicKeyHeader(value: string): string {
  if (value.length > MAX_KEY_HEADER_LENGTH) {
    throw new Error("invalid envelope public key");
  }
  const spki = decode(value);
  const raw = rawPublicFromSpki(spki);
  // Reject weak/invalid points by probing ECDH with an ephemeral key.
  x25519.getSharedSecret(x25519.utils.randomSecretKey(), raw);
  return value;
}

export function parseEnvelopePrivateKeyValue(value: string): Uint8Array {
  if (value.length > MAX_KEY_HEADER_LENGTH) {
    throw new Error("invalid envelope private key");
  }
  return rawPrivateFromPkcs8(decode(value));
}

export function openPaymentTerms(
  sealed: SealedValue,
  context: EnvelopeContext,
  clientPrivateKeyValue: string,
  serverPublicKeyHeader: string,
): PaymentRequirements {
  const clientPrivate = parseEnvelopePrivateKeyValue(clientPrivateKeyValue);
  const serverSpki = decode(serverPublicKeyHeader);
  const serverPublic = rawPublicFromSpki(serverSpki);
  return open(
    sealed,
    context,
    clientPrivate,
    serverPublic,
    serverSpki,
    TERMS_INFO,
  ) as PaymentRequirements;
}

export function sealReceipt(
  receipt: unknown,
  context: Omit<EnvelopeContext, "clientPublicKey">,
  serverPublicKeyHeader: string,
): SealedReceipt {
  const ephemeral = generateClientEnvelopeKey();
  const clientPrivate = parseEnvelopePrivateKeyValue(ephemeral.privateKeyValue);
  const serverSpki = decode(serverPublicKeyHeader);
  const serverPublic = rawPublicFromSpki(serverSpki);
  const fullContext = {
    ...context,
    clientPublicKey: ephemeral.publicKeyHeader,
  };
  return {
    ...seal(
      receipt,
      fullContext,
      clientPrivate,
      serverPublic,
      serverSpki,
      RECEIPT_INFO,
    ),
    clientPublicKey: ephemeral.publicKeyHeader,
  };
}
