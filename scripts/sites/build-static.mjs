import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const root=process.cwd(),source=resolve(root,'site-src'),dist=resolve(root,'dist');
const manifest=JSON.parse(await readFile(resolve(root,'.openai/asset-inputs.json'),'utf8'));
await cp(source,dist,{recursive:true});
let bytes=0;
for(const asset of manifest.assets){
 const target=resolve(dist,asset.path);if(!target.startsWith(dist+sep))throw Error('Asset path outside generated output');
 const pieces=[];for(const name of asset.parts){if(!/^[a-f0-9]{64}\.part$/.test(name))throw Error('Invalid source part');pieces.push(await readFile(resolve(root,'.openai/asset-parts',name)));}
 const data=gunzipSync(Buffer.concat(pieces));
 if(data.length!==asset.bytes||createHash('sha256').update(data).digest('hex')!==asset.sha256)throw Error('Asset verification failed: '+asset.path);
 await mkdir(dirname(target),{recursive:true});await writeFile(target,data);bytes+=data.length;
}
console.log(JSON.stringify({assets:manifest.assets.length,verifiedBytes:bytes,sourceCommit:manifest.source_commit}));
