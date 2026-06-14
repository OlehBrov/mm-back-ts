export default () => ({
  port: parseInt(process.env.PORT ?? '6006', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.AUTH_TOKEN_SECRET_KEY,
    refreshSecret: process.env.REFRESH_TOKEN_SECRET_KEY,
    expiresIn: '24h',
  },
  terminal: {
    provider: process.env.TERMINAL_PROVIDER ?? 'privatbank',
    host: process.env.CLIENT_HOST,
    port: parseInt(process.env.CLIENT_PORT ?? '3000', 10),
    paymentTimeoutMs: parseInt(process.env.TERMINAL_PAYMENT_TIMEOUT_MS ?? '60000', 10),
    connectionTimeoutMs: parseInt(process.env.TERMINAL_CONNECTION_TIMEOUT_MS ?? '5000', 10),
    reconnectIntervalMs: parseInt(process.env.TERMINAL_RECONNECT_INTERVAL_MS ?? '30000', 10),
  },
  fiscal: {
    host: process.env.FISCAL_HOST ?? 'https://kasa.vchasno.ua',
    merchantToken: process.env.AUTH_MERCH_TOKEN,
    merchantTokenVat: process.env.AUTH_MERCH_TOKEN_VAT,
    retryIntervalMs: parseInt(process.env.FISCAL_RETRY_INTERVAL_MS ?? '10000', 10),
  },
  images: {
    dir: process.env.IMAGE_DIR ?? 'C:/mm-images',
    categoryDir: process.env.CATEGORY_IMAGE_DIR ?? 'C:/mm-images/cat-images',
  },
  store: {
    id: parseInt(process.env.STORE_ID ?? '1', 10),
    authId: process.env.STORE_AUTH_ID,
    host: process.env.MM_HOST ?? 'http://localhost:6006',
  },
  dataDir: process.env.DATA_DIR ?? null,
  mailer: {
    host: process.env.MAIL_HOST ?? '',
    port: parseInt(process.env.MAIL_PORT ?? '587', 10),
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER ?? '',
    pass: process.env.MAIL_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'MicroMarket <noreply@localhost>',
    to: process.env.MAIL_TO ?? '',
  },
});
