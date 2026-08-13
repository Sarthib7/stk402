import type { HistoryCursor, HistoryPage } from "@starkware-libs/starknet-privacy-sdk";
import { IndexerDiscoveryProvider } from "@starkware-libs/starknet-privacy-sdk";

import type {
  PaymentEvidence,
  PaymentEvidenceReader,
} from "./signed-receipt.js";

type HistoryIndexer = Pick<
  IndexerDiscoveryProvider,
  "discoverNotes" | "discoverChannels" | "fetchHistory"
>;

export class Strk20HistoryEvidenceReader implements PaymentEvidenceReader {
  constructor(
    private readonly indexer: HistoryIndexer,
    private readonly recipient: bigint,
    private readonly viewingKey: bigint,
    private readonly isFinal: (transactionHash: string) => Promise<boolean>,
  ) {}

  async findPayment(transactionHash: string): Promise<PaymentEvidence | null> {
    const notes = await this.indexer.discoverNotes(
      this.recipient,
      this.viewingKey,
    );
    const outgoing = await this.indexer.discoverChannels(
      this.recipient,
      this.viewingKey,
      "all",
      { blockIdentifier: notes.timestamp },
    );

    let historyCursor: HistoryCursor | undefined;
    const channelCursor = {
      ...(outgoing.channels ? { channels: outgoing.channels as never } : {}),
      ...(outgoing.total !== undefined ? { total: outgoing.total } : {}),
    };
    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      const page: HistoryPage = await this.indexer.fetchHistory(
        this.recipient,
        notes.cursor,
        channelCursor,
        {
          blockIdentifier: notes.timestamp,
          maxTransactions: 50,
          ...(historyCursor ? { historyCursor } : {}),
        },
      );
      const transaction = page.transactions.find(
        (candidate) => candidate.transactionHash === BigInt(transactionHash),
      );

      if (transaction) {
        const incoming = transaction.notes.filter(
          (note) => note.channelKind === "incoming",
        );
        if (incoming.length !== 1) return null;

        const note = incoming[0]!;
        return {
          transactionHash,
          payer: `0x${note.counterparty.toString(16)}`,
          recipient: `0x${this.recipient.toString(16)}`,
          token: `0x${note.token.toString(16)}`,
          amount: note.amount,
          final: await this.isFinal(transactionHash),
        };
      }

      if (page.cursor.historyComplete) return null;
      historyCursor = page.cursor;
    }

    throw new Error("STRK20 history exceeded 100 pages");
  }
}
