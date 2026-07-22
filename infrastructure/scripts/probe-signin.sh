#!/bin/sh
set -e
CSRF_JSON=$(wget -qO- http://moss-web:3000/api/auth/csrf)
TOKEN=$(echo "$CSRF_JSON" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
echo "token=$TOKEN"
# Need cookie from csrf response - wget alone may not keep cookies
# Use wget with temp cookie file
rm -f /tmp/cj
wget -qO /tmp/csrf.json --save-cookies /tmp/cj --keep-session-cookies http://moss-web:3000/api/auth/csrf
TOKEN=$(sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p' /tmp/csrf.json)
echo "csrf=$TOKEN"
wget -qO- --load-cookies /tmp/cj --header="Content-Type: application/x-www-form-urlencoded" \
  --post-data="csrfToken=${TOKEN}&callbackUrl=%2F&json=true" \
  http://moss-web:3000/api/auth/signin/keycloak
echo
echo "---REPO---"
rm -f /tmp/cj2
wget -qO /tmp/csrf2.json --save-cookies /tmp/cj2 --keep-session-cookies http://repo-web:3000/api/auth/csrf
TOKEN2=$(sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p' /tmp/csrf2.json)
wget -qO- --load-cookies /tmp/cj2 --header="Content-Type: application/x-www-form-urlencoded" \
  --post-data="csrfToken=${TOKEN2}&callbackUrl=%2F&json=true" \
  http://repo-web:3000/api/auth/signin/keycloak
echo
