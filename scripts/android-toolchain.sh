#!/usr/bin/env bash
# Локальный Android-тулчейн в `.toolchain/` без sudo и без Android Studio:
# JDK 21 (Temurin) + command-line tools + SDK platform 36 и build-tools.
# Повторный запуск безопасен: скачанное не качается заново.
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
  echo "Скрипт рассчитан на macOS arm64 (Intel/Windows: ставь Android Studio)." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLCHAIN="$ROOT/.toolchain"
SDK="$TOOLCHAIN/android-sdk"
mkdir -p "$TOOLCHAIN"

if ! ls -d "$TOOLCHAIN"/jdk-*/Contents/Home >/dev/null 2>&1; then
  echo "→ JDK 21"
  curl -fsSL --retry 3 -o "$TOOLCHAIN/jdk21.tar.gz" \
    "https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jdk/hotspot/normal/eclipse"
  tar -xzf "$TOOLCHAIN/jdk21.tar.gz" -C "$TOOLCHAIN"
  rm -f "$TOOLCHAIN/jdk21.tar.gz"
fi
JAVA_HOME="$(ls -d "$TOOLCHAIN"/jdk-*/Contents/Home | head -1)"
export JAVA_HOME

if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "→ Android command-line tools"
  curl -fsSL --retry 3 -o "$TOOLCHAIN/cmdline-tools.zip" \
    "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
  rm -rf "$SDK/tmp" "$SDK/cmdline-tools/latest"
  unzip -q -o "$TOOLCHAIN/cmdline-tools.zip" -d "$SDK/tmp"
  mkdir -p "$SDK/cmdline-tools"
  mv "$SDK/tmp/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -rf "$SDK/tmp" "$TOOLCHAIN/cmdline-tools.zip"
fi

export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"

# `yes` получает SIGPIPE после принятия всех лицензий — это не ошибка.
yes | sdkmanager --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true
echo "→ SDK platform 36 и build-tools"
sdkmanager --sdk_root="$SDK" "platform-tools" "platforms;android-36" "build-tools;36.0.0" >/dev/null

echo "Готово: JAVA_HOME=$JAVA_HOME ANDROID_HOME=$SDK"
