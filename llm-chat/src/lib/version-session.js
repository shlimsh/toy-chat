const VERSION_STORAGE_KEY = "toy-chat.dd.rum-version";

export function requireDatadogVersion(value) {
  const version = String(value || "").trim();

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      "VITE_DD_VERSION이 없습니다. npm run dev 또는 npm run build로 실행해 버전을 먼저 동기화해 주세요."
    );
  }

  return version;
}

export function rotateRumSessionOnVersionChange({
  rum,
  version,
  storage = globalThis.localStorage,
  location = globalThis.location,
} = {}) {
  const normalizedVersion = requireDatadogVersion(version);
  const previousVersion = storage?.getItem(VERSION_STORAGE_KEY);

  storage?.setItem(VERSION_STORAGE_KEY, normalizedVersion);

  if (previousVersion === normalizedVersion) {
    return false;
  }

  // 최초 적용 시에도 기존 SDK 세션이 살아 있을 수 있으므로 한 번 회전한다.
  rum?.stopSession?.();
  location?.reload?.();
  return true;
}

export { VERSION_STORAGE_KEY };
