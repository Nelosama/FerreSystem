// Cantidad en letras para documentos de venta (Honduras): «UN MIL DOSCIENTOS LEMPIRAS CON 50/100».
const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function hasta999(n: number): string {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes = [CENTENAS[c]];
  if (r < 30) partes.push(UNIDADES[r]);
  else partes.push(DECENAS[Math.floor(r / 10)] + (r % 10 ? ` Y ${UNIDADES[r % 10]}` : ''));
  return partes.filter(Boolean).join(' ');
}

export function enteroEnLetras(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('Importe inválido');
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${enteroEnLetras(millones)} MILLONES`);
  if (miles) partes.push(`${hasta999(miles)} MIL`);
  if (resto) partes.push(hasta999(resto));
  return partes.join(' ');
}

/** Total en centavos → «… LEMPIRAS CON NN/100». */
export function montoEnLetras(totalCentavos: number): string {
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos < 0) throw new RangeError('Importe inválido');
  const lempiras = Math.floor(totalCentavos / 100);
  const centavos = String(totalCentavos % 100).padStart(2, '0');
  const de = lempiras > 0 && lempiras % 1_000_000 === 0 ? ' DE' : '';
  return `${enteroEnLetras(lempiras)}${de} ${lempiras === 1 ? 'LEMPIRA' : 'LEMPIRAS'} CON ${centavos}/100`;
}
