import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  loadFundingConfig,
  loadNetworkConfig,
  loadPayerConfig,
  runFunding,
  runPayer,
} from "../index.js";

function textResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof payload === "string"
            ? payload
            : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

const server = new McpServer({
  name: "stk402",
  version: "0.0.0",
});

server.tool(
  "stk402_check_network",
  "Read STK402_NETWORK / RPC / pool from the process environment and report chain reachability fields that loadNetworkConfig returns.",
  async () => {
    try {
      return textResult(loadNetworkConfig());
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.tool(
  "stk402_fund_payer",
  "Deposit into the Agent Payer STRK20 notes using FundingConfig from the process environment (.env.payer style).",
  async () => {
    try {
      const transactionHash = await runFunding(loadFundingConfig());
      return textResult({ transactionHash });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.tool(
  "stk402_pay_resource",
  "Pay a Payable x402 Paid Resource through stk402 (402 challenge → STRK20 settle → Receipt). Uses PayerConfig from the process environment. Optional resourceUrl overrides STK402_RESOURCE_URL for this call only.",
  {
    resourceUrl: z
      .string()
      .url()
      .optional()
      .describe("Override Paid Resource URL for this payment"),
  },
  async ({ resourceUrl }) => {
    try {
      if (resourceUrl) {
        process.env.STK402_RESOURCE_URL = resourceUrl;
      }
      const result = await runPayer(loadPayerConfig());
      return textResult(result);
    } catch (error) {
      return errorResult(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
