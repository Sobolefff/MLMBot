#!/usr/bin/env bash
#
# backup-db.sh — ежедневный бэкап SQLite-базы Greenway Bot.
#
# Делает согласованную копию файла БД (в т.ч. при активном WAL-режиме,
# см. src/database/init.js — db.pragma('journal_mode = WAL')) через
# `sqlite3 <db> ".backup <dest>"`, если доступна утилита sqlite3 CLI.
# Если sqlite3 не установлен, выполняется резервный вариант — checkpoint
# WAL-журнала (если возможно) и копирование файла БД вместе с -wal/-shm.
#
# Переменные окружения:
#   SQLITE_PATH             — путь к файлу БД (по умолчанию ./data/greenway.db,
#                              как в .env / src/config/index.js)
#   BACKUP_DIR               — директория для бэкапов (по умолчанию ./backups)
#   BACKUP_RETENTION_DAYS    — сколько дней хранить бэкапы (по умолчанию 14)
#
# Использование:
#   ./scripts/backup-db.sh
#   SQLITE_PATH=./data/greenway.db BACKUP_DIR=./backups ./scripts/backup-db.sh
#
# В Docker (сервис app), например через отдельный контейнер/cron на хосте:
#   docker compose -f docker/docker-compose.yml exec -T app \
#     env SQLITE_PATH=/app/data/greenway.db BACKUP_DIR=/app/data/backups \
#     ./scripts/backup-db.sh
#
# Пример строки для cron на хосте (ежедневно в 03:30):
#   30 3 * * * cd /path/to/MLMBot && SQLITE_PATH=./data/greenway.db BACKUP_DIR=./backups \
#     BACKUP_RETENTION_DAYS=14 ./scripts/backup-db.sh >> ./backups/backup.log 2>&1
#
# Пример строки для cron внутри контейнера app (если он запущен постоянно):
#   30 3 * * * docker compose -f /path/to/MLMBot/docker/docker-compose.yml exec -T app \
#     ./scripts/backup-db.sh >> /path/to/MLMBot/backups/backup.log 2>&1

set -euo pipefail

DB_PATH="${SQLITE_PATH:-./data/greenway.db}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ ! -f "$DB_PATH" ]; then
  echo "[backup-db] Файл БД не найден: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y-%m-%d-%H%M%S)"
DEST="$BACKUP_DIR/greenway-${TIMESTAMP}.db"

echo "[backup-db] Источник: $DB_PATH"
echo "[backup-db] Назначение: $DEST"

if command -v sqlite3 >/dev/null 2>&1; then
  echo "[backup-db] Использую sqlite3 CLI (.backup) для согласованного снимка..."
  sqlite3 "$DB_PATH" ".backup '$DEST'"
else
  echo "[backup-db] sqlite3 CLI не найден, использую резервное копирование файлов." >&2
  echo "[backup-db] Внимание: при активной записи в БД возможна небольшая несогласованность." >&2

  # Пытаемся выполнить checkpoint WAL через Node/better-sqlite3, чтобы
  # перенести изменения из greenway.db-wal в основной файл перед копированием.
  if command -v node >/dev/null 2>&1 && [ -f "$(dirname "$0")/../node_modules/better-sqlite3/package.json" ]; then
    node -e "
      const Database = require('$(dirname "$0")/../node_modules/better-sqlite3');
      const db = new Database(process.argv[1]);
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    " "$DB_PATH" || echo "[backup-db] Не удалось выполнить WAL checkpoint, продолжаю копирование как есть." >&2
  fi

  cp "$DB_PATH" "$DEST"
  # Копируем сопутствующие WAL/SHM-файлы, если они ещё остались.
  [ -f "${DB_PATH}-wal" ] && cp "${DB_PATH}-wal" "${DEST}-wal"
  [ -f "${DB_PATH}-shm" ] && cp "${DB_PATH}-shm" "${DEST}-shm"
fi

echo "[backup-db] Бэкап создан: $DEST"

echo "[backup-db] Удаляю бэкапы старше ${RETENTION_DAYS} дней в $BACKUP_DIR..."
find "$BACKUP_DIR" -maxdepth 1 -name 'greenway-*.db*' -type f -mtime "+${RETENTION_DAYS}" -print -delete

echo "[backup-db] Готово."
