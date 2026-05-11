import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/* ─── Auth Context ──────────────────────────────────────────────────────── */
interface AuthCtx {
  token: string | null;
  user: any | null;
  login: (token: string, user: any) => void;
  logout: () => void;
}
const AuthContext = createContext<AuthCtx>({
  token: null, user: null,
  login: () => {}, logout: () => {},
});
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("kdf_admin_app_token"));
  const [user,  setUser]  = useState<any | null>(() => {
    try { return JSON.parse(localStorage.getItem("kdf_admin_app_user") ?? "null"); } catch { return null; }
  });

  const login = (t: string, u: any) => {
    setToken(t); setUser(u);
    localStorage.setItem("kdf_admin_app_token", t);
    localStorage.setItem("kdf_admin_app_user",  JSON.stringify(u));
  };

  const logout = () => {
    setToken(null); setUser(null);
    localStorage.removeItem("kdf_admin_app_token");
    localStorage.removeItem("kdf_admin_app_user");
  };

  return <AuthContext.Provider value={{ token, user, login, logout }}>{children}</AuthContext.Provider>;
}

/* ─── Module Context ────────────────────────────────────────────────────── */
interface ModuleCtx { activeModules: string[]; loading: boolean; }
const ModuleContext = createContext<ModuleCtx>({ activeModules: [], loading: true });
export const useModules = () => useContext(ModuleContext);

function ModuleProvider({ children }: { children: ReactNode }) {
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/modules/active")
      .then(r => r.json())
      .then(d => {
        setActiveModules((d.modules ?? []).map((m: any) => m.module_key));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return <ModuleContext.Provider value={{ activeModules, loading }}>{children}</ModuleContext.Provider>;
}

/* ─── Pages ─────────────────────────────────────────────────────────────── */
import LoginPage          from "@/pages/LoginPage";
import DashboardPage      from "@/pages/DashboardPage";
import OrdersPage         from "@/pages/OrdersPage";
import OrderDetailPage    from "@/pages/OrderDetailPage";
import RidersPage         from "@/pages/RidersPage";
import ModulesPage        from "@/pages/ModulesPage";
import WhatsAppPage       from "@/pages/WhatsAppPage";
import WAConversationPage from "@/pages/WAConversationPage";
import CustomersPage      from "@/pages/CustomersPage";
import AnalyticsPage      from "@/pages/AnalyticsPage";
import ProductsPage       from "@/pages/ProductsPage";
import InvoicePOSPage     from "@/pages/InvoicePOSPage";
import LogisticsPage      from "@/pages/LogisticsPage";
import StubPage           from "@/pages/StubPage";
import MorePage           from "@/pages/MorePage";

function ProtectedRoute({ component: C, params }: { component: React.ComponentType<any>; params?: any }) {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => { if (!token) navigate("/login"); }, [token]);
  if (!token) return null;
  return <C params={params} />;
}

function Router() {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (token && window.location.pathname.includes("/login")) navigate("/");
  }, [token]);

  return (
    <Switch>
      <Route path="/login"          component={LoginPage} />
      <Route path="/"               component={() => <ProtectedRoute component={DashboardPage}   />} />
      {/* Orders */}
      <Route path="/orders"         component={() => <ProtectedRoute component={OrdersPage}       />} />
      <Route path="/orders/:id">
        {(params) => <ProtectedRoute component={OrderDetailPage} params={params} />}
      </Route>
      {/* Riders */}
      <Route path="/riders"         component={() => <ProtectedRoute component={RidersPage}       />} />
      {/* WhatsApp */}
      <Route path="/wa"             component={() => <ProtectedRoute component={WhatsAppPage}     />} />
      <Route path="/wa/:phone">
        {(params) => <ProtectedRoute component={WAConversationPage} params={params} />}
      </Route>
      {/* Customers */}
      <Route path="/customers"      component={() => <ProtectedRoute component={CustomersPage}    />} />
      {/* Analytics */}
      <Route path="/analytics"      component={() => <ProtectedRoute component={AnalyticsPage}    />} />
      {/* Products */}
      <Route path="/products"       component={() => <ProtectedRoute component={ProductsPage}     />} />
      {/* POS / Invoice */}
      <Route path="/pos"            component={() => <ProtectedRoute component={InvoicePOSPage}   />} />
      {/* Logistics */}
      <Route path="/logistics"      component={() => <ProtectedRoute component={LogisticsPage}    />} />
      {/* Stub pages — open in desktop admin panel */}
      <Route path="/payments"       component={() => <ProtectedRoute component={() => <StubPage slug="payments"      />} />} />
      <Route path="/branches"       component={() => <ProtectedRoute component={() => <StubPage slug="branches"      />} />} />
      <Route path="/store"          component={() => <ProtectedRoute component={() => <StubPage slug="store"         />} />} />
      <Route path="/notifications"  component={() => <ProtectedRoute component={() => <StubPage slug="notifications" />} />} />
      {/* System */}
      <Route path="/more"           component={() => <ProtectedRoute component={MorePage}         />} />
      <Route path="/modules"        component={() => <ProtectedRoute component={ModulesPage}      />} />
      {/* Fallback */}
      <Route                        component={() => <ProtectedRoute component={DashboardPage}    />} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ModuleProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </ModuleProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
