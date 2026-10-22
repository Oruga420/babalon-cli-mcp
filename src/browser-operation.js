// This function is serialized by Playwright. Keep it self-contained.
export async function browserOperation({tool,args}) {
  const e = window.editor;
  if(!e || !Array.isArray(e.entities)) throw new Error('Unsupported babalon editor: window.editor missing');
  const entity = () => { const item=e.entities.find(x=>x.id===args.id); if(!item) throw new Error('Entity not found'); return item; };
  const describe = x => ({id:x.id,name:x.name,kind:x.kind,clips:x.animationGroups.map(g=>g.name)});
  const blob = async b => { if(b.size>128*1024*1024)throw new Error('Artifact exceeds 128 MiB limit');const bytes = new Uint8Array(await b.arrayBuffer()); let s=''; for(let i=0;i<bytes.length;i+=32768) s+=String.fromCharCode(...bytes.subarray(i,i+32768)); return {base64:btoa(s),mime:b.type}; };
  switch(tool) {
    case 'scene_list': return {entities:e.entities.map(describe),camera:{alpha:e.camera.alpha,beta:e.camera.beta,radius:e.camera.radius,target:e.camera.target.asArray()}};
    case 'add_primitive': { const item=e.addPrimitive(args.type); if(args.name)e.rename(item,args.name); return describe(item); }
    case 'import_glb': { const bytes=Uint8Array.from(atob(args.base64),x=>x.charCodeAt(0)); await e.addFiles([new File([bytes],args.filename,{type:'model/gltf-binary'})]); return e.entities.map(describe); }
    case 'transform': { const item=entity(); e.transformMany([item],x=>{if(args.position)x.root.position.set(...args.position);if(args.scale)x.root.scaling.set(...args.scale);if(args.rotation){const q=x.root.rotationQuaternion; if(!q)throw new Error('Expected quaternion rotation'); q.copyFrom(q.constructor.FromEulerAngles(...args.rotation));}});return describe(item); }
    case 'camera': { if(args.frameAll)e.frameAll(); for(const k of ['alpha','beta','radius'])if(args[k]!==undefined)e.camera[k]=args[k];if(args.target)e.camera.setTarget(e.camera.target.clone().set(...args.target));e.invalidate();return {alpha:e.camera.alpha,beta:e.camera.beta,radius:e.camera.radius,target:e.camera.target.asArray()}; }
    case 'pose_joints': return e.pose.joints(entity()).map(j=>({name:j.node.name,bone:j.bone??null}));
    case 'pose_joint': { const item=entity(); const matches=e.pose.joints(item).filter(j=>j.node.name===args.joint || j.bone===args.joint);if(matches.length!==1)throw new Error('Joint not found or name is ambiguous');const j=matches[0];e.select(item);e.pose.start(item);if(e.pose.entity!==item)throw new Error('Entity has no supported skeleton');e.pose.selectJoint(j);const q=j.node.rotationQuaternion?.clone()??j.node.rotation.toQuaternion();e.pose.turnJoint(args.axis,args.degrees,q);e.pose.end();return {id:item.id,joint:j.node.name}; }
    case 'animation': { if(args.action==='seek' && args.frame===undefined)throw new Error('seek requires frame');const item=entity();if(!item.animationGroups.length)throw new Error('Entity has no animation clips');if(args.clip!==undefined){if(!item.animationGroups[args.clip])throw new Error('Clip not found');e.anim.select(item,args.clip);}if(args.action==='play')e.anim.play(item);else if(args.action==='pause')e.anim.pause(item);else {if(args.frame===undefined)throw new Error('seek requires frame');e.anim.seek(item,args.frame,e.anim.state(item,true));}return {id:item.id,state:e.anim.state(item)}; }
    case 'export_glb': return blob(await e.exportGLB(args.compact));
    case 'capture_png': return blob(await e.capture(args.scale));
    case 'record_video': {
      const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(x));
      if(!mime)throw new Error('WebM MediaRecorder unavailable');if(e.recording)throw new Error('Editor is already recording');
      const source=e.engine.getRenderingCanvas();const canvas=document.createElement('canvas');canvas.height=args.height;canvas.width=Math.max(2,Math.round(args.height*source.width/source.height/2)*2);const ctx=canvas.getContext('2d');
      const stream=canvas.captureStream(30), recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});
      const oldAlpha=e.camera.alpha,oldPhoto=e.photoMode;const chunks=[];let before,after,timer;
      e.recording=true;e.setPhotoMode(true);e.invalidate(args.duration*1000+3000);
      try {const started=performance.now();before=e.scene.onBeforeRenderObservable.add(()=>{const t=Math.min(1,(performance.now()-started)/(args.duration*1000));if(args.motion==='orbit')e.camera.alpha=oldAlpha+t*Math.PI*2;else if(args.motion==='sway')e.camera.alpha=oldAlpha+Math.sin(t*Math.PI*2)*.25;});after=e.scene.onAfterRenderObservable.add(()=>ctx.drawImage(source,0,0,canvas.width,canvas.height));
        await new Promise((resolve,reject)=>{recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.onerror=()=>reject(new Error('Video recorder failed'));recorder.onstop=resolve;recorder.start(250);timer=setTimeout(()=>recorder.stop(),args.duration*1000);});
        return blob(new Blob(chunks,{type:'video/webm'}));
      } finally {clearTimeout(timer);if(recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());if(before)e.scene.onBeforeRenderObservable.remove(before);if(after)e.scene.onAfterRenderObservable.remove(after);e.camera.alpha=oldAlpha;e.recording=false;e.setPhotoMode(oldPhoto);e.invalidate();}
    }
    default: throw new Error('Unsupported operation');
  }
}
