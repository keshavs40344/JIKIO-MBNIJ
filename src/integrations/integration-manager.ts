import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface IntegrationLogEntry {
  id: string;
  timestamp: Date;
  integrationId: string;
  category: "payment" | "shipping" | "notifications" | "catalog" | "analytics";
  level: "INFO" | "WARN" | "ERROR";
  action: string;
  message: string;
  details?: Record<string, any>;
}

export interface IntegrationAuditRecord {
  id: string;
  timestamp: Date;
  integrationId: string;
  action: "CONFIG_UPDATED" | "CREDENTIAL_REPLACED" | "ACTIVATED" | "DEACTIVATED" | "PROVIDER_SWITCHED" | "TEST_EXECUTED";
  adminUserId: string;
  changedFields: string[];
  previousNonSecretValues?: Record<string, any>;
  newNonSecretValues?: Record<string, any>;
  testStatus?: string;
  notes?: string;
}

export interface PaytmConfigSettings {
  merchantId: string;
  environment: "staging" | "production";
  website: string;
  channelId: string;
  industryTypeId: string;
  callbackUrl: string;
  webhookUrl: string;
  isActive: boolean;
}

export interface IntegrationMetadata {
  id: string;
  name: string;
  category: "payment" | "shipping" | "notifications" | "catalog" | "analytics";
  isIntegrated: boolean;
  isActive: boolean;
  environment?: "staging" | "production" | "sandbox";
  settings: Record<string, any>;
  hasCredentials: boolean;
  lastTestStatus?:
    | "NOT_CONFIGURED"
    | "FORMAT_VALID"
    | "CONFIGURED_AND_VALID"
    | "INVALID_CREDENTIALS"
    | "CONNECTION_FAILED"
    | "NOT_INTEGRATED";
  lastTestedAt?: Date | null;
  lastDiagnosticMessage?: string | null;
}

export class IntegrationManager {
  private static instance: IntegrationManager | null = null;
  private readonly storageFilePath: string;
  private readonly masterKey: Buffer;

  // Stored state
  private activePaymentProviderId: string = "paytm";
  private configs: Map<string, Record<string, any>> = new Map();
  private secrets: Map<string, Record<string, string>> = new Map();
  private auditHistory: IntegrationAuditRecord[] = [];
  private integrationLogs: IntegrationLogEntry[] = [];

  constructor(customStoragePath?: string) {
    this.storageFilePath =
      customStoragePath ||
      path.resolve(process.cwd(), "storage", "private", "integrations-config.enc.json");

    const rawSecret =
      process.env.INTEGRATIONS_MASTER_KEY ||
      process.env.MFA_ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      "icm-madhubani-secure-dev-master-key-32b";

    this.masterKey = crypto.scryptSync(rawSecret, "icm-madhubani-integrations-salt", 32);

    this.initDefaultConfigs();
    this.loadFromDisk();
  }

  public static getInstance(): IntegrationManager {
    if (!IntegrationManager.instance) {
      IntegrationManager.instance = new IntegrationManager();
    }
    return IntegrationManager.instance;
  }

  private initDefaultConfigs(): void {
    // 1. Paytm (Supported & Configurable)
    const envMid = process.env.PAYTM_MID || "";
    const envKey = process.env.PAYTM_MERCHANT_KEY || "";
    const envEnv = (process.env.PAYTM_ENVIRONMENT === "production" ? "production" : "staging") as "staging" | "production";

    this.configs.set("paytm", {
      merchantId: envMid,
      environment: envEnv,
      website: process.env.PAYTM_WEBSITE || (envEnv === "production" ? "DEFAULT" : "WEBSTAGING"),
      channelId: process.env.PAYTM_CHANNEL_ID || "WEB",
      industryTypeId: process.env.PAYTM_INDUSTRY_TYPE_ID || "Retail",
      callbackUrl: process.env.PAYTM_CALLBACK_URL || "/api/v1/payments/paytm/callback",
      webhookUrl: process.env.PAYTM_WEBHOOK_URL || "/api/v1/payments/paytm/webhook",
      isActive: true,
      lastTestStatus: envMid && envKey ? "CONFIGURED_AND_VALID" : "NOT_CONFIGURED",
      lastDiagnosticMessage: envMid && envKey ? "Credentials populated from environment" : "Paytm credentials not configured",
      lastTestedAt: null,
    });

    if (envKey) {
      this.secrets.set("paytm", { merchantKey: envKey });
    }

    // 2. Razorpay (Planned - Not Integrated)
    this.configs.set("razorpay", {
      keyId: "",
      environment: "sandbox",
      webhookUrl: "/api/v1/payments/razorpay/webhook",
      isActive: false,
      lastTestStatus: "NOT_INTEGRATED",
      lastDiagnosticMessage: "Adapter not implemented. Provider is planned for future phases.",
    });

    // 3. Stripe (Planned - Not Integrated)
    this.configs.set("stripe", {
      publishableKey: "",
      environment: "sandbox",
      webhookUrl: "/api/v1/payments/stripe/webhook",
      isActive: false,
      lastTestStatus: "NOT_INTEGRATED",
      lastDiagnosticMessage: "Adapter not implemented. Provider is planned for future phases.",
    });

    // 4. Logistics (Shiprocket - Planned)
    this.configs.set("shiprocket", {
      apiUser: "",
      environment: "sandbox",
      isActive: false,
      lastTestStatus: "NOT_INTEGRATED",
      lastDiagnosticMessage: "Courier API integration is planned for future release.",
    });

    // 5. Notifications (Resend - Planned)
    this.configs.set("resend", {
      fromEmail: "orders@icm-madhubani.in",
      isActive: false,
      lastTestStatus: "NOT_INTEGRATED",
      lastDiagnosticMessage: "Transactional email provider adapter not enabled.",
    });
  }

