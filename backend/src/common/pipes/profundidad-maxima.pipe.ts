import { BadRequestException, INestApplication, PipeTransform, ValidationPipe } from '@nestjs/common';

/**
 * H-P (CENTINELA): el ValidationPipe de Nest recorre el cuerpo de forma recursiva (`stripProtoKeys`); un JSON muy anidado
 * (≈1 500 niveles en arreglos, ≈5 000 en objetos, con menos de 30 KB) agota la pila y responde 500. Este pipe mide la profundidad
 * de forma iterativa, sin recursión, y rechaza con 400 antes de que lo recorra el validador. Los cuerpos legítimos del sistema
 * tienen menos de 10 niveles; 64 deja un margen amplio y queda muy por debajo del umbral de fallo.
 */
export const PROFUNDIDAD_MAXIMA_JSON = 64;

export function profundidadDe(valor: unknown, tope = PROFUNDIDAD_MAXIMA_JSON): number {
  if (valor === null || typeof valor !== 'object') return 0;
  let maxima = 0;
  const pila: Array<[object, number]> = [[valor as object, 1]];
  while (pila.length) {
    const [actual, nivel] = pila.pop()!;
    if (ArrayBuffer.isView(actual)) continue; // archivos y buffers: nada que anidar, y no se recorren byte a byte
    if (nivel > maxima) maxima = nivel;
    if (maxima > tope) return maxima;
    for (const hijo of Object.values(actual)) {
      if (hijo !== null && typeof hijo === 'object') pila.push([hijo as object, nivel + 1]);
    }
  }
  return maxima;
}

export class ProfundidadMaximaPipe implements PipeTransform {
  transform(valor: unknown) {
    if (profundidadDe(valor) > PROFUNDIDAD_MAXIMA_JSON) {
      throw new BadRequestException(`La solicitud supera la profundidad máxima permitida (${PROFUNDIDAD_MAXIMA_JSON} niveles)`);
    }
    return valor;
  }
}

/** Pipes globales de la aplicación: primero el límite de profundidad, luego la validación. Compartido por main.ts y las pruebas. */
export function configurarPipesGlobales(app: INestApplication) {
  app.useGlobalPipes(
    new ProfundidadMaximaPipe(),
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
}
