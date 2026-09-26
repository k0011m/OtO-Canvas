import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { SurveyApp } from "./survey/SurveyApp";
import { registerServiceWorker } from "./pwa/registerServiceWorker";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has("survey") ? <SurveyApp admin={new URLSearchParams(location.search).get("survey") === "admin"} /> : <App />}
  </React.StrictMode>,
);

registerServiceWorker();
