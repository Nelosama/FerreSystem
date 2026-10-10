// Inventario de rutas: método, ruta, roles efectivos (clase ∪ método), permiso y guardas. Solo lectura.
const ts = require(process.argv[2] + '/node_modules/typescript');
const fs = require('fs'); const path = require('path');
const raiz = process.argv[3];
const archivos = require('child_process').execSync(`find ${raiz}/backend/src -name "*.controller.ts"`).toString().trim().split('\n').sort();
const textoDeArg = (d) => d.arguments.map(a => a.getText().replace(/^['"`]|['"`]$/g, '')).join(',');
for (const f of archivos) {
  const src = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
  const decs = (node) => (ts.getDecorators ? ts.getDecorators(node) : node.decorators) || [];
  const nombre = (d) => d.expression.expression ? d.expression.expression.getText() : d.expression.getText();
  const llamada = (d) => d.expression.expression ? d.expression.expression.getText() : (d.expression.getText ? d.expression.getText() : '');
  const visitar = (node) => {
    if (ts.isClassDeclaration(node)) {
      const cd = decs(node);
      const ctrl = cd.find(d => ts.isCallExpression(d.expression) && d.expression.expression.getText() === 'Controller');
      const prefijo = ctrl ? textoDeArg(ctrl.expression) : '';
      const rolesClase = cd.filter(d => ts.isCallExpression(d.expression) && d.expression.expression.getText() === 'Roles').map(d => textoDeArg(d.expression)).join('|');
      const guardsClase = cd.filter(d => ts.isCallExpression(d.expression) && d.expression.expression.getText() === 'UseGuards').map(d => textoDeArg(d.expression)).join('|');
      node.members.forEach(m => {
        if (!ts.isMethodDeclaration(m)) return;
        const md = decs(m).filter(ts.isDecorator);
        const verbo = md.find(d => ts.isCallExpression(d.expression) && /^(Get|Post|Put|Patch|Delete)$/.test(d.expression.expression.getText()));
        if (!verbo) return;
        const ruta = textoDeArg(verbo.expression);
        const rolesMetodo = md.filter(d => ts.isCallExpression(d.expression) && d.expression.expression.getText() === 'Roles').map(d => textoDeArg(d.expression)).join('|');
        const perm = md.filter(d => ts.isCallExpression(d.expression) && d.expression.expression.getText() === 'RequiredPermission').map(d => textoDeArg(d.expression)).join('|');
        const roles = rolesMetodo || rolesClase || '(SIN @Roles)';
        const rel = path.relative(raiz, f).replace('backend/src/', '');
        console.log([verbo.expression.expression.getText().toUpperCase(), '/' + [prefijo, ruta].filter(Boolean).join('/'), roles, perm || '-', rel.split('/').pop().replace('.controller.ts', ''), (rolesMetodo ? 'metodo' : rolesClase ? 'clase' : 'ninguno'), (guardsClase || 'sin-UseGuards-clase')].join('\t'));
      });
    }
    ts.forEachChild(node, visitar);
  };
  visitar(src);
}
