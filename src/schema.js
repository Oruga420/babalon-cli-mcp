import { z } from 'zod';
const number = z.number().finite();
const vector = z.tuple([number,number,number]);
const id = z.number().int().nonnegative();
const output = (ext) => z.string().min(1).max(240).regex(new RegExp('\\.'+ext+'$','i'));
export const schemas = {
  scene_list: z.object({}).strict(),
  add_primitive: z.object({type:z.enum(['box','sphere','cylinder','cone','torus','plane']),name:z.string().min(1).max(100).optional()}).strict(),
  import_glb: z.object({path:output('glb')}).strict(),
  transform: z.object({id, position:vector.optional(),scale:vector.refine(v=>v.every(x=>x>0 && x<=1000),'Scale must be positive and <=1000').optional(),rotation:vector.optional()}).strict(),
  camera: z.object({alpha:number.optional(),beta:number.min(0.01).max(Math.PI-.01).optional(),radius:number.positive().max(10000).optional(),target:vector.optional(),frameAll:z.boolean().optional()}).strict(),
  pose_joints: z.object({id}).strict(),
  pose_joint: z.object({id,joint:z.string().min(1),axis:z.enum(['x','y','z']),degrees:number.min(-180).max(180)}).strict(),
  animation: z.object({id,action:z.enum(['play','pause','seek']),clip:z.number().int().nonnegative().optional(),frame:number.nonnegative().optional()}).strict(),
  export_glb: z.object({path:output('glb'),compact:z.boolean().default(false)}).strict(),
  capture_png: z.object({path:output('png'),scale:number.min(1).max(4).default(1)}).strict(),
  record_video: z.object({path:output('webm'),duration:number.min(1).max(30).default(4),height:z.union([z.literal(720),z.literal(1080)]).default(720),motion:z.enum(['still','orbit','sway']).default('orbit')}).strict()
};
export function parseOperation(op) { if(!op || !Object.hasOwn(schemas,op.tool)) throw new Error('Unknown tool'); return {tool:op.tool,args:schemas[op.tool].parse(op.args ?? {})}; }
