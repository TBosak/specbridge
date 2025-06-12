import SwaggerParser from '@apidevtools/swagger-parser';
import path from 'path';
import { ParsedSpec, GeneratedTool, ToolParameter } from '../types';
import { getApiNameFromFile } from './auth';

export async function parseOpenAPISpec(filePath: string): Promise<ParsedSpec | null> {
  try {
    const spec = await SwaggerParser.validate(filePath) as any; // OpenAPIV3.Document;
    const apiName = getApiNameFromFile(filePath);
    
    const tools = generateToolsFromSpec(spec, apiName);
    
    return {
      apiName,
      filePath,
      spec,
      tools
    };
  } catch (error) {
    // Only log errors for files that look like they should be OpenAPI specs
    const filename = path.basename(filePath);
    if (filename.toLowerCase().includes('openapi') || 
        filename.toLowerCase().includes('swagger') ||
        filename.toLowerCase().includes('api')) {
      console.error(`Failed to parse OpenAPI spec at ${filePath}:`, error);
    } else {
      // For other files, just log a brief message
      console.log(`Skipping ${filename} - not a valid OpenAPI specification`);
    }
    return null;
  }
}

function generateToolsFromSpec(spec: any, apiName: string): GeneratedTool[] {
  const tools: GeneratedTool[] = [];
  const baseUrl = getBaseUrl(spec);

  if (!spec.paths) return tools;

  for (const [pathTemplate, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
    
    for (const method of methods) {
      const operation = (pathItem as any)[method];
      if (!operation) continue;

      const tool = createToolFromOperation(
        apiName,
        pathTemplate,
        method,
        operation,
        baseUrl,
        (pathItem as any).parameters
      );
      
      if (tool) {
        tools.push(tool);
      }
    }
  }

  return tools;
}

function createToolFromOperation(
  apiName: string,
  pathTemplate: string,
  method: string,
  operation: any,
  baseUrl: string,
  pathLevelParams?: any[]
): GeneratedTool | null {
  try {
    const toolName = generateToolName(apiName, operation, pathTemplate, method);
    const description = operation.summary || operation.description || `${method.toUpperCase()} ${pathTemplate}`;
    
    // Combine path-level and operation-level parameters
    const allParams = [
      ...(pathLevelParams || []),
      ...(operation.parameters || [])
    ];
    
    const parameters = extractParameters(allParams);
    
    return {
      name: toolName,
      description,
      operationId: operation.operationId,
      method: method.toUpperCase(),
      path: pathTemplate,
      parameters,
      requestBody: operation.requestBody as any,
      responses: operation.responses,
      security: operation.security || [],
      baseUrl
    };
  } catch (error) {
    console.error(`Failed to create tool for ${method} ${pathTemplate}:`, error);
    return null;
  }
}

function generateToolName(
  apiName: string,
  operation: any,
  pathTemplate: string,
  method: string
): string {
  if (operation.operationId) {
    return `${apiName}_${operation.operationId}`;
  }
  
  // Generate from path and method
  const pathParts = pathTemplate
    .split('/')
    .filter(part => part && !part.startsWith('{'))
    .map(part => part.replace(/[^a-zA-Z0-9]/g, ''));
  
  const pathName = pathParts.join('_') || 'root';
  return `${apiName}_${method}_${pathName}`;
}

function extractParameters(
  paramRefs: any[]
): ToolParameter[] {
  const parameters: ToolParameter[] = [];

  for (const paramRef of paramRefs) {
    // For simplicity, we're not resolving $ref parameters here
    // In a production version, you'd want to resolve references
    if ('$ref' in paramRef) {
      continue; // Skip reference parameters for now
    }

    const param = paramRef as any;
    
    if (param.in && param.name && param.schema) {
      parameters.push({
        name: param.name,
        in: param.in as 'path' | 'query' | 'header' | 'cookie',
        required: param.required || param.in === 'path',
        schema: param.schema as any,
        description: param.description
      });
    }
  }

  return parameters;
}

function getBaseUrl(spec: any): string {
  if (spec.servers && spec.servers.length > 0) {
    return spec.servers[0].url;
  }
  
  // Fallback for older specs or specs without servers
  return 'https://api.example.com';
}

export function isOpenAPIFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath).toLowerCase();
  
  // Only accept certain extensions
  if (!['.json', '.yaml', '.yml'].includes(ext)) {
    return false;
  }
  
  // Skip common non-OpenAPI files
  const skipFiles = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    '.eslintrc.json',
    'jest.config.json',
    'webpack.config.js',
    'rollup.config.js'
  ];
  
  if (skipFiles.includes(filename)) {
    return false;
  }
  
  return true;
} 