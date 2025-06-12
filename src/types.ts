// Using any types for OpenAPI to avoid dependency issues

export interface ServerConfig {
  specsPath: string;
  port?: number;
  transportType?: 'stdio' | 'httpStream';
}

export interface AuthConfig {
  [apiName: string]: {
    type: 'bearer' | 'apiKey' | 'basic';
    token?: string;
    username?: string;
    password?: string;
    headerName?: string;
  };
}

export interface ParsedSpec {
  apiName: string;
  filePath: string;
  spec: any;
  tools: GeneratedTool[];
}

export interface GeneratedTool {
  name: string;
  description: string;
  operationId?: string;
  method: string;
  path: string;
  parameters: ToolParameter[];
  requestBody?: any;
  responses: any;
  security?: any[];
  baseUrl: string;
}

export interface ToolParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: any;
  description?: string;
}

export interface ToolExecutionContext {
  apiName: string;
  tool: GeneratedTool;
  authConfig?: AuthConfig[string];
}

export interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
} 