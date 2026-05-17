import React from "react";

type State = { hasError: boolean; message: string };

/** Catches render errors on PDP only — avoids taking down the whole storefront. */
export class ProductDetailErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[KDF Plus PDP]", error.message, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      return (
        <main className="kdf-page-shell px-4 py-16 text-center">
          <p className="text-4xl mb-4">🌿</p>
          <h2 className="text-xl font-semibold mb-2">This product page could not load</h2>
          <p className="mx-auto mb-2 max-w-sm text-sm text-muted-foreground">
            Please refresh or try again. You can also browse all products from the menu.
          </p>
          {import.meta.env.DEV && this.state.message ? (
            <p className="mx-auto mb-4 max-w-md text-xs text-red-600/80 font-mono">{this.state.message}</p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[#5FA800] px-6 py-3 text-sm font-bold text-white"
            >
              Refresh page
            </button>
            <a
              href={`${base}/products`}
              className="rounded-xl border border-[#5FA800]/30 px-6 py-3 text-sm font-semibold text-[#5FA800]"
            >
              Browse products
            </a>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
