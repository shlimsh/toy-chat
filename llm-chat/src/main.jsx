import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

import { BrowserRouter } from "react-router-dom";
import { datadogRum } from "@datadog/browser-rum";
import { reactPlugin } from "@datadog/browser-rum-react";
import { datadogLogs } from "@datadog/browser-logs";

datadogRum.init({
  applicationId: "3854465b-fb60-41ed-957b-67b2c3616aea",
  clientToken: "pub449df5722fca21cfef9b38fe276703ea",
  site: "datadoghq.com",
  service: "shlim-toy-chat-front",
  env: "dev",
  version: "0.2.0",
  sessionSampleRate: 100,
  sessionReplaySampleRate: 100,
  defaultPrivacyLevel: "mask-user-input",
  allowedTracingUrls: [
    {
      match: /\/(auth|chat|conversations|health)(\/|$)/,
      propagatorTypes: ["tracecontext", "datadog"],
    },
    {
      match: /https:\/\/6kw29887b6\.execute-api\.us-east-1\.amazonaws\.com/,
      propagatorTypes: ["tracecontext", "datadog"],
    },
    {
      match: /https:\/\/zxezp1ixj5\.execute-api\.us-east-1\.amazonaws\.com/,
      propagatorTypes: ["tracecontext", "datadog"],
},
  ],
  plugins: [reactPlugin()],
});

datadogLogs.init({
  clientToken: "pub449df5722fca21cfef9b38fe276703ea",
  site: "datadoghq.com",
  service: "shlim-toy-chat-front",
  env: "dev",
  version: "0.2.0",
  forwardErrorsToLogs: true,
  sessionSampleRate: 100,
  forwardConsoleLogs: ["warn", "error"],
});

window.DD_RUM = datadogRum;

datadogRum.startSessionReplayRecording();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
