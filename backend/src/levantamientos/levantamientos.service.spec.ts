import { LevantamientosService } from './levantamientos.service';

describe('Conteo protegido y aplicación explícita',()=>{
 let prisma:any,service:LevantamientosService;
 beforeEach(()=>{
  prisma={
   $transaction:vi.fn((fn:any)=>fn(prisma)), $queryRawUnsafe:vi.fn(async(sql:string)=>sql.includes('SELECT u.rol')?[{rol:'ADMIN'}]:[]),
   levantamiento:{findFirst:vi.fn(),findMany:vi.fn(),update:vi.fn(),create:vi.fn()},
   levantamientoItem:{update:vi.fn(),create:vi.fn(),delete:vi.fn()},
   producto:{findMany:vi.fn().mockResolvedValue([]),update:vi.fn(),create:vi.fn()},
  };service=new LevantamientosService(prisma);
 });
 it('no aplica existencias al finalizar',async()=>{
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'EN_PROGRESO',items:[]});
  prisma.levantamiento.update.mockResolvedValue({id:'l',estado:'FINALIZADO'});
  await service.update('t','l',{estado:'FINALIZADO'},'u');
  expect(prisma.producto.update).not.toHaveBeenCalled();
 });
 it('impide sobreescribir una versión que editó otro usuario',async()=>{
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'EN_PROGRESO',items:[{id:'i',version:2}]});
  await expect(service.updateItem('t','l','i',{version:1,cantidad:3},'u')).rejects.toThrow('Otro usuario');
  expect(prisma.levantamientoItem.update).not.toHaveBeenCalled();
 });
 it('impide editar un conteo finalizado',async()=>{
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'FINALIZADO',items:[]});
  await expect(service.createItem('t','l',{descripcion:'Cable',cantidad:1},'u')).rejects.toThrow('cerrado');
 });
 it('un código desconocido exige costo y precio para crear el producto',async()=>{
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'FINALIZADO',items:[{id:'abc12345',codigo:'NUEVO',descripcion:'Cable',cantidad:2,unidad:'METRO'}]});
  const preview=await service.previsualizar('t','l');
  expect(preview.rows[0].errores).toContain('Producto nuevo requiere costo y precio');
 });
 it('rechaza una vista previa obsoleta y no toca el stock',async()=>{
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'FINALIZADO',items:[{id:'abc12345',codigo:'P1',descripcion:'Cable',cantidad:2,unidad:'METRO',precioCosto:1,precioVenta:2}]});
  await expect(service.aplicar('t','u','l','obsoleto')).rejects.toThrow('cambió');
  expect(prisma.producto.update).not.toHaveBeenCalled();expect(prisma.producto.create).not.toHaveBeenCalled();
 });
 it('repetir una aplicación confirmada no repite movimientos',async()=>{
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'FINALIZADO',aplicadoAt:new Date(),aplicadoPor:'u',items:[]});
  await service.aplicar('t','u','l','token');
  expect(prisma.producto.update).not.toHaveBeenCalled();expect(prisma.levantamiento.update).not.toHaveBeenCalled();
 });
});
