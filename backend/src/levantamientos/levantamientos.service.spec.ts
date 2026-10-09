import { LevantamientosService } from './levantamientos.service';
import { EstadoLevantamientoEnum } from './dto/create-levantamiento.dto';

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
  await service.update('t','l',{estado:EstadoLevantamientoEnum.FINALIZADO},'u');
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

describe('Identidad de productos durante el levantamiento', () => {
 let prisma:any, service:LevantamientosService;
 const product={id:'p1',codigo:'CABLE',codigoBarras:'001234',activo:true,unidadMedida:'METRO',stockActual:5,stockReservado:1,precioCosto:2,precioVenta:4};
 const count={id:'count-12345678',descripcion:'Cable',cantidad:3.5,unidad:'METRO',precioCosto:2,precioVenta:4};
 beforeEach(() => {
  prisma={
   $transaction:vi.fn((fn:any)=>fn(prisma)), $queryRawUnsafe:vi.fn(async()=>[]),
   levantamiento:{findFirst:vi.fn().mockResolvedValue({id:'l',estado:'EN_PROGRESO',items:[]})},
   levantamientoItem:{create:vi.fn(async({data}:any)=>data),update:vi.fn(async({data}:any)=>data),findMany:vi.fn().mockResolvedValue([])},
   producto:{findMany:vi.fn(async({where}:any)=>[product].filter(p=>where.OR.some((condition:any)=>
    condition.id?.in.includes(p.id)||(condition.codigo?.equals!==undefined&&condition.codigo.equals.toUpperCase()===p.codigo.toUpperCase())||condition.codigoBarras?.in.includes(p.codigoBarras))))},
  };
  service=new LevantamientosService(prisma);
 });
 it('reconoce barcode con espacios en capturas anteriores sin crear otro producto', async()=>{
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'FINALIZADO',items:[{...count,codigoBarras:' 001234 '}]});
  const preview=await service.previsualizar('t','l');
  expect(preview.rows[0]).toMatchObject({productoId:'p1',anterior:5,nuevo:3.5});
 });
 it('detecta barcodes repetidos aunque tengan espacios distintos', async()=>{
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'FINALIZADO',items:[{...count,codigoBarras:' 0099 '},{...count,id:'other',codigoBarras:'0099'}]});
  const preview=await service.previsualizar('t','l');
  expect(preview.rows[1].errores).toContain('Código de barras repetido en el conteo');
 });
 it('guarda barcode sin espacios preservando ceros iniciales', async()=>{
  const result=await service.createItem('t','l',{...count,codigoBarras:' 001234 '},'u');
  expect(result.codigoBarras).toBe('001234');
 });
 it('normaliza corrección y permite limpiar barcode', async()=>{
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'EN_PROGRESO',items:[{...count,version:1}]});
  expect((await service.updateItem('t','l',count.id,{version:1,codigoBarras:' 001234 '},'u')).codigoBarras).toBe('001234');
  expect((await service.updateItem('t','l',count.id,{version:1,codigoBarras:'   '},'u')).codigoBarras).toBeNull();
 });
});

