package ru.academmix.sway;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import androidx.webkit.*;
import org.json.*;
import java.util.*;
public final class MainActivity extends Activity {
 private WebView web;private final Handler handler=new Handler(Looper.getMainLooper());private final List<JSONObject> waiting=new ArrayList<>();
 private ValueCallback<Uri[]> fileCallback;
 private final Runnable attach=new Runnable(){public void run(){PlaybackService service=PlaybackService.instance;if(service==null){handler.postDelayed(this,100);return;}service.observer=data->runOnUiThread(()->web.evaluateJavascript("window.dispatchEvent(new CustomEvent('sway-native-state',{detail:"+data.toString()+"}));",null));for(JSONObject d:waiting)service.command(d);waiting.clear();}};
 @Override public void onCreate(Bundle state){super.onCreate(state);getWindow().setStatusBarColor(0xff090b10);getWindow().setNavigationBarColor(0xff090b10);web=new WebView(this);setContentView(web);web.setBackgroundColor(0xff090b10);WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setMediaPlaybackRequiresUserGesture(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))WebViewCompat.addWebMessageListener(web,"SwayAndroid",Set.of("https://music.academmix.ru"),(view,message,source,main,reply)->{if(!main)return;try{JSONObject d=new JSONObject(message.getData());PlaybackService service=PlaybackService.instance;if(service!=null)service.command(d);else{waiting.add(d);startService(new Intent(this,PlaybackService.class));handler.post(attach);}}catch(Exception ignored){}});
  web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){if(!request.isForMainFrame())return false;Uri u=request.getUrl();String host=u.getHost();if("https".equals(u.getScheme())&&("music.academmix.ru".equals(host)||"oauth.yandex.ru".equals(host)||"login.yandex.ru".equals(host)||"passport.yandex.ru".equals(host)||"id.yandex.ru".equals(host)))return false;try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}return true;}@Override public void onPageFinished(WebView v,String url){CookieManager.getInstance().flush();}});
  web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;try{startActivityForResult(params.createIntent(),24);return true;}catch(Exception e){fileCallback=null;return false;}}});if(Build.VERSION.SDK_INT>=33)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},1);if(state==null)web.loadUrl("https://music.academmix.ru");else web.restoreState(state);if(PlaybackService.instance!=null)handler.post(attach);
 }
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else moveTaskToBack(true);}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==24&&fileCallback!=null){fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileCallback=null;}}
 @Override protected void onSaveInstanceState(Bundle out){web.saveState(out);super.onSaveInstanceState(out);}
 @Override protected void onResume(){super.onResume();web.onResume();if(PlaybackService.instance!=null)handler.post(attach);}
 @Override protected void onPause(){web.onPause();CookieManager.getInstance().flush();super.onPause();}
 @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);if(PlaybackService.instance!=null)PlaybackService.instance.observer=null;web.destroy();super.onDestroy();}
}
