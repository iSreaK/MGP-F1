"""Cache actual OpenF1 2026 Miami archives outside the repository."""
import requests,json,time,pathlib,tempfile,datetime
root=pathlib.Path(__file__).resolve().parents[2]
raw=pathlib.Path(tempfile.gettempdir())/'mgp-f1-miami-2026-raw'
raw.mkdir(exist_ok=True)
source=root/'scripts/miami/source'
session=json.loads((source/'sessions.json').read_text())[0]
(raw/'session.json').write_text(json.dumps(session))
laps=json.loads((source/'laps.json').read_text())
drivers=json.loads((source/'drivers.json').read_text())

def request(endpoint,query):
    for attempt in range(10):
        try:
            r=requests.get('https://api.openf1.org/v1/'+endpoint,params={'session_key':11280,**query},timeout=150)
            if r.status_code==404:return []
            r.raise_for_status();return r.json()
        except Exception as e:
            print(endpoint,str(e)[:120],flush=True)
            if attempt==9:raise
            time.sleep(min(50,5*(attempt+1)))

def fetch(name,endpoint,query):
    dest=raw/(name+'.json')
    if dest.exists():print(name,'cached',flush=True);return
    data=request(endpoint,query)
    dest.write_text(json.dumps(data));print(name,len(data),flush=True);time.sleep(2.2)

for d in drivers:
    n=d['driver_number'];own=[r for r in laps if r['driver_number']==n]
    (raw/('laps_'+str(n)+'.json')).write_text(json.dumps(own))
    start=min(datetime.datetime.fromisoformat(x['date_start']) for x in own)-datetime.timedelta(seconds=60)
    final=own[-1];end=datetime.datetime.fromisoformat(final['date_start'])+datetime.timedelta(seconds=(final['lap_duration'] or 120)+30)
    for endpoint in ['location','car_data']:
        fetch(endpoint+'_'+str(n),endpoint,{'driver_number':n,'date>':start.isoformat().replace('+00:00','Z'),'date<':end.isoformat().replace('+00:00','Z')})
for endpoint in ['position','intervals','pit','stints','race_control','weather']:
    fetch(endpoint,endpoint,{})
print('Complete archive:',raw,flush=True)
