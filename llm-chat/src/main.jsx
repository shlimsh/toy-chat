import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

import { datadogRum } from "@datadog/browser-rum";
import { reactPlugin } from "@datadog/browser-rum-react";
import { datadogLogs } from "@datadog/browser-logs";

datadogRum.init({
  applicationId: "3854465b-fb60-41ed-957b-67b2c3616aea",
  clientToken: "pub449df5722fca21cfef9b38fe276703ea",
  site: "datadoghq.com",
  service: "shlim-toy-chat-front",
  env: "dev",
  version: "0.0.2",
  sessionSampleRate: 100,
  sessionReplaySampleRate: 100,
  defaultPrivacyLevel: "mask-user-input",
  allowedTracingUrls: [
    {
      match: /\/(auth|chat|conversations|health)(\/|$)/,
      propagatorTypes: ["tracecontext", "datadog"],
    },
  ],
  plugins: [reactPlugin()],
  beforeSend: (event) => {
    console.log("RUM event:", event.type, event);
    return true;
  },
});

datadogLogs.init({
  clientToken: "pub449df5722fca21cfef9b38fe276703ea",
  site: "datadoghq.com",
  service: "shlim-toy-chat-front",
  env: "dev",
  version: "0.0.2",
  forwardErrorsToLogs: true,
  sessionSampleRate: 100,
  forwardConsoleLogs: ["debug", "log", "info", "warn", "error"],
});

window.DD_RUM = datadogRum;

setTimeout(() => {
  datadogRum.addAction("rum_test_event");
  console.log("DD context:", datadogRum.getInternalContext());
}, 3000);

datadogRum.startSessionReplayRecording();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);