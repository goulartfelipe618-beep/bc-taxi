import { emitEvent } from '../src/realtime/eventBus.js';
import { getDynamicMultiplier, refreshDynamicPricing } from '../src/pricing/dynamicPricingService.js';
import { recordFraudSignal, getUserRiskScore } from '../src/fraud/fraudService.js';
import { wsHub } from '../src/realtime/wsHub.js';

console.log('=== Dynamic pricing ===');
const snap = await refreshDynamicPricing('economico');
console.log('Multiplier:', snap.multiplierEffective, 'demand:', snap.factors.demandPressure);
const cached = await getDynamicMultiplier('economico');
console.log('Cached:', cached);

console.log('=== Fraud signals ===');
await recordFraudSignal({
  userId: 'test-user-layer2',
  signalType: 'CODE_VERIFY_FAIL',
  metadata: { test: true },
});
console.log('Risk score:', await getUserRiskScore('test-user-layer2'));

console.log('=== Event bus ===');
await emitEvent('PRICING_UPDATED', 'pricing', 'vale-itajai', { multiplier: cached });
console.log('WS connections:', wsHub.stats());
console.log('Layer 2 OK');
