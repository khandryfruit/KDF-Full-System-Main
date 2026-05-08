import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      console.error("[KDF Plus] Crash:", error.message, info.componentStack);
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message ?? "";
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#0D2B00",
            padding: "24px",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 340 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🌿</div>
            <h1 style={{ color: "#5FA800", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              KDF Plus
            </h1>
            <p style={{ color: "#ffffff", fontSize: 15, marginBottom: 6, fontWeight: 600 }}>
              Something went wrong
            </p>
            <p style={{ color: "#a4c982", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              Please refresh the page to continue shopping.
            </p>
            {msg ? (
              <p style={{ color: "#6b7280", fontSize: 10, marginBottom: 20, fontFamily: "monospace", wordBreak: "break-word" }}>
                {msg}
              </p>
            ) : null}
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: "#5FA800",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "12px 28px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                WebkitAppearance: "none",
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
