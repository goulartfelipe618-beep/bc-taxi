process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    getDriverAccountProductionConfig,
    getDriverAccountDashboard,
    getDriverEarnings,
    listDriverInboxMessages,
    updateDriverProfile,
    getDriverSecuritySummary,
    updateDriverPassword,
    setDriverTwoFactor,
    markDriverInboxMessageRead,
    __testResetDriverAccountProductionMemory,
    __testSeedDriverInboxMessage,
  } = await import('../src/driver/driverAccountProductionService.js');
  const { createUser } = await import('../src/userStore.js');

  __testResetDriverAccountProductionMemory();

  const cfg = await getDriverAccountProductionConfig();
  if (!cfg.earningsEnabled || !cfg.inboxEnabled) throw new Error('Driver account production config incomplete');
  console.log('Driver account config OK:', cfg.configVersion);

  const user = await createUser({
    email: `camada49-${randomUUID()}@test.local`,
    password: 'senha123',
    fullName: 'Motorista Camada 49',
    role: 'driver',
    phone: '+55 47 98800-5678',
  });

  const dashboard = await getDriverAccountDashboard(user);
  if (!dashboard.profile.fullName || !dashboard.earnings) {
    throw new Error('Dashboard missing profile or earnings');
  }
  if (dashboard.recentMessages.length < 1) throw new Error('Dashboard messages missing');
  console.log('Account dashboard OK — available:', dashboard.earnings.availableLabel);

  const earnings = await getDriverEarnings(user.id);
  if (earnings.transactions.length < 1) throw new Error('Earnings transactions missing');
  console.log('Earnings OK:', earnings.transactions.length, 'transactions');

  const messages = await listDriverInboxMessages(user.id);
  if (messages.length < 2) throw new Error('Inbox messages missing');
  const unread = messages.find((m) => !m.isRead);
  if (!unread) throw new Error('Expected unread message');
  await markDriverInboxMessageRead(user.id, unread.id);
  const afterRead = await listDriverInboxMessages(user.id);
  if (afterRead.find((m) => m.id === unread.id)?.isRead !== true) {
    throw new Error('Message not marked read');
  }
  console.log('Inbox OK');

  const updated = await updateDriverProfile(user, {
    fullName: 'Motorista Atualizado',
    emergencyContact: '+55 47 99999-1111',
    preferredPayoutMethod: 'pix',
  });
  if (updated.profile.fullName !== 'Motorista Atualizado') throw new Error('Profile update failed');
  console.log('Profile update OK');

  const security = await getDriverSecuritySummary(user);
  if (!security.passwordChangedLabel) throw new Error('Security summary incomplete');
  console.log('Security summary OK');

  const twoFactor = await setDriverTwoFactor(user, true);
  if (!twoFactor.twoFactorEnabled) throw new Error('2FA not enabled');
  console.log('2FA toggle OK');

  await updateDriverPassword(user, 'senha123', 'novaSenha456');
  try {
    await updateDriverPassword(user, 'senha123', 'outra123');
    throw new Error('Old password should fail after change');
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (!msg.includes('incorreta')) throw e;
  }
  console.log('Password change OK');

  __testSeedDriverInboxMessage(user.id, {
    category: 'system',
    title: 'Teste Camada 49',
    preview: 'Nova mensagem de teste',
    body: 'Conteúdo completo da mensagem de teste.',
    iconType: 'info',
    isRead: false,
  });
  const seeded = await listDriverInboxMessages(user.id, 1);
  if (seeded[0]?.title !== 'Teste Camada 49') throw new Error('Seed inbox failed');

  console.log('\nCamada 49 — conta motorista produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
