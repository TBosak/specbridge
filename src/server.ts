import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { ServerConfig, ParsedSpec, AuthConfig, GeneratedTool, ToolExecutionContext } from './types';
import { parseOpenAPISpec, isOpenAPIFile } from './utils/openapi-parser';
import { HttpClient } from './utils/http-client';
import { loadAuthConfig } from './utils/auth';
import fs from 'fs';
import path from 'path';

function debugLog(message: string) {
  try {
    const debugPath = path.join(__dirname, '../debug.log');
    fs.appendFileSync(debugPath, `${new Date().toISOString()}: ${message}\n`);
  } catch (e) {
  }
}

export class OpenAPIMCPServer {
  private fastMCP: FastMCP;
  private httpClient: HttpClient;
  private parsedSpecs: Map<string, ParsedSpec> = new Map();
  private authConfig: AuthConfig = {};
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.httpClient = new HttpClient();
    
    this.fastMCP = new FastMCP({
      name: 'Specbridge',
      version: '1.0.0',
      instructions: 'I bridge OpenAPI specifications to MCP tools. I load .json, .yaml, and .yml files containing OpenAPI specs from a specified folder and automatically generate tools for each endpoint. Authentication is handled via environment variables with naming patterns like {API_NAME}_API_KEY.'
    });

    this.setupServerEvents();
  }

  private setupServerEvents(): void {
    this.fastMCP.on('connect', (event: any) => {
      this.authConfig = loadAuthConfig(this.config.specsPath);
    });

    this.fastMCP.on('disconnect', (event: any) => {
    });
  }

  async start(): Promise<void> {
    // Only log to console if not in stdio mode (which would interfere with MCP protocol)
    const isStdioMode = this.config.transportType !== 'httpStream';
    
    debugLog(`Starting Specbridge with specsPath: ${this.config.specsPath}`);
    
    if (!isStdioMode) {
      console.log('Starting Specbridge...');
    }
    
    // Load authentication config
    this.authConfig = loadAuthConfig(this.config.specsPath);
    
    // Load existing specs FIRST, before starting FastMCP server
    await this.loadExistingSpecs();
    
    debugLog(`After loading specs: ${this.parsedSpecs.size} specs, ${this.getTotalToolsCount()} tools`);
    
    // Start FastMCP server AFTER all tools are registered
    const transportConfig = this.config.transportType === 'httpStream' && this.config.port
      ? {
          transportType: 'httpStream' as const,
          httpStream: { port: this.config.port }
        }
      : { transportType: 'stdio' as const };
    
    this.fastMCP.start(transportConfig);
    
    if (!isStdioMode) {
      console.log(`Specbridge started. Loaded ${this.parsedSpecs.size} API specifications with ${this.getTotalToolsCount()} tools from ${this.config.specsPath}.`);
    }
  }

  async stop(): Promise<void> {
    // No cleanup needed since we removed file watching
  }

  private async loadExistingSpecs(): Promise<void> {
    const existingFiles = await this.getExistingFiles();
    debugLog(`Found ${existingFiles.length} existing files: ${existingFiles.join(', ')}`);
    for (const filePath of existingFiles) {
      debugLog(`Processing file: ${filePath}`);
      await this.handleSpecAdded(filePath);
    }
  }

  private async getExistingFiles(): Promise<string[]> {
    try {
      debugLog(`Reading directory: ${this.config.specsPath}`);
      
      // Ensure directory exists
      try {
        await fs.promises.access(this.config.specsPath);
      } catch {
        await fs.promises.mkdir(this.config.specsPath, { recursive: true });
        return [];
      }
      
      const files = await fs.promises.readdir(this.config.specsPath);
      debugLog(`Found files: ${files.join(', ')}`);
      
      const filteredFiles = files.filter(file => {
        const isValid = isOpenAPIFile(file);
        debugLog(`File ${file}: isOpenAPIFile = ${isValid}`);
        return isValid;
      });
      
      const fullPaths = filteredFiles.map(file => path.join(this.config.specsPath, file));
      debugLog(`Returning files: ${fullPaths.join(', ')}`);
      return fullPaths;
    } catch (error) {
      debugLog(`Error reading directory ${this.config.specsPath}: ${error}`);
      return [];
    }
  }

  private async handleSpecAdded(filePath: string): Promise<void> {
    debugLog(`Attempting to parse: ${filePath}`);
    const parsedSpec = await parseOpenAPISpec(filePath);
    if (parsedSpec) {
      debugLog(`Successfully parsed ${filePath}: ${parsedSpec.tools.length} tools`);
      this.parsedSpecs.set(filePath, parsedSpec);
      this.registerToolsFromSpec(parsedSpec);
    } else {
      debugLog(`Failed to parse: ${filePath}`);
    }
  }

  private registerToolsFromSpec(spec: ParsedSpec): void {
    for (const tool of spec.tools) {
      this.registerTool(spec, tool);
    }
  }

  private registerTool(spec: ParsedSpec, tool: GeneratedTool): void {
    // Build Zod schema from OpenAPI parameters
    const schema = this.buildZodSchema(tool);
    
    this.fastMCP.addTool({
      name: tool.name,
      description: tool.description,
      parameters: schema,
      execute: async (args: Record<string, any>) => {
        const context: ToolExecutionContext = {
          apiName: spec.apiName,
          tool,
          authConfig: this.authConfig[spec.apiName]
        };
        
        return await this.httpClient.executeRequest(context, args);
      }
    });
  }

  private buildZodSchema(tool: GeneratedTool): z.ZodObject<any> {
    const schemaFields: Record<string, z.ZodType<any>> = {};
    
    // Add parameters
    for (const param of tool.parameters) {
      let fieldSchema = this.openAPISchemaToZod(param.schema);
      
      if (param.description) {
        fieldSchema = fieldSchema.describe(param.description);
      }
      
      if (!param.required) {
        fieldSchema = fieldSchema.optional();
      }
      
      schemaFields[param.name] = fieldSchema;
    }
    
    // Add request body field if present
    if (tool.requestBody) {
      schemaFields.body = z.any().optional().describe('Request body data');
    }
    
    return z.object(schemaFields);
  }

  private openAPISchemaToZod(schema: any): z.ZodType<any> {
    if (!schema || typeof schema !== 'object') {
      return z.any();
    }
    
    switch (schema.type) {
      case 'string':
        return z.string();
      case 'number':
        return z.number();
      case 'integer':
        return z.number().int();
      case 'boolean':
        return z.boolean();
      case 'array':
        return z.array(this.openAPISchemaToZod(schema.items || {}));
      case 'object':
        return z.record(z.any());
      default:
        return z.any();
    }
  }

  private getTotalToolsCount(): number {
    return Array.from(this.parsedSpecs.values())
      .reduce((total, spec) => total + spec.tools.length, 0);
  }

  public getLoadedSpecs(): ParsedSpec[] {
    return Array.from(this.parsedSpecs.values());
  }

  public getAuthConfig(): AuthConfig {
    return this.authConfig;
  }
} 