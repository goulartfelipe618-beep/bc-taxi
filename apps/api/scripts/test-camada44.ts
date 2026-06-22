process.env.SUPABASE_DB_PASSWORD = '';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';

async function main() {
  const { randomUUID } = await import('node:crypto');
  const {
    getPassengerAccountProductionConfig,
    getPassengerAccountDashboard,
    getPassengerWallet,
    listPassengerInboxMessages,
    updatePassengerProfile,
    getPassengerSecuritySummary,
    updatePassengerPassword,
    setPassengerTwoFactor,
    markPassengerInboxMessageRead,
    __testResetPassengerAccountProductionMemory,
    __testSeedPassengerInboxMessage,
  } = await import('../src/passenger/passengerAccountProductionService.js');
  const { createUser } = await import('../src/userStore.js');

  __testResetPassengerAccountProductionMemory();

  const cfg = await getPassengerAccountProductionConfig();
  if (!cfg.walletEnabled || !cfg.inboxEnabled) throw new Error('Account production config incomplete');
  console.log('Passenger account config OK:', cfg.configVersion);

  const user = await createUser({
    email: `camada44-${randomUUID()}@test.local`,
    password: 'senha123',
    fullName: 'Passageiro Camada 44',
    role: 'passenger',
    phone: '+55 47 98800-1234',
  });

  const dashboard = await getPassengerAccountDashboard(user);
  if (!dashboard.profile.fullName || dashboard.paymentMethods.length < 3) {
    throw new Error('Dashboard missing profile or payment methods');
  }
  if (!dashboard.wallet || dashboard.wallet.balanceCentavos < 0) {
    throw new Error('Dashboard wallet missing');
  }
  if (dashboard.recentMessages.length < 1) throw new Error('Dashboard messages missing');
  console.log('Account dashboard OK — balance:', dashboard.wallet.balanceLabel);

  const wallet = await getPassengerWallet(user.id);
  if (wallet.transactions.length < 1) throw new Error('Wallet transactions missing');
  console.log('Wallet OK:', wallet.transactions.length, 'transactions');

  const messages = await listPassengerInboxMessages(user.id);
  if (messages.length < 2) throw new Error('Inbox messages missing');
  const unread = messages.find((m) => !m.isRead);
  if (!unread) throw new Error('Expected unread message');
  await markPassengerInboxMessageRead(user.id, unread.id);
  const afterRead = await listPassengerInboxMessages(user.id);
  if (afterRead.find((m) => m.id === unread.id)?.isRead !== true) {
    throw new Error('Message not marked read');
  }
  console.log('Inbox OK');

  const updated = await updatePassengerProfile(user, {
    fullName: 'Passageiro Atualizado',
    gender: 'Homem',
    recoveryPhone: '+55 47 99999-0000',
  });
  if (updated.profile.fullName !== 'Passageiro Atualizado') throw new Error('Profile update failed');
  console.log('Profile update OK');

  const security = await getPassengerSecuritySummary(user);
  if (!security.passwordChangedLabel) throw new Error('Security summary incomplete');
  console.log('Security summary OK');

  const twoFactor = await setPassengerTwoFactor(user, true);
  if (!twoFactor.twoFactorEnabled) throw new Error('2FA not enabled');
  console.log('2FA toggle OK');

  await updatePassengerPassword(user, 'senha123', 'novaSenha456');
  try {
    await updatePassengerPassword(user, 'senha123', 'outra123');
    throw new Error('Old password should fail after change');
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (!msg.includes('incorreta')) throw e;
  }
  console.log('Password change OK');

  __testSeedPassengerInboxMessage(user.id, {
    category: 'system',
    title: 'Teste Camada 44',
    preview: 'Nova mensagem de teste',
    body: 'Conteúdo completo da mensagem de teste.',
    iconType: 'info',
    isRead: false,
  });
  const seeded = await listPassengerInboxMessages(user.id, 1);
  if (seeded[0]?.title !== 'Teste Camada 44') throw new Error('Seed inbox failed');

  console.log('\nCamada 44 — conta passageiro produção: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
