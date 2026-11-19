const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ru',{granularity:'grapheme'}):null;
export const waveMarkLimit=5;

export function waveMarkChars(text){
 return segmenter?Array.from(segmenter.segment(text),part=>part.segment):Array.from(text);
}

export function limitWaveMark(value){
 if(typeof value!=='string')return '';
 const text=value.slice(0,192).toWellFormed().normalize('NFC').replace(/[\p{Cc}\p{Bidi_Control}\u2028\u2029\uFFFD]/gu,'');
 let result='';
 for(const letter of waveMarkChars(text).slice(0,waveMarkLimit)){
  if(result.length+letter.length>96)break;
  result+=letter;
 }
 return result;
}

export const normalizeWaveMark=value=>limitWaveMark(value).trim();
