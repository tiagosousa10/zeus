import React, { Component, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { useSession } from "./lib/session";
import "./styles.css";
const Entry = lazy(() => import("./pages/Entry"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Portal = lazy(() => import("./pages/Portal"));
const Cinema = lazy(() => import("./pages/Cinema"));
const Explore = lazy(() => import("./pages/Explore"));
const Title = lazy(() => import("./pages/Title"));
const Player = lazy(() => import("./pages/Player"));
const TV = lazy(() => import("./pages/TV"));
const Addons = lazy(() => import("./pages/Addons"));
const Account = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));
const States = lazy(() => import("./pages/States"));
const Guide = lazy(() => import("./pages/Guide"));
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30000 },
  },
});
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="page-loading">
        <b>ZEUS</b>
        <h1>Algo interrompeu a viagem.</h1>
        <p>Tenta abrir novamente este ecrã.</p>
        <a className="z-btn z-btn--primary" href="/portal">
          Voltar ao Portal
        </a>
      </main>
    ) : (
      this.props.children
    );
  }
}
function Guard({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const { user, loading, error } = useSession();
  if (loading)
    return (
      <div className="page-loading" role="status">
        <b>Ζ</b>A abrir as portas…
      </div>
    );
  if (error)
    return (
      <div className="page-loading">
        <b>ZEUS</b>
        <p>Não foi possível ligar à API.</p>
        <button className="z-btn" onClick={() => location.reload()}>
          Tentar novamente
        </button>
      </div>
    );
  if (!user || !user.twoFactorEnabled || !user.twoFactorVerified) {
    location.replace("/entrada");
    return null;
  }
  if (admin && user.role !== "admin")
    return (
      <div className="page-loading">
        <h1>Este lugar é reservado ao Administrador.</h1>
        <a href="/portal">Voltar ao Portal</a>
      </div>
    );
  return children;
}
const root = createRootRoute({
  component: () => (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="page-loading" role="status">
            <b>Ζ</b>A abrir…
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  ),
  notFoundComponent: () => (
    <div className="page-loading">
      <h1>Este caminho não existe.</h1>
      <a href="/portal">Voltar ao Portal</a>
    </div>
  ),
});
const screens: {
  path: string;
  component: React.ComponentType;
  public?: boolean;
  admin?: boolean;
}[] = [
  { path: "/", component: Portal },
  { path: "/entrada", component: Entry, public: true },
  { path: "/onboarding", component: Onboarding },
  { path: "/portal", component: Portal },
  { path: "/cinema", component: Cinema },
  { path: "/explorar", component: Explore },
  { path: "/titulo", component: Title },
  { path: "/leitor", component: Player },
  { path: "/tv", component: TV },
  { path: "/addons", component: Addons },
  { path: "/conta", component: Account },
  { path: "/admin", component: Admin, admin: true },
  { path: "/estados", component: States },
  { path: "/guia", component: Guide },
];
const routeTree = root.addChildren(
  screens.map((s) =>
    createRoute({
      getParentRoute: () => root,
      path: s.path,
      component: () =>
        s.public ? (
          <s.component />
        ) : (
          <Guard admin={s.admin}>
            <s.component />
          </Guard>
        ),
    }),
  ),
);
const router = createRouter({ routeTree });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