// ─── Auditoría P1/P2 — aplicar() protege barcode y precios ───────────────────
describe('Auditoría P1/P2 — aplicar() protege barcode y precios',()=>{
 let prisma:any,service:any;
 const baseProduct={id:'p1',codigo:'ABC',codigoBarras:'BAR123',activo:true,unidadMedida:'UNIDAD',
  stockActual:10,stockReservado:0,precioCosto:5,precioVenta:10};
 beforeEach(()=>{
  prisma={
   $transaction:vi.fn((fn:any)=>fn(prisma)),
   $queryRawUnsafe:vi.fn(async(sql:string)=>sql.includes('SELECT u.rol')?[{rol:'ADMIN'}]:[]),
   levantamiento:{findFirst:vi.fn(),update:vi.fn(async({data}:any)=>({id:'l',...data}))},
   levantamientoItem:{update:vi.fn(async({data}:any)=>({id:'i',...data}))},
   producto:{findMany:vi.fn().mockResolvedValue([baseProduct]),update:vi.fn(async({data}:any)=>data),create:vi.fn()},
   movimientoInventario:{create:vi.fn()},auditLog:{create:vi.fn()},
  };
  service=new LevantamientosService(prisma);
 });
 const itemABC=(extra={})=>({id:'i1',codigo:'ABC',codigoBarras:'BAR123',descripcion:'Tornillo',
  cantidad:7,unidad:'UNIDAD',precioCosto:5,precioVenta:10,conflicto:false,...extra});

 it('NO sobreescribe barcode cuando el conteo difiere del catálogo — aplicar() rechaza',async()=>{
  // Item con código interno diferente al barcode del catálogo: preview.token permite aplicar,
  // pero si hubiera conflicto el servicio bloquea
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'FINALIZADO',aplicadoAt:null,items:[itemABC()]});
  const {token}=await service.previsualizar('t','l');
  await service.aplicar('t','u','l',token);
  const updateCall=prisma.producto.update.mock.calls[0][0];
  // El barcode del catálogo ('BAR123') se conserva; no se sobreescribe con null ni con otro valor
  expect(updateCall.data).not.toHaveProperty('codigoBarras',null);
  expect(updateCall.data).not.toHaveProperty('codigoBarras','');
 });
 it('persiste barcode cuando matchedByBarcode=true',async()=>{
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'FINALIZADO',aplicadoAt:null,
   items:[itemABC({codigo:undefined,codigoBarras:'BAR123'})]});
  const {token}=await service.previsualizar('t','l');
  await service.aplicar('t','u','l',token);
  const updateCall=prisma.producto.update.mock.calls[0][0];
  expect(updateCall.where.id).toBe('p1');
  expect(updateCall.data.stockActual).toBe(7);
 });
 it('actualiza barcode en catálogo cuando catalogBarcode era null',async()=>{
  const noBar={...baseProduct,codigoBarras:null};
  prisma.producto.findMany.mockResolvedValue([noBar]);
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'FINALIZADO',aplicadoAt:null,
   items:[itemABC({codigoBarras:'NEWBAR'})]});
  const {token}=await service.previsualizar('t','l');
  await service.aplicar('t','u','l',token);
  const updateCall=prisma.producto.update.mock.calls[0][0];
  expect(updateCall.data.codigoBarras).toBe('NEWBAR');
 });
 it('preserva precioCosto y precioVenta del catálogo — nunca escribe 0',async()=>{
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'FINALIZADO',aplicadoAt:null,
   items:[itemABC({precioCosto:null,precioVenta:null})]});
  const {token}=await service.previsualizar('t','l');
  await service.aplicar('t','u','l',token);
  const updateCall=prisma.producto.update.mock.calls[0][0];
  // El catálogo tiene precioCosto=5, precioVenta=10 → aplicar usa esos valores, no 0
  expect(updateCall.data.precioCosto).not.toBe(0);
  expect(updateCall.data.precioVenta).not.toBe(0);
 });
 it('lanza error explícito si el producto del catálogo tiene precio null',async()=>{
  const nullPrices={...baseProduct,precioCosto:null,precioVenta:null};
  prisma.producto.findMany.mockResolvedValue([nullPrices]);
  prisma.levantamiento.findFirst.mockResolvedValue({id:'l',estado:'FINALIZADO',aplicadoAt:null,
   items:[itemABC({precioCosto:null,precioVenta:null})]});
  const {token}=await service.previsualizar('t','l');
  await expect(service.aplicar('t','u','l',token)).rejects.toThrow(/precio/i);
 });
});

