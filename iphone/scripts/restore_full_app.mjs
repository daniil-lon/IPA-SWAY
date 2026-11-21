import fs from 'node:fs';

let code = fs.readFileSync('artifacts/sway-polish-ship-1795003679385/public/app.js', 'utf8');

// 1. Add admin-client import at the top
if (!code.includes('admin-client.js')) {
  code = "import { initAdminClient, renderPromo, renderEditorial } from './admin-client.js';\n" + code;
}

// 2. In mobileHome: remove storiesRail, add waveFiltersBar if not present, and add promo/editorial slots
if (code.includes('storiesRail()+')) {
  code = code.replace(
    'storiesRail()+\n',
    (code.includes('waveFiltersBar()') ? '' : 'waveFiltersBar()+\n') + "'<div id=\"sway-promo-slot\"></div>'+\n"
  );
  code = code.replace(
    /<\/div>'\s*\+\s*waveDeck\(\)\s*\+\s*'<\/section>'/,
    '</div><div id="sway-editorial-slot"></div>\'+waveDeck()+\'</section>\''
  );
} else {
  // If storiesRail was already replaced
  if (!code.includes('sway-promo-slot')) {
    code = code.replace(
      /navHeader\([^)]+\)\+/,
      m => m + "'<div id=\"sway-promo-slot\"></div>'+"
    );
  }
}

// 3. In render(): add renderPromo() and renderEditorial()
if (!code.includes('renderPromo();')) {
  code = code.replace(
    /if\(selectedMixKey\(\)\)deckUI\.visibility\(closestDeckSlot\(selectedMixKey\(\)\),selectedMixKey\(\),false\);\s*\}/,
    'if(selectedMixKey())deckUI.visibility(closestDeckSlot(selectedMixKey()),selectedMixKey(),false);\n }\n renderPromo();\n renderEditorial(p=>openEditorialPlaylist(p));'
  );
}

// 4. Add openEditorialPlaylist function and initAdminClient call at bottom
const extra = `
function openEditorialPlaylist(p) {
 const pTracks = (p.trackIds || []).map(id => map.get(id)).filter(Boolean);
 if (pTracks.length) {
  play(pTracks[0], pTracks, 'track');
  open('full');
 }
}

initAdminClient({onToast:t=>toast(t), onOpenPlaylist:p=>openEditorialPlaylist(p)});
`;

if (!code.includes('function openEditorialPlaylist')) {
  code += extra;
}

fs.writeFileSync('public/app.js', code, 'utf8');
console.log('Restored complete app.js, lines:', code.split('\n').length);
