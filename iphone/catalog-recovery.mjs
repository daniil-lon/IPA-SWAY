import state from './published-catalog-state.json' with {type:'json'};
import {applyCatalogOverrides} from './catalog-store.mjs';

export const isD1ReadLimit=error=>/D1_ERROR:.*exceeded D1.s free tier daily row read limit/i.test(String(error?.message||''));

// Only published music metadata is bundled. Authentication and private
// collections continue to use D1 and never fall back to this snapshot.
export async function recoverPublishedCatalog(tracks,snapshot=state){
 const base=await applyCatalogOverrides(null,[...tracks,...snapshot.custom]);
 const patches=new Map(snapshot.overrides.map(r=>[r.track,r.metadata]));
 const languages=new Map(snapshot.languages.map(r=>[r.id,r.language]));
 return base.map(t=>({...t,...(languages.has(t.id)?{language:languages.get(t.id)}:{}),...patches.get(t.id),id:t.id}));
}
