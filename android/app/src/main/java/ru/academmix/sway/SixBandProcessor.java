package ru.academmix.sway;
import java.nio.ByteBuffer;
import androidx.media3.common.C;
import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.common.audio.AudioProcessor;
public final class SixBandProcessor extends BaseAudioProcessor {
 private final EqualizerDsp dsp=new EqualizerDsp();private volatile double[] levels=new double[6];private volatile boolean enabled=false,dirty=true;private int rate=48000,channels=2;
 public void update(double[] value,boolean on){levels=value.clone();enabled=on;dirty=true;}
 private volatile boolean normalize=false;private double energy=0,normalGain=1;
 public void setNormalization(boolean enabled){normalize=enabled;}
 @Override protected AudioFormat onConfigure(AudioFormat f)throws UnhandledAudioFormatException {if(f.encoding!=C.ENCODING_PCM_16BIT)throw new UnhandledAudioFormatException(f);rate=f.sampleRate;channels=f.channelCount;dirty=true;return f;}
 @Override public void queueInput(ByteBuffer input){if(dirty){dsp.configure(rate,channels,levels,enabled);dirty=false;}ByteBuffer out=replaceOutputBuffer(input.remaining());int channel=0;while(input.remaining()>=2){double value=dsp.sample(input.getShort(),channel),x=value/32768d;energy+=(x*x-energy)/Math.max(1,rate*channels*.4);double target=normalize?Math.min(1,.14/Math.sqrt(Math.max(.000001,energy))):1;normalGain+=(target-normalGain)/Math.max(1,rate*channels*(target<normalGain?.08:1.8));out.putShort((short)Math.round(value*normalGain));channel=(channel+1)%channels;}out.flip();}
}
