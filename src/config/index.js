require('dotenv').config();

module.exports = {
  botToken: process.env.BOT_TOKEN || '',
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  sqlitePath: process.env.SQLITE_PATH || './data/greenway.db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'change_me_in_production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  greenwayCatalogUrl: process.env.GREENWAY_CATALOG_URL || '',
  parserCron: process.env.PARSER_CRON || '0 3 * * *',
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Europe/Moscow',
};
