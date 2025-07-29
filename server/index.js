#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// リモートMCPサーバーのエンドポイント
const REMOTE_MCP_ENDPOINT = 'https://mcp-company-lens-v1.gepuro.net/mcp';

class CompanyLensServer {
  constructor() {
    this.server = new Server(
      {
        name: 'company-lens-db',
        version: '1.0.1',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'execute_query',
            description: '企業データベースからPostgreSQLでデータを取得します。SELECTクエリのみ実行可能です。',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: '実行するSQLクエリ（SELECTのみ）',
                },
              },
              required: ['query'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'execute_query') {
        return await this.executeQuery(args.query);
      }

      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    });
  }

  async executeQuery(query) {
    try {
      // リモートMCPサーバーにリクエストを送信
      const response = await fetch(REMOTE_MCP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'execute_query',
            arguments: {
              query: query,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new McpError(
          ErrorCode.InternalError,
          `リモートサーバーエラー: ${result.error.message}`
        );
      }

      // リモートサーバーからの結果をそのまま返す
      return result.result;

    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }

      throw new McpError(
        ErrorCode.InternalError,
        `リモートMCPサーバーへの接続エラー: ${error.message}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Company Lens MCP Proxy Server running on stdio');
  }
}

const server = new CompanyLensServer();
server.run().catch(console.error);
