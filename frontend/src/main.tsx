import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Providers } from "./app/providers";
import { AppRoutes } from "./app/routes";
import { AuthGate } from "./features/auth";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <AuthGate>
        <AppRoutes />
      </AuthGate>
    </Providers>
  </StrictMode>,
);
