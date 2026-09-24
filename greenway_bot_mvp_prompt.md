# 🤖 ПРОМТ: Разработка MVP Бота Greenway CRM

**Дата**: 24 сентября 2026  
**Язык**: Русский  
**Целевая аудитория**: Партнёры Greenway (MLM)  
**Сроки**: 3-4 недели  

---

## 📋 СОДЕРЖАНИЕ

1. [Обзор проекта](#обзор-проекта)
2. [Архитектура системы](#архитектура-системы)
3. [User Flow - Партнёр](#user-flow--партнёр)
4. [User Flow - Клиент](#user-flow--клиент)
5. [Требования безопасности](#требования-безопасности)
6. [Спецификация БД](#спецификация-бд)
7. [API и интеграции](#api-и-интеграции)
8. [Функциональные требования](#функциональные-требования)
9. [Дорожная карта разработки](#дорожная-карта-разработки)
10. [Оркестрация субагентов](#оркестрация-субагентов)
11. [Tech Stack и инфраструктура](#tech-stack-и-инфраструктура)

---

## 🎯 ОБЗОР ПРОЕКТА

### Чему служит бот?
Telegram-бот для партнёров Greenway, который помогает им эффективнее продавать и управлять своими клиентами. Бот не продаёт товары сам — он помогает партнёру организовать работу с клиентами через автоматизацию, уведомления и рекомендации.

### Ключевые ограничения Greenway
- **Партнёры НЕ могут давать скидки** — цены зафиксированы Greenway
- **Заказы идят через Greenway** — бот только уведомляет и помогает выбрать товары
- **Рефлинки партнёра** — используются стандартные ссылки Greenway
- **Комиссии партнёра** — 20-38% + бонусы по системе (не меняется в боте)

### MVP Scope (обязательные фичи)
1. **PV-Подборщик** — расчёт комбинаций товаров для достижения целевого PV
2. **Цепочки продаж** — автоматические уведомления клиентам через 10+ дней без заказа
3. **Умные уведомления** — напоминания партнёру о сроках с эскалацией (-72ч, -24ч, -2ч, +0ч)

### Phase 2 (отложить на потом)
- AI-рекомендации товаров на основе истории клиента
- Gamification (лояльность клиентов, точки, уровни)
- Личная витрина партнёра (упрощённая)
- Live Chat (связь партнёра с клиентом через бот)

---

## 🏗️ АРХИТЕКТУРА СИСТЕМЫ

### Общая схема

```
┌─────────────────────────────────────────────────────────────┐
│                    TELEGRAM USERS                            │
│            (Partners + Clients)                              │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
   ┌──────────┐           ┌──────────────┐
   │ Partner  │           │ Client       │
   │ (Chat ID)│           │ (Chat ID)    │
   └──────────┘           └──────────────┘
        │                       │
        └───────────┬───────────┘
                    ▼
        ┌─────────────────────┐
        │ Telegram Bot        │
        │ (telegraf.js)       │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Backend Service     │
        │ (Node.js + Express) │
        └──────────┬──────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌─────────┐  ┌──────────┐  ┌──────────┐
│ PV-Calc │  │ Chains   │  │ Notifs   │
│ Service │  │ Service  │  │ Service  │
└────┬────┘  └────┬─────┘  └─────┬────┘
     │            │              │
     └────────────┼──────────────┘
                  ▼
        ┌─────────────────────┐
        │ SQLite DB           │
        │ + Redis (queue)     │
        └─────────────────────┘
                  │
        ┌─────────▼──────────┐
        │ Greenway Catalog   │
        │ (парсер сайта)     │
        └────────────────────┘
```

### Слои архитектуры

**Layer 1: Telegram Bot**
- Обработка входящих сообщений от партнёров и клиентов
- Маршрутизация команд (`/start`, `/pv`, `/chains`, `/notify`)
- Отправка уведомлений (текст, кнопки, инлайн-клавиатура)

**Layer 2: Backend API**
- REST API для логики бота
- Endpoints для каждого сервиса (PV-Calc, Chains, Notifications)
- Аутентификация по Telegram ID + Session Token
- Парсинг каталога Greenway (ежедневно, cron job)

**Layer 3: Business Logic Services**
- **PV-Calc Service** — динамическое программирование для подбора товаров
- **Chains Service** — отслеживание активности клиентов, триггеры
- **Notifications Service** — Bull Queue для расписания уведомлений

**Layer 4: Data Layer**
- SQLite (локальное хранилище)
- Redis (очередь задач, кэш)
- Таблицы: `partners`, `clients`, `sales`, `products`, `deadlines`, `notifications`

**Layer 5: External Integrations**
- Greenway сайт (парсинг Playwright)
- Telegram API (telegraf.js)

---

## 👥 USER FLOW – ПАРТНЁР

### Сценарий 1: Первый запуск (регистрация)

```
1. Партнёр пишет /start боту
2. Бот запрашивает подтверждение (Telegram ID = ID партнёра в Greenway)
3. Партнёр подтверждает ФИ и номер телефона
4. Бот сохраняет данные в DB (table: partners)
5. Партнёр видит главное меню:
   ├─ 📊 PV-Подборщик
   ├─ 🔔 Мои цепочки
   ├─ ⏰ Сроки
   ├─ ⚙️ Настройки
   └─ ❓ Помощь
```

### Сценарий 2: Использование PV-Подборщика

```
Партнёр кликает на "📊 PV-Подборщик"

Бот: "Какую сумму вы хотите собрать?"
Партнёр: 5000 RUB (или 150 PV)

Бот парсит каталог и находит 3 оптимальные комбинации:
─────────────────────────────────────────────────────────
Вариант 1️⃣  | Сумма: 4,950 RUB | PV: 148 | Товары: Таблица
Вариант 2️⃣  | Сумма: 5,020 RUB | PV: 152 | Товары: Таблица
Вариант 3️⃣  | Сумма: 4,890 RUB | PV: 145 | Товары: Таблица

[Скопировать в буфер] [Отправить клиенту] [Поиск заново]

Партнёр выбирает вариант → Бот показывает детали:
  ├─ Полные названия товаров (с ссылками на Greenway)
  ├─ Цены
  ├─ PV каждого
  ├─ Сумму
  ├─ Ссылка для отправки клиенту
  └─ Кнопка "Поделиться в чат" (через Share)
```

### Сценарий 3: Управление клиентами и цепочками

```
Партнёр кликает на "🔔 Мои цепочки"

Бот показывает список:
Клиент: Иван Петров | Последний заказ: 7 дней назад
Клиент: Мария Сидорова | Последний заказ: 15 дней назад ⚠️
Клиент: Анна Корова | Последний заказ: 2 дня назад

Партнёр кликает на "Мария Сидорова"
─────────────────────────────────────────────────────────
Активировать цепочку? (отправлять уведомления через 10+ дней)
  ├─ ✅ Включить (будет уведомление, когда не куплено 10 дней)
  ├─ ℹ️ Показать рекомендации товаров Марии
  ├─ 🗑️ Удалить клиента
  └─ 📞 Позвать менеджера (live chat в Phase 2)
```

### Сценарий 4: Напоминание о сроках

```
Партнёр устанавливает дедлайн:
"Собрать 50 PV до 25.09 (завтра в 18:00)"

Бот создаёт расписание уведомлений:
  - 25.09 @ 18:00-72ч (14:00): "3 дня до дедлайна! Осталось собрать 25 PV"
  - 25.09 @ 18:00-24ч (18:00): "Последние 24 часа! Срочно!"
  - 25.09 @ 18:00-2ч (16:00): "⚠️ КРИТИЧНО! Осталось 2 часа"
  - 25.09 @ 18:00 (18:00): "❌ Дедлайн истёк. Результат: собрано 40 PV из 50"

Каждое уведомление идёт с кнопкой:
[🔄 Пересчитать PV] [📊 Открыть PV-Подборщик]
```

### Сценарий 5: Настройки

```
Партнёр: "⚙️ Настройки"

Бот показывает форму:
┌─ Мой профиль
│  ├─ ФИ: Иван Иванов
│  ├─ Телефон: +7 920 123 45 67
│  ├─ ID Greenway: G123456
│  └─ Ранк: L1
│
├─ Уведомления
│  ├─ ☑️ Включены уведомления о сроках
│  ├─ ☑️ Включены напоминания о цепочках
│  ├─ ⏰ Время отправки (по умолчанию 09:00)
│  └─ 🌍 Часовой пояс (Europe/Moscow)
│
├─ Приватность
│  ├─ 📊 Кто видит мои статистику? (только я)
│  ├─ 🔒 Двухфакторная аутентификация (выключено)
│  └─ 🗑️ Удалить все мои данные
│
└─ [Сохранить]
```

---

## 👤 USER FLOW – КЛИЕНТ

### Сценарий 1: Получение ссылки на товары

```
Партнёр отправляет клиенту:
"Привет! Вот рекомендуемые товары: [кнопка 'Посмотреть товары']"

Клиент кликает → открывается сообщение от бота:
─────────────────────────────────────────────────────────
Вот товары для вас (рекомендовано партнёром):

📦 Крем для лица Supreme (799 RUB) | ⭐⭐⭐⭐⭐
📦 Витамины Supreme Plus (1,499 RUB) | ⭐⭐⭐⭐
📦 Маска для волос (599 RUB) | ⭐⭐⭐⭐⭐

Общая сумма: 2,897 RUB
[👉 КУПИТЬ В GREENWAY] (переход по реферальной ссылке партнёра)
[❌ Закрыть]
```

### Сценарий 2: Автоматическое напоминание (цепочка)

```
Клиент не заказывал 10 дней.
Партнёр активировал цепочку для этого клиента.

Клиент получает сообщение от бота:
─────────────────────────────────────────────────────────
👋 Привет! Давно вас не видели!

Вот что популярно прямо сейчас:
📦 Новая сыворотка для кожи (899 RUB)
📦 Набор витаминов (2,499 RUB)

[💚 ПОСМОТРЕТЬ КАТАЛОГ] → каталог в приложении Greenway
[☎️ ПОЗВАТЬ ПАРТНЁРА] → уведомление партнёру
[❌ Не показывать мне это]
```

### Сценарий 3: История заказов (профиль клиента)

```
Клиент может посмотреть в боте:
├─ 📝 Мои заказы
│  ├─ 15.09 | 2,500 RUB | 3 товара
│  ├─ 10.09 | 1,899 RUB | 2 товара
│  └─ 05.09 | 3,200 RUB | 5 товаров
│
├─ 💚 Мои баллы лояльности: 150 points (Phase 2)
├─ 👤 Мой партнёр: Иван Иванов
└─ [⚙️ Настройки]
```

---

## 🔐 ТРЕБОВАНИЯ БЕЗОПАСНОСТИ

### ФЗ-152 (Защита персональных данных в России)

**1. Согласие на обработку данных**
- При регистрации партнёр и клиент ОБЯЗАТЕЛЬНО принимают:
  ```
  ☐ Я согласен на обработку моих персональных данных
  ☐ Я согласен получать уведомления от этого бота
  ☐ Я ознакомился с Политикой конфиденциальности
  ```
- Логируется дата и время согласия

**2. Виды хранимых данных**
- ФИ, номер телефона, Telegram ID
- История заказов (дата, сумма, товары)
- Данные активности (последний заказ, сроки)

**3. Где хранятся данные**
- SQLite база на собственном сервере (РФ рекомендуется)
- Никаких данных в облаках без согласия
- Redis только для временных данных (сессии, очередь)

**4. Время хранения**
- Активные клиенты: неограниченно
- Неактивные 2+ года: право на удаление
- После запроса удаления: немедленно

**5. Шифрование**
- Все пароли: bcrypt (salt rounds: 10)
- Telegram tokens: переменные окружения (.env)
- БД не шифруется (хранится на своём сервере)

**6. Доступ к данным**
- Партнёр видит только своих клиентов
- Клиент видит только свою историю
- Администратор имеет audit log доступ

### Аутентификация и авторизация

**Для Партнёра:**
```
1. Telegram ID (первичный идентификатор)
2. Session Token (JWT, 7 дней)
   ├─ partner_id
   ├─ telegram_id
   ├─ issued_at
   ├─ expires_at
   └─ signature (HMAC-SHA256)
```

**Для Клиента:**
```
1. Telegram ID
2. Partner_ID (привязка к партнёру)
3. Temp Token (действует только в контексте бота, 30 дней)
```

### Audit Log

Логировать ОБЯЗАТЕЛЬНО:
- Вход/выход пользователя
- Создание/удаление клиента
- Изменение сроков
- Отправка уведомлений
- Доступ к данным другого пользователя (попытка)
- Ошибки приложения

---

## 🗄️ СПЕЦИФИКАЦИЯ БД

### SQLite Schema (ключевые таблицы)

```sql
-- Таблица партнёров
CREATE TABLE partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  greenway_id TEXT UNIQUE,
  greenway_rank TEXT DEFAULT 'S1',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active BOOLEAN DEFAULT 1
);

-- Таблица клиентов
CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL,
  telegram_id INTEGER,
  name TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'active',
  total_purchases REAL DEFAULT 0,
  total_pv REAL DEFAULT 0,
  last_order_date DATETIME,
  loyalty_points INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  UNIQUE(partner_id, phone)
);

-- Таблица товаров (каталог Greenway)
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  greenway_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  pv INTEGER NOT NULL,
  category TEXT,
  description TEXT,
  image_url TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_available BOOLEAN DEFAULT 1
);

-- Таблица заказов (история)
CREATE TABLE sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  partner_id INTEGER NOT NULL,
  total_amount REAL NOT NULL,
  total_pv INTEGER NOT NULL,
  order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  greenway_order_id TEXT,
  items_count INTEGER,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (partner_id) REFERENCES partners(id)
);

-- Таблица дедлайнов/сроков
CREATE TABLE deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL,
  title TEXT,
  target_pv INTEGER,
  current_pv INTEGER DEFAULT 0,
  deadline_at DATETIME NOT NULL,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id)
);

-- Таблица цепочек продаж
CREATE TABLE chains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  trigger_days INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT 1,
  last_notified_at DATETIME,
  notification_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Таблица уведомлений
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER,
  client_id INTEGER,
  type TEXT,
  title TEXT,
  body TEXT,
  is_sent BOOLEAN DEFAULT 0,
  scheduled_for DATETIME,
  sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Таблица логов аудита
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  user_type TEXT,
  action TEXT,
  entity TEXT,
  entity_id INTEGER,
  details TEXT
);
```

---

## 🔌 API ENDPOINTS

**Base URL:** `http://localhost:3000/api/v1`

### Auth Endpoints
```
POST /auth/register
  Body: {telegram_id, name, phone, greenway_id}
  Response: {partner_id, session_token}

POST /auth/login
  Body: {telegram_id}
  Response: {session_token, expires_at}
```

### Partner Endpoints
```
GET /partners/me
  Headers: {Authorization: "Bearer <token>"}

GET /partners/:id/clients
  Headers: {Authorization: "Bearer <token>"}

POST /partners/:id/clients
  Headers: {Authorization: "Bearer <token>"}
  Body: {name, phone}
```

### PV-Calculator Endpoints
```
POST /pv-calc/search
  Headers: {Authorization: "Bearer <token>"}
  Body: {target_pv: 150, max_price: 5000}
  Response: {results: [{total_pv, total_price, items: []}]}

GET /pv-calc/products
  Query: {category: "skincare", search: "крем"}
```

### Chains Endpoints
```
GET /chains/list
  Headers: {Authorization: "Bearer <token>"}

POST /chains/activate
  Body: {client_id, trigger_days: 10}

DELETE /chains/:id
```

### Deadlines Endpoints
```
POST /deadlines/create
  Body: {title, target_pv, deadline_at}
  Response: {deadline_id, notifications_scheduled: 4}

GET /deadlines/list
  Headers: {Authorization: "Bearer <token>"}

PUT /deadlines/:id
  Body: {current_pv: 120}
```

---

## 📋 ФУНКЦИОНАЛЬНЫЕ ТРЕБОВАНИЯ

### Требование 1: PV-Подборщик

**Назначение:** Быстро найти комбинацию товаров для достижения целевого PV/суммы

**Входные данные:**
- target_pv (число) ИЛИ target_price (число)
- max_items (опционально, по умолчанию 10)
- excluded_categories (опционально)

**Алгоритм:**
- Используем Dynamic Programming (unbounded knapsack)
- Ищем 3 оптимальные комбинации (разные по структуре)
- Время выполнения: < 500ms

**Выходные данные:**
```json
{
  "results": [
    {
      "id": "combo_1",
      "total_pv": 148,
      "total_price": 4950,
      "items": [
        {"product_id": 123, "name": "Крем", "pv": 50, "price": 1500}
      ]
    }
  ]
}
```

### Требование 2: Цепочки продаж

**Логика:**
```
Когда: client.last_order_date < TODAY - trigger_days
Что: Отправить сообщение с рекомендациями
Где: В Telegram клиенту
Как часто: Один раз за период
```

**Рекомендации:**
- ТОП-3 товара из любимых категорий клиента
- С кнопкой "Открыть каталог" → deeplink в Greenway

### Требование 3: Умные уведомления

**График уведомлений для дедлайна:**
```
deadline_at = 25.09 18:00

1. За 72 часа: 22.09 @ 18:00
2. За 24 часа: 24.09 @ 18:00
3. За 2 часа: 25.09 @ 16:00
4. В момент: 25.09 @ 18:00
```

**Реализация:**
- Bull Queue для планирования
- Актуальное PV из последнего заказа
- Если достигнут раньше → успешное уведомление, отмена остальных

---

## 🛣️ ДОРОЖНАЯ КАРТА РАЗРАБОТКИ

### Phase 1 (MVP) — 3-4 недели

**Неделя 1-2: Инфраструктура + Core (10 дней)**
- [ ] Инициализировать Node.js проект
- [ ] Подключить SQLite3, Redis
- [ ] Создать все таблицы
- [ ] Парсер каталога Greenway + cron job
- [ ] Telegram бот core + регистрация

**Неделя 2-3: PV-Калькулятор (10 дней)**
- [ ] Реализовать DP алгоритм
- [ ] API endpoints для PV-Calc
- [ ] Интеграция с ботом
- [ ] Тестирование и оптимизация

**Неделя 3-4: Chains + Notifications (10 дней)**
- [ ] Логика цепочек
- [ ] Bull Queue для расписания
- [ ] Уведомления партнёру (-72ч, -24ч, -2ч, +0ч)
- [ ] Полное тестирование MVP

### Phase 2 (Q4 2026) — 2 недели
- AI-рекомендации
- Gamification
- Live Chat
- Личная витрина

### Phase 3 (Q1 2027) — 2-3 недели
- 2FA
- Экспорт отчётов
- Dashboard аналитики
- Multi-язычность

---

## 🎭 ОРКЕСТРАЦИЯ СУБАГЕНТОВ

### 📋 Процесс Setup Скилов

**ДО НАЧАЛА РАБОТЫ СУБАГЕНТОВ:**

1. **Основной разработчик выполняет:**
   ```bash
   # В Claude Code: подключить skills.sh
   /list-skills  # Посмотреть доступные скилы
   
   # Для каждого субагента будут использованы встроенные скилы Claude Code:
   # - Glob (поиск файлов)
   # - Grep (поиск в коде)
   # - Read (чтение файлов)
   # - Edit (редактирование файлов)
   # - Write (создание файлов)
   # - Bash (выполнение команд)
   ```

2. **При создании каждого субагента:** передать в промт набор скилов, которые ему нужны

3. **Субагент получит доступ к:** Artifact (для просмотра готового кода/документов)

---

### Субагент 1: Backend Architect

**Скилы:**
- ✅ Node.js ecosystem (встроено)
- ✅ Express.js framework (встроено)
- ✅ SQLite3 (встроено)
- ✅ Redis (встроено)
- ✅ API design patterns (встроено)

**Задачи:**
- Создание backend структуры
- Написание всех API endpoints (routes, controllers, middleware)
- Парсинг каталога Greenway (Playwright)
- Оптимизация БД запросов
- Написание миграций и seeders

**Промт для субагента:**
> Используй встроенные Node.js, Express и SQLite скилы. Cоздай структуру backend с разделением на routes → controllers → services → database.

---

### Субагент 2: Bot Developer

**Скилы:**
- ✅ telegraf.js (Telegram Bot API)
- ✅ JavaScript/Node.js (встроено)
- ✅ Event handling (встроено)
- ✅ Async/await patterns (встроено)

**Задачи:**
- Интеграция с Backend API (HTTP запросы)
- User flow & menu navigation (inline keyboards)
- Обработка сообщений, команд, callback queries
- Отправка уведомлений (text, photo, inline)
- Webhook обработка

**Промт для субагента:**
> Используй telegraf.js для создания Telegram бота. Интегрируй с Backend API через fetch/axios. Реализуй menu navigation с inline keyboards, обработку всех user intents.

---

### Субагент 3: Algorithm Specialist

**Скилы:**
- ✅ JavaScript/TypeScript (встроено)
- ✅ Dynamic Programming (математика, встроено)
- ✅ Jest (unit testing, встроено)
- ✅ Performance optimization (встроено)

**Задачи:**
- Реализация DP алгоритма (unbounded knapsack) для PV-подборщика
- Поиск 3 оптимальных комбинаций товаров
- Оптимизация до < 500ms execution time
- Написание comprehensive unit-тестов
- Бенчмарки и профилирование

**Промт для субагента:**
> Реализуй Dynamic Programming алгоритм для решения unbounded knapsack problem с целевым PV/ценой. Результат должен быть < 500ms. Покрой unit-тестами все граничные случаи.

---

### Субагент 4: QA Engineer

**Скилы:**
- ✅ Jest (unit testing, встроено)
- ✅ Supertest (API testing, встроено)
- ✅ Mocha (встроено)
- ✅ Test-driven development (встроено)

**Задачи:**
- Unit-тесты backend (services, utils)
- Integration-тесты (API endpoints, БД)
- E2E-тесты Telegram бота (симуляция пользователя)
- Regression testing
- Баг-трэкинг и отчёты

**Промт для субагента:**
> Напиши comprehensive test suite для всех компонентов. Unit-тесты для logic, integration для API и БД, E2E для бота. Минимум 80% code coverage.

---

### Субагент 5: Security Auditor

**Скилы:**
- ✅ OWASP Top 10 (встроено в knowledge)
- ✅ Cryptography basics (bcrypt, JWT, встроено)
- ✅ SQL injection / XSS / CSRF patterns (встроено)
- ✅ Code review & audit (встроено)
- ✅ Compliance (ФЗ-152, GDPR, встроено)

**Задачи:**
- Аудит аутентификации/авторизации (JWT, bcrypt)
- Анализ SQL injection уязвимостей
- Проверка XSS/CSRF валидации
- Проверка утечек данных в логах
- ФЗ-152 compliance checklist
- Security best practices (rate limiting, CORS, HTTPS)
- Penetration testing scenarios
- Security Policy документация

**Промт для субагента:**
> Выполни security audit всего кода. Проверь ФЗ-152 compliance, аутентификацию, SQL injection, XSS, CSRF. Дай recommendations по security hardening. Напиши Security Policy документ.

---

### Субагент 6: DevOps Engineer

**Скилы:**
- ✅ Docker & Docker Compose (встроено)
- ✅ Linux/Ubuntu administration (встроено)
- ✅ Nginx configuration (встроено)
- ✅ SSL/TLS (Let's Encrypt, встроено)
- ✅ Shell scripting (bash, встроено)
- ✅ Process management (systemd, PM2, встроено)

**Задачи:**
- Написание Dockerfile для Node.js приложения
- docker-compose.yml (app, redis, nginx)
- Скрипты развёртывания на Ubuntu 20.04
- Настройка Nginx как reverse proxy
- SSL сертификат (Let's Encrypt)
- Backup скрипты для БД
- Мониторинг (логирование, healthcheck)
- Disaster recovery план

**Промт для субагента:**
> Создай production-ready Docker setup с Nginx, SSL, backup automation. Напиши deployment scripts для Ubuntu 20.04. Добавь logging, healthchecks, disaster recovery procedures.

---

### 🔗 Как распределить Скилы при Запуске Субагентов

В Claude Code, при создании каждого субагента передавайте **в промте явно**:

```
Для Backend Architect:
/agent claude
> Создай backend структуру для Telegram CRM бота на Node.js + Express + SQLite...
> [вставить соответствующий раздел промта]

Для Bot Developer:
/agent claude
> Разработай Telegram бота используя telegraf.js...
> [вставить раздел Bot Developer]

И т.д. для каждого субагента...
```

**ИЛИ используйте встроенные инструменты Claude Code:**
```bash
# Проверить доступные скилы
claude skills list

# Инициализировать проект с нужными скилами
claude init --skills nodejs,typescript,docker
```

---

## 💻 TECH STACK

```
Backend:       Node.js 18+ + Express.js
Database:      SQLite3 + Redis
Bot Framework: telegraf.js
Parsing:       Playwright
Task Queue:    Bull Queue
Auth:          jsonwebtoken (JWT)
Validation:    Joi
Logging:       Winston
Tests:         Jest + Supertest
```

### Infrastructure

```
Server:        Ubuntu 20.04 LTS (собственный VPS)
Containerization: Docker + Docker Compose
Process Mgmt:  PM2 или systemd
Reverse Proxy: Nginx
SSL:           Let's Encrypt (certbot)
Backup:        Ежедневные бэкапы БД
```

### Directory Structure

```
greenway-bot/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── src/
│   ├── bot/
│   │   ├── handlers/
│   │   ├── keyboards/
│   │   └── index.js
│   ├── api/
│   │   ├── routes/
│   │   ├── services/
│   │   └── middleware/
│   ├── database/
│   │   ├── schema.sql
│   │   └── migrations/
│   ├── parsers/
│   │   └── greenway-parser.js
│   ├── utils/
│   └── config/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── package.json
└── README.md
```

---

## ✅ ИТОГОВЫЙ CHECKLIST ДЛЯ РАЗРАБОТЧИКА

- [ ] Все таблицы созданы и индексированы
- [ ] 100+ тестовых товаров в каталоге
- [ ] PV-алгоритм находит комбинации < 500ms
- [ ] Telegram бот отвечает на все команды
- [ ] Парсер обновляет каталог каждый день
- [ ] Notifications отправляются по расписанию
- [ ] Все логируется в audit_logs
- [ ] Нет утечек данных (проверить .env)
- [ ] Docker собирается без ошибок
- [ ] SSL сертификат установлен
- [ ] Backup БД работает ежедневно
- [ ] README содержит инструкции развёртывания
- [ ] Code review пройден

---

**Документ создан:** 24.09.2026  
**Версия:** 1.0 (MVP Specification)
