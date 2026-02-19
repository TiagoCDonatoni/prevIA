import React from "react";
import { PlanChangeModal } from "./PlanChangeModal";

type Props = {
  open: boolean;
  reason: "NO_CREDITS" | "FEATURE_LOCKED";
  onClose: () => void;
};

/**
 * Back-compat wrapper (antigo UpgradeModal).
 * Agora usamos PlanChangeModal para permitir escolher o plano.
 */
export default function UpgradeModal({ open, reason, onClose }: Props) {
  return <PlanChangeModal open={open} reason={reason} onClose={onClose} />;
}
