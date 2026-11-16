#!/usr/bin/env bash
# Подписанный AAB для Google Play: веб-сборка → cap sync → gradle bundleRelease.
# Готовый файл кладётся в build/android/TwoBoxes.aab, подпись берётся из keys/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Тулчейн: локальный `.toolchain` (scripts/android-toolchain.sh) или системный
# из Android Studio. Уже выставленные JAVA_HOME/ANDROID_HOME не перетираются.
if [ -d "$ROOT/.toolchain" ]; then
  if [ -z "${JAVA_HOME:-}" ]; then
    JAVA_HOME="$(ls -d "$ROOT"/.toolchain/jdk-*/Contents/Home 2>/dev/null | head -1)"
    export JAVA_HOME
  fi
  if [ -z "${ANDROID_HOME:-}" ]; then
    ANDROID_HOME="$ROOT/.toolchain/android-sdk"
    export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
  fi
fi

[ -x "${JAVA_HOME:-}/bin/java" ] || {
  echo "Нет JDK 21: запусти bash scripts/android-toolchain.sh" >&2
  exit 1
}
[ -d "${ANDROID_HOME:-}/platforms" ] || {
  echo "Нет Android SDK: запусти bash scripts/android-toolchain.sh" >&2
  exit 1
}
[ -f keys/keystore.properties ] || {
  echo "Нет keys/keystore.properties: без подписи Google Play не примет bundle" >&2
  exit 1
}

npm run android
(cd android && ./gradlew --no-daemon bundleRelease)

GRADLE_AAB="android/app/build/outputs/bundle/release/app-release.aab"
[ -f "$GRADLE_AAB" ] || {
  echo "Gradle не создал $GRADLE_AAB" >&2
  exit 1
}

mkdir -p build/android
cp -f "$GRADLE_AAB" build/android/TwoBoxes.aab

echo "Готово: build/android/TwoBoxes.aab ($(du -h build/android/TwoBoxes.aab | cut -f1))"
