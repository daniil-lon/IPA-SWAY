import ru.academmix.sway.EqualizerDsp;
public final class EqualizerDspCheck {
 static double energy(double frequency,double[] levels){EqualizerDsp d=new EqualizerDsp();d.configure(48000,1,levels,true);double sum=0;for(int i=0;i<96000;i++){short y=d.sample((short)(4000*Math.sin(2*Math.PI*frequency*i/48000)),0);if(i>48000)sum+=(double)y*y;}return sum;}
 public static void main(String[] args){double[] flat=new double[6],bass={6,4,1,0,-1,-1};double ratio=10*Math.log10((energy(60,bass)/energy(2400,bass))/(energy(60,flat)/energy(2400,flat)));if(ratio<3)throw new AssertionError("Bass response "+ratio);EqualizerDsp d=new EqualizerDsp();d.configure(48000,2,new double[]{12,12,12,12,12,12},true);for(int i=0;i<100000;i++)d.sample((short)(32000*Math.sin(i*.2)),i%2);System.out.println("PASS native six-band DSP: bass vs treble "+String.format("%.1f",ratio)+" dB, full-scale processing");}
}