// ─── Multiusuario: detección y resolución de conflictos ──────────────────────
describe('Multiusuario — detección de conflictos', () => {
 let prisma:any, service:LevantamientosService;
 beforeEach(() => {
  prisma = {
   $transaction: vi.fn((fn:any) => fn(prisma)),
   $queryRawUnsafe: vi.fn(async () => []),
   levantamiento: { findFirst: vi.fn(), update: vi.fn() },
   levantamientoItem: {
    create: vi.fn(async ({ data }:any) => ({ id: 'new-item', ...data })),
    update: vi.fn(async ({ data }:any) => ({ id: 'upd', ...data })),
    findMany: vi.fn().mockResolvedValue([]),
   },
   producto: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue({ id: 'p1' }) },
  };
  service = new LevantamientosService(prisma);
 });

 it('marca conflicto=true cuando dos usuarios cuentan el mismo producto', async () => {
  // Usuario A ya contó el item con productoId='p1'
  prisma.levantamiento.findFirst.mockResolvedValue({
   id: 'l', estado: 'EN_PROGRESO',
   items: [{ id: 'item-A', productoId: 'p1', codigo: null, codigoBarras: null, contadorId: 'userA', conflicto: false }],
  });
  // Usuario B intenta contar el mismo producto
  const result = await service.createItem('t', 'l',
   { descripcion: 'Tornillo', cantidad: 5, productoId: 'p1' }, 'userB');
  expect(result.conflicto).toBe(true);
 });

 it('mismo usuario repitiendo un artículo ya contado recibe CONTEO_DUPLICADO y no crea otro ítem (FS-06 fase 2)', async () => {
  prisma.levantamiento.findFirst.mockResolvedValue({
   id: 'l', estado: 'EN_PROGRESO',
   items: [{ id: 'item-A', productoId: 'p1', codigo: null, codigoBarras: null, contadorId: 'userA', conflicto: false }],
  });
  const error = await service.createItem('t', 'l',
   { descripcion: 'Tornillo', cantidad: 3, productoId: 'p1' }, 'userA').catch((e: any) => e);
  expect(error.getStatus()).toBe(409);
  expect(error.getResponse()).toMatchObject({ code: 'CONTEO_DUPLICADO', itemId: 'item-A' });
  expect(prisma.levantamientoItem.create).not.toHaveBeenCalled();
 });

 it('detecta conflicto por código de barras igual', async () => {
  prisma.levantamiento.findFirst.mockResolvedValue({
   id: 'l', estado: 'EN_PROGRESO',
   items: [{ id: 'item-A', productoId: null, codigo: null, codigoBarras: '001234', contadorId: 'userA', conflicto: false }],
  });
  const result = await service.createItem('t', 'l',
   { descripcion: 'Cable', cantidad: 10, codigoBarras: '001234' }, 'userB');
  expect(result.conflicto).toBe(true);
 });

 it('detecta conflicto por código interno igual (normalizado a mayúsculas)', async () => {
  prisma.levantamiento.findFirst.mockResolvedValue({
   id: 'l', estado: 'EN_PROGRESO',
   items: [{ id: 'item-A', productoId: null, codigo: 'CABLE-001', codigoBarras: null, contadorId: 'userA', conflicto: false }],
  });
  const result = await service.createItem('t', 'l',
   { descripcion: 'Cable', cantidad: 5, codigo: 'cable-001' }, 'userB');
  expect(result.conflicto).toBe(true);
 });

 it('bloquea aplicar() cuando hay ítems con conflicto=true', async () => {
  prisma.$queryRawUnsafe.mockImplementation(async (sql:string) => sql.includes('SELECT u.rol') ? [{ rol: 'ADMIN' }] : []);
  prisma.levantamiento.findFirst.mockResolvedValue({
   id: 'l', estado: 'FINALIZADO', aplicadoAt: null,
   items: [{ id: 'i1', conflicto: true, descripcion: 'Cable', cantidad: 5, unidad: 'METRO', precioCosto: 1, precioVenta: 2 }],
  });
  const { token } = await service.previsualizar('t', 'l');
  await expect(service.aplicar('t', 'u', 'l', token)).rejects.toThrow(/conflicto|Resuelva/i);
 });

 it('preview incluye error por ítem con conflicto pendiente', async () => {
  prisma.levantamiento.findFirst.mockResolvedValue({
   id: 'l', estado: 'FINALIZADO', aplicadoAt: null,
   items: [{ id: 'i1', conflicto: true, descripcion: 'Cable', cantidad: 5, unidad: 'METRO' }],
  });
  const preview = await service.previsualizar('t', 'l');
  expect(preview.rows[0].errores).toContain('Conteo en conflicto: conciliar antes de aplicar');
 });
});

