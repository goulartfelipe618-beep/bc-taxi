import { createReviewObligations, listPendingObligationsForUser } from './obligationStore.js';

const REVIEW_WINDOW_DAYS = 7;

export function reviewExpiryFrom(completedAt: Date): Date {
  return new Date(completedAt.getTime() + REVIEW_WINDOW_DAYS * 86_400_000);
}

export async function openReviewObligationsForRide(params: {
  rideId: string;
  passengerId: string;
  driverId: string;
  completedAt: Date;
}) {
  return createReviewObligations({
    rideId: params.rideId,
    passengerId: params.passengerId,
    driverId: params.driverId,
    expiresAt: reviewExpiryFrom(params.completedAt),
  });
}

export async function getPendingReviewsForUser(userId: string) {
  const obligations = await listPendingObligationsForUser(userId);
  return obligations.map((o) => ({
    id: o.id,
    rideId: o.rideId,
    reviewedUserId: o.reviewedUserId,
    reviewerRole: o.reviewerRole,
    expiresAt: o.expiresAt.toISOString(),
    daysRemaining: Math.max(0, Math.ceil((o.expiresAt.getTime() - Date.now()) / 86_400_000)),
  }));
}
