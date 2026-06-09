#!/usr/bin/env bash
# TestFlight / App Store IPA build. Requires Xcode + Apple Developer account.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY}"

flutter pub get
flutter build ipa \
  --release \
  --dart-define=SUPABASE_URL="$SUPABASE_URL" \
  --dart-define=SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"

echo "IPA: build/ios/ipa/*.ipa — upload with Transporter or Xcode Organizer."
