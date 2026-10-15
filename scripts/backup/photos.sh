#!/usr/bin/env bash
# Copia delle foto dei check (dati sulla salute: stanno solo nello spazio file
# di Supabase, il backup del database non le contiene). Una volta a settimana.
#
# 1. elenca i file del contenitore "checks" dal database (storage.objects)
# 2. li scarica uno a uno con la chiave di servizio
# 3. controlla che siano arrivati tutti, li impacchetta e li cifra
#
# Variabili: SOURCE_URL (database), STORAGE_URL (indirizzo del progetto
# Supabase), STORAGE_KEY (chiave secret/service_role), OUT_DIR,
# BACKUP_PASSPHRASE (obbligatoria: sono dati sulla salute).
set -euo pipefail
: "${SOURCE_URL:?manca SOURCE_URL}"
: "${STORAGE_URL:?manca STORAGE_URL}"
: "${STORAGE_KEY:?manca STORAGE_KEY}"
: "${BACKUP_PASSPHRASE:?manca BACKUP_PASSPHRASE: le foto non si salvano in chiaro}"
OUT_DIR="${OUT_DIR:-backup-out}"
BUCKET="checks"
STAMP="$(date -u +%Y-%m-%d)"
WORK="$(mktemp -d)"
mkdir -p "$OUT_DIR" "$WORK/foto"
BASE="${STORAGE_URL%/}/storage/v1/object/$BUCKET"

echo "== Elenco delle foto dei check"
psql "$SOURCE_URL" -Atqc "select name from storage.objects where bucket_id = '$BUCKET' order by name" > "$WORK/list.txt"
TOTAL="$(grep -c . "$WORK/list.txt" || true)"
echo "$TOTAL file"
[ "$TOTAL" -eq 0 ] && { echo "Nessuna foto da copiare."; exit 0; }

echo "== Download"
fail=0
while read -r name; do
  [ -z "$name" ] && continue
  dest="$WORK/foto/$name"
  mkdir -p "$(dirname "$dest")"
  # il nome è fatto di id e numeri (cliente/check/file): niente da codificare
  if ! curl -fsS --retry 3 -H "Authorization: Bearer $STORAGE_KEY" -H "apikey: $STORAGE_KEY" -o "$dest" "$BASE/$name"; then
    echo "NON SCARICATA: $name"
    fail=$((fail + 1))
  fi
done < "$WORK/list.txt"
GOT="$(find "$WORK/foto" -type f | wc -l | tr -d ' ')"
echo "scaricate $GOT su $TOTAL"
if [ "$fail" -gt 0 ] || [ "$GOT" -ne "$TOTAL" ]; then
  echo "ERRORE: $fail foto non scaricate. La copia non è completa."
  exit 1
fi

echo "== Pacchetto cifrato"
tar -C "$WORK" -czf "$WORK/foto.tgz" foto
gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 --passphrase-fd 3 -o "$OUT_DIR/otherise-foto-$STAMP.tgz.gpg" "$WORK/foto.tgz" 3<<<"$BACKUP_PASSPHRASE"
ls -lh "$OUT_DIR/otherise-foto-$STAMP.tgz.gpg" | awk '{print "file cifrato: " $5}'
rm -rf "$WORK"
