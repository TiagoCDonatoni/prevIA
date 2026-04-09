import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { trackPublicPageView } from "../lib/analytics";

export function PublicAnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPublicPageView(location.pathname, location.search);
  }, [location.pathname, location.search]);

  return null;
}