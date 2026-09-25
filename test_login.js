function validateLoginInput(email, password) {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'El correo electrónico debe tener un formato válido' };
  }
  if (!password || password.length < 6) {
    return { success: false, error: 'La contraseña debe tener al menos 6 caracteres' };
  }
  return { success: true };
}

console.log('--- Testing FerreSystem Login Validation DTO ---');

const cases = [
  { email: 'admin@ferresystem.hn', pass: 'SuperAdmin2026!', expected: true },
  { email: 'cajero@lamundial.hn', pass: 'Ferre2026!', expected: true },
  { email: 'invalid-email', pass: 'Ferre2026!', expected: false },
  { email: 'cajero@lamundial.hn', pass: '123', expected: false },
];

cases.forEach((c, index) => {
  const result = validateLoginInput(c.email, c.pass);
  const ok = result.success === c.expected;
  console.log(`Test Case #${index + 1} (${c.email}):`, ok ? '✅ PASSED' : '❌ FAILED');
});
