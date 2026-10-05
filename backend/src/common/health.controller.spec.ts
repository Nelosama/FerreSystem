import { HealthController } from './health.controller';
import { ServiceUnavailableException } from '@nestjs/common';
describe('Disponibilidad del servicio',()=>{
 it('comprueba PostgreSQL sin exponer datos del negocio',async()=>{
  const controller=new HealthController({$queryRaw:vi.fn().mockResolvedValue([{ok:1}])} as any);
  expect(await controller.ready()).toEqual({status:'ok'});
 });
 it('devuelve 503 sin publicar detalles de conexión',async()=>{
  const controller=new HealthController({$queryRaw:vi.fn().mockRejectedValue(new Error('detalle privado'))} as any);
  await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  await expect(controller.ready()).rejects.toThrow('Servicio temporalmente no disponible');
 });
});
