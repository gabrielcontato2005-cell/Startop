#!/usr/bin/env bash
# Recria o banco de teste local (Postgres comum) com o stub do Supabase e todas as migrations.
# Uso: TEST_DATABASE_URL=postgres://postgres@localhost:5432/startop_teste scripts/db-teste.sh
set -euo pipefail
URL="${TEST_DATABASE_URL:?defina TEST_DATABASE_URL}"
BASE="${URL%/*}/postgres"
NOME="${URL##*/}"
NOME="${NOME%%\?*}"
psql "$BASE" -qv ON_ERROR_STOP=1 -c "drop database if exists \"$NOME\" with (force)" -c "create database \"$NOME\""
psql "$URL" -qv ON_ERROR_STOP=1 -f tests/sql/supabase-stub.sql
for f in supabase/migrations/*.sql; do
  psql "$URL" -qv ON_ERROR_STOP=1 -f "$f"
done
echo "Banco de teste pronto: $NOME"
