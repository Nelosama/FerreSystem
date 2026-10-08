import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('i18n locales contain close_modal key under common', () => {
  const es = JSON.parse(fs.readFileSync('src/locales/es.json', 'utf8'));
  const en = JSON.parse(fs.readFileSync('src/locales/en.json', 'utf8'));

  assert.equal(es.common?.close_modal, 'Cerrar modal');
  assert.equal(en.common?.close_modal, 'Close modal');
});

test('modal close buttons in pages and components have aria-label and type="button"', () => {
  const filesToDist = [
    'src/components/ImportarProductosModal.tsx',
    'src/components/BottomNavigation.tsx',
    'src/components/TopBar.tsx',
    'src/pages/InventarioPage.tsx',
    'src/pages/CotizacionesPage.tsx',
    'src/pages/ClientesPage.tsx',
    'src/pages/UsuariosPage.tsx',
    'src/pages/POSPage.tsx',
    'src/pages/SuperAdminPage.tsx',
  ];

  for (const relativePath of filesToDist) {
    const fullPath = path.resolve(relativePath);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf8');

    // Find all <X ... /> icon renders inside buttons or style={styles.closeBtn} buttons
    const buttonRegex = /<button[\s\S]*?<\/button>/g;
    let match;
    while ((match = buttonRegex.exec(content)) !== null) {
      const buttonHtml = match[0];

      // If the button renders an <X icon (close button) or uses closeBtn style
      if (buttonHtml.includes('<X ') || buttonHtml.includes('closeBtn')) {
        // Exclude reject notification button which has visible text like "{t('topbar.reject')}"
        if (buttonHtml.includes("topbar.reject")) {
          continue;
        }

        assert.ok(
          buttonHtml.includes('aria-label='),
          `Button in ${relativePath} containing <X /> icon or closeBtn must have an aria-label attribute. Found:\n${buttonHtml}`
        );

        assert.ok(
          buttonHtml.includes('type="button"'),
          `Button in ${relativePath} close button must have explicit type="button" for keyboard accessibility. Found:\n${buttonHtml}`
        );
      }
    }
  }
});
