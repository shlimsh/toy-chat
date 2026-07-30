import React, { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import ChatPage from "../pages/ChatPage.jsx";

const AnalyticsPage = lazy(() => import("../pages/AnalyticsPage.jsx"));
const AboutPage = lazy(() => import("../pages/AboutPage.jsx"));
const DashboardPage = lazy(() => import("../pages/DashboardPage.jsx"));
const MonitoringPage = lazy(() => import("../pages/MonitoringPage.jsx"));
const SettingsPage = lazy(() => import("../pages/SettingsPage.jsx"));

function PageFallback() {
  return (
    <div role="status" style={{ padding: 24, color: "#64748b" }}>
      화면을 불러오는 중입니다.
    </div>
  );
}

export default function AppRoutes({
  conversations,
  currentTrace,
  chatProps,
}) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<ChatPage {...chatProps} />} />
        <Route
          path="/dashboard"
          element={
            <DashboardPage
              conversations={conversations}
              currentTrace={currentTrace}
            />
          }
        />
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route
          path="/analytics"
          element={<AnalyticsPage conversations={conversations} />}
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </Suspense>
  );
}

