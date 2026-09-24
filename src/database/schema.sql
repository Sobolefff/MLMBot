-- Партнёры
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  greenway_id TEXT UNIQUE,
  greenway_rank TEXT DEFAULT 'S1',
  consent_data_processing_at DATETIME,
  consent_notifications_at DATETIME,
  timezone TEXT DEFAULT 'Europe/Moscow',
  notify_time TEXT DEFAULT '09:00',
  notifications_enabled BOOLEAN DEFAULT 1,
  chains_enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active BOOLEAN DEFAULT 1
);

-- Клиенты
CREATE TABLE IF NOT EXISTS clients (
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
  consent_data_processing_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  UNIQUE(partner_id, phone)
);

-- Товары (каталог Greenway)
CREATE TABLE IF NOT EXISTS products (
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

-- Заказы (история)
CREATE TABLE IF NOT EXISTS sales (
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

-- Дедлайны/сроки
CREATE TABLE IF NOT EXISTS deadlines (
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

-- Цепочки продаж
CREATE TABLE IF NOT EXISTS chains (
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

-- Уведомления
CREATE TABLE IF NOT EXISTS notifications (
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

-- Логи аудита
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,
  user_type TEXT,
  action TEXT,
  entity TEXT,
  entity_id INTEGER,
  details TEXT
);

-- Учётные данные партнёра для личного кабинета Greenway (pyapi.greenwaystart.com).
-- Токены хранятся зашифрованными (см. src/greenway/tokenCrypto.js) — здесь только шифротекст.
CREATE TABLE IF NOT EXISTS greenway_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL UNIQUE,
  gw_partner_id TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at DATETIME,
  last_synced_at DATETIME,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id)
);

-- Ежедневный снимок ключевых бизнес-показателей партнёра из pyapi (main-view),
-- т.к. сам личный кабинет сравнивает только 2 периода за раз — история нужна боту.
CREATE TABLE IF NOT EXISTS greenway_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL,
  captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  qualification TEXT,
  rank TEXT,
  lo REAL,
  lgo REAL,
  sgo REAL,
  first_line_total INTEGER,
  first_line_active INTEGER,
  clients_total INTEGER,
  clients_with_orders INTEGER,
  raw_json TEXT,
  FOREIGN KEY (partner_id) REFERENCES partners(id)
);

CREATE INDEX IF NOT EXISTS idx_clients_partner_id ON clients(partner_id);
CREATE INDEX IF NOT EXISTS idx_clients_last_order_date ON clients(last_order_date);
CREATE INDEX IF NOT EXISTS idx_sales_client_id ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_partner_id ON sales(partner_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_partner_id ON deadlines(partner_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_status ON deadlines(status);
CREATE INDEX IF NOT EXISTS idx_chains_partner_id ON chains(partner_id);
CREATE INDEX IF NOT EXISTS idx_chains_client_id ON chains(client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_for ON notifications(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_greenway_snapshots_partner_id ON greenway_snapshots(partner_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
