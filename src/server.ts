import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { ServerConfig, ParsedSpec, AuthConfig, GeneratedTool, ToolExecutionContext } from './types';
import { parseOpenAPISpec, isOpenAPIFile } from './utils/openapi-parser';
import { HttpClient } from './utils/http-client';
import { loadAuthConfig } from './utils/auth';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

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
      version: '1.0.2',
      instructions: 'I bridge OpenAPI specifications to MCP tools. I load .json, .yaml, and .yml files containing OpenAPI specs from a specified folder and automatically generate tools for each endpoint. I also provide built-in tools for managing the OpenAPI specs themselves (list, get, update) and for discovering new APIs through the APIs.guru directory. Authentication is handled via environment variables with naming patterns like {API_NAME}_API_KEY.'
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
    
    // Register built-in spec management tools
    this.registerBuiltInTools();
    
    // Register APIs.guru tools
    this.registerApisGuruTools();
    
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

  private registerBuiltInTools(): void {
    // Tool to list all OpenAPI specs in the folder
    this.fastMCP.addTool({
      name: 'specbridge_list_specs',
      description: 'List all OpenAPI specification files in the specs folder',
      parameters: z.object({}),
      execute: async () => {
        try {
          const files = await fs.promises.readdir(this.config.specsPath);
          const specFiles = files.filter(file => isOpenAPIFile(file));
          
          const specInfo = await Promise.all(
            specFiles.map(async (file) => {
              const filePath = path.join(this.config.specsPath, file);
              const stats = await fs.promises.stat(filePath);
              return {
                filename: file,
                path: filePath,
                size: `${(stats.size / 1024).toFixed(1)} KB`,
                modified: stats.mtime.toISOString(),
                extension: path.extname(file)
              };
            })
          );

          return `Found ${specFiles.length} OpenAPI specification files:\n\n` +
            specInfo.map(spec => 
              `📄 ${spec.filename}\n` +
              `   Path: ${spec.path}\n` +
              `   Size: ${spec.size}\n` +
              `   Modified: ${spec.modified}\n` +
              `   Format: ${spec.extension}`
            ).join('\n\n');
        } catch (error) {
          return `Error listing specs: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    });

    // Tool to get the content of a specific OpenAPI spec
    this.fastMCP.addTool({
      name: 'specbridge_get_spec',
      description: 'Get the content of a specific OpenAPI specification file',
      parameters: z.object({
        filename: z.string().describe('The filename of the spec to retrieve (e.g., "petstore.json", "github.yaml")')
      }),
      execute: async (args) => {
        try {
          const { filename } = args;
          const filePath = path.join(this.config.specsPath, filename);
          
          // Security check - ensure the file is within the specs directory
          const resolvedPath = path.resolve(filePath);
          const resolvedSpecsPath = path.resolve(this.config.specsPath);
          if (!resolvedPath.startsWith(resolvedSpecsPath)) {
            return `Error: Access denied. File must be within the specs directory.`;
          }
          
          // Check if file exists and is a valid OpenAPI file
          if (!isOpenAPIFile(filename)) {
            return `Error: "${filename}" is not a valid OpenAPI specification file. Must be .json, .yaml, or .yml.`;
          }
          
          const content = await fs.promises.readFile(filePath, 'utf-8');
          
          return `Content of ${filename}:\n\n\`\`\`${path.extname(filename).slice(1)}\n${content}\n\`\`\``;
        } catch (error) {
          if ((error as any).code === 'ENOENT') {
            return `Error: File "${args.filename}" not found in specs directory.`;
          }
          return `Error reading spec: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    });

    // Tool to update a specific OpenAPI spec
    this.fastMCP.addTool({
      name: 'specbridge_update_spec',
      description: 'Update the content of a specific OpenAPI specification file',
      parameters: z.object({
        filename: z.string().describe('The filename of the spec to update (e.g., "petstore.json", "github.yaml")'),
        content: z.string().describe('The new content for the specification file')
      }),
      execute: async (args) => {
        try {
          const { filename, content } = args;
          const filePath = path.join(this.config.specsPath, filename);
          
          // Security check - ensure the file is within the specs directory
          const resolvedPath = path.resolve(filePath);
          const resolvedSpecsPath = path.resolve(this.config.specsPath);
          if (!resolvedPath.startsWith(resolvedSpecsPath)) {
            return `Error: Access denied. File must be within the specs directory.`;
          }
          
          // Check if file is a valid OpenAPI file extension
          if (!isOpenAPIFile(filename)) {
            return `Error: "${filename}" is not a valid OpenAPI specification file. Must be .json, .yaml, or .yml.`;
          }
          
          // Validate that the content is valid JSON/YAML by trying to parse it
          try {
            if (filename.endsWith('.json')) {
              JSON.parse(content);
            } else {
              // For YAML, we'll do a basic validation - the OpenAPI parser will catch any issues later
              if (!content.trim()) {
                throw new Error('Content cannot be empty');
              }
            }
          } catch (parseError) {
            return `Error: Invalid ${filename.endsWith('.json') ? 'JSON' : 'YAML'} content. ${parseError instanceof Error ? parseError.message : String(parseError)}`;
          }
          
          // Create backup of existing file if it exists
          let backupCreated = false;
          try {
            await fs.promises.access(filePath);
            const backupPath = `${filePath}.backup.${Date.now()}`;
            await fs.promises.copyFile(filePath, backupPath);
            backupCreated = true;
          } catch (error) {
            // File doesn't exist, no backup needed
          }
          
          // Write the new content
          await fs.promises.writeFile(filePath, content, 'utf-8');
          
          // Try to validate the updated spec
          const updatedSpec = await parseOpenAPISpec(filePath);
          if (updatedSpec) {
            return `✅ Successfully updated "${filename}".\n` +
              `${backupCreated ? '📄 Backup created.\n' : ''}` +
              `🔧 Spec validated successfully - found ${updatedSpec.tools.length} tools.\n\n` +
              `Tools that will be available after restart:\n${updatedSpec.tools.map(t => `  • ${t.name}`).join('\n')}\n\n` +
              `🔄 **Please restart the MCP server to see the updated tools.**`;
          } else {
            return `⚠️ File "${filename}" was updated but failed OpenAPI validation. ` +
              `The file was saved but tools may not work correctly. ` +
              `Please check the OpenAPI specification format and restart the server.`;
          }
          
        } catch (error) {
          return `Error updating spec: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    });

    // Tool to download and save OpenAPI specs from URLs
    this.fastMCP.addTool({
      name: 'specbridge_download_spec',
      description: 'Download an OpenAPI specification from a URL and save it to the specs folder with a custom name. This allows you to give meaningful names to downloaded specs instead of generic names like "openapi.json".',
      parameters: z.object({
        url: z.string().url().describe('The URL of the OpenAPI specification to download'),
        filename: z.string().describe('The filename to save the spec as. Choose a descriptive name that identifies the API (e.g., "stripe-payments.json", "github-repos.yaml", "twilio-messaging.json"). Must end with .json, .yaml, or .yml.')
      }),
      execute: async (args) => {
        try {
          const { url, filename } = args;
          
          // Validate filename
          if (!isOpenAPIFile(filename)) {
            return `Error: "${filename}" is not a valid OpenAPI specification filename. Must end with .json, .yaml, or .yml.`;
          }
          
          // Provide helpful naming suggestions
          if (filename.toLowerCase() === 'openapi.json' || filename.toLowerCase() === 'openapi.yaml' || filename.toLowerCase() === 'openapi.yml') {
            return `Error: Please choose a more descriptive filename instead of "${filename}". Consider names like:\n` +
              `  • "stripe-payments.json" for Stripe API\n` +
              `  • "github-repos.json" for GitHub API\n` +
              `  • "twilio-messaging.json" for Twilio Messaging\n` +
              `  • "openai-completions.json" for OpenAI API\n\n` +
              `This helps identify which API is which when you have multiple specs.`;
          }
          
          const filePath = path.join(this.config.specsPath, filename);
          
          // Security check - ensure the file is within the specs directory
          const resolvedPath = path.resolve(filePath);
          const resolvedSpecsPath = path.resolve(this.config.specsPath);
          if (!resolvedPath.startsWith(resolvedSpecsPath)) {
            return `Error: Access denied. File must be within the specs directory.`;
          }
          
          // Check if file already exists
          try {
            await fs.promises.access(filePath);
            return `Error: File "${filename}" already exists. Please choose a different filename or use specbridge_update_spec to modify it.`;
          } catch (error) {
            // File doesn't exist, which is what we want
          }
          
          // Download the specification
          const response = await axios.get(url, {
            headers: {
              'User-Agent': 'specbridge/1.0.2',
              'Accept': 'application/json, application/x-yaml, text/yaml, text/x-yaml, */*'
            },
            timeout: 30000
          });
          
          let content: string;
          if (typeof response.data === 'string') {
            content = response.data;
          } else {
            // If it's an object, stringify it as JSON
            content = JSON.stringify(response.data, null, 2);
          }
          
          // Ensure the specs directory exists
          await fs.promises.mkdir(this.config.specsPath, { recursive: true });
          
          // Save the file
          await fs.promises.writeFile(filePath, content, 'utf-8');
          
          // Try to validate the downloaded spec
          const parsedSpec = await parseOpenAPISpec(filePath);
          if (parsedSpec) {
            return `✅ Successfully downloaded and saved "${filename}".\n` +
              `📁 Saved to: ${filePath}\n` +
              `🔧 Spec validated successfully - found ${parsedSpec.tools.length} tools.\n\n` +
              `Tools that will be available after restart:\n${parsedSpec.tools.map(t => `  • ${t.name}`).join('\n')}\n\n` +
              `🔄 **Please restart the MCP server to see the new tools.**`;
          } else {
            return `⚠️ Downloaded "${filename}" but it failed OpenAPI validation. ` +
              `The file was saved but may not generate tools correctly. ` +
              `Please check the content and restart the server.`;
          }
          
        } catch (error) {
          if (axios.isAxiosError(error)) {
            const status = error.response?.status || 'Unknown';
            return `Error downloading spec: HTTP ${status} - ${error.message}`;
          }
          return `Error downloading spec: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    });
  }

  private registerApisGuruTools(): void {
    // Create a mock ParsedSpec for APIs.guru to register its tools
    const apisGuruSpec: ParsedSpec = {
      apiName: 'apisguru',
      filePath: '<built-in>',
      spec: {}, // We don't need the full spec object
      tools: [
        {
          name: 'apisguru_getProviders',
          description: 'Get a list of all API providers in the APIs.guru directory (e.g., "googleapis.com", "github.com", "stripe.com"). Start here to explore what companies and services have APIs available for download.',
          method: 'GET',
          path: '/providers.json',
          parameters: [],
          responses: {},
          security: [],
          baseUrl: 'https://api.apis.guru/v2'
        },
        {
          name: 'apisguru_getProvider',
          description: 'List all APIs available from a specific provider. Provide a provider name (from apisguru_getProviders) to see their available API specifications with download URLs.',
          method: 'GET',
          path: '/{provider}.json',
          parameters: [
            {
              name: 'provider',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Provider name (e.g., "stripe.com", "github.com", "openai.com")'
            }
          ],
          responses: {},
          security: [],
          baseUrl: 'https://api.apis.guru/v2'
        },
        {
          name: 'apisguru_getMetrics',
          description: 'Get basic statistics about the APIs.guru directory, including total number of APIs, endpoints, and providers. Use this to understand the scope of available APIs.',
          method: 'GET',
          path: '/metrics.json',
          parameters: [],
          responses: {},
          security: [],
          baseUrl: 'https://api.apis.guru/v2'
        }
      ]
    };

    // Register tools from the APIs.guru spec
    this.registerToolsFromSpec(apisGuruSpec);
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