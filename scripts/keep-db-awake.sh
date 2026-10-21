#!/usr/bin/env bash
# Pings the public_tree() RPC (counts as database activity for Supabase's
# "a few requests a day" rule) and fails loudly if the project looks paused
# or the tree looks blank. URL and public anon key come from js/tree-data.js
# unless SUPABASE_URL / SUPABASE_ANON_KEY are set (used by the unit test).
set -euo pipefail

url="${SUPABASE_URL:-$(grep -o 'https://[a-z0-9]*\.supabase\.co' js/tree-data.js | head -1 || true)}"
key="${SUPABASE_ANON_KEY:-$(sed -n 's/.*SUPABASE_ANON_KEY = "\([^"]*\)".*/\1/p' js/tree-data.js | head -1 || true)}"
min_people="${MIN_PEOPLE:-10}"
if [ -z "$url" ] || [ -z "$key" ]; then
  echo "::error::could not read the Supabase URL/key from js/tree-data.js"
  exit 1
fi

body="$(mktemp)"
status="$(curl -sS --max-time "${CURL_MAX_TIME:-30}" --retry 3 --retry-delay "${RETRY_DELAY:-20}" --retry-all-errors \
  -o "$body" -w '%{http_code}' -X POST "$url/rest/v1/rpc/public_tree" \
  -H "apikey: $key" -H "Authorization: Bearer $key" -H "Content-Type: application/json" -d '{}')" || status="000"
echo "HTTP $status ($(wc -c < "$body") bytes)"   # never print the body: it is the family tree
if [ "$status" != "200" ]; then
  echo "::error::Supabase did not answer 200 (got $status). The project may be paused: restore it from the Supabase dashboard."
  exit 1
fi

people="$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(Array.isArray(j.people)?j.people.length:-1)}catch(e){console.log(-1)}' "$body")"
echo "people in the public tree: $people"
if [ "$people" -lt "$min_people" ]; then
  echo "::error::public_tree returned $people people (expected at least $min_people): the tree looks blank or the response shape changed."
  exit 1
fi
