#!/usr/bin/env bash
# Backup dei dati di Otherise (schemi public e auth: clienti, programmi, check,
# logbook, pagamenti, chat scritta, impostazioni, accessi). Foto e video della
# chat restano fuori.
#
# 1. conta le righe di ogni tabella sul database vero
# 2. fa la copia (pg_dump, formato compresso)
# 3. la ricarica su un database vuoto di prova e ricontrolla le righe
# 4. se i numeri tornano, la cifra con la passphrase (se c'è)
#
# Variabili: SOURCE_URL (database vero), TARGET_URL (database vuoto per la
# prova), OUT_DIR, BACKUP_PASSPHRASE (facoltativa: senza, il file resta in chiaro).
set -euo pipefail
: "${SOURCE_URL:?manca SOURCE_URL}"
: "${TARGET_URL:?manca TARGET_URL}"
OUT_DIR="${OUT_DIR:-backup-out}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y-%m-%d)"
DUMP="$OUT_DIR/otherise-$STAMP.dump"

# elenco delle tabelle da controllare (tutte quelle dei dati + gli accessi)
TABLES_SQL="select table_schema || '.' || table_name from information_schema.tables
  where table_type = 'BASE TABLE'
    and (table_schema = 'public' or (table_schema = 'auth' and table_name in ('users', 'identities')))
  order by 1"

count_all() { # $1 = url, $2 = file con l'elenco delle tabelle
  local url="$1" list="$2" t n
  while read -r t; do
    [ -z "$t" ] && continue
    if [ "$(psql "$url" -Atqc "select to_regclass('$t') is not null")" = "t" ]; then
      n="$(psql "$url" -Atqc "select count(*) from $t")"
    else
      n="-1"
    fi
    echo "$t $n"
  done < "$list"
}

echo "== Tabelle e righe sul database vero"
psql "$SOURCE_URL" -Atqc "$TABLES_SQL" > "$OUT_DIR/tables.txt"
count_all "$SOURCE_URL" "$OUT_DIR/tables.txt" > "$OUT_DIR/before.txt"
echo "$(wc -l < "$OUT_DIR/tables.txt") tabelle"

echo "== Copia"
pg_dump "$SOURCE_URL" -Fc -n public -n auth --no-owner --no-privileges -f "$DUMP"
count_all "$SOURCE_URL" "$OUT_DIR/tables.txt" > "$OUT_DIR/after.txt"
ls -lh "$DUMP" | awk '{print "file: " $5}'

echo "== Prova di ripristino su un database vuoto"
psql "$TARGET_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  -- i ruoli che Supabase usa nei permessi e nelle regole di accesso
  perform 1;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'dashboard_user') then create role dashboard_user nologin; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
SQL
set +e
pg_restore -d "$TARGET_URL" --no-owner --no-privileges "$DUMP" 2> "$OUT_DIR/restore.log"
set -e
echo "avvisi durante il ripristino: $(grep -c 'error:' "$OUT_DIR/restore.log" || true) (normali: oggetti propri di Supabase che il database di prova non ha)"
count_all "$TARGET_URL" "$OUT_DIR/tables.txt" > "$OUT_DIR/restored.txt"

echo "== Controllo righe (vero → ripristinato)"
bad=0
while read -r t b; do
  a="$(awk -v t="$t" '$1 == t {print $2}' "$OUT_DIR/after.txt")"
  r="$(awk -v t="$t" '$1 == t {print $2}' "$OUT_DIR/restored.txt")"
  lo=$(( b < a ? b : a )); hi=$(( b > a ? b : a ))
  if [ "$r" -lt "$lo" ] || [ "$r" -gt "$hi" ]; then
    echo "NON TORNA  $t: $b sul database, $r nella copia"
    bad=$((bad + 1))
  fi
done < "$OUT_DIR/before.txt"
for t in public.clients public.programs public.checks public.workout_logs public.payments public.messages auth.users; do
  awk -v t="$t" '$1 == t {printf "%-24s %s righe\n", $1, $2}' "$OUT_DIR/restored.txt"
done
if [ "$bad" -gt 0 ]; then
  echo "ERRORE: $bad tabelle non tornano. La copia non è affidabile."
  exit 1
fi
echo "OK: tutte le $(wc -l < "$OUT_DIR/tables.txt") tabelle hanno le stesse righe."

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  echo "== Cifratura"
  gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 --passphrase-fd 3 -o "$DUMP.gpg" "$DUMP" 3<<<"$BACKUP_PASSPHRASE"
  rm -f "$DUMP"
  ls -lh "$DUMP.gpg" | awk '{print "file cifrato: " $5}'
fi
