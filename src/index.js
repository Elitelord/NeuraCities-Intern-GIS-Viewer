import React from "react";
import { createRoot } from "react-dom/client";
import "./App.css";       // keep global layout here (Leaflet CSS is imported in App.js)
import App from "./App";

const container = document.getElementById("root");
const root = createRoot(container);

// No StrictMode (avoids double-mount in dev that can confuse Leaflet)
root.render(<App />);