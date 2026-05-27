import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tailwind.css";
import "./styles/index.css";

// Handle Auth0 authorization response messages to prevent warnings
window.addEventListener('message', (event) => {
  // Filter Auth0 messages - they are handled internally by Auth0 SDK
  if (event.data && event.data.type === 'authorization_response') {
    // Auth0 handles this internally, no action needed
    return;
  }
});

const container = document.getElementById("root");
const root = createRoot(container);

const renderApp = () => {
  root.render(<App />);
};

import("./i18n/config")
  .then(({ i18nReady }) => i18nReady)
  .catch((error) => {
    console.error("[i18n] Failed to initialize translations:", error);
  })
  .finally(renderApp);
