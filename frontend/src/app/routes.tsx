import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Loading } from "../components/ui";

// One chunk per page: the first screen loads fast, the rest load when visited.
const Dashboard = lazy(() => import("../pages/Dashboard"));
const Customers = lazy(() => import("../pages/Customers"));
const Customer360 = lazy(() => import("../pages/Customer360"));
const Campaign = lazy(() => import("../pages/Campaign"));
const Copilot = lazy(() => import("../pages/Copilot"));
const Amd = lazy(() => import("../pages/Amd"));

const page = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={page(<Dashboard />)} />
        <Route path="customers" element={page(<Customers />)} />
        <Route path="customers/:id" element={page(<Customer360 />)} />
        <Route path="campaign" element={page(<Campaign />)} />
        <Route path="copilot" element={page(<Copilot />)} />
        <Route path="amd" element={page(<Amd />)} />
        <Route path="*" element={<p className="text-muted">Page not found.</p>} />
      </Route>
    </Routes>
  );
}
