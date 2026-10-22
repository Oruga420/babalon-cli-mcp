#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseArgs } from 'node:util';
import { schemas } from './schema.js';
import { Session } from './session.js';
const {values}=parseArgs({options:{url:{type:'string'},workspace:{type:'string'},chromium:{type:'string'}}});
if(!values.url||!values.workspace||!values.chromium){console.error('Required: --url http://127.0.0.1:5173/ --workspace /path/to/assets --chromium /path/to/chromium');process.exit(1);}
const session=new Session({url:values.url,workspace:values.workspace,chromiumPath:values.chromium});
const server=new McpServer({name:'babalon-cli-mcp',version:'0.1.0'});
let opened=false;let queue=Promise.resolve();
const serial=fn=>(...args)=>{const task=queue.then(()=>fn(...args));queue=task.catch(()=>{});return task;};
const reply=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
server.registerTool('open_editor',{description:'Launch a fresh isolated browser at the configured trusted local babalon editor. Executes that app; never installs it.',inputSchema:{}},serial(async()=>{try{if(opened&&session.page)return reply({alreadyOpen:true});const result=await session.start();opened=true;return reply(result);}catch(e){return {...reply({error:e.message}),isError:true};}}));
for(const [name,schema] of Object.entries(schemas))server.registerTool(name,{description:`babalon ${name}. Uses only the isolated editor and configured workspace; output filenames must be new.`,inputSchema:schema.shape},serial(async args=>{try{return reply(await session.run({tool:name,args}));}catch(e){return {...reply({error:e.message}),isError:true};}}));
server.registerTool('close_editor',{description:'Close isolated browser, discarding unsaved scene changes.',inputSchema:{}},serial(async()=>{await session.close();opened=false;return reply({closed:true});}));
await server.connect(new StdioServerTransport());
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await session.close();await server.close();process.exit(0);});
process.stdin.on('end',async()=>{await session.close();});
