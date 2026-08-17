import { toolsRequest } from "./client";
import type {
  BankrollAccount,
  BankrollAccountCreate,
  BankrollBootstrapResponse,
  BankrollEntry,
  BankrollEntryWrite,
  BankrollSummary,
} from "./types";

export function fetchBankrollBootstrap(): Promise<BankrollBootstrapResponse> {
  return toolsRequest<BankrollBootstrapResponse>("/tools/bankroll/bootstrap");
}

export function createBankrollAccount(payload: BankrollAccountCreate) {
  return toolsRequest<{ ok: true; account: BankrollAccount }>("/tools/bankroll/accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createBankrollEntry(payload: BankrollEntryWrite) {
  return toolsRequest<{ ok: true; entry: BankrollEntry }>("/tools/bankroll/entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateBankrollEntry(entryId: number, payload: BankrollEntryWrite) {
  return toolsRequest<{ ok: true; entry: BankrollEntry }>(
    `/tools/bankroll/entries/${encodeURIComponent(String(entryId))}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
}

export function deleteBankrollEntry(entryId: number) {
  return toolsRequest<{ ok: true; entry_id: number; deleted: true }>(
    `/tools/bankroll/entries/${encodeURIComponent(String(entryId))}`,
    { method: "DELETE" }
  );
}

export function fetchBankrollSummary() {
  return toolsRequest<{ ok: true; summary: BankrollSummary }>("/tools/bankroll/summary");
}