  // --------------------------------------------------------------------------
  // ENCRYPTION AT REST & DURABLE PERSISTENCE
  // --------------------------------------------------------------------------
  private encrypt(plainText: string): { iv: string; authTag: string; data: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.masterKey, iv);
    let encrypted = cipher.update(plainText, "utf8", "base64");
    encrypted += cipher.final("base64");
    const authTag = cipher.getAuthTag().toString("base64");
    return {
      iv: iv.toString("base64"),
      authTag,
      data: encrypted,
    };
  }

  private decrypt(payload: { iv: string; authTag: string; data: string }): string {
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.masterKey, Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
    let decrypted = decipher.update(payload.data, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  public saveToDisk(): void {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const secretsPlain = JSON.stringify(Object.fromEntries(this.secrets.entries()));
      const encryptedSecrets = this.encrypt(secretsPlain);

      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        activePaymentProviderId: this.activePaymentProviderId,
        configs: Object.fromEntries(this.configs.entries()),
        encryptedSecrets,
        auditHistory: this.auditHistory,
        integrationLogs: this.integrationLogs.slice(-100),
      };

      fs.writeFileSync(this.storageFilePath, JSON.stringify(payload, null, 2), "utf8");
    } catch (err) {
      console.error("[IntegrationManager] Failed to persist configuration to disk:", err);
    }
  }

  public loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.storageFilePath)) {
        this.saveToDisk();
        return;
      }

      const raw = fs.readFileSync(this.storageFilePath, "utf8");
      const parsed = JSON.parse(raw);

      if (parsed.activePaymentProviderId) {
        this.activePaymentProviderId = parsed.activePaymentProviderId;
      }

      if (parsed.configs) {
        for (const [key, val] of Object.entries(parsed.configs)) {
          this.configs.set(key, val as Record<string, any>);
        }
      }

      if (parsed.encryptedSecrets) {
        try {
          const decryptedJson = this.decrypt(parsed.encryptedSecrets);
          const decryptedObj = JSON.parse(decryptedJson);
          for (const [key, val] of Object.entries(decryptedObj)) {
            this.secrets.set(key, val as Record<string, string>);
          }
        } catch (decryptErr) {
          console.error("[IntegrationManager] Warning: Could not decrypt stored credentials. Using fallback defaults:", decryptErr);
        }
      }

      if (Array.isArray(parsed.auditHistory)) {
        this.auditHistory = parsed.auditHistory.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }));
      }

      if (Array.isArray(parsed.integrationLogs)) {
        this.integrationLogs = parsed.integrationLogs.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }));
      }
    } catch (err) {
      console.error("[IntegrationManager] Error reading config file, keeping memory defaults:", err);
    }
  }

  // --------------------------------------------------------------------------
  // PUBLIC ACCESSORS & MASKED VIEWS
  // --------------------------------------------------------------------------
  public getActivePaymentProviderId(): string {
    return this.activePaymentProviderId;
  }

  public getMaskedIntegrations(): IntegrationMetadata[] {
    const list: IntegrationMetadata[] = [];

    // 1. Paytm
    const paytmCfg = this.configs.get("paytm") || {};
    const hasPaytmKey = !!(this.secrets.get("paytm")?.merchantKey);

    list.push({
      id: "paytm",
      name: "Paytm Payment Gateway",
      category: "payment",
      isIntegrated: true,
      isActive: this.activePaymentProviderId === "paytm" && paytmCfg.isActive !== false,
      environment: paytmCfg.environment || "staging",
      settings: {
        merchantId: paytmCfg.merchantId || "",
        merchantKeyMasked: hasPaytmKey ? "••••••••" : "",
        website: paytmCfg.website || "WEBSTAGING",
        channelId: paytmCfg.channelId || "WEB",
        industryTypeId: paytmCfg.industryTypeId || "Retail",
        callbackUrl: paytmCfg.callbackUrl || "/api/v1/payments/paytm/callback",
        webhookUrl: paytmCfg.webhookUrl || "/api/v1/payments/paytm/webhook",
      },
      hasCredentials: hasPaytmKey && !!paytmCfg.merchantId,
      lastTestStatus: paytmCfg.lastTestStatus || (hasPaytmKey && paytmCfg.merchantId ? "CONFIGURED_AND_VALID" : "NOT_CONFIGURED"),
      lastTestedAt: paytmCfg.lastTestedAt ? new Date(paytmCfg.lastTestedAt) : null,
      lastDiagnosticMessage: paytmCfg.lastDiagnosticMessage || null,
    });

    // 2. Razorpay
    const rzpCfg = this.configs.get("razorpay") || {};
    list.push({
      id: "razorpay",
      name: "Razorpay Payment Gateway",
      category: "payment",
      isIntegrated: false,
      isActive: false,
      environment: "sandbox",
      settings: { keyId: rzpCfg.keyId || "", keySecretMasked: "" },
      hasCredentials: false,
      lastTestStatus: "NOT_INTEGRATED",
      lastDiagnosticMessage: "Adapter not implemented. Provider planned for future phases.",
    });

    // 3. Stripe
    const stripeCfg = this.configs.get("stripe") || {};
    list.push({
      id: "stripe",
      name: "Stripe International Payments",
      category: "payment",
      isIntegrated: false,
      isActive: false,
      environment: "sandbox",
      settings: { publishableKey: stripeCfg.publishableKey || "", secretKeyMasked: "" },
      hasCredentials: false,
      lastTestStatus: "NOT_INTEGRATED",
      lastDiagnosticMessage: "Adapter not implemented. Provider planned for future phases.",
    });

    // 4. Shiprocket
    list.push({
      id: "shiprocket",
      name: "Shiprocket Domestic Logistics",
      category: "shipping",
      isIntegrated: false,
      isActive: false,
      environment: "sandbox",
      settings: { apiUser: "" },
      hasCredentials: false,
      lastTestStatus: "NOT_INTEGRATED",
      lastDiagnosticMessage: "Planned courier integration.",
    });

    // 5. Resend
    list.push({
      id: "resend",
      name: "Resend Transactional Email",
      category: "notifications",
      isIntegrated: false,
      isActive: false,
      settings: { fromEmail: "orders@icm-madhubani.in" },
      hasCredentials: false,
      lastTestStatus: "NOT_INTEGRATED",
      lastDiagnosticMessage: "Planned transactional email integration.",
    });

    return list;
  }

  public getRawCredentials(integrationId: string): Record<string, string> {
    return { ...(this.secrets.get(integrationId) || {}) };
  }

  public getConfig(integrationId: string): Record<string, any> {
    return { ...(this.configs.get(integrationId) || {}) };
  }

  // --------------------------------------------------------------------------
  // ADMINISTRATIVE ACTIONS (SUPER ADMIN ONLY)
  // --------------------------------------------------------------------------
  public updateConfig(
    integrationId: string,
    updates: Partial<PaytmConfigSettings>,
    adminUserId: string
  ): void {
    const existing = this.configs.get(integrationId);
    if (!existing) {
      throw new Error(`Integration '${integrationId}' not found.`);
    }

    const previousNonSecretValues: Record<string, any> = {};
    const newNonSecretValues: Record<string, any> = {};
    const changedFields: string[] = [];

    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined && key !== "merchantKey" && key !== "secretKey" && key !== "keySecret") {
        if (existing[key] !== val) {
          previousNonSecretValues[key] = existing[key];
          newNonSecretValues[key] = val;
          changedFields.push(key);
          existing[key] = val;
        }
      }
    }

    this.configs.set(integrationId, existing);

    this.auditHistory.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      integrationId,
      action: "CONFIG_UPDATED",
      adminUserId,
      changedFields,
      previousNonSecretValues,
      newNonSecretValues,
    });

    this.logEntry({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      integrationId,
      category: "payment",
      level: "INFO",
      action: "CONFIG_UPDATED",
      message: `Admin ${adminUserId} updated config fields: ${changedFields.join(", ")}`,
    });

    this.saveToDisk();
  }

  public replaceCredentials(
    integrationId: string,
    newCredentials: Record<string, string>,
    adminUserId: string
  ): void {
    if (!this.configs.has(integrationId)) {
      throw new Error(`Integration '${integrationId}' not found.`);
    }

    if (integrationId === "paytm") {
      const key = newCredentials.merchantKey;
      if (!key) {
        this.secrets.delete(integrationId);
      } else if (typeof key !== "string" || key.trim().length < 8) {
        throw new Error("Invalid Paytm merchant key: Must be at least 8 characters.");
      } else {
        this.secrets.set(integrationId, { merchantKey: key.trim() });
      }
    } else {
      this.secrets.set(integrationId, { ...newCredentials });
    }

    // Update test status to Format Valid
    const cfg = this.configs.get(integrationId)!;
    cfg.lastTestStatus = "FORMAT_VALID";
    cfg.lastDiagnosticMessage = "Credentials updated. Run connection test to verify.";
    this.configs.set(integrationId, cfg);

    this.auditHistory.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      integrationId,
      action: "CREDENTIAL_REPLACED",
      adminUserId,
      changedFields: ["merchantKey"],
      notes: "Credential secret securely updated and encrypted at rest.",
    });

    this.logEntry({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      integrationId,
      category: "payment",
      level: "INFO",
      action: "CREDENTIAL_REPLACED",
      message: `Admin ${adminUserId} securely replaced credentials for '${integrationId}'.`,
    });

    this.saveToDisk();
  }

  public switchActivePaymentProvider(targetProviderId: string, adminUserId: string): void {
    if (targetProviderId !== "paytm") {
      throw new Error(
        `Cannot activate '${targetProviderId}': Provider is not integrated. Only 'paytm' is currently implemented.`
      );
    }

    const paytmCfg = this.configs.get("paytm");
    const paytmKey = this.secrets.get("paytm")?.merchantKey;
    if (!paytmCfg?.merchantId || !paytmKey) {
      throw new Error(
        "Cannot activate Paytm: Merchant ID and Merchant Key are required before activating gateway."
      );
    }

    const previousProvider = this.activePaymentProviderId;
    this.activePaymentProviderId = targetProviderId;
    paytmCfg.isActive = true;
    this.configs.set("paytm", paytmCfg);

    this.auditHistory.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      integrationId: targetProviderId,
      action: "PROVIDER_SWITCHED",
      adminUserId,
      changedFields: ["activePaymentProviderId"],
      previousNonSecretValues: { activeProvider: previousProvider },
      newNonSecretValues: { activeProvider: targetProviderId },
      notes: `Payment provider safely switched to ${targetProviderId}`,
    });

    this.logEntry({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      integrationId: targetProviderId,
      category: "payment",
      level: "INFO",
      action: "PROVIDER_SWITCHED",
      message: `Active payment gateway switched from '${previousProvider}' to '${targetProviderId}' by admin ${adminUserId}.`,
    });

    this.saveToDisk();
  }

  public recordTestResult(
    integrationId: string,
    status:
      | "CONFIGURED_AND_VALID"
      | "FORMAT_VALID"
      | "INVALID_CREDENTIALS"
      | "CONNECTION_FAILED"
      | "NOT_CONFIGURED"
      | "NOT_INTEGRATED",
    message: string,
    adminUserId: string
  ): void {
    const cfg = this.configs.get(integrationId);
    if (cfg) {
      cfg.lastTestStatus = status;
      cfg.lastDiagnosticMessage = message;
      cfg.lastTestedAt = new Date().toISOString();
      this.configs.set(integrationId, cfg);
    }

    this.auditHistory.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      integrationId,
      action: "TEST_EXECUTED",
      adminUserId,
      changedFields: ["lastTestStatus", "lastDiagnosticMessage"],
      testStatus: status,
      notes: message,
    });

    this.logEntry({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      integrationId,
      category: "payment",
      level: status === "CONFIGURED_AND_VALID" || status === "FORMAT_VALID" ? "INFO" : "WARN",
      action: "TEST_EXECUTED",
      message: `Connection test result: ${status} — ${message}`,
    });

    this.saveToDisk();
  }

  public logEntry(entry: IntegrationLogEntry): void {
    this.integrationLogs.unshift(entry);
    if (this.integrationLogs.length > 200) {
      this.integrationLogs.pop();
    }
  }

  public getAuditHistory(): IntegrationAuditRecord[] {
    return [...this.auditHistory];
  }

  public getIntegrationLogs(): IntegrationLogEntry[] {
    return [...this.integrationLogs];
  }
}
