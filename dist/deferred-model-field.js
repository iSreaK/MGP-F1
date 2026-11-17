// Explore the circuit immediately; decode the garage assets only when a grid,
// simulation or replay actually needs them. Two decoders run concurrently.
export function createDeferredModelField(entries, loadEntry, onChange=()=>{}) {
  let started=false,ready=false,promise=null;
  return {
    get started(){return started;},get ready(){return ready;},
    load(){
      if(promise)return promise;
      started=true;onChange();
      promise=(async()=>{
        let next=0;const failures=[];
        async function worker(){
          while(next<entries.length){
            const entry=entries[next++];
            try{await loadEntry(entry);}catch(error){failures.push(error);}
            onChange();
            // Yield between asset decodes so circuit controls remain usable.
            await new Promise(resolve=>setTimeout(resolve,0));
          }
        }
        await Promise.all(Array.from({length:Math.min(2,entries.length)},worker));
        if(failures.length)throw failures[0];
        ready=true;onChange();
      })();
      return promise;
    },
  };
}
