import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getRide } from '../match/matchService.js';
import { getRideReceipt, issueRideReceipt, toPublicReceipt } from '../receipts/receiptService.js';

export const receiptsRouter = Router();

receiptsRouter.use(authMiddleware);

receiptsRouter.get('/rides/:rideId', async (req, res) => {
  const ride = await getRide(req.params.rideId);
  if (!ride) {
    res.status(404).json({ error: 'Corrida não encontrada' });
    return;
  }
  if (ride.passengerId !== req.user!.id && ride.driverId !== req.user!.id) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  let receipt = await getRideReceipt(ride.id, ride.passengerId);
  if (!receipt && ride.status === 'COMPLETED') {
    receipt = await issueRideReceipt(ride);
  }
  if (!receipt) {
    res.status(404).json({ error: 'Recibo ainda não disponível' });
    return;
  }

  res.json({ receipt: toPublicReceipt(receipt) });
});

receiptsRouter.get('/rides/:rideId/html', async (req, res) => {
  const ride = await getRide(req.params.rideId);
  if (!ride) {
    res.status(404).send('Corrida não encontrada');
    return;
  }
  if (ride.passengerId !== req.user!.id) {
    res.status(403).send('Acesso negado');
    return;
  }

  let receipt = await getRideReceipt(ride.id, ride.passengerId);
  if (!receipt && ride.status === 'COMPLETED') {
    receipt = await issueRideReceipt(ride);
  }
  if (!receipt) {
    res.status(404).send('Recibo indisponível');
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(receipt.htmlContent);
});
