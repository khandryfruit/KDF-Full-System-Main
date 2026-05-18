import type { ReactNode } from "react";

type Accent = "green" | "orange";
type Variant = "default" | "plain" | "shipping";

export function CheckoutOption({
  selected,
  disabled,
  onClick,
  title,
  hint,
  trailing,
  leading,
  accent = "green",
  variant = "default",
  className = "",
  testId,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
  trailing?: ReactNode;
  leading?: ReactNode;
  accent?: Accent;
  variant?: Variant;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={[
        "kdf-checkout-option",
        `kdf-checkout-option--${variant}`,
        selected ? "is-selected" : "",
        accent === "orange" ? "is-orange" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="kdf-checkout-option__radio" aria-hidden>
        {selected ? <span className="kdf-checkout-option__radio-dot" /> : null}
      </span>
      {leading ? <span className="kdf-checkout-option__leading">{leading}</span> : null}
      <span
        className={[
          "kdf-checkout-option__body",
          variant === "shipping" ? "kdf-checkout-option__body--inline" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="kdf-checkout-option__title">{title}</span>
        {hint ? <span className="kdf-checkout-option__hint">{hint}</span> : null}
      </span>
      {trailing ? <span className="kdf-checkout-option__trailing">{trailing}</span> : null}
    </button>
  );
}
