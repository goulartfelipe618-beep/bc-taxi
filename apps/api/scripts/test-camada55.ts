process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    getSafetyHelpProductionConfig,
    getSafetyHelpDashboard,
    recordHelpInquiry,
    addTrustedContact,
    removeTrustedContact,
    createRideShareLink,
    __testResetSafetyHelpProductionMemory,
  } = await import('../src/passenger/safetyHelpProductionService.js');
  const { createUser } = await import('../src/userStore.js');

  __testResetSafetyHelpProductionMemory();

  const cfg = await getSafetyHelpProductionConfig();
  if (!cfg.helpCenterEnabled || !cfg.safetyToolsEnabled) {
    throw new Error('Safety help production config incomplete');
  }
  console.log('Config OK:', cfg.configVersion);

  const passenger = await createUser({
    email: `camada55-${randomUUID()}@test.local`,
    password: 'senha123',
    fullName: 'Passageiro Camada 55',
    role: 'passenger',
  });

  const dashboard = await getSafetyHelpDashboard(passenger.id);
  if (dashboard.helpTopics.length < 5) throw new Error('Help topics missing');
  if (dashboard.safetyTools.length < 3) throw new Error('Safety tools missing');
  if (!dashboard.supportChannels.some((c) => c.code === 'emergency')) {
    throw new Error('Emergency channel missing');
  }
  console.log('Dashboard OK — topics:', dashboard.helpTopics.length);

  await recordHelpInquiry({
    userId: passenger.id,
    topicCode: 'lost_item',
    channel: 'in_app',
  });
  const afterInquiry = await getSafetyHelpDashboard(passenger.id);
  if (afterInquiry.recentInquiries < 1) throw new Error('Inquiry not recorded');
  console.log('Help inquiry OK');

  const contact = await addTrustedContact({
    userId: passenger.id,
    name: 'Maria',
    phone: '47999998888',
    relationshipLabel: 'Mãe',
  });
  if (!contact.phoneMasked.includes('8888')) throw new Error('Phone mask failed');
  console.log('Trusted contact OK');

  await removeTrustedContact(passenger.id, contact.id);
  const afterRemove = await getSafetyHelpDashboard(passenger.id);
  if (afterRemove.trustedContacts.length > 0) throw new Error('Contact remove failed');
  console.log('Contact remove OK');

  const share = await createRideShareLink({ userId: passenger.id });
  if (!share.shareUrl.includes('bc.taxi/share/')) throw new Error('Share link missing');
  console.log('Ride share OK');

  console.log('\nCamada 55 — ajuda e segurança produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
