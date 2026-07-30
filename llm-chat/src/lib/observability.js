import { datadogLogs } from "@datadog/browser-logs";
import { datadogRum } from "@datadog/browser-rum";
import { reactPlugin } from "@datadog/browser-rum-react";

import { runtimeConfig } from "../config/runtime-config.js";

const VERSION_KEY = "toy-chat:rum-version";
const RELOAD_KEY = "toy-chat:rum-version-reload";
const BROWSER_SDK_MAJOR = 7;
const TRACED_PATH_PATTERN =
  /^\/(?:api|auth|chat|conversations|health)(?:\/|$)/;

export function isTracedApplicationUrl(
  value,
  {
    pageOrigin = globalThis.location?.origin,
    apiBaseUrl = runtimeConfig.apiBaseUrl,
  } = {}
) {
  if (!pageOrigin) return false;

  try {
    const url = new URL(value, pageOrigin);
    const allowedOrigins = new Set([pageOrigin]);

    if (apiBaseUrl) {
      allowedOrigins.add(new URL(apiBaseUrl, pageOrigin).origin);
    }

    return (
      allowedOrigins.has(url.origin) &&
      TRACED_PATH_PATTERN.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function errorContext(error, context = {}) {
  return {
    ...context,
    error: {
      kind: error?.name || "Error",
      message: error?.message || String(error),
      stack: error?.stack,
    },
    error_code: error?.code,
    request_id: error?.requestId,
    retryable: error?.retryable,
  };
}

export function reportFrontendError(error, context = {}) {
  datadogRum.addError(error, {
    ...context,
    error_code: error?.code,
    request_id: error?.requestId,
    retryable: error?.retryable,
  });
  datadogLogs.logger.error(
    error?.message || "Frontend error",
    errorContext(error, context),
    error
  );
}

export function reportFrontendWarning(message, context = {}) {
  datadogLogs.logger.warn(message, context);
}

export function initializeObservability() {
  const { datadog } = runtimeConfig;
  const releaseContext = {
    build_mode: datadog.release.buildMode,
    browser_sdk_major: BROWSER_SDK_MAJOR,
    source_maps_expected: datadog.release.sourceMapsExpected,
    minified_path_prefix: datadog.release.minifiedPathPrefix,
  };

  datadogRum.init({
    applicationId: datadog.applicationId,
    clientToken: datadog.clientToken,
    site: datadog.site,
    service: datadog.service,
    env: datadog.env,
    version: datadog.version,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    defaultPrivacyLevel: "mask-user-input",
    enablePrivacyForActionName: true,
    // v7 defaults this to true. Keep v6 network behavior until every traced
    // API Gateway origin explicitly allows the baggage request header.
    propagateTraceBaggage: false,
    allowedTracingUrls: [
      {
        match: (url) => isTracedApplicationUrl(url),
        propagatorTypes: ["tracecontext", "datadog"],
      },
    ],
    plugins: [reactPlugin()],
  });

  datadogLogs.init({
    clientToken: datadog.clientToken,
    site: datadog.site,
    service: datadog.service,
    env: datadog.env,
    version: datadog.version,
    forwardErrorsToLogs: true,
    sessionSampleRate: 100,
    forwardConsoleLogs: ["warn", "error"],
  });

  datadogRum.setGlobalContextProperty("release", releaseContext);
  datadogLogs.setGlobalContextProperty("release", releaseContext);

  const previousVersion = localStorage.getItem(VERSION_KEY);
  const reloadVersion = sessionStorage.getItem(RELOAD_KEY);

  if (
    previousVersion &&
    previousVersion !== datadog.version &&
    reloadVersion !== datadog.version
  ) {
    sessionStorage.setItem(RELOAD_KEY, datadog.version);
    localStorage.setItem(VERSION_KEY, datadog.version);
    datadogRum.stopSession();
    window.location.reload();
    return { reloadRequired: true };
  }

  sessionStorage.removeItem(RELOAD_KEY);
  localStorage.setItem(VERSION_KEY, datadog.version);
  datadogRum.startSessionReplayRecording();
  window.DD_RUM = datadogRum;
  return { reloadRequired: false };
}

export { datadogLogs, datadogRum };
