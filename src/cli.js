#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { Session } from './session.js';
import { Workspace } from './security.js';
import { parseOperation } from './schema.js';
export const help=`babalon run <recipe.json> --url http://127.0.0.1:5173/ --workspace <folder> --chromium <executable> [--headed]
babalon validate <recipe.json> --workspace <folder>

Each recipe is an array of {"tool":"...","args":{...}} operations.
Run starts a fresh isolated browser. Serve your trusted babalon JS checkout yourself.
No app installation, external URLs, shell commands, arbitrary JS, credentials, or existing browser profile.
Outputs never overwrite files. GLB inputs must be self-contained. See README for tools.`;
async function main(){
 const {values,positionals}=parseArgs({allowPositionals:true,options:{url:{type:'string'},workspace:{type:'string',default:process.cwd()},chromium:{type:'string'},headed:{type:'boolean'},help:{type:'boolean'}}});
 const [command,file]=positionals;
 if(values.help||!command){console.log(help);return;}
 if(!['run','validate'].includes(command)||!file)throw new Error(help);
 const ws=await new Workspace(values.workspace).init();
 const recipe=JSON.parse((await ws.read(file,1024*1024)).toString('utf8'));
 if(!Array.isArray(recipe)||recipe.length>100)throw new Error('Recipe must contain at most 100 operations');
 const ops=recipe.map(parseOperation);
 if(command==='validate'){console.log(JSON.stringify({valid:true,operations:ops.length}));return;}
 if(!values.url || !values.chromium)throw new Error('--url and --chromium are required');
 const session=new Session({url:values.url,workspace:values.workspace,chromiumPath:values.chromium,headless:!values.headed});
 try {await session.start();for(const op of ops)console.log(JSON.stringify({tool:op.tool,result:await session.run(op)}));}finally{await session.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
