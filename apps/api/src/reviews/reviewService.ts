import { getRide } from '../match/matchService.js';
import { emitEvent } from '../realtime/eventBus.js';
import { findReview, insertReview, toPublicReview, validateReviewTags } from './reviewStore.js';
import { recalculateUserReputation } from './reputationService.js';

export interface SubmitReviewInput {
  rideId: string;
  reviewerUserId: string;
  reviewerRole: 'passenger' | 'driver';
  stars: number;
  comment?: string;
  tags?: string[];
}

export async function submitRideReview(input: SubmitReviewInput) {
  const ride = await getRide(input.rideId);
  if (!ride) throw new Error('Corrida não encontrada');
  if (ride.status !== 'COMPLETED') {
    throw new Error('Avaliação permitida apenas após conclusão da corrida');
  }

  let reviewedUserId: string;
  let reviewedRole: 'passenger' | 'driver';

  if (input.reviewerRole === 'passenger') {
    if (ride.passengerId !== input.reviewerUserId) {
      throw new Error('Passageiro não autorizado');
    }
    if (!ride.driverId) throw new Error('Motorista não atribuído');
    reviewedUserId = ride.driverId;
    reviewedRole = 'driver';
  } else {
    if (ride.driverId !== input.reviewerUserId) {
      throw new Error('Motorista não autorizado');
    }
    reviewedUserId = ride.passengerId;
    reviewedRole = 'passenger';
  }

  const existing = await findReview(input.rideId, input.reviewerUserId, reviewedUserId);
  if (existing) throw new Error('Avaliação já enviada para esta corrida');

  const tags = input.tags?.length
    ? await validateReviewTags(input.tags, reviewedRole)
    : [];

  const review = await insertReview({
    rideId: input.rideId,
    reviewerUserId: input.reviewerUserId,
    reviewedUserId,
    reviewerRole: input.reviewerRole,
    reviewedRole,
    stars: input.stars,
    comment: input.comment,
    tags,
  });

  void emitEvent(
    'REVIEW_CREATED',
    'ride',
    input.rideId,
    { reviewId: review.id, stars: input.stars },
    { userIds: [input.reviewerUserId, reviewedUserId], rideId: input.rideId },
  );

  void recalculateUserReputation(reviewedUserId, reviewedRole);

  return toPublicReview(review);
}
