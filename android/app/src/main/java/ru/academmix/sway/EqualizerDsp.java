package ru.academmix.sway;
public final class EqualizerDsp {
 private static final double[] HZ={60,150,400,1000,2400,15000};
 private final double[][] c=new double[6][5];private double[][] z;private double headroom=1;private int channels;
 public void configure(int rate,int channels,double[] levels,boolean enabled){
  this.channels=channels;z=new double[channels][12];double max=0;
  for(int i=0;i<6;i++){double db=enabled?Math.max(-12,Math.min(12,levels[i])):0;max+=Math.max(0,db);double a=Math.pow(10,db/40),w=2*Math.PI*Math.min(HZ[i],rate*.45)/rate,alpha=Math.sin(w)/2,cos=Math.cos(w),a0=1+alpha/a;c[i]=new double[]{(1+alpha*a)/a0,-2*cos/a0,(1-alpha*a)/a0,-2*cos/a0,(1-alpha/a)/a0};}
  headroom=Math.pow(10,-Math.min(24,max)/20);
 }
 public short sample(short input,int channel){double x=input*headroom;for(int i=0;i<6;i++){double[] b=c[i],s=z[channel];int p=i*2;double y=b[0]*x+s[p];s[p]=b[1]*x-b[3]*y+s[p+1];s[p+1]=b[2]*x-b[4]*y;x=y;}return(short)Math.round(Math.max(-32768,Math.min(32767,x)));}
}
