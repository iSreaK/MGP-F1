"""Positive-determinant, chronological map registration; never reflect a lap."""
import pathlib,json,math,numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2]
SLUGS=['montreal','monaco','barcelona','spielberg','silverstone','spa','hungaroring','zandvoort']
def resample(points,n=720):
    p=np.asarray(points,float)
    if np.linalg.norm(p[0]-p[-1])>1e-6:p=np.vstack([p,p[0]])
    d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
    mask=np.r_[True,np.diff(d)>1e-6];p=p[mask];d=d[mask]
    s=np.arange(n)/n*d[-1]
    return np.c_[np.interp(s,d,p[:,0]),np.interp(s,d,p[:,1])]
for slug in SLUGS:
    source=ROOT/'scripts'/slug/'source'
    geo=json.loads((source/'geography.geojson').read_text())['features'][0]['geometry']['coordinates']
    p=np.array(geo)[:,:2];origin=(p.min(axis=0)+p.max(axis=0))/2
    metres=np.array([111319.49079327358*math.cos(math.radians(origin[1])),111319.49079327358])
    ground=(p-origin)*metres*np.array([1,-1])
    mv=json.loads((source/'corner-reference.json').read_text())
    draft=np.c_[mv['x'],-np.array(mv['y'])]
    a=resample(draft);b=resample(ground);am=a.mean(axis=0);bm=b.mean(axis=0)
    ac=(a-am)[:,0]+1j*(a-am)[:,1];bc=(b-bm)[:,0]+1j*(b-bm)[:,1]
    best=None
    for phase in range(len(a)):
        shifted=np.roll(bc,-phase);factor=np.vdot(ac,shifted)/np.vdot(ac,ac)
        error=float(np.sqrt(np.mean(np.abs(ac*factor-shifted)**2)))
        if best is None or error<best[0]:best=(error,phase,factor)
    error,phase,factor=best
    def transform(points):
        q=np.asarray(points);z=((q-am)[:,0]+1j*(q-am)[:,1])*factor
        return np.c_[z.real,z.imag]+bm
    registered=transform(draft)
    corners=[]
    for c in mv['corners']:
        if c.get('letter'):continue
        cp=c.get('trackPosition',c)
        q=transform([[cp['x'],-cp['y']]])[0]
        idx=int(np.argmin(np.linalg.norm(registered-q,axis=1)))
        corners.append({'number':c['number'],'letter':c.get('letter',''),'x':float(q[0]),'z':float(q[1]),'index':idx})
    result={'origin':origin.tolist(),'metresPerDegree':metres.tolist(),'scale':1,'determinant':1,'registrationRmsMeters':error,'rotationDegrees':math.degrees(math.atan2(factor.imag,factor.real)),'factor':[factor.real,factor.imag],'sourceCentroid':am.tolist(),'targetCentroid':bm.tolist(),'corners':corners,'points':registered.tolist(),'sourceYear':mv['year']}
    (source/'registered-reference.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(slug,'RMS',round(error,2),'corners',[(c['number'],c['letter']) for c in corners], 'origin',origin.tolist())
