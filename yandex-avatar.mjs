const portraitId=/^[a-z0-9_-]{1,120}(?:\/[a-z0-9_-]{1,120})?$/i;

export function yandexPortraitId(info){
 const id=info.default_avatar_id;
 return info.is_avatar_empty===false&&typeof id==='string'&&portraitId.test(id)?id:null;
}

export function yandexPortraitURL(id){
 return typeof id==='string'&&portraitId.test(id)?
  'https://avatars.yandex.net/get-yapic/'+id+'/islands-200':null;
}
