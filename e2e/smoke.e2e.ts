import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

// Prueba de humo (FEAT-017b, AC-09): alta del primer Admin, inicio de sesión y pantalla de inicio,
// contra el server en modo mock sobre una base temporal nueva. Credenciales distintas en cada corrida.
test('test_e2e_alta_primer_admin_login_e_inicio', async ({ page }) => {
  const name = 'Admin E2E';
  const email = `e2e-${randomUUID()}@example.com`;
  const password = randomUUID();

  // `/` sin sesión → `/login` → `/setup`, porque la base no tiene usuarios.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Registrar el primer Admin' })).toBeVisible();

  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crear Admin' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Admin creado. Ya podés iniciar sesión.')).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page.getByRole('heading', { name: `Hola, ${name}` })).toBeVisible();
});
