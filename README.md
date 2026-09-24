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
- [x] Docker production deployment (SSL/Nginx пример конфига, healthcheck'и, backup-скрипт SQLite — см. раздел «Деплой» ниже)

Полный и приоритизированный список — в `TODO.md`.

## Деплой

### Docker

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

Сервисы `app` и `redis` снабжены Docker healthcheck'ами (`app` — `curl http://localhost:3000/health`, `redis` — `redis-cli ping`), статус смотрите через `docker compose ps` или `docker inspect --format='{{.State.Health.Status}}' <container>`.

### Nginx + SSL (Let's Encrypt)

Пример конфига — `docker/nginx.conf.example` (reverse proxy на `app:3000`/`127.0.0.1:3000`, с местом под сертификаты).

1. Установите nginx и certbot на сервере:
   ```bash
   sudo apt-get install -y nginx certbot python3-certbot-nginx
   ```
2. Скопируйте пример конфига и поправьте `server_name`:
   ```bash
   sudo cp docker/nginx.conf.example /etc/nginx/sites-available/greenway-bot.conf
   sudo ln -s /etc/nginx/sites-available/greenway-bot.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. Получите сертификат Let's Encrypt (webroot или через certbot-плагин nginx):
   ```bash
   sudo certbot --nginx -d example.com
   # или, если используется webroot из примера конфига:
   sudo certbot certonly --webroot -w /var/www/certbot -d example.com
   ```
4. Перезапустите nginx после выпуска/обновления сертификата:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
   Certbot по умолчанию сам настраивает автопродление сертификата (systemd timer / cron); `nginx -s reload` при этом можно добавить в `--deploy-hook`.

### Backup SQLite

Скрипт `scripts/backup-db.sh` делает согласованный снимок SQLite-базы (через `sqlite3 <db> ".backup <dest>"`, либо запасной вариант с WAL checkpoint + копированием файла) в директорию `backups/` и удаляет бэкапы старше `BACKUP_RETENTION_DAYS` дней (по умолчанию 14).

```bash
chmod +x scripts/backup-db.sh   # уже исполняемый в репозитории
SQLITE_PATH=./data/greenway.db BACKUP_DIR=./backups BACKUP_RETENTION_DAYS=14 ./scripts/backup-db.sh
```

Пример строки для cron (ежедневно в 03:30):

```
30 3 * * * cd /path/to/MLMBot && SQLITE_PATH=./data/greenway.db BACKUP_DIR=./backups BACKUP_RETENTION_DAYS=14 ./scripts/backup-db.sh >> ./backups/backup.log 2>&1
```
