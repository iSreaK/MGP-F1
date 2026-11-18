export function createHelpers(THREE){
 const unit=new THREE.BoxGeometry(1,1,1);
 const material=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.85,...options});
 function box(parent,name,dimensions,position,mat){const mesh=new THREE.Mesh(unit,mat);mesh.name=name;mesh.scale.set(...dimensions);mesh.position.set(...position);mesh.receiveShadow=true;
  mesh.userData.staticPrimitive='box';parent.add(mesh);return mesh;}
 function instances(parent,name,geometry,mat,poses){const mesh=new THREE.InstancedMesh(geometry,mat,poses.length),helper=new THREE.Object3D();mesh.name=name;
  for(let i=0;i<poses.length;i++){const p=poses[i];helper.position.set(...p.position);helper.rotation.set(...(p.rotation||[0,0,0]));helper.scale.set(...(p.scale||[1,1,1]));helper.updateMatrix();mesh.setMatrixAt(i,helper.matrix);if(p.color!==undefined)mesh.setColorAt(i,new THREE.Color(p.color));}
  mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 function label(_THREE,text,{background='#12303b',foreground='#faf5e6',width=1024,height=128}={}){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');
  context.fillStyle=background;context.fillRect(0,0,width,height);context.fillStyle=foreground;context.font='italic 800 62px Arial';context.textAlign='center';context.textBaseline='middle';context.fillText(text,width/2,height/2,width-35);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
 }
 return {box,material,instances,label};
}
