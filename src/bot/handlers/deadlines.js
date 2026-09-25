const { Markup } = require('telegraf');
const apiClient = require('../apiClient');
const { ensureSession } = require('../session');

// Russia has used a single UTC+3 offset (no DST) since 2014 - matches the
// project's default partner timezone (schema.sql: partners.timezone
// DEFAULT 'Europe/Moscow'). Good enough for a bot-typed "31.12.2026 18:00"
// without pulling in a timezone library for one command.
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/;

function parseMoscowDate(text) {
  const m = DATE_RE.exec(text.trim());
  if (!m) return null;
  const [, day, month, year, hour = '23', minute = '59'] = m;
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const mi = Number(minute);

  const asIfUtc = new Date(Date.UTC(y, mo - 1, d, h, mi));
  // Date.UTC silently rolls an invalid calendar date (e.g. 31.02) into the
  // next month instead of rejecting it - catch that before trusting it.
  if (asIfUtc.getUTCFullYear() !== y || asIfUtc.getUTCMonth() !== mo - 1 || asIfUtc.getUTCDate() !== d) {
    return null;
  }
  return new Date(asIfUtc.getTime() - MOSCOW_OFFSET_MS);
}

function remainingPv(deadline) {
  return Math.max(0, deadline.target_pv - deadline.current_pv);
}

function deadlineKeyboard(deadline) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Изменить остаток PV', `deadline_edit_${deadline.id}`)],
  ]);
}

async function sendDeadline(ctx, d) {
  const text =
    `${d.title || 'Цель по PV'}\n` +
    `Набрано: ${d.current_pv} / ${d.target_pv} PV (осталось ${remainingPv(d)} PV)\n` +
    `До: ${new Date(d.deadline_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}\n` +
    `Статус: ${d.status}`;
  await ctx.reply(text, d.status === 'active' ? deadlineKeyboard(d) : undefined);
}

function registerDeadlinesHandler(bot) {
  bot.hears('⏰ Сроки', async (ctx) => {
    if (!(await ensureSession(ctx))) {
      await ctx.reply('Сначала завершите регистрацию через /start.');
      return;
    }
    try {
      const deadlines = await apiClient.request('/deadlines/list', { token: ctx.session.token });
      if (!deadlines.length) {
        await ctx.reply('Активных сроков нет. Используйте /newdeadline для создания.');
        return;
      }
      for (const d of deadlines) await sendDeadline(ctx, d);
    } catch (err) {
      await ctx.reply(`Ошибка при получении сроков: ${err.message}`);
    }
  });

  bot.command('newdeadline', async (ctx) => {
    if (!(await ensureSession(ctx))) {
      await ctx.reply('Сначала завершите регистрацию через /start.');
      return;
    }
    ctx.session.newDeadline = { step: 'title' };
    await ctx.reply('Название цели? (например: "Квалификация S3", или "-" чтобы пропустить)');
  });

  bot.action(/deadline_edit_(\d+)/, async (ctx) => {
    if (!(await ensureSession(ctx))) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    const deadlineId = Number(ctx.match[1]);
    try {
      const deadlines = await apiClient.request('/deadlines/list', { token: ctx.session.token });
      const deadline = deadlines.find((d) => d.id === deadlineId);
      if (!deadline) {
        await ctx.reply('Этот срок не найден (возможно, уже удалён).');
        return;
      }
      ctx.session.deadlineEdit = { id: deadlineId, targetPv: deadline.target_pv, step: 'awaiting_remaining' };
      await ctx.reply(
        `Сейчас осталось ${remainingPv(deadline)} PV из ${deadline.target_pv}. Сколько PV осталось набрать теперь?`
      );
    } catch (err) {
      await ctx.reply(`Ошибка: ${err.message}`);
    }
  });

  bot.on('text', async (ctx, next) => {
    const newDeadline = ctx.session?.newDeadline;
    if (!newDeadline) return next();

    if (newDeadline.step === 'title') {
      const text = ctx.message.text.trim();
      newDeadline.title = text === '-' ? null : text;
      newDeadline.step = 'target_pv';
      await ctx.reply('Сколько PV нужно набрать до дедлайна?');
      return;
    }

    if (newDeadline.step === 'target_pv') {
      const value = Number(ctx.message.text.trim().replace(',', '.'));
      if (!Number.isFinite(value) || value <= 0) {
        await ctx.reply('Введите положительное число PV, например: 150');
        return;
      }
      newDeadline.targetPv = Math.round(value);
      newDeadline.step = 'deadline_at';
      await ctx.reply('До какой даты? Формат: ДД.ММ.ГГГГ [ЧЧ:ММ] (например: 31.12.2026 18:00, время московское)');
      return;
    }

    if (newDeadline.step === 'deadline_at') {
      const date = parseMoscowDate(ctx.message.text);
      if (!date) {
        await ctx.reply('Не удалось распознать дату. Формат: ДД.ММ.ГГГГ [ЧЧ:ММ], например: 31.12.2026 18:00');
        return;
      }
      if (date.getTime() <= Date.now()) {
        await ctx.reply('Эта дата уже в прошлом. Укажите дату в будущем.');
        return;
      }
      try {
        await apiClient.request('/deadlines/create', {
          method: 'POST',
          token: ctx.session.token,
          body: { title: newDeadline.title, target_pv: newDeadline.targetPv, deadline_at: date.toISOString() },
        });
        await ctx.reply(
          `✅ Срок создан: ${newDeadline.title || 'Цель по PV'} — ${newDeadline.targetPv} PV до ` +
            `${date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}. Уведомления придут за 72ч/24ч/2ч до срока.`
        );
      } catch (err) {
        await ctx.reply(`Не удалось создать срок: ${err.message}`);
      } finally {
        ctx.session.newDeadline = null;
      }
      return;
    }

    return next();
  });

  bot.on('text', async (ctx, next) => {
    const deadlineEdit = ctx.session?.deadlineEdit;
    if (!deadlineEdit || deadlineEdit.step !== 'awaiting_remaining') return next();

    const remaining = Number(ctx.message.text.trim().replace(',', '.'));
    if (!Number.isFinite(remaining) || remaining < 0) {
      await ctx.reply('Введите неотрицательное число PV, например: 40');
      return;
    }

    try {
      const currentPv = Math.max(0, Math.round(deadlineEdit.targetPv - remaining));
      const updated = await apiClient.request(`/deadlines/${deadlineEdit.id}`, {
        method: 'PUT',
        token: ctx.session.token,
        body: { current_pv: currentPv },
      });
      await sendDeadline(ctx, updated);
    } catch (err) {
      await ctx.reply(`Не удалось обновить срок: ${err.message}`);
    } finally {
      ctx.session.deadlineEdit = null;
    }
  });
}

module.exports = { registerDeadlinesHandler, parseMoscowDate, remainingPv };
