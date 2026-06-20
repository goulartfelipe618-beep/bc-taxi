import type { PaymentMethodType } from '../types.js';

export interface PspPixCharge {
  txid: string;
  qrCodePayload: string;
  expiresAt: Date;
}

export interface PspAuthorizeParams {
  amountCentavos: number;
  currency: string;
  methodType: PaymentMethodType;
  idempotencyKey: string;
  userId: string;
  description?: string;
}

export interface PspAuthorizeResult {
  providerRef: string;
  status: 'authorized' | 'pending' | 'requires_action' | 'failed';
  failureReason?: string;
  pix?: PspPixCharge;
}

export interface PspCaptureParams {
  providerRef: string;
  amountCentavos: number;
  idempotencyKey: string;
}

export interface PspCaptureResult {
  providerRef: string;
  status: 'captured' | 'failed';
  failureReason?: string;
}

export interface PspVoidParams {
  providerRef: string;
  idempotencyKey: string;
}

export interface PspProvider {
  name: string;
  authorize(params: PspAuthorizeParams): Promise<PspAuthorizeResult>;
  capture(params: PspCaptureParams): Promise<PspCaptureResult>;
  void(params: PspVoidParams): Promise<{ status: 'voided' | 'failed'; failureReason?: string }>;
}
