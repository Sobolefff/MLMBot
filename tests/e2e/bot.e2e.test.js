/**
 * E2E-тесты Telegram-бота.
 *
 * Идея: поднимаем реальный REST API (`createApp()`) на отдельном тестовом
 * порту с временной SQLite базой (как в tests/integration/api.test.js),
 * направляем `src/bot/apiClient.js` на этот сервер (он читает адрес из
 * `config.port`, поэтому просто выставляем `PORT` до первого require), и
 * собираем настоящий `Telegraf`-бот из реальных хендлеров
 * (`registerStartHandler`, `registerPvCalcHandler`, ...) — то есть той же
 * сборки, что и `src/bot/index.js`, но без `bot.launch()` (который полез бы
 * в реальный Telegram API и завис бы в тестах).
 *
 * Исходящие вызовы Telegram API (sendMessage/editMessageText/answerCbQuery)
 * перехватываются моком `Telegram.prototype.callApi`, чтобы не стучаться в
 * реальный Telegram, а просто собирать отправленные ботом сообщения для
 * проверок — таким образом мы симулируем реального пользователя, отправляя
 * `bot.handleUpdate(update)` с поддельными update-объектами Telegram.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.SQLITE_PATH = path.join(os.tmpdir(), `greenway-e2e-${Date.now()}.db`);
process.env.JWT_SECRET = 'test_secret';
process.env.BOT_TOKEN = 'test:bot-token';
process.env.PORT = String(4300 + Math.floor(Math.random() * 500));

const { Telegraf, Telegram, session } = require('telegraf');
const { createApp } = require('../../src/api/app');
const { getDb } = require('../../src/database/db');
const config = require('../../src/config');

const { registerStartHandler } = require('../../src/bot/handlers/start');
const { registerPvCalcHandler } = require('../../src/bot/handlers/pvCalc');
const { registerChainsHandler } = require('../../src/bot/handlers/chains');
const { registerDeadlinesHandler } = require('../../src/bot/handlers/deadlines');
const { registerSettingsHandler } = require('../../src/bot/handlers/settings');
const { closeQueue } = require('../../src/api/services/notificationsService');

let server;
let sentMessages;
let updateCounter = 0;
let messageIdCounter = 0;

function resetOutbox() {
  sentMessages = [];
}

function buildBot() {
  const bot = new Telegraf(config.botToken);
  bot.use(session());
  registerStartHandler(bot);
  registerPvCalcHandler(bot);
  registerChainsHandler(bot);
  registerDeadlinesHandler(bot);
  registerSettingsHandler(bot);
  bot.catch((err) => {
    // Surface handler errors loudly instead of swallowing them in tests.
    // eslint-disable-next-line no-console
    console.error('Bot error in test', err);
  });
  return bot;
}

function textUpdate(chatId, userId, text) {
  const isCommand = text.startsWith('/');
  return {
    update_id: ++updateCounter,
    message: {
      message_id: ++messageIdCounter,
      from: { id: userId, is_bot: false, first_name: 'Test', username: 'testuser' },
      chat: { id: chatId, type: 'private', first_name: 'Test' },
      date: Math.floor(Date.now() / 1000),
      text,
      ...(isCommand
        ? { entities: [{ offset: 0, length: text.split(' ')[0].length, type: 'bot_command' }] }
        : {}),
    },
  };
}

function callbackUpdate(chatId, userId, data) {
  return {
    update_id: ++updateCounter,
    callback_query: {
      id: String(++updateCounter),
      from: { id: userId, is_bot: false, first_name: 'Test', username: 'testuser' },
      message: {
        message_id: ++messageIdCounter,
        chat: { id: chatId, type: 'private', first_name: 'Test' },
        date: Math.floor(Date.now() / 1000),
        text: 'placeholder',
      },
      chat_instance: 'test-chat-instance',
      data,
    },
  };
}

function lastReplyText() {
  const last = [...sentMessages].reverse().find((m) => m.method === 'sendMessage' || m.method === 'editMessageText');
  return last ? last.text : undefined;
}

function allReplyTexts() {
  return sentMessages
    .filter((m) => m.method === 'sendMessage' || m.method === 'editMessageText')
    .map((m) => m.text);
}

beforeAll(() => {
  const app = createApp();
  server = app.listen(config.port);

  const db = getDb();
  db.prepare('INSERT INTO products (greenway_id, name, price, pv, category) VALUES (?, ?, ?, ?, ?)').run(
    'GW1',
    'Крем',
    799,
    24,
    'skincare'
  );
  db.prepare('INSERT INTO products (greenway_id, name, price, pv, category) VALUES (?, ?, ?, ?, ?)').run(
    'GW2',
    'Витамины',
    1499,
    45,
    'health'
  );

  jest.spyOn(Telegram.prototype, 'callApi').mockImplementation(async function mockCallApi(method, payload) {
    if (method === 'getMe') {
      return { id: 1, is_bot: true, first_name: 'TestBot', username: 'test_bot' };
    }
    if (method === 'answerCbQuery') {
      return true;
    }
    sentMessages.push({ method, ...payload });
    if (method === 'sendMessage' || method === 'editMessageText') {
      return {
        message_id: ++messageIdCounter,
        chat: { id: payload.chat_id },
        text: payload.text,
        date: Math.floor(Date.now() / 1000),
      };
    }
    return {};
  });
});

afterAll(async () => {
  jest.restoreAllMocks();
  await new Promise((resolve) => server.close(resolve));
  await closeQueue();
  getDb().close();
  fs.rmSync(process.env.SQLITE_PATH, { force: true });
  fs.rmSync(`${process.env.SQLITE_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.SQLITE_PATH}-shm`, { force: true });
});

beforeEach(() => {
  resetOutbox();
});

describe('E2E: регистрация партнёра через /start', () => {
  const bot = buildBot();
  const chatId = 5001;
  const userId = 9001;

  test('/start запрашивает согласие ФЗ-152', async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '/start'));
    expect(lastReplyText()).toMatch(/согласие на обработку персональных данных/i);
  });

  test('после согласия бот спрашивает ФИО', async () => {
    await bot.handleUpdate(callbackUpdate(chatId, userId, 'consent_accept'));
    expect(lastReplyText()).toMatch(/как вас зовут/i);
  });

  test('после ФИО бот спрашивает телефон', async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, 'Иван Иванов'));
    expect(lastReplyText()).toMatch(/номер телефона/i);
  });

  test('после телефона партнёр реально создаётся через REST API и получает главное меню', async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '+79991234567'));
    expect(lastReplyText()).toMatch(/регистрация завершена/i);

    const db = getDb();
    const partner = db.prepare('SELECT * FROM partners WHERE telegram_id = ?').get(userId);
    expect(partner).toBeDefined();
    expect(partner.name).toBe('Иван Иванов');
    expect(partner.phone).toBe('+79991234567');
  });

  test('отказ от согласия отдельного пользователя не регистрирует его', async () => {
    const declineChatId = 5099;
    const declineUserId = 9099;
    await bot.handleUpdate(textUpdate(declineChatId, declineUserId, '/start'));
    await bot.handleUpdate(callbackUpdate(declineChatId, declineUserId, 'consent_decline'));
    expect(lastReplyText()).toMatch(/не может продолжить регистрацию/i);

    const db = getDb();
    const partner = db.prepare('SELECT * FROM partners WHERE telegram_id = ?').get(declineUserId);
    expect(partner).toBeUndefined();
  });
});

describe('E2E: PV-Подборщик', () => {
  const bot = buildBot();
  const chatId = 5002;
  const userId = 9002;

  beforeAll(async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '/start'));
    await bot.handleUpdate(callbackUpdate(chatId, userId, 'consent_accept'));
    await bot.handleUpdate(textUpdate(chatId, userId, 'Петр PV-тестов'));
    await bot.handleUpdate(textUpdate(chatId, userId, '+79990000001'));
    resetOutbox();
  });

  test('запрашивает целевую сумму/PV', async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '📊 PV-Подборщик'));
    expect(lastReplyText()).toMatch(/какую сумму/i);
  });

  test('"5000 RUB" возвращает варианты комбинаций товаров', async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '5000 RUB'));
    const text = lastReplyText();
    expect(text).toMatch(/вариант 1/i);
    expect(text).toMatch(/PV:/);
  });
});

describe('E2E: цепочки — включение/выключение и удаление клиента', () => {
  const bot = buildBot();
  const chatId = 5003;
  const userId = 9003;
  let partnerId;

  beforeAll(async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '/start'));
    await bot.handleUpdate(callbackUpdate(chatId, userId, 'consent_accept'));
    await bot.handleUpdate(textUpdate(chatId, userId, 'Мария Цепочкина'));
    await bot.handleUpdate(textUpdate(chatId, userId, '+79990000002'));

    const db = getDb();
    partnerId = db.prepare('SELECT id FROM partners WHERE telegram_id = ?').get(userId).id;
    db.prepare('INSERT INTO clients (partner_id, name, phone, last_order_date) VALUES (?, ?, ?, ?)').run(
      partnerId,
      'Клиент Тестовый',
      '+79990000099',
      new Date(Date.now() - 15 * 86400000).toISOString()
    );
    resetOutbox();
  });

  function clientId() {
    const db = getDb();
    return db.prepare('SELECT id FROM clients WHERE partner_id = ?').get(partnerId).id;
  }

  test('«🔔 Мои цепочки» показывает клиента с выключенной цепочкой', async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '🔔 Мои цепочки'));
    const text = allReplyTexts().find((t) => t.includes('Клиент Тестовый'));
    expect(text).toMatch(/цепочка: выключена/i);
  });

  test('включение цепочки для клиента', async () => {
    resetOutbox();
    await bot.handleUpdate(callbackUpdate(chatId, userId, `chain_toggle_${clientId()}`));
    expect(lastReplyText()).toMatch(/цепочка включена/i);

    const db = getDb();
    const chain = db.prepare('SELECT * FROM chains WHERE client_id = ?').get(clientId());
    expect(chain.is_active).toBe(1);
  });

  test('повторное нажатие выключает цепочку', async () => {
    resetOutbox();
    await bot.handleUpdate(callbackUpdate(chatId, userId, `chain_toggle_${clientId()}`));
    expect(lastReplyText()).toMatch(/цепочка выключена/i);

    const db = getDb();
    const chain = db.prepare('SELECT * FROM chains WHERE client_id = ?').get(clientId());
    expect(chain.is_active).toBe(0);
  });

  test('удаление клиента убирает его из БД', async () => {
    const idToDelete = clientId();
    resetOutbox();
    await bot.handleUpdate(callbackUpdate(chatId, userId, `client_delete_${idToDelete}`));
    expect(lastReplyText()).toMatch(/клиент удалён/i);

    const db = getDb();
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(idToDelete);
    expect(client).toBeUndefined();
  });
});

describe('E2E: настройки — добавление клиента и удаление всех данных партнёра', () => {
  const bot = buildBot();
  const chatId = 5004;
  const userId = 9004;

  beforeAll(async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '/start'));
    await bot.handleUpdate(callbackUpdate(chatId, userId, 'consent_accept'));
    await bot.handleUpdate(textUpdate(chatId, userId, 'Ольга Настройкина'));
    await bot.handleUpdate(textUpdate(chatId, userId, '+79990000003'));
    resetOutbox();
  });

  test('«⚙️ Настройки» показывает профиль партнёра', async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '⚙️ Настройки'));
    expect(lastReplyText()).toMatch(/мой профиль/i);
    expect(lastReplyText()).toMatch(/ольга настройкина/i);
  });

  test('добавление клиента через «➕ Добавить клиента»', async () => {
    resetOutbox();
    await bot.handleUpdate(callbackUpdate(chatId, userId, 'settings_add_client'));
    expect(lastReplyText()).toMatch(/введите имя клиента/i);

    await bot.handleUpdate(textUpdate(chatId, userId, 'Новый Клиент'));
    expect(lastReplyText()).toMatch(/введите телефон клиента/i);

    await bot.handleUpdate(textUpdate(chatId, userId, '+79995554433'));
    expect(lastReplyText()).toMatch(/добавлен/i);

    const db = getDb();
    const partner = db.prepare('SELECT id FROM partners WHERE telegram_id = ?').get(userId);
    const client = db.prepare('SELECT * FROM clients WHERE partner_id = ? AND name = ?').get(
      partner.id,
      'Новый Клиент'
    );
    expect(client).toBeDefined();
    expect(client.phone).toBe('+79995554433');
  });

  test('удаление всех данных партнёра (ФЗ-152) требует подтверждения', async () => {
    const db = getDb();
    const partnerBefore = db.prepare('SELECT id FROM partners WHERE telegram_id = ?').get(userId);
    expect(partnerBefore).toBeDefined();

    resetOutbox();
    await bot.handleUpdate(callbackUpdate(chatId, userId, 'settings_delete_data'));
    expect(lastReplyText()).toMatch(/безвозвратно удалит все ваши данные/i);

    await bot.handleUpdate(callbackUpdate(chatId, userId, 'settings_delete_data_confirm'));
    expect(lastReplyText()).toMatch(/все ваши данные удалены/i);

    const partnerAfter = db.prepare('SELECT id FROM partners WHERE id = ?').get(partnerBefore.id);
    expect(partnerAfter).toBeUndefined();
  });

  test('после удаления данных бот снова требует /start для доступа к разделам', async () => {
    resetOutbox();
    await bot.handleUpdate(textUpdate(chatId, userId, '⚙️ Настройки'));
    expect(lastReplyText()).toMatch(/сначала завершите регистрацию/i);
  });
});

describe('E2E: сессия переживает потерю (перезапуск бота)', () => {
  const chatId = 5004;
  const userId = 9004;

  test('уже зарегистрированный партнёр не должен заново вводить согласие/имя/телефон', async () => {
    // Register once, on a "before restart" bot instance.
    const botBefore = buildBot();
    await botBefore.handleUpdate(textUpdate(chatId, userId, '/start'));
    await botBefore.handleUpdate(callbackUpdate(chatId, userId, 'consent_accept'));
    await botBefore.handleUpdate(textUpdate(chatId, userId, 'Сессия Тестова'));
    await botBefore.handleUpdate(textUpdate(chatId, userId, '+79990004004'));
    expect(lastReplyText()).toMatch(/регистрация завершена/i);

    // A restart wipes the in-memory session() store - a brand new Telegraf
    // instance with its own fresh session() simulates that faithfully.
    const botAfter = buildBot();
    resetOutbox();

    await botAfter.handleUpdate(textUpdate(chatId, userId, '🔔 Мои цепочки'));
    expect(lastReplyText()).not.toMatch(/сначала завершите регистрацию/i);

    resetOutbox();
    await botAfter.handleUpdate(textUpdate(chatId, userId, '/start'));
    expect(lastReplyText()).toMatch(/с возвращением/i);
  });

  test('телеграм-пользователь, который никогда не регистрировался, всё ещё должен пройти /start', async () => {
    const bot = buildBot();
    await bot.handleUpdate(textUpdate(6004, 9999004, '⏰ Сроки'));
    expect(lastReplyText()).toMatch(/сначала завершите регистрацию/i);
  });
});

describe('E2E: /newdeadline и изменение остатка PV', () => {
  const bot = buildBot();
  const chatId = 5005;
  const userId = 9005;

  beforeAll(async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '/start'));
    await bot.handleUpdate(callbackUpdate(chatId, userId, 'consent_accept'));
    await bot.handleUpdate(textUpdate(chatId, userId, 'Пётр Дедлайнов'));
    await bot.handleUpdate(textUpdate(chatId, userId, '+79990005005'));
    resetOutbox();
  });

  test('/newdeadline создаёт срок по шагам: название → PV → дата', async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '/newdeadline'));
    expect(lastReplyText()).toMatch(/название цели/i);

    await bot.handleUpdate(textUpdate(chatId, userId, 'Квалификация S3'));
    expect(lastReplyText()).toMatch(/сколько pv/i);

    await bot.handleUpdate(textUpdate(chatId, userId, '150'));
    expect(lastReplyText()).toMatch(/до какой даты/i);

    await bot.handleUpdate(textUpdate(chatId, userId, '31.12.2099 18:00'));
    expect(lastReplyText()).toMatch(/срок создан/i);
    expect(lastReplyText()).toMatch(/150 pv/i);

    const db = getDb();
    const partner = db.prepare('SELECT id FROM partners WHERE telegram_id = ?').get(userId);
    const deadline = db
      .prepare("SELECT * FROM deadlines WHERE partner_id = ? AND title = 'Квалификация S3'")
      .get(partner.id);
    expect(deadline).toBeDefined();
    expect(deadline.target_pv).toBe(150);
  });

  test('отклоняет нераспознанную дату и остаётся на том же шаге', async () => {
    await bot.handleUpdate(textUpdate(chatId, userId, '/newdeadline'));
    await bot.handleUpdate(textUpdate(chatId, userId, '-'));
    await bot.handleUpdate(textUpdate(chatId, userId, '80'));
    await bot.handleUpdate(textUpdate(chatId, userId, 'завтра вечером'));
    expect(lastReplyText()).toMatch(/не удалось распознать дату/i);

    await bot.handleUpdate(textUpdate(chatId, userId, '01.01.2099'));
    expect(lastReplyText()).toMatch(/срок создан/i);
  });

  test('«⏰ Сроки» показывает остаток PV и кнопку изменения; кнопка меняет остаток', async () => {
    resetOutbox();
    await bot.handleUpdate(textUpdate(chatId, userId, '⏰ Сроки'));
    const texts = allReplyTexts();
    expect(texts.some((t) => /Квалификация S3/.test(t) && /осталось 150 PV/.test(t))).toBe(true);

    const db = getDb();
    const partner = db.prepare('SELECT id FROM partners WHERE telegram_id = ?').get(userId);
    const deadline = db
      .prepare("SELECT * FROM deadlines WHERE partner_id = ? AND title = 'Квалификация S3'")
      .get(partner.id);

    resetOutbox();
    await bot.handleUpdate(callbackUpdate(chatId, userId, `deadline_edit_${deadline.id}`));
    expect(lastReplyText()).toMatch(/сколько pv осталось набрать теперь/i);

    await bot.handleUpdate(textUpdate(chatId, userId, '40'));
    expect(lastReplyText()).toMatch(/осталось 40 pv/i);

    const updated = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(deadline.id);
    expect(updated.current_pv).toBe(110); // 150 target - 40 remaining
  });
});
