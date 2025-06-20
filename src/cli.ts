#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { OpenAPIMCPServer } from './server';
import { ServerConfig } from './types';

const program = new Command();

program
  .name('specbridge')
  .description('Bridge OpenAPI specifications to MCP tools - automatically generates tools from OpenAPI specs')
  .version('1.0.2')
  .option(
    '--specs <path>', 
    'Path to directory containing OpenAPI spec files',
    process.cwd()
  )
  .option(
    '--port <number>',
    'Port number for HTTP transport (enables HTTP mode)',
    (val: any) => parseInt(val, 10)
  )
  .option(
    '--transport <type>',
    'Transport type: stdio or httpStream',
    'stdio'
  )
  .action(async (options: any) => {
    try {
      // Debug: log raw options without breaking JSON protocol
      const specsPath = path.resolve(options.specs || process.cwd());
      
      const config: ServerConfig = {
        specsPath,
        port: options.port,
        transportType: options.transport as 'stdio' | 'httpStream'
      };

      // Validate transport configuration
      if (config.transportType === 'httpStream' && !config.port) {
        console.error('Error: --port is required when using httpStream transport');
        process.exit(1);
      }

      const server = new OpenAPIMCPServer(config);
      
      // Handle graceful shutdown
      const shutdown = async () => {
        console.log('\nShutting down...');
        process.exit(0);
      };
      
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      
      // Start the server
      await server.start();
      
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

// Add a command to list loaded specs (useful for debugging)
program
  .command('list')
  .description('List all loaded OpenAPI specifications and their tools')
  .option('--specs <path>', 'Path to directory containing OpenAPI spec files', process.cwd())
  .action(async (options: any) => {
    try {
      // Debug: log raw options without breaking JSON protocol  
      const specsPath = path.resolve(options.specs || process.cwd());
      
      const config: ServerConfig = {
        specsPath
      };

      const server = new OpenAPIMCPServer(config);
      
      // We need to start the server briefly to load specs
      await server.start();
      
      const specs = server.getLoadedSpecs();
      const authConfig = server.getAuthConfig();
      
      console.log('\n=== Specbridge Status ===\n');
      console.log(`Specs Directory: ${config.specsPath}`);
      console.log(`Loaded Specifications: ${specs.length}`);
      
      // Show built-in tools
      console.log('\n=== Built-in Spec Management Tools ===\n');
      console.log('🔧 specbridge_list_specs - List all OpenAPI specification files');
      console.log('📄 specbridge_get_spec - Get the content of a specific spec file');  
      console.log('✏️ specbridge_update_spec - Update the content of a specific spec file');
      console.log('⬇️ specbridge_download_spec - Download and save specs from URLs');
      
      console.log('\n=== Built-in APIs.guru Discovery Tools ===\n');
      console.log('🏢 apisguru_getProviders - List API providers (Google, GitHub, Stripe, etc.)');
      console.log('🔍 apisguru_getProvider - Get all APIs from a specific provider with download URLs');
      console.log('📊 apisguru_getMetrics - Get directory statistics (total APIs, endpoints, providers)');
      
      if (specs.length === 0) {
        console.log('\nNo OpenAPI specifications found.');
        console.log('Add .json, .yaml, or .yml files to the specs directory.');
      } else {
        console.log('\n=== Generated API Tools ===\n');
        for (const spec of specs) {
          console.log(`📋 ${spec.apiName.toUpperCase()}`);
          console.log(`   File: ${path.basename(spec.filePath)}`);
          console.log(`   Base URL: ${spec.tools[0]?.baseUrl || 'N/A'}`);
          console.log(`   Tools: ${spec.tools.length}`);
          
          if (authConfig[spec.apiName]) {
            const auth = authConfig[spec.apiName];
            console.log(`   Auth: ${auth.type} ${auth.type === 'apiKey' ? `(${auth.headerName})` : ''}`);
          } else {
            console.log(`   Auth: None configured`);
          }
          
          if (spec.tools.length > 0) {
            console.log('   Available tools:');
            for (const tool of spec.tools.slice(0, 5)) { // Show first 5 tools
              console.log(`     • ${tool.name} - ${tool.description}`);
            }
            if (spec.tools.length > 5) {
              console.log(`     ... and ${spec.tools.length - 5} more`);
            }
          }
        }
      }
      
      console.log('\n=== Authentication Configuration ===\n');
      const authKeys = Object.keys(authConfig);
      if (authKeys.length === 0) {
        console.log('No authentication configured.');
        console.log('Add a .env file with credentials like:');
        console.log('  PETSTORE_API_KEY=your_key_here');
        console.log('  GITHUB_TOKEN=your_token_here');
      } else {
        for (const apiName of authKeys) {
          const auth = authConfig[apiName];
          console.log(`🔐 ${apiName.toUpperCase()}: ${auth.type}`);
        }
      }
            
    } catch (error) {
      console.error('Failed to list specs:', error);
      process.exit(1);
    }
  });

if (require.main === module) {
  program.parse();
} 