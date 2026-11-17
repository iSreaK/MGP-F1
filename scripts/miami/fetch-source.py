"""Retrieve the small, public 2026 reference data kept with the generator."""
import requests,json,time,pathlib,datetime
p=pathlib.Path(__file__).resolve().parent/'source'
p.mkdir(exist_ok=True)
def request(endpoint,query):
    for attempt in range(8):
        try:
            response=requests.get('https://api.openf1.org/v1/'+endpoint,params={'session_key':11280,**query},timeout=120)
            response.raise_for_status();return response.json()
        except Exception as error:
            if attempt==7:raise
            print(error,flush=True);time.sleep(5*(attempt+1))
for endpoint in ['sessions','drivers','session_result','laps']:
    dest=p/(endpoint+'.json')
    if not dest.exists():
        rows=request(endpoint,{})
        dest.write_text(json.dumps(rows),encoding='utf-8')
        print(endpoint,len(rows),flush=True);time.sleep(2.2)
laps=json.loads((p/'laps.json').read_text())
lap=next(x for x in laps if x['driver_number']==1 and x['lap_number']==35)
(p/'reference-lap.json').write_text(json.dumps(lap),encoding='utf-8')
if not (p/'reference-location.json').exists():
    start=datetime.datetime.fromisoformat(lap['date_start'])
    end=start+datetime.timedelta(seconds=lap['lap_duration'])
    rows=request('location',{'driver_number':1,'date>':start.isoformat().replace('+00:00','Z'),'date<':end.isoformat().replace('+00:00','Z')})
    (p/'reference-location.json').write_text(json.dumps(rows),encoding='utf-8')
    print('reference-location',len(rows),flush=True)
