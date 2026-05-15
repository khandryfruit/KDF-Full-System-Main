import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { ShieldOff, Loader2 } from "lucide-react";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";

interface Props {
  permission?: string;
  anyOf?: string[];
  children: ReactNode;
}

export function PermissionRoute({ permission, anyOf, children }: Props) {
  const { hasPermission, hasAnyPermission, isLoaded } = useAdminAuth();
  const [, setLoc] = useLocation();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allowed = permission
    ? hasPermission(permission)
    : anyOf?.length
      ? hasAnyPermission(anyOf)
      : true;

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldOff className="w-8 h-8 text-destructive" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Access denied</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Your role does not include permission for this area. Contact a Super Admin if you need access.
          </p>
        </div>
        <Button variant="outline" onClick={() => setLoc("/")}>Back to dashboard</Button>
      </div>
    );
  }

  return <>{children}</>;
}
