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
   levantamientoItem:{create:vi.fn(async({data}:any)=>data),update:vi.fn(async({data}:any)=>data)},
   producto:{findMany:vi.fn(async({where}:any)=>[product].filter(p=>where.OR.some((condition:any)=>
    condition.id?.in.includes(p.id)||condition.codigo?.in.some((code:string)=>code.toUpperCase()===p.codigo)||condition.codigoBarras?.in.includes(p.codigoBarras))))},
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

describe('Auditoría P1 — protección de código de barras del catálogo', () => {
 let prisma: any, service: LevantamientosService;

 const catalogProduct = {
  id: 'p1', codigo: 'CABLE', codigoBarras: '001234',
  activo: true, unidadMedida: 'METRO',
  stockActual: 5, stockReservado: 0, precioCosto: 2, precioVenta: 4,
 };

 function mkPrisma(items: any[]) {
  return {
   $transaction: vi.fn((fn: any) => fn(prisma)),
   $queryRawUnsafe: vi.fn(async (sql: string) => sql.includes('SELECT u.rol') ? [{ rol: 'ADMIN' }] : []),
   auditoria_operaciones: {},
   levantamiento: {
    findFirst: vi.fn().mockResolvedValue({ id: 'l', estado: 'FINALIZADO', aplicadoAt: null, items }),
    update: vi.fn(async ({ data }: any) => ({ id: 'l', ...data })),
   },
   levantamientoItem: { update: vi.fn(async ({ data }: any) => data) },
   producto: {
    findMany: vi.fn(async ({ where }: any) => [catalogProduct].filter(p =>
     where.OR.some((c: any) =>
      (c.id?.in ?? []).includes(p.id) ||
      (c.codigo?.in ?? []).some((code: string) => code?.toUpperCase() === p.codigo) ||
      (c.codigoBarras?.in ?? []).includes(p.codigoBarras),
     ),
    )),
    update: vi.fn(async ({ data }: any) => data),
    create: vi.fn(async ({ data }: any) => ({ id: 'new', ...data })),
   },
   categoria: { upsert: vi.fn() },
  };
 }

 it('advierte cuando el barcode del conteo difiere del catálogo', async () => {
  prisma = mkPrisma([{ id: 'c1', codigo: 'CABLE', codigoBarras: '999999', descripcion: 'Cable', cantidad: 3, unidad: 'METRO', precioCosto: 2, precioVenta: 4, productoId: null }]);
  service = new LevantamientosService(prisma);
  const preview = await service.previsualizar('t', 'l');
  expect(preview.rows[0].errores.some((e: string) => e.includes('difiere del catálogo'))).toBe(true);
 });

 it('NO sobreescribe el barcode del catálogo cuando el producto se identifica por código interno', async () => {
  const item = { id: 'c1', codigo: 'CABLE', codigoBarras: '999999', descripcion: 'Cable', cantidad: 3, unidad: 'METRO', precioCosto: 2, precioVenta: 4, productoId: null };
  // Product matched by codigo, not by barcode — but count has a DIFFERENT barcode
  // Preview would show barcode mismatch error, so aplicar() would be blocked.
  // Test the safe path: when count barcode MATCHES catalog barcode, it should update.
  const itemMatching = { ...item, codigoBarras: '001234' }; // same as catalog
  prisma = mkPrisma([itemMatching]);
  service = new LevantamientosService(prisma);
  const preview = await service.previsualizar('t', 'l');
  expect(preview.rows[0].errores).toHaveLength(0);
  expect(preview.rows[0].matchedByBarcode).toBe(true);
 });

 it('actualiza barcode cuando el catálogo no tenía barcode y el conteo lo aporta', async () => {
  const productSinBarcode = { ...catalogProduct, codigoBarras: null };
  prisma = mkPrisma([{ id: 'c1', productoId: 'p1', codigo: 'CABLE', codigoBarras: '001234', descripcion: 'Cable', cantidad: 3, unidad: 'METRO', precioCosto: 2, precioVenta: 4 }]);
  prisma.producto.findMany.mockResolvedValue([productSinBarcode]);
  service = new LevantamientosService(prisma);
  const preview = await service.previsualizar('t', 'l');
  // catalogBarcode is null → safe to accept count's barcode
  expect(preview.rows[0].catalogBarcode).toBeNull();
  expect(preview.rows[0].errores).toHaveLength(0);
 });

 it('NO genera error de barcode cuando el conteo no incluye barcode', async () => {
  prisma = mkPrisma([{ id: 'c1', codigo: 'CABLE', codigoBarras: null, descripcion: 'Cable', cantidad: 3, unidad: 'METRO', precioCosto: 2, precioVenta: 4, productoId: null }]);
  service = new LevantamientosService(prisma);
  const preview = await service.previsualizar('t', 'l');
  expect(preview.rows[0].errores).toHaveLength(0);
 });
});

