#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { authTools } from './tools/auth.js';
import { partnerTools } from './tools/partners.js';
import { itemTools } from './tools/items.js';
import { quoteTools } from './tools/quotes.js';
import { billingTools } from './tools/billings.js';
import { deliveryTools } from './tools/delivery.js';

// Combine all tools
const allTools = {
  ...authTools,
  ...partnerTools,
  ...itemTools,
  ...quoteTools,
  ...billingTools,
  ...deliveryTools,
};

type ToolName = keyof typeof allTools;
type ToolDef = (typeof allTools)[ToolName];

// Create MCP server
const server = new Server(
  {
    name: 'mf-invoice-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema),
  }));

  return { tools };
});

// Handle call tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = allTools[name as ToolName] as ToolDef | undefined;

  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  }

  try {
    // Validate input
    const validatedArgs = tool.inputSchema.parse(args || {});
    // Execute handler (use any to avoid complex type inference)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (tool.handler as (args: any) => Promise<any>)(validatedArgs);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        content: [
          {
            type: 'text',
            text: `入力パラメータエラー: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `エラー: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MF Invoice MCP Server started');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
