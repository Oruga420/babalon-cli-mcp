import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
test('real MCP SDK stdio initialize/list/call/close without upstream',async()=>{const client=new Client({name:'test-client',version:'1.0.0'});const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/mcp.js',import.meta.url)),'--url','http://127.0.0.1:5173/','--workspace',process.cwd(),'--chromium','/usr/bin/chromium'],stderr:'pipe'});try{await client.connect(transport);const tools=await client.listTools();assert.equal(tools.tools.length,13);assert(tools.tools.some(t=>t.name==='record_video'));const result=await client.callTool({name:'scene_list',arguments:{}});assert.equal(result.isError,true);assert.match(result.content[0].text,/not open/);const closed=await client.callTool({name:'close_editor',arguments:{}});assert.match(closed.content[0].text,/closed/);}finally{await client.close();}});
