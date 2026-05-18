import type { ReactNode } from "react";

type Accent = "green" | "orange";

export function CheckoutOption({
  selected,
  disabled,
  onClick,
  title,
  hint,
  trailing,
  accent = "green",
  className = "",
  testId,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
  trailing?: ReactNode;
  accent?: Accent;
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
      <span className="kdf-checkout-option__title">{title}</span>
      {hint ? <span className="kdf-checkout-option__hint">{hint}</span> : null}
      {trailing ? <span className="kdf-checkout-option__trailing">{trailing}</span> : null}
    </button>
  );
}
