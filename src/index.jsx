import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tailwind.css";
import "./styles/index.css";
import "./i18n/config";

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

root.render(<App />);