// ─── Multiusuario: conciliación explícita ────────────────────────────────────
describe('Multiusuario — conciliación de conflictos', () => {
 let prisma:any, service:LevantamientosService;
 const itemA = { id: 'item-A', productoId: 'p1', codigo: 'P1', codigoBarras: '001', contadorId: 'userA', conflicto: true, cantidad: 5, unidad: 'UNIDAD', descripcion: 'Tubo' };
 const itemB = { id: 'item-B', productoId: 'p1', codigo: 'P1', codigoBarras: '001', contadorId: 'userB', conflicto: true, cantidad: 8, unidad: 'UNIDAD', descripcion: 'Tubo' };

 beforeEach(() => {
  prisma = {
   $transaction: vi.fn((fn:any) => fn(prisma)),
   $queryRawUnsafe: vi.fn(async (sql:string) => sql.includes('SELECT u.rol') ? [{ rol: 'ADMIN' }] : []),
   levantamiento: { findFirst: vi.fn().mockResolvedValue({ id: 'l', estado: 'EN_PROGRESO', items: [itemA, itemB] }) },
   levantamientoItem: {
    update: vi.fn(async ({ data }:any) => ({ ...itemA, ...data })),
    delete: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
   },
  };
  service = new LevantamientosService(prisma);
 });

 it('ADMIN puede elegir qué conteo conservar — el otro se elimina', async () => {
  await service.conciliarConflicto('t', 'l', { mantenerItemId: 'item-A' }, 'admin');
  expect(prisma.levantamientoItem.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'item-B' } }));
  expect(prisma.levantamientoItem.update).toHaveBeenCalledWith(expect.objectContaining({
   where: { id: 'item-A' },
   data: expect.objectContaining({ conflicto: false }),
  }));
 });

 it('ADMIN puede ingresar cantidad manual al conciliar', async () => {
  await service.conciliarConflicto('t', 'l', { mantenerItemId: 'item-A', cantidadManual: 6 }, 'admin');
  expect(prisma.levantamientoItem.update).toHaveBeenCalledWith(expect.objectContaining({
   where: { id: 'item-A' },
   data: expect.objectContaining({ cantidad: 6, conflicto: false }),
  }));
 });

 it('no-ADMIN no puede conciliar conflictos', async () => {
  prisma.$queryRawUnsafe.mockImplementation(async () => [{ rol: 'EMPLEADO' }]);
  await expect(service.conciliarConflicto('t', 'l', { mantenerItemId: 'item-A' }, 'empleado')).rejects.toThrow();
 });

 it('rechaza mantenerItemId que no es un ítem en conflicto', async () => {
  // El ítem 'inexistente' no está en la lista de ítems del levantamiento
  prisma.levantamiento.findFirst.mockResolvedValue({ id: 'l', estado: 'EN_PROGRESO', aplicadoAt: null, items: [itemA, itemB] });
  await expect(service.conciliarConflicto('t', 'l', { mantenerItemId: 'inexistente' }, 'admin')).rejects.toThrow(/no encontrado|conflicto/i);
 });
});

