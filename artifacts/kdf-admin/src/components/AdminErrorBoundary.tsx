import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

function isChunkLoadError(err: Error): boolean {
  return (
    /Failed to fetch dynamically imported module/i.test(err.message) ||
    /Loading chunk \d+ failed/i.test(err.message) ||
    /Importing a module script failed/i.test(err.message)
  );
}

export class AdminErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[kdf-admin] UI error:", error, info.componentStack);
  }

  private handleReload = () => {
    sessionStorage.removeItem("kdf_admin_chunk_reload_v1");
    window.location.reload();
  };

  private handleClearAndLogin = () => {
    localStorage.removeItem("kdf_admin_token");
    localStorage.removeItem("kdf_admin_user");
    sessionStorage.removeItem("kdf_admin_chunk_reload_v1");
    const base = (import.meta.env.BASE_URL || "/admin/").replace(/\/$/, "");
    window.location.href = `${base}/login`;
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);

    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-foreground">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
          <h1 className="text-lg font-bold text-foreground">
            {chunk ? "Admin needs a refresh" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {chunk
              ? "A cached page tried to load an old script after an update. Reload once to fix the black screen."
              : "The dashboard hit an unexpected error. Try reloading; if it persists, sign in again."}
          </p>
          <p className="mt-3 break-all rounded-md bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              onClick={this.handleReload}
            >
              Reload page
            </button>
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
              onClick={this.handleClearAndLogin}
            >
              Clear session & sign in
            </button>
          </div>
        </div>
      </div>
    );
  }
}
