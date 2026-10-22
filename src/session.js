import { chromium } from 'playwright-core';
import path from 'node:path';
import { editorURL, Workspace, assertGLB } from './security.js';
import { parseOperation } from './schema.js';
import { browserOperation } from './browser-operation.js';
export const UPSTREAM_SHA='e3e2757c70689f1116072b9d8c1136ae4b7556d5';
export class Session {
  constructor({url,workspace,chromiumPath,headless=true}) {this.url=editorURL(url);this.workspace=new Workspace(workspace);this.chromiumPath=chromiumPath;this.headless=headless;this.queue=Promise.resolve();}
  async start() {
    await this.workspace.init();
    this.browser=await chromium.launch({executablePath:this.chromiumPath,headless:this.headless});
    try {
      this.context=await this.browser.newContext({viewport:{width:1280,height:720},acceptDownloads:false,serviceWorkers:'block'});
      const origin=new URL(this.url).origin;
      await this.context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin||['data:','blob:'].includes(u.protocol)?route.continue():route.abort('blockedbyclient');});
      await this.context.routeWebSocket('**/*', socket=>{const u=new URL(socket.url());if(u.protocol==='ws:' && u.host===new URL(this.url).host)socket.connectToServer();else socket.close();});
      this.page=await this.context.newPage();
      await this.page.goto(this.url,{waitUntil:'domcontentloaded',timeout:30000});
      await this.page.waitForFunction(()=>window.editor && Array.isArray(window.editor.entities),{},{timeout:30000});
      await this.page.evaluate(()=>{const e=window.editor;for(const k of ['addPrimitive','addFiles','capture','exportGLB','transformMany','invalidate'])if(typeof e[k]!=='function')throw new Error('Incompatible editor: '+k);});
      return {url:this.url,compatibility:'runtime contract check only',targetCommit:UPSTREAM_SHA};
    } catch(error) {await this.close();throw error;}
  }
  run(operation) { const task=this.queue.then(()=>this.execute(operation));this.queue=task.catch(()=>{});return task; }
  async execute(operation) {
    const op=parseOperation(operation);
    if(!this.page)throw new Error('Editor session is not open');
    const isOutput=['export_glb','capture_png','record_video'].includes(op.tool);
    if(isOutput)await this.workspace.resolve(op.args.path,true);
    if(op.tool==='import_glb'){const data=await this.workspace.read(op.args.path);assertGLB(data);op.args={filename:path.basename(op.args.path),base64:data.toString('base64')};}
    let timer;let result;try { result=await Promise.race([this.page.evaluate(browserOperation,op),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Operation timed out; editor closed')),60000);})]);}catch(error){if(error.message.includes('timed out'))await this.close();throw error;}finally{clearTimeout(timer);}
    if(isOutput){if(!result.base64)throw new Error('Empty editor output');const bytes=Buffer.from(result.base64,'base64');if(op.tool==='export_glb')assertGLB(bytes);return {...await this.workspace.write(op.args.path,bytes),mime:result.mime};}
    return result;
  }
  async close(){const b=this.browser;this.browser=null;this.page=null;await b?.close();}
}
