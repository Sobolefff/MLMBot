# Greenway Bot MVP

Telegram-бот для партнёров Greenway (MLM CRM). См. полную спецификацию в `greenway_bot_mvp_prompt.md`.

## Быстрый старт

```bash
npm install
cp .env.example .env   # заполните BOT_TOKEN и остальные переменные
npm run db:init        # инициализирует SQLite схему в ./data
npm start               # запускает REST API (порт 3000)
npm run bot              # запускает Telegram-бота (отдельный процесс)
npm run worker           # запускает воркер уведомлений (обработка очереди Bull)
```

Redis обязателен для очереди уведомлений (`npm run bot` и создание дедлайнов):

```bash
redis-server
```

## Тесты

```bash
npm test
```

## Структура проекта

```
src/
  bot/          — Telegram-бот (telegraf.js): handlers, keyboards, API-клиент
  api/          — REST API: routes, services, middleware
  database/     — SQLite схема и инициализация
  parsers/      — парсер каталога Greenway (Playwright)
  utils/        — логирование, аудит
  config/       — конфигурация из .env
docker/         — Dockerfile и docker-compose для продакшена
tests/
  unit/         — юнит-тесты (PV-калькулятор и т.д.)
  integration/  — интеграционные тесты API
```

## Реализовано (Phase 1 MVP, в разработке)

- [x] Схема БД (partners, clients, products, sales, deadlines, chains, notifications, audit_logs)
- [x] PV-Подборщик: DP-алгоритм (unbounded knapsack), до 3 комбинаций, < 500ms
- [x] REST API: auth, partners, pv-calc, chains, deadlines
- [x] Telegram-бот: регистрация с согласием на обработку ПД (ФЗ-152), главное меню, PV-Подборщик, цепочки, сроки
- [x] Уведомления по дедлайнам через Bull Queue (-72ч/-24ч/-2ч/0ч) + worker для отправки в Telegram
- [x] Audit log для действий партнёров
- [ ] Парсер каталога Greenway — селекторы-заглушки, требуют уточнения после доступа к реальной разметке сайта
- [ ] Cron job для ежедневного обновления каталога
- [ ] Security review (JWT/bcrypt hardening, rate limiting, CORS)
- [ ] Docker production deployment (SSL, Nginx, backups)

## Следующие шаги

1. Подтвердить структуру страницы каталога Greenway и обновить селекторы в `src/parsers/greenwayParser.js`.
2. Добавить worker-процесс, который читает очередь `deadline-notifications` и реально отправляет сообщения через бота.
3. Настроить cron (`node-cron` или системный cron) для `npm run` парсера каталога.
4. Провести security review перед продакшен-деплоем.
