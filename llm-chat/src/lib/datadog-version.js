export function getDatadogVersion() {
  const version = String(import.meta.env.VITE_DD_VERSION || "").trim();

  if (!version) {
    throw new Error(
      "VITE_DD_VERSION이 없습니다. npm run dev 또는 npm run build를 다시 실행해 버전을 동기화해 주세요."
    );
  }

  return version;
}

export function rotateRumSessionOnVersionChange(datadogRum, version) {
  const storageKey = "toy-chat.dd-version";
  const previousVersion = localStorage.getItem(storageKey);
  localStorage.setItem(storageKey, version);

  if (!previousVersion || previousVersion === version) {
    return false;
  }

  datadogRum.stopSession();
  window.location.reload();
  return true;
}

