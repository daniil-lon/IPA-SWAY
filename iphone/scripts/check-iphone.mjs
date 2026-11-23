import {spawnSync} from 'node:child_process';

// The published product is the iPhone UI at every window size. Keep the old
// desktop/coordinate audit in check.mjs as historical evidence, not the default.
for(const file of [
 'check-worker-startup.mjs','check-independent-bootstrap.mjs','check-mobile-upgrade.mjs',
 'check-foreground-loading.mjs','check-transfer-priority.mjs','check-media-stream.mjs',
 'check-progressive-playback.mjs','check-playback-recovery.mjs','check-offline-reconnect.mjs',
 'check-november-transition.mjs','check-iphone-stations.mjs','check-november-reference.mjs',
 'check-iphone-journey.mjs','check-audio-optimization.mjs','check-experience.mjs','check-experience-ui.mjs','check-player-paint.mjs','check-community-reads.mjs'
]){
 console.log('\nChecking '+file);
 const result=spawnSync(process.execPath,['scripts/'+file],{stdio:'inherit',windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
console.log('\nPASS: iPhone startup, delivery, playback, offline reconnect and current interface');
