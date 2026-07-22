#!/usr/bin/env bash
set -euo pipefail

env_file="/opt/physicalrisk/.env"
tmp_file="$(mktemp /opt/physicalrisk/.env.turnstile.XXXXXX)"
trap 'rm -f "$tmp_file"' EXIT

read -r -s -p 'TURNSTILE_SITE_KEY: ' site_key
printf '\n'
read -r -s -p 'TURNSTILE_SECRET_KEY: ' secret_key
printf '\n'

if [[ -z "$site_key" || -z "$secret_key" ]]; then
  printf 'Both values are required; .env was not changed.\n' >&2
  exit 1
fi

awk -v site_key="$site_key" -v secret_key="$secret_key" '
  BEGIN { site_written = 0; secret_written = 0 }
  /^TURNSTILE_SITE_KEY=/ {
    if (!site_written) print "TURNSTILE_SITE_KEY=" site_key
    site_written = 1
    next
  }
  /^TURNSTILE_SECRET_KEY=/ {
    if (!secret_written) print "TURNSTILE_SECRET_KEY=" secret_key
    secret_written = 1
    next
  }
  { print }
  END {
    if (!site_written) print "TURNSTILE_SITE_KEY=" site_key
    if (!secret_written) print "TURNSTILE_SECRET_KEY=" secret_key
  }
' "$env_file" > "$tmp_file"

chmod --reference="$env_file" "$tmp_file"
chown --reference="$env_file" "$tmp_file"
mv "$tmp_file" "$env_file"
trap - EXIT
unset site_key secret_key

printf 'Turnstile keys were stored in /opt/physicalrisk/.env (values not displayed).\n'