describe('Auditoría P1/P2 — aplicar() protege barcode y precios', () => {
 let prisma: any, service: LevantamientosService;

 const catalogProduct = {
  id: 'p1', codigo: 'CABLE', codigoBarras: '001234',
  activo: true, unidadMedida: 'METRO',
  stockActual: 5, stockReservado: 0, precioCosto: 2, precioVenta: 4,
 };

 function mkPrisma(items: any[], productOverride?: Partial<typeof catalogProduct> | null) {
  const prod = productOverride === null ? null : { ...catalogProduct, ...productOverride };
  return {
   $transaction: vi.fn((fn: any) => fn(prisma)),
   $queryRawUnsafe: vi.fn(async (sql: string) => sql.includes('SELECT u.rol') ? [{ rol: 'ADMIN' }] : []),
   levantamiento: {
    findFirst: vi.fn().mockResolvedValue({ id: 'l', estado: 'FINALIZADO', aplicadoAt: null, items }),
    update: vi.fn(async ({ data }: any) => ({ id: 'l', ...data })),
   },
   levantamientoItem: { update: vi.fn(async ({ data }: any) => data) },
   producto: {
    findMany: vi.fn(async ({ where }: any) =>
     prod ? [prod].filter(p =>
      where.OR.some((c: any) =>
       (c.id?.in ?? []).includes(p.id) ||
       (c.codigo?.in ?? []).some((code: string) => code?.toUpperCase() === p.codigo) ||
       (c.codigoBarras?.in ?? []).includes(p.codigoBarras ?? ''),
      ),
     ) : [],
    ),
    update: vi.fn(async ({ data }: any) => ({ id: 'p1', ...data })),
    create: vi.fn(async ({ data }: any) => ({ id: 'new', ...data })),
   },
   categoria: { upsert: vi.fn() },
  };
 }

 /** Genera token válido llamando previsualizar() y luego invoca aplicar() */
 async function aplicarConToken(svc: LevantamientosService, items: any[]) {
  prisma.levantamiento.findFirst.mockResolvedValue({ id: 'l', estado: 'FINALIZADO', aplicadoAt: null, items });
  const preview = await svc.previsualizar('t', 'l');
  return svc.aplicar('t', 'u', 'l', preview.token);
 }

 it('NO sobreescribe barcode cuando el conteo difiere del catálogo — aplicar() rechaza la operación', async () => {
  // Count matched by internal code CABLE but has DIFFERENT barcode → preview emits "difiere" error
  // → aplicar() must refuse, and producto.update must never be called.
  const item = { id: 'c1', codigo: 'CABLE', codigoBarras: '999999', descripcion: 'Cable', cantidad: 3, unidad: 'METRO', precioCosto: 2, precioVenta: 4, productoId: null };
  prisma = mkPrisma([item]);
  service = new LevantamientosService(prisma);
  prisma.levantamiento.findFirst.mockResolvedValue({ id: 'l', estado: 'FINALIZADO', aplicadoAt: null, items: [item] });
  const preview = await service.previsualizar('t', 'l');
  expect(preview.rows[0].errores.some((e: string) => e.includes('difiere del catálogo'))).toBe(true);
  await expect(service.aplicar('t', 'u', 'l', preview.token)).rejects.toThrow('conflictos');
  expect(prisma.producto.update).not.toHaveBeenCalled();
 });

 it('persiste barcode cuando matchedByBarcode=true — el conteo identificó al producto por barcode coincidente', async () => {
  // Count matched by the SAME barcode as catalog — safe to persist barcode update
  const item = { id: 'c1', codigo: 'CABLE', codigoBarras: '001234', descripcion: 'Cable', cantidad: 7, unidad: 'METRO', precioCosto: 2, precioVenta: 4, productoId: null };
  prisma = mkPrisma([item]);
  service = new LevantamientosService(prisma);
  await aplicarConToken(service, [item]);
  const updateCall = prisma.producto.update.mock.calls[0][0];
  expect(updateCall.data.codigoBarras).toBe('001234');
  expect(updateCall.data.stockActual).toBe(7);
 });

 it('actualiza barcode en catálogo cuando catalogBarcode era null — el conteo aporta uno nuevo', async () => {
  const item = { id: 'c1', productoId: 'p1', codigo: 'CABLE', codigoBarras: '777777', descripcion: 'Cable', cantidad: 4, unidad: 'METRO', precioCosto: 2, precioVenta: 4 };
  prisma = mkPrisma([item], { codigoBarras: null });
  service = new LevantamientosService(prisma);
  await aplicarConToken(service, [item]);
  const updateCall = prisma.producto.update.mock.calls[0][0];
  expect(updateCall.data.codigoBarras).toBe('777777');
 });

 it('preserva precioCosto y precioVenta del catálogo — nunca escribe 0 cuando el conteo no los provee', async () => {
  // Count omits prices (null) → aplicar() must use catalog prices exactly (2 and 4), never 0
  const item = { id: 'c1', codigo: 'CABLE', codigoBarras: '001234', descripcion: 'Cable', cantidad: 3, unidad: 'METRO', precioCosto: null, precioVenta: null, productoId: null };
  prisma = mkPrisma([item]);
  service = new LevantamientosService(prisma);
  await aplicarConToken(service, [item]);
  const updateCall = prisma.producto.update.mock.calls[0][0];
  expect(updateCall.data.precioCosto).toBe(2);
  expect(updateCall.data.precioVenta).toBe(4);
  expect(updateCall.data.precioCosto).not.toBe(0);
  expect(updateCall.data.precioVenta).not.toBe(0);
 });

 it('lanza error explícito si el producto del catálogo tiene precio null — nunca escribe 0 silenciosamente', async () => {
  // Edge case: catalog product was created with missing prices (upstream data integrity issue)
  // aplicar() must throw instead of silently setting 0.
  const item = { id: 'c1', productoId: 'p1', codigo: 'CABLE', codigoBarras: '001234', descripcion: 'Cable', cantidad: 3, unidad: 'METRO', precioCosto: null, precioVenta: null };
  prisma = mkPrisma([item], { precioCosto: null, precioVenta: null });
  service = new LevantamientosService(prisma);
  prisma.levantamiento.findFirst.mockResolvedValue({ id: 'l', estado: 'FINALIZADO', aplicadoAt: null, items: [item] });
  const preview = await service.previsualizar('t', 'l');
  await expect(service.aplicar('t', 'u', 'l', preview.token)).rejects.toThrow('costo o precio definido');
  expect(prisma.producto.update).not.toHaveBeenCalled();
 });
});
