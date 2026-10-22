import crypto from "crypto";

/**
 * Paytm Standard Checksum Utility
 * Implements HMAC-SHA256 signature generation and verification
 * adhering to official Paytm Payment Gateway specifications.
 */
export class PaytmChecksum {
  /**
   * Generates a standard SHA256 HMAC signature for a parameter string or dictionary.
   */
  public static generateSignature(
    params: Record<string, any> | string,
    key: string
  ): string {
    if (!key || typeof key !== "string") {
      throw new Error("Merchant key must be a non-empty string.");
    }
    const payload = typeof params === "string" ? params : this.getStringByParams(params);
    return crypto.createHmac("sha256", key).update(payload).digest("base64");
  }

  /**
   * Verifies an incoming SHA256 HMAC signature against a parameter string or dictionary.
   */
  public static verifySignature(
    params: Record<string, any> | string,
    key: string,
    checksum: string
  ): boolean {
    if (!checksum || !key) return false;
    try {
      const generated = this.generateSignature(params, key);
      const generatedBuf = Buffer.from(generated, "base64");
      const checksumBuf = Buffer.from(checksum, "base64");
      if (generatedBuf.length !== checksumBuf.length) {
        return false;
      }
      return crypto.timingSafeEqual(generatedBuf, checksumBuf);
    } catch {
      return false;
    }
  }

  /**
   * Formats a parameter dictionary into a deterministic pipe-separated string
   * sorted lexicographically by key, excluding checksum/signature fields.
   */
  public static getStringByParams(params: Record<string, any>): string {
    const sortedKeys = Object.keys(params)
      .filter((k) => k !== "CHECKSUMHASH" && k !== "checksum" && k !== "signature" && params[k] !== undefined && params[k] !== null)
      .sort();

    return sortedKeys
      .map((k) => {
        const val = params[k];
        return typeof val === "object" ? JSON.stringify(val) : String(val);
      })
      .join("|");
  }
}
