"""Chronological OpenF1 -> east/south metres, registered to WGS84 GeoJSON.
The map-layout rotation is only an intermediate drafting frame. A proper
rigid registration (determinant +1) fixes geographic orientation from the
independent us-2022 WGS84 line. No reflection or point-order reversal.
"""
import pathlib,json,math,numpy as np
root=pathlib.Path(__file__).resolve().parents[2]
source=root/'scripts/miami/source'
rows=json.loads((source/'reference-location.json').read_text())
xy=np.array([[r['x'],-r['y']] for r in rows],dtype=float)
a=math.radians(-30)
rot=np.array([[math.cos(a),-math.sin(a)],[math.sin(a),math.cos(a)]])
xy=xy@rot.T
centre=(np.min(xy,axis=0)+np.max(xy,axis=0))/2
xy-=centre
# The reference time starts 0.314 s after the control line; append the final
# measured point before the first to place origin at the line to within ~2 m.
xy=np.vstack([xy[-1],xy[:-1],xy[-1]])
d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(xy,axis=0),axis=1))]
secants=np.diff(xy,axis=0)/np.diff(d)[:,None]
tangents=np.vstack([(secants[-1]+secants[0])/2,(secants[:-1]+secants[1:])/2,(secants[-1]+secants[0])/2])
fine=[]
for at in np.linspace(0,d[-1],6000):
    i=min(len(d)-2,int(np.searchsorted(d,at,side='right')-1))
    span=d[i+1]-d[i];t=(at-d[i])/span
    fine.append((2*t**3-3*t**2+1)*xy[i]+(t**3-2*t**2+t)*span*tangents[i]+(-2*t**3+3*t**2)*xy[i+1]+(t**3-t**2)*span*tangents[i+1])
fine=np.array(fine)
fd=np.r_[0,np.cumsum(np.linalg.norm(np.diff(fine,axis=0),axis=1))]
scale=5412/fd[-1]
fine*=scale
fd*=scale
station=np.linspace(0,5412,1084)
points=np.c_[np.interp(station,fd,fine[:,0]),np.interp(station,fd,fine[:,1])]
# Correct tiny chord loss introduced by the 5 m export interval.
scale2=5412/np.linalg.norm(np.diff(points,axis=0),axis=1).sum()
points*=scale2
def draft_anchor(x,z):return (np.array([x,z])-centre)*scale*scale2
# The original manual markers fell after several apexes and mislabeled the
# T14-left/T15-right sequence. Corrected stations follow the FIA turn order
# and local curvature; they remain approximate racing-line apex stations.
turn_stations=[364,460,610,1150,1274,1410,1545,1634,2160,2560,3118,3240,3360,3434,3458,3542,4878,5032,5162]
turns={}
for i,s in enumerate(turn_stations):
    idx=int(round(s/5412*(len(points)-1)))
    turns['T'+str(i+1)]={'name':'Virage '+str(i+1),'index':idx,'distanceMeters':round(station[idx],2)}

geo=json.loads((source/'us-2022.geojson').read_text())
coordinates=np.array(geo['features'][0]['geometry']['coordinates'])[:,:2]
origin=np.array([-80.2389,25.9579])
metres=np.array([111319.49079327358*math.cos(math.radians(origin[1])),-111319.49079327358])
ground=(coordinates-origin)*metres
gd=np.r_[0,np.cumsum(np.linalg.norm(np.diff(ground,axis=0),axis=1))]
gs=np.arange(0,gd[-1],1.5)
target=np.c_[np.interp(gs,gd,ground[:,0]),np.interp(gs,gd,ground[:,1])]
draft=points[::6]
def matches(p):
    square=((p[:,None,:]-target[None,:,:])**2).sum(axis=2)
    idx=np.argmin(square,axis=1)
    return target[idx],np.min(square,axis=1)
best=None
for degrees in range(-180,180,5):
    a=math.radians(degrees);rotation=np.array([[math.cos(a),math.sin(a)],[-math.sin(a),math.cos(a)]])
    shift=target.mean(axis=0)-draft.mean(axis=0)@rotation
    _,sq=matches(draft@rotation+shift)
    score=np.mean(np.sort(sq)[:int(len(sq)*.9)])
    if best is None or score<best[0]:best=(score,rotation,shift)
