import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";

// One chunk per page: the first screen loads fast, charts/markdown load when needed.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Customers = lazy(() => import("./pages/Customers"));
const Customer360 = lazy(() => import("./pages/Customer360"));
const Campaign = lazy(() => import("./pages/Campaign"));
const Copilot = lazy(() => import("./pages/Copilot"));
const Amd = lazy(() => import("./pages/Amd"));

const page = (el: React.ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={page(<Dashboard />)} />
        <Route path="customers" element={page(<Customers />)} />
        <Route path="customers/:id" element={page(<Customer360 />)} />
        <Route path="campaign" element={page(<Campaign />)} />
        <Route path="copilot" element={page(<Copilot />)} />
        <Route path="amd" element={page(<Amd />)} />
        <Route path="*" element={<p className="text-slate-400">Page not found.</p>} />
      </Route>
    </Routes>
  );
}
