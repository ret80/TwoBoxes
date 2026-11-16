#!/usr/bin/env bash
# Убирает из android/ то, что создаётся сборкой и IDE: артефакты Gradle,
# скопированные веб-ассеты и локальные пути к SDK. Исходники, манифест, иконки
# и конфиги не трогает — удалённое заново создаёт `npm run android`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/android"

# Список явный: так опечатка не может снести исходники проекта.
JUNK=(
  app/build
  build
  .gradle
  .idea
  app/.idea
  local.properties
  app/local.properties
  app/release
  app/debug
  app/src/main/assets/public
  app/src/main/assets/capacitor.config.json
  app/src/main/assets/capacitor.plugins.json
  capacitor-cordova-android-plugins
)

removed=0
for path in "${JUNK[@]}"; do
  [ -e "$path" ] || continue
  size="$(du -sh "$path" 2>/dev/null | cut -f1)"
  rm -rf "$path"
  echo "удалено: android/$path ($size)"
  removed=$((removed + 1))
done

# Файлы, которые любит оставлять Finder: в репозитории им места нет.
find . -name '.DS_Store' -type f -delete

if [ "$removed" -eq 0 ]; then
  echo "android/ уже чистая"
else
  echo "Готово: удалено $removed шт.; восстановить — npm run android"
fi
