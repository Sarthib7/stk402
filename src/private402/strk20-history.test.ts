import assert from "node:assert/strict";
import test from "node:test";

import type { HistoryPage } from "@starkware-libs/starknet-privacy-sdk";

import { Strk20HistoryEvidenceReader } from "./strk20-history.js";

const transactionHash = 0x444n;

function page(notes: HistoryPage["transactions"][number]["notes"]): HistoryPage {
  return {
    blockRef: 10,
    transactions: [
      {
        blockNumber: 10,
        transactionHash,
        notes,
        deposits: [],
        withdrawals: [],
        openNoteDeposits: [],
      },
    ],
    cursor: { subchannels: [], historyComplete: true },
  };
}

function indexer(historyPage: HistoryPage) {
  return {
    discoverNotes: async () => ({
      timestamp: 10,
      notes: new Map(),
      cursor: { blockId: 10, incomingChannels: new Map() },
    }),
    discoverChannels: async () => ({
      timestamp: 10,
      channels: new Map(),
      total: 0,
    }),
    fetchHistory: async () => historyPage,
  };
}

test("maps one indexed incoming note to payment evidence", async () => {
  const reader = new Strk20HistoryEvidenceReader(
    indexer(
      page([
        {
          channelKind: "incoming",
          token: 0x333n,
          noteIndex: 0,
          noteId: 1n,
          counterparty: 0x111n,
          amount: 50n,
          salt: 2n,
        },
      ]),
    ) as never,
    0x222n,
    0x123n,
    async () => true,
  );

  assert.deepEqual(await reader.findPayment("0x444"), {
    transactionHash: "0x444",
    payer: "0x111",
    recipient: "0x222",
    token: "0x333",
    amount: 50n,
    final: true,
  });
});

test("rejects an ambiguous transaction with multiple incoming notes", async () => {
  const incoming = {
    channelKind: "incoming" as const,
    token: 0x333n,
    noteIndex: 0,
    noteId: 1n,
    counterparty: 0x111n,
    amount: 50n,
    salt: 2n,
  };
  const reader = new Strk20HistoryEvidenceReader(
    indexer(page([incoming, { ...incoming, noteId: 3n, noteIndex: 1 }])) as never,
    0x222n,
    0x123n,
    async () => true,
  );

  assert.equal(await reader.findPayment("0x444"), null);
});
