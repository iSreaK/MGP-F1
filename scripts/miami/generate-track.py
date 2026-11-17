"""Chronological 2026 OpenF1 XY -> FIA-map orientation, calibrated to 5 412 m.
Pure rotation in the horizontal map after converting north-up XY into Three x/z.
No arbitrary reflection, reversed point order, or raw GPS z as a terrain survey.
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
def anchor(x,z):return tuple((np.array([x,z])-centre)*scale*scale2)
turn_indices=[21,31,39,70,80,88,97,103,129,146,184,198,219,228,232,243,318,331,343]
turns={}
for i,ref in enumerate(turn_indices):
    target=(np.array([rows[ref]['x'],-rows[ref]['y']])@rot.T-centre)*scale*scale2
    idx=int(np.argmin(np.linalg.norm(points-target,axis=1)))
    turns['T'+str(i+1)]={'name':'Virage '+str(i+1),'index':idx,'distanceMeters':round(station[idx],2)}
def idx_at(s):return int(round(s/5412*(len(points)-1)))
landmarks={'controlLineIndex':0,'pitStraight':{'entryIndex':idx_at(5170),'exitIndex':idx_at(510)},'turns':turns,'sectors':{'S1':{'afterTurn':'T8','afterMeters':110},'S2':{'afterTurn':'T16','afterMeters':70}},'drs':{'activation1':{'afterTurn':'T8','afterMeters':165},'activation2':{'afterTurn':'T16','afterMeters':90},'activation3':{'afterTurn':'T19','afterMeters':70}},'speedTrap':{'beforeTurn':'T17','beforeMeters':150}}
text='''// Miami International Autodrome, current 19-turn configuration.
// Chronological OpenF1 positions: Miami 2026 race, Norris lap 35 (session 11280).
// Reference plan and turn numbers verified against FIA 2026 Miami Doc 5 map.
// XY racing-line samples are smoothed, recentered, rotated, then calibrated
// to the FIA 5 412 m centreline length; they are not a kerb-level survey.
// x right / z down in the FIA map view. No mirror is applied by the world.
export const TRACK_LENGTH_METERS = 5412;
export const TRACK_WIDTH_METERS = 12;
export const TRACK_POINTS = [
'''
text+=''.join('  ['+','.join(str(round(float(v),5)) for v in row)+'],\n' for row in points)
text+='];\nexport const LANDMARKS = '+json.dumps(landmarks,ensure_ascii=False,indent=2)+';\n'
text+='\n// Broad placements digitized from the FIA plan, architectural volumes approximate.\n'
text+='export const SCENERY_ANCHORS = '+json.dumps({'stadium':anchor(1700,700),'marina':anchor(-1600,4350)},indent=2)+';\n'
(root/'dist/miami/track-data.js').write_text(text,encoding='utf-8')
print('scale',scale*scale2,'turn stations',[(k,v['distanceMeters']) for k,v in turns.items()])
