require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const DEFAULT_JWT_SECRET = 'change_me_in_production';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Fail fast in production if the JWT secret was never configured or is still
 * the insecure default. Call this from process entrypoints (API server, bot,
 * worker) before anything starts listening — never from module load time,
 * so importing `config` stays side-effect free for tests and tooling.
 */
function assertProductionSecrets() {
  if (nodeEnv !== 'production') return;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === DEFAULT_JWT_SECRET) {
    throw new Error(
      'JWT_SECRET must be set to a strong, unique value in production (NODE_ENV=production). ' +
        'Refusing to start with the default placeholder from .env.example.'
    );
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET is too short for production use (minimum 32 characters recommended).');
  }
}

module.exports = {
  botToken: process.env.BOT_TOKEN || '',
  port: parseInt(process.env.PORT, 10) || 3000,
  // The bot process talks to the API process over HTTP (see src/bot/apiClient.js).
  // On a single host (bare-metal `npm start` + `npm run bot`) they share
  // localhost, so the default below just works. Under docker-compose, `app`
  // and `bot` are separate containers with separate network namespaces -
  // "localhost" inside the bot container is the bot container itself, not
  // `app` - so this MUST be overridden there, e.g. http://app:3000/api/v1.
  apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${parseInt(process.env.PORT, 10) || 3000}/api/v1`,
  // Cloud api.telegram.org hard-caps file downloads (getFile) at 20 MB
  // regardless of anything we configure. Pointing this at a self-hosted
  // telegram-bot-api server (docker/docker-compose.yml, service
  // `telegram-bot-api`) raises that to ~2000 MB - see README "Self-hosted
  // Bot API сервер". Leave as the default when not running one.
  telegramApiRoot: process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org',
  // Our own ceiling on top of whatever Telegram allows, so a self-hosted
  // server doesn't invite someone to hand the bot a multi-GB file that would
  // just blow up Node's memory while parsing it.
  maxPdfUploadMb: parseInt(process.env.MAX_PDF_UPLOAD_MB, 10) || 150,
  nodeEnv,
  sqlitePath: process.env.SQLITE_PATH || './data/greenway.db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  greenwayCatalogUrl: process.env.GREENWAY_CATALOG_URL || '',
  parserCron: process.env.PARSER_CRON || '0 3 * * *',
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Europe/Moscow',
  allowedOrigins,
  assertProductionSecrets,
  // Личный кабинет партнёра (pyapi.greenwaystart.com) — бизнес-аналитика
  // (команда/финансы/PRO-бонус), не публичный каталог товаров.
  gwApiBaseUrl: process.env.GW_API_BASE_URL || 'https://pyapi.greenwaystart.com/pyapi/v1/',
  gwTokenEncKey: process.env.GREENWAY_TOKEN_ENC_KEY || '',
  // Conservative default after a real block incident on 2026-09-24 (see
  // memory `reference-greenway-pyapi`) — a handful of requests in quick
  // succession was enough to get a real account's IPs temporarily blocked.
  gwRequestMinIntervalMs: parseInt(process.env.GW_REQUEST_MIN_INTERVAL_MS, 10) || 3000,
};
