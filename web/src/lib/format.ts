export function shortAddress(value: string): string {
  if (value.length < 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function chainLabel(chainId: string): string {
  if (chainId.includes("SN_MAIN") || chainId.endsWith("534e5f4d41494e")) {
    return "Mainnet";
  }
  if (chainId.includes("SN_SEPOLIA") || chainId.includes("SEPOLIA")) {
    return "Sepolia";
  }
  return chainId;
}

/** Ready / Xverse (and similar) in-app browsers inject a wallet provider. */
export function detectWalletBrowser(): string | null {
  if (typeof window === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("ready") || ua.includes("argent")) return "Ready";
  if (ua.includes("xverse")) return "Xverse";
  return null;
}
