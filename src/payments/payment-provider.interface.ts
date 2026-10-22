import { CustomerOrderRecord, OrderPaymentStatus } from "../types/marketplace.js";

export type PaymentGatewayId = "paytm" | "razorpay" | "stripe" | "cashfree";

export interface PaymentInitiationResult {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  provider: PaymentGatewayId;
  txnToken?: string;
  redirectUrl?: string;
  checkoutParams?: Record<string, any>;
  status: "INITIATED" | "PENDING" | "FAILED";
  message?: string;
}

export interface PaymentVerificationResult {
  isValid: boolean;
  orderNumber: string;
  transactionReference: string;
  amount: number;
  currency: string;
  status: OrderPaymentStatus;
  rawResponse?: Record<string, any>;
  failureReason?: string;
}

export interface WebhookProcessingResult {
  processed: boolean;
  orderNumber?: string;
  transactionReference?: string;
  status?: OrderPaymentStatus;
  isDuplicate?: boolean;
  message?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  status:
    | "CONFIGURED_AND_VALID"
    | "FORMAT_VALID"
    | "INVALID_CREDENTIALS"
    | "CONNECTION_FAILED"
    | "NOT_CONFIGURED"
    | "NOT_INTEGRATED";
  diagnosticMessage: string;
  testedAt: Date;
  environment?: "staging" | "production";
  details?: Record<string, any>;
}

export interface IPaymentProvider {
  readonly id: PaymentGatewayId;
  readonly name: string;
  isConfigured(): boolean;
  isIntegrated(): boolean;
  initiatePayment(order: CustomerOrderRecord, callbackUrl?: string): Promise<PaymentInitiationResult>;
  verifyCallback(payload: Record<string, any>): Promise<PaymentVerificationResult>;
  queryTransactionStatus(orderNumber: string): Promise<PaymentVerificationResult>;
  verifyWebhookSignature(headers: Record<string, string>, payload: any): boolean;
  processWebhook(headers: Record<string, string>, payload: any): Promise<WebhookProcessingResult>;
  testConnection(): Promise<ConnectionTestResult>;
}
