# Greenway Bot MVP

Telegram-бот для партнёров Greenway (MLM CRM). См. полную спецификацию в `greenway_bot_mvp_prompt.md` и актуальный список задач в `TODO.md`.

## Быстрый старт

```bash
npm install
cp .env.example .env   # заполните BOT_TOKEN и остальные переменные
npm run db:init        # инициализирует SQLite схему в ./data
npm start               # запускает REST API (порт 3000)
npm run bot              # запускает Telegram-бота (отдельный процесс)
npm run worker           # запускает воркер уведомлений (обработка очередей Bull)
```

Redis обязателен для очередей уведомлений (`npm run worker`, создание дедлайнов):

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
  scheduler/    — cron-задачи (проверка цепочек [приостановлено], синк каталога [приостановлено])
  greenway/     — интеграция с личным кабинетом Greenway (pyapi.greenwaystart.com): клиент API, шифрование токенов, синк каталога товаров
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
- [x] Telegram-бот: регистрация с согласием на обработку ПД (ФЗ-152), главное меню, PV-Подборщик, сроки (создание через `/newdeadline`, изменение остатка PV), настройки (тумблеры, добавление клиента, удаление всех данных). Сессия хранится в памяти процесса бота и теряется при перезапуске, но партнёр не должен из-за этого проходить регистрацию заново — при первом же действии после перезапуска бот тихо переавторизует его по Telegram ID (см. `src/bot/session.js`)
- [x] Уведомления по дедлайнам через Bull Queue (-72ч/-24ч/-2ч/0ч) + worker для отправки в Telegram
- [ ] 🛑 «Мои цепочки» ПРИОСТАНОВЛЕНО (25.09.2026, по решению пользователя) — фича зависит от `clients.last_order_date`, которое ничем не заполняется без синка заказов из личного кабинета Greenway (которого пока нет). Показывать не работающую по сути фичу не стали: кнопка убрана из главного меню, `registerChainsHandler` и `startChainsCron` закомментированы (см. `src/bot/index.js`, `src/index.js`) — код (`src/bot/handlers/chains.js`, `chainsService.js`, `/api/v1/chains/*`) оставлен нетронутым для быстрого возврата, когда появится синк заказов
- [x] Rate limiting на /auth
- [x] Audit log для действий партнёров
- [x] Security review (helmet, CORS allowlist, JWT_SECRET проверка при старте, rate limiting расширен, SQL injection аудит пройден)
- [x] Docker production deployment (SSL/Nginx пример конфига, healthcheck'и, backup-скрипт SQLite — см. раздел «Деплой» ниже)
- [x] Каталог товаров Greenway — найден и подключён через `pyapi.greenwaystart.com` (не нужен HTML-скрейпинг), ежедневный cron синка — см. раздел «Интеграция с Greenway» ниже
- [x] Обновление каталога из PDF — партнёр присылает боту PDF-каталог Greenway файлом, бот разбирает его и обновляет `products` — см. раздел «Обновление каталога из PDF» ниже
- [ ] Автоматическое подключение аккаунта партнёра (логин через pyapi) — эндпоинт логина ещё не подтверждён, пока только ручное подключение токена

Полный и приоритизированный список — в `TODO.md`.

## Интеграция с Greenway (pyapi.greenwaystart.com)

Личный кабинет `greenwayglobal.com` — SPA поверх JSON API на отдельном домене `pyapi.greenwaystart.com`. Каталог товаров, история заказов, финансы и бизнес-аналитика партнёра (команда/квалификация/PRO-бонус) — всё через этот API, авторизация заголовком `Authorization: Bearer <accessToken>`.

Эндпоинт логина ещё не подтверждён (см. `TODO.md`), поэтому пока используется временный мост — токен получают вручную через DevTools браузера и кладут в БД:

```bash
# 1. Сгенерировать ключ шифрования (один раз, в .env как GREENWAY_TOKEN_ENC_KEY)
openssl rand -hex 32

# 2. Получить accessToken вручную (DevTools → Console на странице greenwayglobal.com,
#    пользователь уже залогинен):
#    const token = document.cookie.match(/accessToken=([^;]+)/)[1];
#    console.log(decodeURIComponent(token));

# 3. Подключить токен к партнёру в БД бота (partner_id — id из таблицы partners,
#    gw_partner_id — user.id из ответа auth/info/, НЕ видимый ID партнёра)
GW_MANUAL_ACCESS_TOKEN=<токен> npm run gw:connect -- <partner_id> <gw_partner_id>

# 4. Разовый синк каталога товаров (после подключения хотя бы одного аккаунта)
npm run gw:sync-catalog
```

После этого ежедневный cron (`PARSER_CRON` в `.env`) сам обновляет каталог через `src/scheduler/catalogCron.js`, используя первый активный `greenway_accounts` как сервисный токен.

## Обновление каталога из PDF

Пока автосинк с `pyapi.greenwaystart.com` приостановлен (см. TODO.md), каталог товаров (`products`) можно обновить вручную: партнёр присылает боту официальный PDF-каталог Greenway файлом (просто прикрепить, без команды), и бот сам его разбирает и обновляет базу.

Как это работает:

1. Бот скачивает файл из Telegram и передаёт его в API (`POST /api/v1/catalog/import-pdf`, требует авторизации партнёра).
2. `src/catalog/pdfCatalogParser.js` разбирает PDF: каталог — двухколоночная вёрстка без разметки таблиц, поэтому парсер ориентируется на начертания шрифтов внутри PDF (жирность у названия товара, у артикулов и у строки цены/PV своя, устойчиво повторяется на всех страницах).
3. `src/catalog/pdfCatalogSync.js` разворачивает каждую карточку товара в отдельную строку на артикул (разные цвета/варианты — разные строки с одинаковыми названием/ценой/PV) и делает upsert в `products` с `greenway_id` вида `pdf-<артикул>` — не пересекается с числовыми id из pyapi-синка. Если товаров распозналось подозрительно мало (< 30), импорт отклоняется, чтобы не затереть каталог не тем файлом.

Каждая карточка товара в PDF кликабельна — ссылка на страницу товара на greenwayglobal.com. Парсер сопоставляет эти ссылки с товарами по положению на странице (прямоугольник ссылки накрывает карточку) и сохраняет в `products.product_url`. PV-Подборщик (`📊 PV-Подборщик` в боте) показывает эту ссылку под каждым товаром в подборке, если она есть. Покрытие — около 85% товаров: там, где в название "склеился" маркетинговый заголовок раздела (см. ограничение про наборы ниже), привязка ссылки может не сработать — не критично, просто не будет ссылки у этого товара.

Ограничения:

- Файлы тяжелее 20 МБ требуют self-hosted Bot API сервер — см. раздел ниже.
- Обновить каталог сейчас может любой зарегистрированный партнёр (каталог общий для всех). Если это нежелательно, стоит добавить проверку на партнёра-администратора в `src/bot/handlers/catalog.js` / `src/api/routes/catalog.js`.
- Названия части товаров-«наборов» с несколькими вкусами/ароматами могут прийти слегка неаккуратно склеенными (в PDF у них нет привычного разделения название/варианты) — это не влияет на цену/PV/артикул, только на текст названия.

### Self-hosted Bot API сервер (снимает лимит в 20 МБ)

Облачный `api.telegram.org` не отдаёт боту (`getFile`) файлы тяжелее 20 МБ — это ограничение самого Telegram, а не кода бота. Реальные PDF-каталоги Greenway с фотографиями товаров легко превышают этот размер (например, полный каталог на 199 страниц — около 37 МБ). Чтобы партнёры могли присылать такие файлы напрямую, поднимите свой [self-hosted Bot API сервер](https://github.com/tdlib/telegram-bot-api).

⚠️ **Важный нюанс, подтверждённый на практике**: сам по себе self-hosted сервер лимит в 20 МБ на `getFile` **не снимает** — он молча ведёт себя как облако, пока не запущен с флагом `--local`. Только `--local` реально поднимает потолок до ~2000 МБ. В этом режиме `getFile` возвращает не HTTP-ссылку на файл, а путь к нему на диске — поэтому боту нужен доступ к тому же диску, что и у `telegram-bot-api` (общий volume; в `docker/docker-compose.yml` это уже настроено). Код бота (`src/bot/handlers/catalog.js`) сам определяет, что перед ним путь на диске, а не ссылка, и читает файл напрямую.

1. Получите `api_id`/`api_hash` на [my.telegram.org/apps](https://my.telegram.org/apps) (раздел «API development tools») — это отдельные от `BOT_TOKEN` учётные данные приложения, привязанные к вашему телефонному номеру. Их может получить только владелец аккаунта — сгенерировать их за вас нельзя.
2. Впишите их в `.env` вместе с `TELEGRAM_LOCAL=1`:
   ```bash
   TELEGRAM_API_ID=...
   TELEGRAM_API_HASH=...
   TELEGRAM_LOCAL=1
   ```
3. Укажите адрес self-hosted сервера в `TELEGRAM_API_ROOT`:
   - при запуске через `docker compose` (сервис `telegram-bot-api` уже есть в `docker/docker-compose.yml`, volume с ним уже расшарен с `bot`):
     ```bash
     TELEGRAM_API_ROOT=http://telegram-bot-api:8081
     ```
   - при запуске бота напрямую на сервере, где отдельно поднят `telegram-bot-api` **на той же машине** (в `--local` режиме бот должен читать файлы с локального диска, поэтому сервер и бот обязаны быть на одном хосте):
     ```bash
     TELEGRAM_API_ROOT=http://localhost:8081
     ```
4. Перезапустите **и пересоздайте** контейнеры, а не просто перезапустите — Docker Compose не подхватывает изменения `.env` в уже запущенные контейнеры сами по себе:
   ```bash
   docker compose -f docker/docker-compose.yml up -d --force-recreate
   ```
   (для bare-metal — поднимите `telegram-bot-api` отдельно с флагом `--local` по [официальной инструкции](https://github.com/tdlib/telegram-bot-api#usage) и перезапустите `npm run bot`).
5. Проверьте, что флаг реально применился — в логе `telegram-bot-api` должна появиться строка запуска с `--local`:
   ```bash
   docker compose -f docker/docker-compose.yml logs telegram-bot-api
   ```

Если `TELEGRAM_API_ROOT` не задан (или равен `https://api.telegram.org` по умолчанию) — бот продолжает работать как раньше, просто с лимитом Telegram в 20 МБ на файлы. Собственный потолок бота сверху (`MAX_PDF_UPLOAD_MB` в `.env`, по умолчанию 150 МБ) действует независимо от режима self-hosted сервера — это защита от случайно присланного гигантского файла.

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
