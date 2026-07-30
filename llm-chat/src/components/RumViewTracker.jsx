import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { datadogRum } from "../lib/observability.js";

export default function RumViewTracker() {
  const location = useLocation();

  useEffect(() => {
    datadogRum.startView({ name: location.pathname });
  }, [location.pathname]);

  return null;
}

