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

  render() {
    if (this.state.hasError) {
      return (
        <main className="kdf-page-shell px-4 py-16 text-center">
          <p className="text-4xl mb-4">🌿</p>
          <h2 className="text-xl font-semibold mb-2">This product page could not load</h2>
          <p className="mx-auto mb-6 max-w-sm text-sm text-muted-foreground">
            Please refresh. If the problem continues, browse all products from the menu.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-[#5FA800] px-6 py-3 text-sm font-bold text-white"
          >
            Refresh Page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
