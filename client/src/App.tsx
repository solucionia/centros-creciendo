import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import { useAuthStatus, useLogout } from "@/hooks/use-auth";

function Router() {
  return (
    <Switch>
      {/* Add pages below */}
      <Route path="/" component={Home}/>
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function LogoutButton() {
  const logout = useLogout();
  return (
    <Button
      variant="outline"
      size="sm"
      className="fixed right-4 top-4 z-50 gap-2 shadow-sm"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      data-testid="button-logout"
    >
      {logout.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      Salir
    </Button>
  );
}

// ─── Puerta de autenticación ──────────────────────────────────────────────────
// Toda la app queda detrás del login OTP: sin sesión válida solo se ve <Login>.
function AuthGate() {
  const { data, isLoading } = useAuthStatus();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.authenticated) {
    return <Login />;
  }

  return (
    <>
      <LogoutButton />
      <Router />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthGate />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
