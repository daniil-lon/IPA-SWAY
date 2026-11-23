package ru.academmix.sway;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.media.AudioManager;
import android.media.AudioFocusRequest;
import androidx.media3.common.*;
import androidx.media3.exoplayer.*;
import androidx.media3.exoplayer.audio.*;
import androidx.media3.datasource.*;
import androidx.media3.datasource.cache.*;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.*;
import org.json.*;
import java.io.File;
import java.util.*;
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public final class PlaybackService extends MediaSessionService {
 public interface Observer {void state(JSONObject data);}
 public static PlaybackService instance;public Observer observer;
 private AudioManager audioManager;private AudioFocusRequest audioFocus;private boolean focused=false;private float duck=1;
 private final DefaultHttpDataSource.Factory http=new DefaultHttpDataSource.Factory().setUserAgent("Sway/1.0 Android");
 private ExoPlayer[] players=new ExoPlayer[2];private SixBandProcessor[] eq=new SixBandProcessor[2];private float[] gains={1,0};private float[] volumes={1,1};private boolean[] muted={false,false};private String[] queueKeys={"",""};private MediaSession session;private SimpleCache cache;private final Handler handler=new Handler(Looper.getMainLooper());private int active=0;
 private final Runnable ticker=new Runnable(){public void run(){for(int i=0;i<2;i++)publish(i,false);handler.postDelayed(this,250);}};
 @Override public void onCreate(){super.onCreate();instance=this;audioManager=(AudioManager)getSystemService(AUDIO_SERVICE);audioFocus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_MEDIA).setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC).build()).setOnAudioFocusChangeListener(change->{if(change==AudioManager.AUDIOFOCUS_LOSS||change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT){focused=false;for(ExoPlayer p:players)if(p!=null)p.pause();}else{duck=change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK?.25f:1;for(int ch=0;ch<2;ch++)if(players[ch]!=null)volume(ch);}},handler).build();cache=new SimpleCache(new File(getCacheDir(),"audio"),new LeastRecentlyUsedCacheEvictor(1024L*1024*1024),new StandaloneDatabaseProvider(this));
  var source=new CacheDataSource.Factory().setCache(cache).setUpstreamDataSourceFactory(new DefaultDataSource.Factory(this,http)).setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
  for(int i=0;i<2;i++){eq[i]=new SixBandProcessor();final SixBandProcessor processor=eq[i];DefaultRenderersFactory renderers=new DefaultRenderersFactory(this){@Override protected AudioSink buildAudioSink(android.content.Context context,boolean floatOutput,boolean params){return new DefaultAudioSink.Builder(context).setAudioProcessors(new androidx.media3.common.audio.AudioProcessor[]{processor}).build();}};
   players[i]=new ExoPlayer.Builder(this,renderers).setMediaSourceFactory(new DefaultMediaSourceFactory(source)).build();players[i].setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),false);players[i].setHandleAudioBecomingNoisy(true);players[i].setWakeMode(C.WAKE_MODE_LOCAL);final int ch=i;
   players[i].addListener(new Player.Listener(){@Override public void onPlayerError(PlaybackException error){publish(ch,true);}@Override public void onEvents(Player p,Player.Events e){if(p.getPlayWhenReady()&&!focused){focused=audioManager.requestAudioFocus(audioFocus)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED;if(!focused)p.pause();}publish(ch,false);}});
  }
  Intent launch=new Intent(this,MainActivity.class);PendingIntent pending=PendingIntent.getActivity(this,0,launch,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);session=new MediaSession.Builder(this,players[0]).setSessionActivity(pending).setCallback(new MediaSession.Callback(){
   @Override public MediaSession.ConnectionResult onConnect(MediaSession s,MediaSession.ControllerInfo controller){
    // Queue URLs come only from the origin-checked WebView bridge. External
    // controllers may control playback, but must never choose cookie-bearing URLs.
    Player.Commands commands=MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon().remove(Player.COMMAND_SET_MEDIA_ITEM).remove(Player.COMMAND_CHANGE_MEDIA_ITEMS).build();
    return new MediaSession.ConnectionResult.AcceptedResultBuilder(s).setAvailablePlayerCommands(commands).build();
   }
  }).build();handler.post(ticker);
 }
 @Override public MediaSession onGetSession(MediaSession.ControllerInfo info){return session;}
 private void volume(int ch){players[ch].setVolume(muted[ch]?0:Math.max(0,Math.min(1,gains[ch]*volumes[ch]*duck)));}
 private static boolean permitted(String url){Uri u=Uri.parse(url);return "https".equals(u.getScheme())&&"music.academmix.ru".equals(u.getHost())&&(u.getPath().startsWith("/media/")||u.getPath().startsWith("/api/custom-media/"));}
 public void command(JSONObject d){try{
  String cookie=android.webkit.CookieManager.getInstance().getCookie("https://music.academmix.ru");http.setDefaultRequestProperties(cookie==null?Collections.emptyMap():Map.of("Cookie",cookie));
  int ch=d.optInt("channel",active);if(ch<0||ch>1)return;ExoPlayer p=players[ch];String action=d.getString("action");
  switch(action){
   case "load":{String url=d.getString("url");if(!permitted(url))return;p.setMediaItem(MediaItem.fromUri(url));p.prepare();queueKeys[ch]="";break;}
   case "clear":p.stop();p.clearMediaItems();queueKeys[ch]="";break;
   case "play":if(!focused)focused=audioManager.requestAudioFocus(audioFocus)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED;if(!focused){publish(ch,true);return;}active=ch;if(session.getPlayer()!=p)session.setPlayer(p);p.play();break;
   case "pause":p.pause();break;
   case "currentTime":p.seekTo(Math.max(0,(long)(d.getDouble("value")*1000)));break;
   case "volume":volumes[ch]=(float)d.getDouble("value");volume(ch);break;
   case "gain":gains[ch]=(float)d.getDouble("value");volume(ch);break;
   case "muted":muted[ch]=d.getBoolean("value");volume(ch);break;
   case "repeat":{String mode=d.optString("value");int repeat="one".equals(mode)?Player.REPEAT_MODE_ONE:"all".equals(mode)?Player.REPEAT_MODE_ALL:Player.REPEAT_MODE_OFF;for(ExoPlayer player:players)player.setRepeatMode(repeat);break;}
   case "normalize":for(SixBandProcessor e:eq)e.setNormalization(d.optBoolean("value"));break;
   case "queue":{JSONArray a=d.getJSONArray("items");if(a.length()==0)return;String key=a.toString();if(key.equals(queueKeys[ch]))return;ArrayList<MediaItem> items=new ArrayList<>();for(int i=0;i<Math.min(1000,a.length());i++){JSONObject t=a.getJSONObject(i);if(!permitted(t.getString("url")))continue;Uri art=Uri.parse(t.optString("art"));MediaMetadata.Builder metadata=new MediaMetadata.Builder().setTitle(t.optString("title")).setArtist(t.optString("artist"));if("https".equals(art.getScheme())&&"music.academmix.ru".equals(art.getHost()))metadata.setArtworkUri(art);items.add(new MediaItem.Builder().setMediaId(t.getString("id")).setUri(t.getString("url")).setMediaMetadata(metadata.build()).build());}if(items.isEmpty())return;long position=p.getCurrentPosition();boolean playing=p.getPlayWhenReady();p.setMediaItems(items,0,position);p.prepare();p.setPlayWhenReady(playing);queueKeys[ch]=key;break;}
   case "equalizer":{JSONArray a=d.getJSONArray("levels");if(a.length()!=6)return;double[] levels=new double[6];for(int i=0;i<6;i++)levels[i]=a.getDouble(i);for(SixBandProcessor e:eq)e.update(levels,d.optBoolean("enabled"));break;}
  }
  publish(ch,false);
 }catch(Exception ignored){}}
 private void publish(int ch,boolean error){if(observer==null||players[ch]==null)return;try{ExoPlayer p=players[ch];MediaItem item=p.getCurrentMediaItem();JSONObject d=new JSONObject().put("channel",ch).put("currentTime",Math.max(0,p.getCurrentPosition())/1000d).put("duration",p.getDuration()>0?p.getDuration()/1000d:0).put("buffered",Math.max(0,p.getBufferedPosition())/1000d).put("paused",!p.getPlayWhenReady()).put("ended",p.getPlaybackState()==Player.STATE_ENDED).put("readyState",p.getPlaybackState()==Player.STATE_READY?4:0).put("trackId",item==null?"":item.mediaId).put("error",error);observer.state(d);}catch(Exception ignored){}}
 @Override public void onTaskRemoved(Intent rootIntent){if(!players[active].getPlayWhenReady())stopSelf();}
 @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);observer=null;audioManager.abandonAudioFocusRequest(audioFocus);session.release();for(ExoPlayer p:players)p.release();cache.release();instance=null;super.onDestroy();}
}