_,rotation,shift=best
for iteration in range(45):
    matched,sq=matches(draft@rotation+shift)
    keep=sq<=np.quantile(sq,.92)
    a=draft[keep];b=matched[keep]
    am=a.mean(axis=0);bm=b.mean(axis=0)
    u,_,vt=np.linalg.svd((a-am).T@(b-bm))
    rotation=u@np.diag([1,np.linalg.det(u@vt)])@vt
    shift=bm-am@rotation
assert np.linalg.det(rotation)>.999999
registered=points@rotation+shift
_,squared=matches(registered[::3])
rms=float(np.sqrt(np.mean(squared)))
assert rms<15,('Geographic registration too imprecise',rms)
georef={'source':'https://github.com/bacinger/f1-circuits/blob/master/circuits/us-2022.geojson','originLongitude':float(origin[0]),'originLatitude':float(origin[1]),'metresPerDegreeLongitude':float(metres[0]),'metresPerDegreeLatitude':float(-metres[1]),'registrationRmsMetres':round(rms,3),'rotationDegrees':math.degrees(math.atan2(rotation[0,1],rotation[0,0])),'determinant':float(np.linalg.det(rotation)),'anchors':{}}
for name in ['T1','T8','T16','T17']:
    p=registered[turns[name]['index']]
    j=int(np.argmin(np.linalg.norm(ground-p,axis=1)))
    georef['anchors'][name]={'longitude':float(coordinates[j,0]),'latitude':float(coordinates[j,1]),'referencePosition':[float(v) for v in ground[j]],'modelDistanceMetres':round(float(np.linalg.norm(ground[j]-p)),3)}
points=registered
def anchor(x,z):return tuple(draft_anchor(x,z)@rotation+shift)
(source/'geographic-registration.json').write_text(json.dumps(georef,indent=2),encoding='utf-8')
def idx_at(s):return int(round(s/5412*(len(points)-1)))
landmarks={'controlLineIndex':0,'pitStraight':{'entryIndex':idx_at(5170),'exitIndex':idx_at(510)},'turns':turns,'sectors':{'S1':{'afterTurn':'T8','afterMeters':110},'S2':{'afterTurn':'T16','afterMeters':70}},'drs':{'activation1':{'afterTurn':'T8','afterMeters':165},'activation2':{'afterTurn':'T16','afterMeters':90},'activation3':{'afterTurn':'T19','afterMeters':70}},'speedTrap':{'beforeTurn':'T17','beforeMeters':150}}
text='''// Miami International Autodrome, current 19-turn configuration.
// Chronological OpenF1 positions: Miami 2026 race, Norris lap 35 (session 11280).
// Reference plan and turn numbers verified against FIA 2026 Miami Doc 5 map.
// XY racing-line samples are smoothed, recentered, rotated, then calibrated
// to the FIA 5 412 m centreline length; they are not a kerb-level survey.
// x east / z south, registered without reflection to WGS84 us-2022 GeoJSON.
// The FIA artwork's drafting rotation is not used as geographic north.
export const TRACK_LENGTH_METERS = 5412;
export const TRACK_WIDTH_METERS = 12;
export const TRACK_POINTS = [
'''
text+=''.join('  ['+','.join(str(round(float(v),5)) for v in row)+'],\n' for row in points)
text+='];\nexport const LANDMARKS = '+json.dumps(landmarks,ensure_ascii=False,indent=2)+';\n'
text+='\nexport const GEO_REFERENCE = '+json.dumps(georef,indent=2)+';\n'
text+='\nexport const SCENERY_LAYOUT_ROTATION_Y = '+str(-math.atan2(rotation[0,1],rotation[0,0]))+';\n'
text+='\n// Broad placements digitized from the FIA plan, architectural volumes approximate.\n'
text+='export const SCENERY_ANCHORS = '+json.dumps({'stadium':anchor(1700,700),'marina':anchor(-1600,4350)},indent=2)+';\n'
(root/'dist/miami/track-data.js').write_text(text,encoding='utf-8')
print('WGS84 RMS',rms,'rotation',georef['rotationDegrees'],'determinant',np.linalg.det(rotation))
print('scale',scale*scale2,'turn stations',[(k,v['distanceMeters']) for k,v in turns.items()])
