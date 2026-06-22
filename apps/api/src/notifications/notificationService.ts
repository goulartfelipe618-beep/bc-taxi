import { config } from '../config.js';
import type { RealtimeEvent, RealtimeEventType } from '../realtime/types.js';
import {
  buildPushDedupKey,
  shouldSkipPushDueToDedup,
} from '../realtime/realtimeProductionService.js';
import { listActivePushTokens, logPushNotification } from './pushTokenStore.js';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

const templates: Partial<Record<RealtimeEventType, (event: RealtimeEvent) => PushPayload | null>> = {
  RIDE_DRIVER_ASSIGNED: () => ({
    title: 'Motorista a caminho',
    body: 'Seu motorista foi atribuído. Acompanhe no app.',
  }),
  RIDE_DRIVER_ARRIVED: () => ({
    title: 'Motorista chegou',
    body: 'Informe o código de início da corrida.',
  }),
  RIDE_STARTED: () => ({
    title: 'Viagem iniciada',
    body: 'Boa viagem! Estamos monitorando sua rota.',
  }),
  RIDE_COMPLETED: (e) => ({
    title: 'Viagem concluída',
    body: `Corrida finalizada${e.payload.fareCentavos ? ` · R$ ${(Number(e.payload.fareCentavos) / 100).toFixed(2)}` : ''}. Recibo disponível.`,
  }),
  PAYMENT_AUTHORIZED: () => ({
    title: 'Pagamento confirmado',
    body: 'Seu pagamento PIX foi recebido.',
  }),
  PAYMENT_FAILED: () => ({
    title: 'Falha no pagamento',
    body: 'Atualize o método de pagamento para continuar.',
  }),
  RIDE_OFFERED: () => ({
    title: 'Nova corrida disponível',
    body: 'Toque para ver os detalhes da oferta.',
  }),
  DELIVERY_CREATED: () => ({
    title: 'Entrega solicitada',
    body: 'Estamos buscando um entregador.',
  }),
  DELIVERY_PICKUP_CONFIRMED: () => ({
    title: 'Coleta confirmada',
    body: 'O pacote foi coletado e está a caminho.',
  }),
  DELIVERY_COMPLETED: () => ({
    title: 'Entrega concluída',
    body: 'Seu pacote foi entregue com sucesso.',
  }),
  GPS_INTEGRITY_ALERT: () => ({
    title: 'Alerta de localização',
    body: 'Verifique o GPS do dispositivo para continuar operando.',
  }),
};

async function sendFcm(token: string, payload: PushPayload): Promise<{ ok: boolean; ref?: string; error?: string }> {
  if (!config.fcmServerKey) return { ok: false, error: 'FCM not configured' };

  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${config.fcmServerKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
    }),
  });

  if (!res.ok) return { ok: false, error: await res.text() };
  const json = (await res.json()) as { message_id?: number; failure?: number };
  if (json.failure) return { ok: false, error: 'FCM delivery failed' };
  return { ok: true, ref: String(json.message_id ?? 'fcm') };
}

export async function dispatchPushForEvent(event: RealtimeEvent) {
  if (!config.pushNotificationsEnabled) return;

  const templateFn = templates[event.eventType];
  if (!templateFn) return;

  const payload = templateFn(event);
  if (!payload) return;

  const userIds = event.userIds ?? [];
  const driverId = event.driverId;
  const targets = new Set(userIds);
  if (driverId && ['RIDE_OFFERED', 'RIDE_DRIVER_ASSIGNED', 'GPS_INTEGRITY_ALERT'].includes(event.eventType)) {
    targets.add(driverId);
  }

  const dedupKey = buildPushDedupKey(event);

  for (const userId of targets) {
    if (await shouldSkipPushDueToDedup(userId, event.eventType, dedupKey)) {
      await logPushNotification({
        userId,
        eventType: event.eventType,
        title: payload.title,
        body: payload.body,
        status: 'skipped',
        provider: config.pushProvider,
        payload: { reason: 'dedup', rideId: event.rideId, dedupKey },
      });
      continue;
    }

    const tokens = await listActivePushTokens(userId);
    if (tokens.length === 0) {
      await logPushNotification({
        userId,
        eventType: event.eventType,
        title: payload.title,
        body: payload.body,
        status: 'skipped',
        provider: config.pushProvider,
        payload: { reason: 'no_token', rideId: event.rideId },
      });
      continue;
    }

    for (const t of tokens) {
      let status: 'sent' | 'failed' = 'sent';
      let providerRef: string | undefined;
      let error: string | undefined;

      if (config.pushProvider === 'fcm') {
        const result = await sendFcm(t.token, {
          ...payload,
          data: { eventType: event.eventType, rideId: event.rideId ?? '', ...(payload.data ?? {}) },
        });
        status = result.ok ? 'sent' : 'failed';
        providerRef = result.ref;
        error = result.error;
      } else {
        providerRef = `demo-${Date.now()}`;
      }

      await logPushNotification({
        userId,
        eventType: event.eventType,
        title: payload.title,
        body: payload.body,
        status,
        provider: config.pushProvider,
        providerRef,
        payload: { tokenPlatform: t.platform, rideId: event.rideId, error },
      });
    }
  }
}
