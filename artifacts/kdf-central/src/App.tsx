import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import CentralDashboard from "@/pages/central-dashboard";
import BranchDetail from "@/pages/branch-detail";
import BranchesManage from "@/pages/branches-manage";
import Login from "@/pages/login";
import { getToken } from "@/lib/api";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(() => !!getToken());

  if (!authed) {
    return <Login onLogin={() => { setAuthed(true); queryClient.clear(); }} />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={CentralDashboard} />
      <Route path="/branches" component={BranchesManage} />
      <Route path="/branches/:id" component={BranchDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGate>
            <Router />
          </AuthGate>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
