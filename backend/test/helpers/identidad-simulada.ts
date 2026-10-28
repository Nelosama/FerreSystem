// Pruebas unitarias sin base: simula las consultas de identidad del login (`lower(trim(...))` sobre usuarios y super_admins)
// y la relectura por id, a partir de filas en memoria. Conserva la implementación previa de $queryRaw para el resto del SQL.
type Fila = Record<string, any> & { id: string };

export function simularIdentidad(prisma: any, datos: { usuarios?: Fila[]; superAdmins?: Fila[] }) {
  const usuarios = datos.usuarios ?? [];
  const superAdmins = datos.superAdmins ?? [];
  const previa = prisma.$queryRaw.getMockImplementation?.();
  prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...valores: unknown[]) => {
    const sql = strings.join('?');
    const consulta = /SELECT id FROM (usuarios|super_admins) WHERE lower\(trim\((email|username)\)\) = \?/.exec(sql);
    if (!consulta) return previa ? previa(strings, ...valores) : [];
    const [tabla, campo] = [consulta[1], consulta[2]];
    const [valor, tenant] = valores as [string, string | null];
    const filas = tabla === 'usuarios' ? usuarios : superAdmins;
    return filas
      .filter(f => typeof f[campo] === 'string' && f[campo].trim().toLowerCase() === valor && (tabla !== 'usuarios' || !tenant || f.tenantId === tenant))
      .map(f => ({ id: f.id })).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2);
  });
  prisma.usuario.findMany.mockImplementation(async ({ where }: any = {}) => usuarios.filter(u => u.id === where?.id));
  prisma.superAdmin.findUnique.mockImplementation(async ({ where }: any = {}) => superAdmins.find(s => s.id === where?.id) ?? null);
  return { usuarios, superAdmins };
}
