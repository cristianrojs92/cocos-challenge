// Los tests e2e nunca usan la base de desarrollo ni la de Neon: siempre la de test.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://cocos:cocos@localhost:5432/cocos_test';

// Los tests no escriben logs salvo que uno lo pida (test/logging.e2e-spec.ts).
process.env.LOG_LEVEL ??= 'silent';