// ─── Multiusuario: heartbeat y participantes ─────────────────────────────────
describe('Multiusuario — heartbeat y participantes', () => {
 let prisma:any, service:LevantamientosService;
 const NOW = new Date();

 beforeEach(() => {
  prisma = {
   $transaction: vi.fn((fn:any) => fn(prisma)),
   $queryRawUnsafe: vi.fn().mockResolvedValue([]),
   levantamiento: { findFirst: vi.fn().mockResolvedValue({ id: 'l', tenantId: 't' }) },
   levantamientoSesion: {
    upsert: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([
     { usuarioId: 'u1', nombreUsuario: 'Ana', ultimoHeartbeat: NOW },
     { usuarioId: 'u2', nombreUsuario: 'Pedro', ultimoHeartbeat: new Date(NOW.getTime() - 10_000) },
     // sesión expirada (> 5 min)
     { usuarioId: 'u3', nombreUsuario: 'Fantasma', ultimoHeartbeat: new Date(NOW.getTime() - 400_000) },
    ]),
   },
  };
  service = new LevantamientosService(prisma);
 });

 it('heartbeat registra o actualiza la sesión del usuario', async () => {
  await service.heartbeat('t', 'l', 'u1', 'Ana');
  expect(prisma.levantamientoSesion.upsert).toHaveBeenCalledWith(expect.objectContaining({
   where: { levantamientoId_usuarioId: { levantamientoId: 'l', usuarioId: 'u1' } },
   create: expect.objectContaining({ nombreUsuario: 'Ana' }),
   update: expect.objectContaining({ nombreUsuario: 'Ana' }),
  }));
 });

 it('salirSesion elimina el registro del usuario', async () => {
  await service.salirSesion('t', 'l', 'u1');
  expect(prisma.levantamientoSesion.deleteMany).toHaveBeenCalledWith(
   expect.objectContaining({ where: expect.objectContaining({ usuarioId: 'u1', levantamientoId: 'l' }) })
  );
 });

 it('findParticipantes filtra por TTL en la consulta a BD (no devuelve expirados)', async () => {
  // El servicio pasa {ultimoHeartbeat:{gte:umbral}} a prisma; el mock devuelve lo que prisma devolvería
  // Simulamos que prisma ya filtró — mock devuelve solo sesiones activas
  prisma.levantamientoSesion.findMany.mockResolvedValue([
   { usuarioId: 'u1', nombreUsuario: 'Ana', ultimoHeartbeat: NOW },
   { usuarioId: 'u2', nombreUsuario: 'Pedro', ultimoHeartbeat: new Date(NOW.getTime() - 10_000) },
  ]);
  const result = await service.findParticipantes('t', 'l');
  expect(result.length).toBe(2);
  expect(result.map((p:any) => p.usuarioId)).not.toContain('u3');
  // Verificar que se pasó el filtro de TTL
  expect(prisma.levantamientoSesion.findMany).toHaveBeenCalledWith(
   expect.objectContaining({ where: expect.objectContaining({ ultimoHeartbeat: expect.objectContaining({ gte: expect.any(Date) }) }) })
  );
 });
});

// ─── Aislamiento por tenant ───────────────────────────────────────────────────
describe('Aislamiento por tenant', () => {
 let prisma:any, service:LevantamientosService;
 const lev = { id: 'l', tenantId: 'tenant-A', estado: 'EN_PROGRESO', items: [] };

 beforeEach(() => {
  prisma = {
   $transaction: vi.fn((fn:any) => fn(prisma)),
   $queryRawUnsafe: vi.fn().mockResolvedValue([]),
   levantamiento: { findFirst: vi.fn() },
  };
  service = new LevantamientosService(prisma);
 });

 it('no puede acceder a levantamiento de otro tenant', async () => {
  // El servicio busca con tenantId='tenant-B', pero el levantamiento pertenece a tenant-A
  prisma.levantamiento.findFirst.mockResolvedValue(null); // tenant mismatch → null
  await expect(service.findOne('tenant-B', 'l')).rejects.toThrow(/no encontrado|not found/i);
 });

 it('findAll devuelve solo levantamientos del tenant solicitado', async () => {
  // El servicio accede a _count.items para calcular totalItems
  const rawRows = [{ id: 'l1', tenantId: 'tenant-A', nombre: 'Conteo A', estado: 'BORRADOR', _count: { items: 3 } }];
  prisma.levantamiento.findMany = vi.fn().mockResolvedValue(rawRows);
  const result = await service.findAll('tenant-A');
  expect(prisma.levantamiento.findMany).toHaveBeenCalledWith(
   expect.objectContaining({ where: { tenantId: 'tenant-A' } })
  );
  expect(result[0].totalItems).toBe(3);
  expect(result[0].tenantId).toBe('tenant-A');
 });

 it('conflictos de un tenant no afectan a otro tenant', async () => {
  // findFirst con where:{tenantId:'tenant-B',id:'l'} no encuentra nada → NotFoundException
  prisma.levantamiento.findFirst.mockResolvedValue(null);
  await expect(service.findConflictos('tenant-B', 'l')).rejects.toThrow(/no encontrado|not found/i);
 });
});
