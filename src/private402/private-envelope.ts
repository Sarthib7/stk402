import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";

import type { Network, PaymentRequirements } from "@x402/core/types";

export const PRIVATE_ENVELOPE_SCHEME = "exact-private-envelope-v1";
export const CLIENT_KEY_HEADER = "stk402-client-key";

const TERMS_INFO = "stk402/payment-terms/v1";
const RECEIPT_INFO = "stk402/payment-receipt/v1";
const MAX_KEY_HEADER_LENGTH = 256;

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

export interface ClientEnvelopeKey {
  publicKeyHeader: string;
  publicKey: KeyObject;
  privateKey: KeyObject;
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: unknown, expectedBytes?: number): Buffer {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error("invalid payment envelope");
  }
  const decoded = Buffer.from(value, "base64url");
  if (encode(decoded) !== value || (expectedBytes && decoded.length !== expectedBytes)) {
    throw new Error("invalid payment envelope");
  }
  return decoded;
}

function publicDer(key: KeyObject): Buffer {
  return key.export({ type: "spki", format: "der" }) as Buffer;
}

function assertX25519(key: KeyObject): KeyObject {
  if (key.asymmetricKeyType !== "x25519") {
    throw new Error("envelope key must use X25519");
  }
  return key;
}

export function generateClientEnvelopeKey(): ClientEnvelopeKey {
  const pair = generateKeyPairSync("x25519");
  return {
    publicKeyHeader: encode(publicDer(pair.publicKey)),
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
  };
}

export function generateServerEnvelopeKey(): {
  publicKey: KeyObject;
  privateKey: KeyObject;
  publicKeyValue: string;
  privateKeyValue: string;
} {
  const pair = generateKeyPairSync("x25519");
  return {
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    publicKeyValue: encode(publicDer(pair.publicKey)),
    privateKeyValue: encode(
      pair.privateKey.export({ type: "pkcs8", format: "der" }) as Buffer,
    ),
  };
}

export function parseEnvelopePublicKey(value: string): KeyObject {
  if (value.length > MAX_KEY_HEADER_LENGTH) {
    throw new Error("invalid envelope public key");
  }
  try {
    const key = assertX25519(
      createPublicKey({ key: decode(value), type: "spki", format: "der" }),
    );
    const probe = generateKeyPairSync("x25519");
    diffieHellman({ privateKey: probe.privateKey, publicKey: key });
    return key;
  } catch (error) {
    throw new Error("invalid envelope public key", { cause: error });
  }
}

export function parseEnvelopePrivateKey(value: string): KeyObject {
  if (value.length > MAX_KEY_HEADER_LENGTH) {
    throw new Error("invalid envelope private key");
  }
  try {
    return assertX25519(
      createPrivateKey({ key: decode(value), type: "pkcs8", format: "der" }),
    );
  } catch (error) {
    throw new Error("invalid envelope private key", { cause: error });
  }
}

export function envelopeKeyId(publicKey: KeyObject): string {
  return createHash("sha256").update(publicDer(publicKey)).digest("base64url");
}

function aad(context: EnvelopeContext): Buffer {
  return Buffer.from(
    JSON.stringify({
      invoiceId: context.invoiceId,
      resourceUrl: context.resourceUrl,
      network: context.network,
      asset: context.asset,
      maxTimeoutSeconds: context.maxTimeoutSeconds,
      expiresAt: context.expiresAt,
      clientPublicKey: context.clientPublicKey,
    }),
    "utf8",
  );
}

function deriveKey(
  privateKey: KeyObject,
  publicKey: KeyObject,
  salt: Buffer,
  info: string,
): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      diffieHellman({ privateKey, publicKey }),
      salt,
      Buffer.from(info, "utf8"),
      32,
    ),
  );
}

function seal(
  value: unknown,
  context: EnvelopeContext,
  privateKey: KeyObject,
  publicKey: KeyObject,
  serverPublicKey: KeyObject,
  info: string,
  random: typeof randomBytes = randomBytes,
): SealedValue {
  const salt = random(32);
  const nonce = random(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveKey(privateKey, publicKey, salt, info),
    nonce,
  );
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    keyId: envelopeKeyId(serverPublicKey),
    salt: encode(salt),
    nonce: encode(nonce),
    ciphertext: encode(ciphertext),
    tag: encode(cipher.getAuthTag()),
  };
}

function open(
  sealed: SealedValue,
  context: EnvelopeContext,
  privateKey: KeyObject,
  publicKey: KeyObject,
  serverPublicKey: KeyObject,
  info: string,
): unknown {
  if (!sealed || typeof sealed !== "object" || sealed.version !== 1) {
    throw new Error("invalid payment envelope");
  }
  if (sealed.keyId !== envelopeKeyId(serverPublicKey)) {
    throw new Error("unsupported envelope key");
  }
  try {
    const salt = decode(sealed.salt, 32);
    const nonce = decode(sealed.nonce, 12);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(privateKey, publicKey, salt, info),
      nonce,
    );
    decipher.setAAD(aad(context));
    decipher.setAuthTag(decode(sealed.tag, 16));
    const plaintext = Buffer.concat([
      decipher.update(decode(sealed.ciphertext)),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error("payment envelope authentication failed", { cause: error });
  }
}

export function sealPaymentTerms(
  requirements: PaymentRequirements,
  context: EnvelopeContext,
  serverPrivateKey: KeyObject,
  clientPublicKey: KeyObject,
  serverPublicKey: KeyObject,
  random?: typeof randomBytes,
): SealedValue {
  return seal(
    requirements,
    context,
    serverPrivateKey,
    clientPublicKey,
    serverPublicKey,
    TERMS_INFO,
    random,
  );
}

export function openPaymentTerms(
  sealed: SealedValue,
  context: EnvelopeContext,
  clientPrivateKey: KeyObject,
  serverPublicKey: KeyObject,
): PaymentRequirements {
  return open(
    sealed,
    context,
    clientPrivateKey,
    serverPublicKey,
    serverPublicKey,
    TERMS_INFO,
  ) as PaymentRequirements;
}

export function sealReceipt(
  receipt: unknown,
  context: Omit<EnvelopeContext, "clientPublicKey">,
  serverPublicKey: KeyObject,
): SealedReceipt {
  const client = generateClientEnvelopeKey();
  const clientPublicKey = parseEnvelopePublicKey(client.publicKeyHeader);
  const fullContext = { ...context, clientPublicKey: client.publicKeyHeader };
  return {
    ...seal(
      receipt,
      fullContext,
      client.privateKey,
      serverPublicKey,
      serverPublicKey,
      RECEIPT_INFO,
    ),
    clientPublicKey: client.publicKeyHeader,
  };
}

export function openReceipt(
  sealed: SealedReceipt,
  context: Omit<EnvelopeContext, "clientPublicKey">,
  serverPrivateKey: KeyObject,
  serverPublicKey: KeyObject,
): unknown {
  const clientPublicKey = parseEnvelopePublicKey(sealed.clientPublicKey);
  return open(
    sealed,
    { ...context, clientPublicKey: sealed.clientPublicKey },
    serverPrivateKey,
    clientPublicKey,
    serverPublicKey,
    RECEIPT_INFO,
  );
}
