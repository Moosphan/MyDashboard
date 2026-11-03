#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/dev-process-utils.sh"
LABEL="com.dorck.hulkdash.dev"
PLIST="${ROOT_DIR}/.dev-logs/${LABEL}.plist"
LOG_DIR="${ROOT_DIR}/.dev-logs"
NODE_BIN="$(command -v node)"
VITE_BIN="$(cd "${ROOT_DIR}" && node -e 'const path=require("node:path");process.stdout.write(path.join(path.dirname(require.resolve("electron-vite/package.json")),"bin/electron-vite.js"))')"

mkdir -p "${LOG_DIR}"

LOADED_SERVICE="$(launchctl print "gui/$(id -u)/${LABEL}" 2>/dev/null || true)"
if [[ -n "${LOADED_SERVICE}" ]]; then
  LOADED_PLIST="$(sed -n 's/^[[:space:]]*path = //p' <<<"${LOADED_SERVICE}" | head -n 1)"
  LOADED_ROOT="$(/usr/libexec/PlistBuddy -c 'Print :WorkingDirectory' "${LOADED_PLIST}" 2>/dev/null || true)"
  if [[ -z "${LOADED_ROOT}" || "$(cd "${LOADED_ROOT}" 2>/dev/null && pwd -P)" != "$(cd "${ROOT_DIR}" && pwd -P)" ]]; then
    echo "Loaded development service belongs to another checkout; leaving it running" >&2
    exit 1
  fi
fi

if [[ -f "${PLIST}" ]]; then
  EXISTING_ROOT="$(/usr/libexec/PlistBuddy -c 'Print :WorkingDirectory' "${PLIST}" 2>/dev/null || true)"
  if [[ -z "${EXISTING_ROOT}" || "$(cd "${EXISTING_ROOT}" 2>/dev/null && pwd -P)" != "$(cd "${ROOT_DIR}" && pwd -P)" ]]; then
    echo "Existing development service belongs to another checkout; leaving it running" >&2
    exit 1
  fi
fi

if [[ "${1:-}" == "stop" ]]; then
  launchctl bootout "gui/$(id -u)" "${PLIST}" 2>/dev/null || true
  rm -f "${PLIST}"
  echo "Stopped launchd dev app"
  exit 0
fi

cat >"${PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${ROOT_DIR}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${VITE_BIN}</string>
    <string>dev</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TRENDING_ALLOW_FIXTURES</key>
    <string>1</string>
    <key>PATH</key>
    <string>${PATH}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/launchd.err.log</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "${PLIST}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${PLIST}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"

echo "Started launchd dev app: ${LABEL}"
echo "Plist: ${PLIST}"
echo "Logs: ${LOG_DIR}/launchd.out.log / ${LOG_DIR}/launchd.err.log"
