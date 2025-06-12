import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import { AuthConfig } from '../types';

export function loadAuthConfig(specsPath: string): AuthConfig {
  // Load .env file from specs directory
  const envPath = path.join(specsPath, '.env');
  if (fs.existsSync(envPath)) {
    config({ path: envPath });
  }

  const authConfig: AuthConfig = {};
  
  // Parse environment variables with naming convention {API_NAME}_API_KEY, etc.
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;

    // Match patterns like PETSTORE_API_KEY, GITHUB_TOKEN, etc.
    const apiKeyMatch = key.match(/^(.+)_API_KEY$/);
    const tokenMatch = key.match(/^(.+)_TOKEN$/);
    const bearerMatch = key.match(/^(.+)_BEARER_TOKEN$/);
    const basicUserMatch = key.match(/^(.+)_USERNAME$/);
    const basicPassMatch = key.match(/^(.+)_PASSWORD$/);

    let apiName: string | undefined;
    let authType: 'bearer' | 'apiKey' | 'basic' | undefined;
    let configKey: string | undefined;

    if (bearerMatch) {
      apiName = bearerMatch[1].toLowerCase();
      authType = 'bearer';
      configKey = 'token';
    } else if (apiKeyMatch) {
      apiName = apiKeyMatch[1].toLowerCase();
      authType = 'apiKey';
      configKey = 'token';
    } else if (tokenMatch && !key.includes('BEARER')) {
      apiName = tokenMatch[1].toLowerCase();
      authType = 'bearer';
      configKey = 'token';
    } else if (basicUserMatch) {
      apiName = basicUserMatch[1].toLowerCase();
      authType = 'basic';
      configKey = 'username';
    } else if (basicPassMatch) {
      apiName = basicPassMatch[1].toLowerCase();
      authType = 'basic';
      configKey = 'password';
    }

    if (apiName && authType && configKey) {
      if (!authConfig[apiName]) {
        authConfig[apiName] = { type: authType };
      }
      
      // Override type if more specific auth found
      if (authType === 'bearer' && authConfig[apiName].type !== 'bearer') {
        authConfig[apiName].type = authType;
      }
      
      (authConfig[apiName] as any)[configKey] = value;
      
      // Set default header name for API keys
      if (authType === 'apiKey' && !authConfig[apiName].headerName) {
        authConfig[apiName].headerName = 'X-API-Key';
      }
    }
  }

  return authConfig;
}

export function applyAuthentication(
  headers: Record<string, string>,
  authConfig?: AuthConfig[string]
): Record<string, string> {
  if (!authConfig) return headers;

  const result = { ...headers };

  switch (authConfig.type) {
    case 'bearer':
      if (authConfig.token) {
        result['Authorization'] = `Bearer ${authConfig.token}`;
      }
      break;
    
    case 'apiKey':
      if (authConfig.token && authConfig.headerName) {
        result[authConfig.headerName] = authConfig.token;
      }
      break;
    
    case 'basic':
      if (authConfig.username && authConfig.password) {
        const credentials = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
        result['Authorization'] = `Basic ${credentials}`;
      }
      break;
  }

  return result;
}

export function getApiNameFromFile(filePath: string): string {
  const fileName = path.basename(filePath, path.extname(filePath));
  // Convert kebab-case and snake_case to lowercase
  return fileName.toLowerCase().replace(/[-_]/g, '');
} 