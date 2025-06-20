import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { GeneratedTool, ToolExecutionContext, RequestConfig } from '../types';
import { applyAuthentication } from './auth';

export class HttpClient {
  async executeRequest(
    context: ToolExecutionContext,
    args: Record<string, any>
  ): Promise<string> {
    try {
      const requestConfig = this.buildRequestConfig(context, args);
      const response = await axios(requestConfig);
      
      return this.formatResponse(response);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 'Unknown';
        const message = error.response?.data || error.message;
        return `HTTP Error ${status}: ${JSON.stringify(message, null, 2)}`;
      }
      
      return `Request failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private buildRequestConfig(
    context: ToolExecutionContext,
    args: Record<string, any>
  ): AxiosRequestConfig {
    const { tool, authConfig } = context;
    
    // Build URL with path parameters
    let url = this.buildUrl(tool, args);
    
    // Build headers
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'specbridge/1.0.2'
    };
    
    // Apply authentication
    headers = applyAuthentication(headers, authConfig);
    
    // Add header parameters
    this.addHeaderParameters(tool, args, headers);
    
    // Build query parameters
    const params = this.buildQueryParameters(tool, args);
    
    // Build request body
    const data = this.buildRequestBody(tool, args);
    
    const config: AxiosRequestConfig = {
      method: tool.method.toLowerCase() as any,
      url,
      headers,
      timeout: 30000, // 30 second timeout
    };
    
    if (Object.keys(params).length > 0) {
      config.params = params;
    }
    
    if (data !== null) {
      config.data = data;
    }
    
    return config;
  }

  private buildUrl(tool: GeneratedTool, args: Record<string, any>): string {
    let url = tool.baseUrl.replace(/\/$/, '') + tool.path;
    
    // Replace path parameters
    for (const param of tool.parameters) {
      if (param.in === 'path' && args[param.name] !== undefined) {
        url = url.replace(`{${param.name}}`, encodeURIComponent(String(args[param.name])));
      }
    }
    
    return url;
  }

  private addHeaderParameters(
    tool: GeneratedTool,
    args: Record<string, any>,
    headers: Record<string, string>
  ): void {
    for (const param of tool.parameters) {
      if (param.in === 'header' && args[param.name] !== undefined) {
        headers[param.name] = String(args[param.name]);
      }
    }
  }

  private buildQueryParameters(
    tool: GeneratedTool,
    args: Record<string, any>
  ): Record<string, any> {
    const params: Record<string, any> = {};
    
    for (const param of tool.parameters) {
      if (param.in === 'query' && args[param.name] !== undefined) {
        params[param.name] = args[param.name];
      }
    }
    
    return params;
  }

  private buildRequestBody(
    tool: GeneratedTool,
    args: Record<string, any>
  ): any {
    if (!tool.requestBody) return null;
    
    // Look for 'body' or 'requestBody' in args
    if (args.body !== undefined) {
      return args.body;
    }
    
    if (args.requestBody !== undefined) {
      return args.requestBody;
    }
    
    // If no explicit body parameter, collect all non-parameter args
    const bodyArgs: Record<string, any> = {};
    const paramNames = new Set(tool.parameters.map(p => p.name));
    
    for (const [key, value] of Object.entries(args)) {
      if (!paramNames.has(key)) {
        bodyArgs[key] = value;
      }
    }
    
    return Object.keys(bodyArgs).length > 0 ? bodyArgs : null;
  }

  private formatResponse(response: AxiosResponse): string {
    const headers = Object.entries(response.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    
    let body: string;
    if (typeof response.data === 'string') {
      body = response.data;
    } else if (response.data === null || response.data === undefined) {
      body = '(empty response)';
    } else {
      body = JSON.stringify(response.data, null, 2);
    }
    
    return `Status: ${response.status} ${response.statusText}\n\nHeaders:\n${headers}\n\nBody:\n${body}`;
  }
} 