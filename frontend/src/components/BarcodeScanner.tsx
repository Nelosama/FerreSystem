import React,{useEffect,useRef,useState} from 'react';
interface Detector {detect(source:HTMLVideoElement):Promise<{rawValue:string}[]>;}
export const BarcodeScanner:React.FC<{onCode:(code:string)=>void;disabled?:boolean}>=({onCode,disabled})=>{
 const [open,setOpen]=useState(false),[error,setError]=useState('');const video=useRef<HTMLVideoElement>(null),callback=useRef(onCode);callback.current=onCode;
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useEffect(()=>{
  if(!open)return;
  let stopped=false,stream:MediaStream|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const start=async()=>{
   try{
    const Detector=(window as unknown as {BarcodeDetector?:new()=>Detector}).BarcodeDetector;
    if(!Detector)throw new Error('Este navegador no permite leer códigos con la cámara. Use un lector USB/Bluetooth o escriba y busque el producto.');
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    if(stopped){stream.getTracks().forEach(t=>t.stop());return;}
    if(!video.current)throw new Error('No se pudo abrir la cámara');
    video.current.srcObject=stream;await video.current.play();const detector=new Detector();
    const scan=async()=>{
     if(stopped||!video.current)return;
     try{const codes=await detector.detect(video.current);if(codes[0]?.rawValue){callback.current(codes[0].rawValue);setOpen(false);return;}}catch{ /* El video puede no tener un cuadro disponible todavía. */ }
     if(!stopped)timer=setTimeout(()=>void scan(),250);
    };void scan();
   }catch(e){if(!stopped)setError(e instanceof Error?e.message:'No se pudo utilizar la cámara');stream?.getTracks().forEach(t=>t.stop());}
  };setError('');void start();
  return()=>{stopped=true;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());};
 },[open]);
 return <div><button type="button" className="btn btn-secondary" disabled={disabled&&!open} onClick={()=>setOpen(v=>!v)}>{open?'Cerrar cámara':'Leer código con cámara'}</button>{open&&<div><video ref={video} muted playsInline style={{width:'100%',maxWidth:400,maxHeight:260}}/>{error&&<p role="alert">{error}</p>}</div>}</div>;
};
