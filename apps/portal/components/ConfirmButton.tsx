"use client";

import { useState } from "react";

interface ConfirmButtonProps {
  label: string;
  confirmMessage: string;
  onConfirm: () => Promise<void> | void;
}

/** Delete-style button that requires a native confirm before firing. */
export function ConfirmButton({
  label,
  confirmMessage,
  onConfirm,
}: ConfirmButtonProps) {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    if (!window.confirm(confirmMessage)) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      className="btn-danger"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? "…" : label}
    </button>
  );
}
