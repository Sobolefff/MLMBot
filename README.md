# Greenway Bot MVP

Telegram-бот для партнёров Greenway (MLM CRM). См. полную спецификацию в `greenway_bot_mvp_prompt.md` и актуальный список задач в `TODO.md`.

## Быстрый старт

```bash
npm install
cp .env.example .env   # заполните BOT_TOKEN и остальные переменные
npm run db:init        # инициализирует SQLite схему в ./data
npm start               # запускает REST API (порт 3000) + cron цепочек
npm run bot              # запускает Telegram-бота (отдельный процесс)
npm run worker           # запускает воркер уведомлений (обработка очередей Bull)
```

Redis обязателен для очередей уведомлений (`npm run worker`, создание дедлайнов, cron цепочек):

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
  bot/          — Telegram-бот (telegraf.js): handlers, keyboards, API-клиент, worker очередей
  api/          — REST API: routes, services, middleware
  database/     — SQLite схема и инициализация
  scheduler/    — cron-задачи (проверка цепочек)
  parsers/      — парсер каталога Greenway (Playwright)
  utils/        — логирование, аудит
  config/       — конфигурация из .env
docker/         — Dockerfile и docker-compose для продакшена
tests/
  unit/         — юнит-тесты (PV-калькулятор, логика цепочек)
  integration/  — интеграционные тесты API
```

## Реализовано (Phase 1 MVP, в разработке)

- [x] Схема БД (partners, clients, products, sales, deadlines, chains, notifications, audit_logs)
- [x] PV-Подборщик: DP-алгоритм (unbounded knapsack), до 3 комбинаций, < 500ms
- [x] REST API: auth, partners, pv-calc, chains, deadlines, settings, удаление данных (ФЗ-152)
- [x] Telegram-бот: регистрация с согласием на обработку ПД (ФЗ-152), главное меню, PV-Подборщик, цепочки (вкл/выкл по клиенту), сроки, настройки (тумблеры, добавление клиента, удаление всех данных)
- [x] Уведомления по дедлайнам через Bull Queue (-72ч/-24ч/-2ч/0ч) + worker для отправки в Telegram
- [x] Cron-планировщик цепочек — ежедневно проверяет `last_order_date` активных цепочек и ставит клиентские напоминания в очередь
- [x] Rate limiting на /auth
- [x] Audit log для действий партнёров
- [ ] Парсер каталога Greenway — селекторы-заглушки, требуют уточнения после доступа к реальной разметке сайта / личного кабинета
- [ ] Cron job для ежедневного обновления каталога
- [ ] Security review (JWT/bcrypt hardening, CORS)
- [ ] Docker production deployment (SSL, Nginx, backups)

Полный и приоритизированный список — в `TODO.md`.
