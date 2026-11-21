// Only words from the recording's lyrics or an explicit catalog credit are evidence.
export function lyricLanguage(text){
 const words=String(text||'').replace(/\[[^\]]*\]/g,' ').replace(/https?:\/\/\S+/g,' ');
 const cyrillic=(words.match(/[а-яё]/gi)||[]).length;
 const latin=(words.match(/[a-z]/gi)||[]).length;
 const letters=(words.match(/\p{L}/gu)||[]).length;
 if(letters<35)return '';
 if(/[іїєґўђјљњћџәғқңөұүһ]/iu.test(words)&&cyrillic/letters>=.4)return 'foreign';
 if(cyrillic/letters>=.64)return 'ru';
 if(latin/letters>=.78)return 'en';
 if(cyrillic/letters>.2)return 'mul';
 return 'foreign';
}
export function songLanguage(track){
 const code=String(track?.language||track?.lyricsLanguage||'').toLowerCase().split('-')[0];
 if(['ru','rus','russian'].includes(code))return 'ru';
 if(['en','eng','english'].includes(code))return 'en';
 if(['mul','mixed','zxx','instrumental','und'].includes(code))return code==='mixed'?'mul':code==='instrumental'?'zxx':code;
 return code&&/^[a-z]{2,3}$/.test(code)||code==='foreign'?'foreign':'';
}
export function matchesLanguage(track,language){
 if(!language||language==='any')return true;
 const known=songLanguage(track);
 return language==='ru'?known==='ru':['en','foreign'].includes(known);
}
