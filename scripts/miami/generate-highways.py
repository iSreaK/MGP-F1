"""Connected Turnpike/ramp plan from OSM, elevations approximate, not surveyed."""
import pathlib,json,math,heapq
root=pathlib.Path(__file__).resolve().parents[2]
source=root/'scripts/miami/source'
geo=json.loads((source/'geographic-registration.json').read_text())
data=json.loads((source/'highways-osm.json').read_text())
nodes={};graph={};bridges=set();ways=[]
def projected(p):return [(p['lon']-geo['originLongitude'])*geo['metresPerDegreeLongitude'],(geo['originLatitude']-p['lat'])*geo['metresPerDegreeLatitude']]
for way in data['elements']:
    ids=[]
    for p in way['geometry']:
        k=(p['lon'],p['lat']);nodes[k]=projected(p);ids.append(k);graph.setdefault(k,[])
        if way['tags'].get('bridge')=='yes':bridges.add(k)
    for a,b in zip(ids,ids[1:]):
        distance=math.dist(nodes[a],nodes[b]);graph[a].append((b,distance));graph[b].append((a,distance))
    ways.append((way,ids))
distance={k:0 if k in bridges else math.inf for k in nodes}
queue=[(0,k) for k in bridges];heapq.heapify(queue)
while queue:
    d,k=heapq.heappop(queue)
    if d!=distance[k]:continue
    for nxt,step in graph[k]:
        if d+step<distance[nxt]:distance[nxt]=d+step;heapq.heappush(queue,(d+step,nxt))
roads=[]
for way,ids in ways:
    points=[]
    for a,b in zip(ids,ids[1:]):
        pa=nodes[a];pb=nodes[b];span=math.dist(pa,pb)
        for i in range(max(1,math.ceil(span/8))):
            t=i/max(1,math.ceil(span/8));x=pa[0]+(pb[0]-pa[0])*t;z=pa[1]+(pb[1]-pa[1])*t
            # Shared graph nodes give continuous ramps into bridge decks.
            h=max(.1,16-(distance[a]+(distance[b]-distance[a])*t)*.04) if math.isfinite(distance[a]) and math.isfinite(distance[b]) else .1
            points.append([round(x,3),round(h,3),round(z,3)])
    if ids:points.append([round(nodes[ids[-1]][0],3),round(max(.1,16-distance[ids[-1]]*.04),3),round(nodes[ids[-1]][1],3)])
    if not any(100<p[0]<1550 and -900<p[2]<600 for p in points):continue
    tags=way['tags'];lanes=int(tags.get('lanes','3' if tags['highway']=='motorway' else '1').split(';')[0])
    roads.append({'id':way['id'],'bridge':tags.get('bridge')=='yes','name':tags.get('name','Turnpike access ramp'),'width':round(lanes*3.6+2,2),'points':points})
text='// Surrounding road plans © OpenStreetMap contributors, ODbL 1.0.\n// Elevations: conservative visual reconstruction; not an OSM elevation survey.\nexport const TURNPIKE_ROADS = '+json.dumps(roads,separators=(',',':'))+';\n'
(root/'dist/miami/highway-data.js').write_text(text,encoding='utf-8')
print('Connected geographic highway/ramp ways:',len(roads))
