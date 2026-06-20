export type PaymentMethodType = 'pix' | 'card' | 'debit' | 'cash';

export type PaymentIntentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'voided'
  | 'failed'
  | 'requires_action';

export interface PaymentMethodRecord {
  id: string;
  userId: string;
  methodType: PaymentMethodType;
  label: string;
  lastFour?: string;
  brand?: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface PaymentIntentRecord {
  id: string;
  rideId?: string;
  userId: string;
  paymentMethodId?: string;
  paymentMethodType: PaymentMethodType;
  status: PaymentIntentStatus;
  amountAuthorizedCentavos: number;
  amountCapturedCentavos: number;
  currency: string;
  provider: string;
  providerRef?: string;
  idempotencyKey?: string;
  failureReason?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PixChargePublic {
  txid: string;
  status: string;
  qrCodePayload: string;
  amountCentavos: number;
  expiresAt: string;
  paidAt?: string;
}

export function toPublicPaymentMethod(m: PaymentMethodRecord) {
  return {
    id: m.id,
    type: m.methodType,
    label: m.label,
    lastFour: m.lastFour,
    brand: m.brand,
    isDefault: m.isDefault,
  };
}

export function toPublicPaymentIntent(i: PaymentIntentRecord, pix?: PixChargePublic) {
  return {
    id: i.id,
    rideId: i.rideId,
    status: i.status,
    paymentMethodType: i.paymentMethodType,
    amountAuthorizedCentavos: i.amountAuthorizedCentavos,
    amountCapturedCentavos: i.amountCapturedCentavos,
    currency: i.currency,
    pix,
  };
}
